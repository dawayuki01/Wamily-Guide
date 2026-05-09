#!/usr/bin/env node
/**
 * check-curation-urls.js
 * Notion キュレーションDB の「公開」状態のURLを全件死活チェックし、
 * 死んでいる URL を「非公開」に変更する。
 *
 * 判定ロジック：
 *   1. HEAD リクエスト → 200/301/302 = OK / 404/410 = 死亡
 *   2. HEAD で 4xx（404/410以外）→ GETでリトライ（一部サイトはHEADブロック）
 *   3. タイムアウト・DNS失敗 = 死亡
 *   4. その他 = OK扱い（誤判定を避ける）
 *
 * Usage:
 *   node scripts/check-curation-urls.js              # 本番実行
 *   node scripts/check-curation-urls.js --dry-run    # ドライラン（Notion更新なし）
 *   node scripts/check-curation-urls.js --slug london # 特定の国だけ
 */

const { Client } = require('@notionhq/client');
const { notifySlack } = require('./lib/slack-notify');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const CURATION_DB_ID = process.env.NOTION_CURATION_DB_ID || '4f146e35-f680-46e1-acf2-8e4cc86851fb';

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const SLUG_FILTER = (() => {
  const i = ARGS.indexOf('--slug');
  return i >= 0 ? ARGS[i + 1] : null;
})();

const TIMEOUT_MS = 10000;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 国名（Notion）→ slug マッピング
const COUNTRY_SLUG = {
  'ロンドン': 'london', '台湾': 'taipei', '台北': 'taipei',
  'パリ': 'paris', 'ストックホルム': 'stockholm', 'シンガポール': 'singapore',
  'バンコク': 'bangkok', 'マニラ': 'manila', 'LA': 'la',
  'ハワイ': 'hawaii', 'ソウル': 'seoul', '香港': 'hongkong',
};

// ──────────────────────────────────────────────────────────
// URL 死活チェック
// ──────────────────────────────────────────────────────────

async function checkUrl(url) {
  const result = { alive: true, status: null, error: null };

  if (!url || !/^https?:\/\//i.test(url)) {
    return { alive: false, status: null, error: 'invalid URL' };
  }

  // HEAD リクエスト
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    clearTimeout(timer);
    result.status = res.status;

    // 200番台・300番台 → OK
    if (res.status >= 200 && res.status < 400) return result;

    // 404/410 → 死亡
    if (res.status === 404 || res.status === 410) {
      result.alive = false;
      result.error = `HTTP ${res.status}`;
      return result;
    }

    // 403/405 等 → HEAD ブロックの可能性、GETでリトライ
    return await retryWithGet(url, result);
  } catch (err) {
    // タイムアウト・DNS失敗等
    if (err.name === 'AbortError') {
      // タイムアウトは GET でリトライ
      return await retryWithGet(url, { alive: true, status: null, error: null });
    }
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      return { alive: false, status: null, error: `DNS失敗: ${err.code}` };
    }
    // その他のネットワークエラーは GETでリトライ
    return await retryWithGet(url, { alive: true, status: null, error: null });
  }
}

async function retryWithGet(url, prev) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    clearTimeout(timer);

    if (res.status >= 200 && res.status < 400) {
      return { alive: true, status: res.status, error: null };
    }
    if (res.status === 404 || res.status === 410) {
      return { alive: false, status: res.status, error: `HTTP ${res.status}` };
    }
    // 403/405 などは「アクセス制限」だが URL は存在する可能性が高い → OK扱い
    return { alive: true, status: res.status, error: `HTTP ${res.status}（アクセス制限の可能性）` };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { alive: false, status: null, error: 'タイムアウト' };
    }
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      return { alive: false, status: null, error: `DNS失敗: ${err.code}` };
    }
    // 不明エラーは OK扱い（誤判定回避）
    return { alive: true, status: null, error: `${err.message}（不明・OK扱い）` };
  }
}

// ──────────────────────────────────────────────────────────
// Notion からキュレーション一覧を取得
// ──────────────────────────────────────────────────────────

async function fetchPublishedCurations(notion) {
  const items = [];
  let cursor;

  do {
    const res = await notion.databases.query({
      database_id: CURATION_DB_ID,
      filter: {
        and: [
          { property: 'ステータス', select: { equals: '公開' } },
          { property: 'URL', url: { is_not_empty: true } },
        ],
      },
      start_cursor: cursor || undefined,
      page_size: 100,
    });

    for (const page of res.results) {
      const name = page.properties['名前']?.title?.map(t => t.plain_text).join('') || '';
      const url = page.properties['URL']?.url || '';
      const country = page.properties['国名']?.select?.name || '';
      items.push({
        id: page.id,
        name,
        url,
        country,
        slug: COUNTRY_SLUG[country] || null,
      });
    }

    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);

  return items;
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  if (!NOTION_API_KEY) {
    console.error('❌ NOTION_API_KEY が必要です');
    process.exit(1);
  }

  const notion = new Client({ auth: NOTION_API_KEY });

  console.log(`🔍 キュレーションURL死活チェック ${DRY_RUN ? '(ドライラン)' : ''}`);
  if (SLUG_FILTER) console.log(`   フィルター: ${SLUG_FILTER}`);
  console.log();

  console.log('📥 Notion から「公開」状態のキュレーションを取得中...');
  let allItems = await fetchPublishedCurations(notion);
  console.log(`   → ${allItems.length} 件取得\n`);

  if (SLUG_FILTER) {
    allItems = allItems.filter(item => item.slug === SLUG_FILTER);
    console.log(`   → フィルター後: ${allItems.length} 件\n`);
  }

  let aliveCount = 0;
  let deadCount = 0;
  const deadItems = [];
  const errors = [];

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    process.stdout.write(`[${i + 1}/${allItems.length}] ${item.country} | ${item.name.slice(0, 30)} ... `);

    const check = await checkUrl(item.url);

    if (check.alive) {
      console.log(`✅ ${check.status || 'OK'}`);
      aliveCount++;
    } else {
      console.log(`❌ ${check.error || 'dead'}`);
      console.log(`   URL: ${item.url}`);
      deadCount++;
      deadItems.push({ ...item, reason: check.error });

      // Notion で「非公開」に変更
      if (!DRY_RUN) {
        try {
          await notion.pages.update({
            page_id: item.id,
            properties: {
              'ステータス': { select: { name: '非公開' } },
            },
          });
          console.log(`   📝 Notion で「非公開」に変更`);
          await new Promise(r => setTimeout(r, 350));
        } catch (err) {
          console.warn(`   ⚠️ Notion 更新失敗: ${err.message}`);
          errors.push(`${item.name}: ${err.message}`);
        }
      }
    }

    // レート制限対策（外部URL）
    await new Promise(r => setTimeout(r, 200));
  }

  console.log();
  console.log('═══════════════════════════════════════');
  console.log(`✅ 生存: ${aliveCount} 件`);
  console.log(`❌ 死亡: ${deadCount} 件`);
  if (errors.length > 0) {
    console.log(`⚠️ Notion更新エラー: ${errors.length} 件`);
  }
  console.log('═══════════════════════════════════════');

  if (deadItems.length > 0) {
    console.log('\n【非公開化されたURL】');
    deadItems.forEach(d => {
      console.log(`  - [${d.country}] ${d.name}`);
      console.log(`    ${d.url}  (${d.reason})`);
    });
  }

  // Slack 通知
  if (!DRY_RUN && (deadCount > 0 || errors.length > 0)) {
    await notifySlack({
      channel: 'content',
      icon: errors.length ? '🟡' : (deadCount > 0 ? '🟡' : '🟢'),
      title: `[コンテンツ部] キュレーションURL死活チェック ${errors.length ? '一部エラー' : '完了'}`,
      body: `${deadCount}件の死んだURLを「非公開」に変更`,
      color: errors.length ? 'warning' : (deadCount > 0 ? 'warning' : 'success'),
      fields: [
        { label: '生存', value: `${aliveCount} 件` },
        { label: '死亡', value: `${deadCount} 件` },
        SLUG_FILTER ? { label: '対象', value: SLUG_FILTER } : null,
      ].filter(Boolean),
    });
  }
}

main().catch(async err => {
  console.error('❌ 致命的エラー:', err);
  await notifySlack({
    channel: 'content',
    icon: '🔴',
    title: '[コンテンツ部] キュレーションURL死活チェック エラー',
    body: err.message || String(err),
    color: 'error',
  });
  process.exit(1);
});

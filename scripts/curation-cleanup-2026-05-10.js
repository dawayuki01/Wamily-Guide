#!/usr/bin/env node
/**
 * 一回限りスクリプト: 2026-05-10 のキュレーション整理
 *
 * 1. 死んでる/不適切な12件を「非公開」に変更
 * 2. 香港に新規Instagram 2件を追加
 *
 * Usage:
 *   node scripts/curation-cleanup-2026-05-10.js              # 本番実行
 *   node scripts/curation-cleanup-2026-05-10.js --dry-run    # ドライラン
 */

const { Client } = require('@notionhq/client');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const CURATION_DB_ID = process.env.NOTION_CURATION_DB_ID || '4f146e35-f680-46e1-acf2-8e4cc86851fb';
const DRY_RUN = process.argv.includes('--dry-run');

// 非公開化する URL（サワディー目視確認済み）
const URLS_TO_HIDE = [
  'https://www.instagram.com/ayu_london_life',          // 1. ロンドン
  'https://www.instagram.com/france.fr/',                // 4. パリ
  'https://www.instagram.com/visitsingaporejp/',         // 6. シンガポール
  'https://www.instagram.com/famitabi_/',                // 8. バンコク
  'https://www.instagram.com/discoverlosangeles/',       // 9. LA
  'https://www.instagram.com/gohawaiijapan/',            // 11. ハワイ
  'https://www.instagram.com/visitkorea.jp/',            // 12. ソウル
  'https://www.itsmorefuninthephilippines.com/',         // 14. マニラ
  'https://www.youtube.com/@LoveGREATBritain',           // 15. ロンドン
  'https://www.youtube.com/@familytravelworld',          // 16. ロンドン
  'https://www.youtube.com/results?search_query=hong+kong+with+kids+vlog', // 17. 香港
  'https://www.hanacell.com/blog/hong-kong-with-kids/',  // 20. 香港
];

// 香港に追加するInstagram 2件
const HONGKONG_ADDITIONS = [
  {
    name: '@hitomickey_2',
    url: 'https://www.instagram.com/hitomickey_2',
    description: '香港在住の暮らしと家族の日常を綴るInstagram。',
  },
  {
    name: '@jazziesillona',
    url: 'https://www.instagram.com/jazziesillona',
    description: '香港のローカル目線の発信。',
  },
];

async function main() {
  if (!NOTION_API_KEY) {
    console.error('❌ NOTION_API_KEY が必要です');
    process.exit(1);
  }

  const notion = new Client({ auth: NOTION_API_KEY });

  console.log(`🧹 キュレーション整理 ${DRY_RUN ? '(ドライラン)' : ''}`);
  console.log(`   非公開化: ${URLS_TO_HIDE.length} 件`);
  console.log(`   新規追加: ${HONGKONG_ADDITIONS.length} 件\n`);

  // ===== 1. 全件取得して URL マップ作成 =====
  const urlToPage = new Map();
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: CURATION_DB_ID,
      start_cursor: cursor || undefined,
      page_size: 100,
    });
    for (const page of res.results) {
      const url = page.properties['URL']?.url || '';
      if (url) urlToPage.set(url.replace(/\/$/, ''), page);
    }
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);

  console.log(`📥 Notion から ${urlToPage.size} 件のURL情報を取得\n`);

  // ===== 2. 12件を非公開化 =====
  console.log('━━━ 非公開化 ━━━');
  let hidden = 0;
  let notFound = 0;
  for (const url of URLS_TO_HIDE) {
    const normUrl = url.replace(/\/$/, '');
    const page = urlToPage.get(normUrl);
    if (!page) {
      console.log(`  ⚠️ 見つからず: ${url}`);
      notFound++;
      continue;
    }
    const name = page.properties['名前']?.title?.map(t => t.plain_text).join('') || '?';
    const country = page.properties['国名']?.select?.name || '?';
    console.log(`  📝 [${country}] ${name}`);
    console.log(`     → 非公開に変更`);
    if (!DRY_RUN) {
      await notion.pages.update({
        page_id: page.id,
        properties: {
          'ステータス': { select: { name: '非公開' } },
        },
      });
      await new Promise(r => setTimeout(r, 350));
    }
    hidden++;
  }
  console.log(`  → ${hidden} 件を非公開化、${notFound} 件未発見\n`);

  // ===== 3. 香港に新規追加 =====
  console.log('━━━ 香港に新規追加 ━━━');
  let added = 0;
  for (const item of HONGKONG_ADDITIONS) {
    console.log(`  ✨ [香港] ${item.name}`);
    console.log(`     ${item.url}`);
    if (!DRY_RUN) {
      await notion.pages.create({
        parent: { database_id: CURATION_DB_ID },
        properties: {
          '名前': { title: [{ text: { content: item.name } }] },
          '国名': { select: { name: '香港' } },
          'URL': { url: item.url },
          'タイプ': { select: { name: 'Instagram' } },
          '説明': { rich_text: [{ text: { content: item.description } }] },
          'ステータス': { select: { name: '公開' } },
        },
      });
      await new Promise(r => setTimeout(r, 350));
    }
    added++;
  }
  console.log(`  → ${added} 件を追加\n`);

  console.log('═══════════════════════════════════════');
  console.log(`✅ 完了: 非公開 ${hidden} / 新規 ${added}`);
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log('次：sync.yml を手動実行 → data/curation-*.json 反映 → wamily.jp に反映');
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});

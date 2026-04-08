/**
 * コミュニティ部（user）— 日次/週次エンゲージメントレポート
 *
 * Usage:
 *   node scripts/community-report.js --daily   # バトン通知 + マイルストーン
 *   node scripts/community-report.js --weekly  # GA4レポート + 全体サマリー
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('@notionhq/client');
const { notifySlack } = require('./lib/slack-notify');

const DATA_DIR = path.join(__dirname, '..', 'data');
const LAST_CHECK_PATH = path.join(DATA_DIR, '.community-last-check.json');
const MILESTONE_PATH  = path.join(DATA_DIR, '.milestone-state.json');
const MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

// ──────────────────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────────────────

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function richText(prop) {
  return prop?.rich_text?.map(t => t.plain_text).join('') ?? '';
}

function titleText(prop) {
  return prop?.title?.map(t => t.plain_text).join('') ?? '';
}

function selectName(prop) {
  return prop?.select?.name ?? '';
}

// ──────────────────────────────────────────────────────────
// Notion クエリ
// ──────────────────────────────────────────────────────────

async function countActiveSubscribers(notion) {
  const dbId = process.env.NEWSLETTER_SUBSCRIBERS_DB_ID;
  if (!dbId) return 0;

  let count = 0;
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: dbId,
      filter: { property: 'ステータス', select: { equals: 'アクティブ' } },
      page_size: 100,
      start_cursor: cursor,
    });
    count += res.results.length;
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return count;
}

async function countNewSubscribers(notion, sinceDate) {
  const dbId = process.env.NEWSLETTER_SUBSCRIBERS_DB_ID;
  if (!dbId) return 0;

  let count = 0;
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: dbId,
      filter: {
        and: [
          { property: 'ステータス', select: { equals: 'アクティブ' } },
          { property: '登録日', date: { on_or_after: sinceDate } },
        ],
      },
      page_size: 100,
      start_cursor: cursor,
    });
    count += res.results.length;
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return count;
}

async function getBatonCount(notion) {
  const dbId = process.env.NOTION_BATON_DB_ID;
  if (!dbId) return { total: 0, recent: [] };

  let total = 0;
  let allResults = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: dbId,
      page_size: 100,
      start_cursor: cursor,
    });
    total += res.results.length;
    allResults = allResults.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return { total, results: allResults };
}

async function getNewBatons(notion, sinceISO) {
  const dbId = process.env.NOTION_BATON_DB_ID;
  if (!dbId) return [];

  const res = await notion.databases.query({
    database_id: dbId,
    filter: {
      timestamp: 'created_time',
      created_time: { on_or_after: sinceISO },
    },
    sorts: [{ timestamp: 'created_time', direction: 'descending' }],
  });

  return res.results;
}

// ──────────────────────────────────────────────────────────
// 日次モード
// ──────────────────────────────────────────────────────────

async function runDaily(notion) {
  console.log('📮 日次モード開始');

  // 前回チェック日時を取得
  const lastCheck = loadJson(LAST_CHECK_PATH);
  const sinceISO = lastCheck?.lastCheckAt || new Date(0).toISOString();

  // 1. 新規バトン投稿チェック
  const newBatons = await getNewBatons(notion, sinceISO);
  console.log(`  新規バトン: ${newBatons.length}件`);

  for (const baton of newBatons) {
    const title = titleText(baton.properties['タイトル']) || titleText(baton.properties['名前']) || '(無題)';
    const country = selectName(baton.properties['国']) || '';
    const author = richText(baton.properties['投稿者']) || richText(baton.properties['ニックネーム']) || '';
    const createdDate = baton.created_time.slice(0, 10);

    await notifySlack({
      channel: 'community_user',
      icon: '📮',
      title: '[コミュニティ部] 新しい旅のバトンが届きました',
      body: `${country ? country + ' — ' : ''}「${title}」\n┌ 投稿者: ${author || '匿名'}\n└ 投稿日: ${createdDate}`,
      color: 'success',
    });
  }

  // 2. マイルストーン判定
  const subscribers = await countActiveSubscribers(notion);
  const { total: batonTotal } = await getBatonCount(notion);
  console.log(`  購読者: ${subscribers}人 / バトン: ${batonTotal}件`);

  const milestoneState = loadJson(MILESTONE_PATH);

  if (!milestoneState) {
    // 初回実行 — 現在値を初期値として保存、通知スキップ
    console.log('  初回実行: マイルストーン初期値を保存');
    saveJson(MILESTONE_PATH, { subscribers, batons: batonTotal });
  } else {
    // 購読者マイルストーン
    for (const threshold of MILESTONES) {
      if (subscribers >= threshold && (milestoneState.subscribers || 0) < threshold) {
        await notifySlack({
          channel: 'community_user',
          icon: '🎉',
          title: '[コミュニティ部] マイルストーン達成！',
          body: `メルマガ購読者が ${threshold}人 を突破しました！（現在: ${subscribers}人）`,
          color: 'success',
        });
      }
    }

    // バトンマイルストーン
    for (const threshold of MILESTONES) {
      if (batonTotal >= threshold && (milestoneState.batons || 0) < threshold) {
        await notifySlack({
          channel: 'community_user',
          icon: '🎉',
          title: '[コミュニティ部] マイルストーン達成！',
          body: `旅のバトンが ${threshold}件 を突破しました！（現在: ${batonTotal}件）`,
          color: 'success',
        });
      }
    }

    saveJson(MILESTONE_PATH, { subscribers, batons: batonTotal });
  }

  // 3. チェック日時を更新
  saveJson(LAST_CHECK_PATH, { lastCheckAt: new Date().toISOString() });
  console.log('✅ 日次モード完了');
}

// ──────────────────────────────────────────────────────────
// 週次モード
// ──────────────────────────────────────────────────────────

async function runWeekly(notion) {
  console.log('📊 週次モード開始');

  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  const startLabel = `${weekAgo.getMonth() + 1}/${weekAgo.getDate()}`;
  const endLabel   = `${now.getMonth() + 1}/${now.getDate()}`;

  // ── GA4 データ取得 ──
  let ga4Section = '';
  if (process.env.GA4_PROPERTY_ID && process.env.GA4_CREDENTIALS) {
    try {
      const { createGA4Client, runReport } = require('./lib/ga4-client');
      const client = await createGA4Client();
      const propertyId = process.env.GA4_PROPERTY_ID;

      // サマリー
      const summary = await runReport(client, {
        propertyId,
        startDate: '7daysAgo',
        endDate: 'today',
        dimensions: [],
        metrics: ['screenPageViews', 'totalUsers', 'sessions'],
      });

      const pv    = summary.rows?.[0]?.metricValues?.[0]?.value || '0';
      const users = summary.rows?.[0]?.metricValues?.[1]?.value || '0';
      const sess  = summary.rows?.[0]?.metricValues?.[2]?.value || '0';

      // 流入元トップ5
      const sources = await runReport(client, {
        propertyId,
        startDate: '7daysAgo',
        endDate: 'today',
        dimensions: ['sessionSource'],
        metrics: ['sessions'],
      });

      const sourceRows = (sources.rows || [])
        .sort((a, b) => Number(b.metricValues[0].value) - Number(a.metricValues[0].value))
        .slice(0, 5);

      let sourceText = sourceRows.map((r, i) => {
        const prefix = i === 0 ? '┌' : i === sourceRows.length - 1 ? '└' : '├';
        return `${prefix} ${i + 1}. ${r.dimensionValues[0].value} — ${Number(r.metricValues[0].value).toLocaleString()}`;
      }).join('\n');

      // 人気ページトップ5
      const pages = await runReport(client, {
        propertyId,
        startDate: '7daysAgo',
        endDate: 'today',
        dimensions: ['pagePath'],
        metrics: ['screenPageViews'],
      });

      const pageRows = (pages.rows || [])
        .sort((a, b) => Number(b.metricValues[0].value) - Number(a.metricValues[0].value))
        .slice(0, 5);

      let pageText = pageRows.map((r, i) => {
        const prefix = i === 0 ? '┌' : i === pageRows.length - 1 ? '└' : '├';
        return `${prefix} ${i + 1}. ${r.dimensionValues[0].value} — ${Number(r.metricValues[0].value).toLocaleString()} PV`;
      }).join('\n');

      ga4Section = `アクセス:\n┌ PV: ${Number(pv).toLocaleString()}\n├ ユーザー: ${Number(users).toLocaleString()}\n└ セッション: ${Number(sess).toLocaleString()}\n\n流入元トップ5:\n${sourceText}\n\n人気ページトップ5:\n${pageText}`;

      console.log('  ✅ GA4 データ取得完了');
    } catch (err) {
      console.error('  ⚠ GA4 データ取得スキップ:', err.message);
      ga4Section = 'アクセス: GA4未設定またはエラーのためスキップ';
    }
  } else {
    console.log('  ⚠ GA4 環境変数未設定 — スキップ');
    ga4Section = 'アクセス: GA4未設定のためスキップ';
  }

  // ── Notion データ取得 ──
  const subscribers = await countActiveSubscribers(notion);
  const newSubs = await countNewSubscribers(notion, weekAgoStr);
  const { total: batonTotal } = await getBatonCount(notion);
  const newBatons = await getNewBatons(notion, weekAgoStr);

  const communitySection = `コミュニティ:\n┌ メルマガ購読者: ${subscribers}人（今週 +${newSubs}）\n└ 旅のバトン: ${batonTotal}件（今週 +${newBatons.length}）`;

  // ── Slack通知 ──
  const reportBody = `${ga4Section}\n\n${communitySection}`;

  await notifySlack({
    channel: 'community_user',
    icon: '📊',
    title: `[コミュニティ部] 週次エンゲージメントレポート（${startLabel}〜${endLabel}）`,
    body: reportBody,
    color: 'success',
  });

  // マイルストーンも更新
  const milestoneState = loadJson(MILESTONE_PATH) || { subscribers: 0, batons: 0 };
  saveJson(MILESTONE_PATH, { subscribers, batons: batonTotal });
  saveJson(LAST_CHECK_PATH, { lastCheckAt: new Date().toISOString() });

  console.log('✅ 週次モード完了');
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.error('❌ NOTION_API_KEY が設定されていません。');
    process.exit(1);
  }

  const notion = new Client({ auth: apiKey });
  const args = process.argv.slice(2);

  if (args.includes('--weekly')) {
    await runWeekly(notion);
  } else {
    await runDaily(notion);
  }
}

main().catch(err => {
  console.error('❌ 予期しないエラー:', err.message);
  process.exit(1);
});

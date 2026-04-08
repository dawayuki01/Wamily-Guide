/**
 * Notionダッシュボード — 週次更新
 *
 * Usage:
 *   node scripts/update-dashboard.js
 */

const { Client } = require('@notionhq/client');
const { notifySlack } = require('./lib/slack-notify');

const SLUGS = ['london', 'taipei', 'paris', 'stockholm', 'singapore', 'bangkok', 'manila', 'la', 'hawaii', 'seoul'];
const COUNTRY_JA = {
  london: 'ロンドン', taipei: '台北', paris: 'パリ', stockholm: 'ストックホルム',
  singapore: 'シンガポール', bangkok: 'バンコク', manila: 'マニラ',
  la: 'LA', hawaii: 'ハワイ', seoul: 'ソウル',
};

// ──────────────────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────────────────

function richText(prop) {
  return prop?.rich_text?.map(t => t.plain_text).join('') ?? '';
}

function selectName(prop) {
  return prop?.select?.name ?? '';
}

async function countAll(notion, dbId, filter) {
  if (!dbId) return 0;
  let count = 0;
  let cursor;
  do {
    const opts = { database_id: dbId, page_size: 100, start_cursor: cursor };
    if (filter) opts.filter = filter;
    const res = await notion.databases.query(opts);
    count += res.results.length;
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return count;
}

async function queryAll(notion, dbId, filter) {
  if (!dbId) return [];
  let all = [];
  let cursor;
  do {
    const opts = { database_id: dbId, page_size: 100, start_cursor: cursor };
    if (filter) opts.filter = filter;
    const res = await notion.databases.query(opts);
    all = all.concat(res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return all;
}

// ──────────────────────────────────────────────────────────
// Notionブロック生成ヘルパー
// ──────────────────────────────────────────────────────────

function heading2(text) {
  return {
    object: 'block', type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: text } }] },
  };
}

function paragraph(text) {
  return {
    object: 'block', type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: text } }] },
  };
}

function tableRow(cells) {
  return {
    type: 'table_row',
    table_row: {
      cells: cells.map(c => [{ type: 'text', text: { content: String(c) } }]),
    },
  };
}

function table(headers, rows) {
  return {
    object: 'block', type: 'table',
    table: {
      table_width: headers.length,
      has_column_header: true,
      has_row_header: false,
      children: [tableRow(headers), ...rows.map(r => tableRow(r))],
    },
  };
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.NOTION_API_KEY;
  const pageId = process.env.NOTION_DASHBOARD_PAGE_ID;
  if (!apiKey) { console.error('❌ NOTION_API_KEY 未設定'); process.exit(1); }
  if (!pageId) { console.error('❌ NOTION_DASHBOARD_PAGE_ID 未設定'); process.exit(1); }

  const notion = new Client({ auth: apiKey });
  console.log('📊 ダッシュボード更新開始');

  // ── データ収集 ──
  const subscriberCount = await countAll(notion, process.env.NEWSLETTER_SUBSCRIBERS_DB_ID,
    { property: 'ステータス', select: { equals: 'アクティブ' } });
  const batonCount = await countAll(notion, process.env.NOTION_BATON_DB_ID);

  // ホスト情報
  const hostDbId = process.env.NOTION_HOST_DB_ID;
  const activeHosts = hostDbId ? await queryAll(notion, hostDbId,
    { property: 'ステータス', select: { equals: 'アクティブ' } }) : [];

  const hostBySlug = {};
  for (const h of activeHosts) {
    const slug = selectName(h.properties['国スラッグ']);
    const nickname = richText(h.properties['ニックネーム']);
    if (slug) hostBySlug[slug] = nickname || '—';
  }

  // スポット・キュレーション数（JSONファイルから取得）
  const fs = require('fs');
  const path = require('path');
  const DATA_DIR = path.join(__dirname, '..', 'data');

  const countryRows = SLUGS.map(slug => {
    let spotCount = 0;
    let curationCount = 0;
    try {
      const spots = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `spots-${slug}.json`), 'utf8'));
      spotCount = spots.spots?.length || 0;
    } catch {}
    try {
      const cur = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `curation-${slug}.json`), 'utf8'));
      curationCount = cur.items?.length || 0;
    } catch {}
    return [COUNTRY_JA[slug], spotCount, curationCount, hostBySlug[slug] || '—'];
  });

  // GA4 データ
  let ga4Rows7 = ['—', '—', '—'];
  let ga4Rows30 = ['—', '—', '—'];
  if (process.env.GA4_PROPERTY_ID && process.env.GA4_CREDENTIALS) {
    try {
      const { createGA4Client, runReport } = require('./lib/ga4-client');
      const client = await createGA4Client();
      const propertyId = process.env.GA4_PROPERTY_ID;

      const week = await runReport(client, {
        propertyId, startDate: '7daysAgo', endDate: 'today',
        dimensions: [], metrics: ['screenPageViews', 'totalUsers', 'sessions'],
      });
      if (week.rows?.[0]) {
        ga4Rows7 = week.rows[0].metricValues.map(v => Number(v.value).toLocaleString());
      }

      const month = await runReport(client, {
        propertyId, startDate: '30daysAgo', endDate: 'today',
        dimensions: [], metrics: ['screenPageViews', 'totalUsers', 'sessions'],
      });
      if (month.rows?.[0]) {
        ga4Rows30 = month.rows[0].metricValues.map(v => Number(v.value).toLocaleString());
      }
      console.log('  ✅ GA4 データ取得完了');
    } catch (err) {
      console.error('  ⚠ GA4 エラー:', err.message);
    }
  }

  // ── 既存ブロックを全削除 ──
  console.log('  🗑  既存ブロックを削除中...');
  const existing = await notion.blocks.children.list({ block_id: pageId });
  for (const block of existing.results) {
    try { await notion.blocks.delete({ block_id: block.id }); } catch {}
  }

  // ── 新しいブロックを追加 ──
  const now = new Date();
  const jstStr = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    .toISOString().replace('T', ' ').slice(0, 16) + ' JST';

  const blocks = [
    paragraph(`最終更新: ${jstStr}`),
    heading2('アクセス（GA4）'),
    table(
      ['期間', 'PV', 'ユーザー', 'セッション'],
      [
        ['過去7日', ...ga4Rows7],
        ['過去30日', ...ga4Rows30],
      ]
    ),
    heading2('コミュニティ'),
    table(
      ['指標', '数値'],
      [
        ['メルマガ購読者', `${subscriberCount}人`],
        ['旅のバトン', `${batonCount}件`],
        ['アクティブホスト', `${activeHosts.length}人`],
      ]
    ),
    heading2('スポット（国別）'),
    table(
      ['国', 'スポット数', 'キュレーション数', 'ホスト'],
      countryRows,
    ),
  ];

  console.log('  📝 新しいブロックを追加中...');
  await notion.blocks.children.append({ block_id: pageId, children: blocks });

  await notifySlack({
    channel: 'community_user',
    icon: '📊',
    title: '[コミュニティ部] ダッシュボード更新完了',
    body: `購読者: ${subscriberCount}人 / バトン: ${batonCount}件 / ホスト: ${activeHosts.length}人`,
    color: 'success',
  });

  console.log('✅ ダッシュボード更新完了');
}

main().catch(err => {
  console.error('❌ 予期しないエラー:', err.message);
  process.exit(1);
});

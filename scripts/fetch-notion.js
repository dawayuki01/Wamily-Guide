#!/usr/bin/env node
/**
 * fetch-notion.js
 * Notion API から「最近の動き」を取得して data/live-feed.json に書き出す
 *
 * 必要な環境変数：
 *   NOTION_API_KEY         — Notion インテグレーションのシークレット
 *   NOTION_LIVEFEED_DB_ID  — 「最近の動き」DB の ID
 *
 * Notion DB の想定プロパティ：
 *   投稿者（rich_text）  投稿者種別（select: owner/resident/traveler）
 *   国名（select）       本文（rich_text）  投稿日（date）
 */

const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// ──────────────────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────────────────

function richText(prop) {
  return prop?.rich_text?.map(t => t.plain_text).join('') ?? '';
}

function selectName(prop) {
  return prop?.select?.name ?? '';
}

function dateStr(prop) {
  return prop?.date?.start ?? '';
}

// ──────────────────────────────────────────────────────────
// 最近の動き
// ──────────────────────────────────────────────────────────

async function fetchLiveFeed(notion) {
  const dbId = process.env.NOTION_LIVEFEED_DB_ID;
  if (!dbId) {
    console.warn('⚠  NOTION_LIVEFEED_DB_ID が設定されていません。スキップします。');
    return null;
  }

  const response = await notion.databases.query({
    database_id: dbId,
    sorts: [{ property: '投稿日', direction: 'descending' }],
    page_size: 10,
  });

  const items = response.results.map(page => ({
    id: page.id,
    author: richText(page.properties['投稿者']),
    authorType: selectName(page.properties['投稿者種別']) || 'traveler',
    country: selectName(page.properties['国名']),
    body: richText(page.properties['本文']),
    date: dateStr(page.properties['投稿日']),
  }));

  return { items, updatedAt: new Date().toISOString() };
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

  console.log('📥 Notion から最近の動きを取得中...');
  const feedData = await fetchLiveFeed(notion);

  if (feedData) {
    const outPath = path.join(DATA_DIR, 'live-feed.json');
    fs.writeFileSync(outPath, JSON.stringify(feedData, null, 2), 'utf-8');
    console.log(`✅ live-feed.json を更新しました（${feedData.items.length} 件）`);
  }
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});

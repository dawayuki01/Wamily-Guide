#!/usr/bin/env node
/**
 * fetch-events.js
 * TimeOut London の RSS を取得し、Claude API で子連れ関連性をフィルタリング。
 * 結果を data/events-london.json に書き出す。
 *
 * 必要な環境変数：
 *   ANTHROPIC_API_KEY — Claude API キー
 *
 * （オプション）
 *   TIMEOUT_RSS_URL   — RSS URL を上書きする場合（デフォルト: TimeOut London family）
 */

const RSSParser = require('rss-parser');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

const DEFAULT_RSS = 'https://www.timeout.com/london/family/rss.xml';

// ──────────────────────────────────────────────────────────
// RSS 取得
// ──────────────────────────────────────────────────────────

async function fetchRSSItems(url) {
  const parser = new RSSParser();
  try {
    const feed = await parser.parseURL(url);
    return feed.items.slice(0, 20);
  } catch (err) {
    console.warn(`⚠  RSS 取得に失敗しました: ${err.message}`);
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Claude API でフィルタリング
// ──────────────────────────────────────────────────────────

async function filterWithClaude(client, items) {
  if (!items.length) return [];

  const summary = items.map((item, i) => {
    const desc = item.contentSnippet || item.summary || '';
    return `${i}: ${item.title} — ${desc.slice(0, 100)}`;
  }).join('\n');

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `以下のイベント一覧から、乳幼児〜小学生連れのファミリーに関連性の高いものを3〜5件選んでください。
無料のもの、屋外活動、博物館・公園・マーケット、季節のイベントを優先してください。
選んだものの番号を JSON 配列で返してください。例: {"selected": [0, 2, 4]}

イベント一覧:
${summary}`,
    }],
  });

  try {
    const text = message.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const { selected } = JSON.parse(match[0]);
      return Array.isArray(selected) ? selected : [0, 1, 2];
    }
  } catch { /* fallback */ }

  return [0, 1, 2];
}

// ──────────────────────────────────────────────────────────
// アイテムを整形
// ──────────────────────────────────────────────────────────

function formatItem(item) {
  const titleLower = (item.title + ' ' + (item.contentSnippet || '')).toLowerCase();
  const isFree = titleLower.includes('free') || titleLower.includes('無料');

  // 日付を日本語形式に変換
  let date = '';
  if (item.pubDate) {
    const d = new Date(item.pubDate);
    date = `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  return {
    title: item.title || '',
    description: (item.contentSnippet || '').slice(0, 120),
    date,
    place: '',  // RSS には場所情報がないことが多い
    link: item.link || '',
    free: isFree,
  };
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY が設定されていません。');
    process.exit(1);
  }

  const rssUrl = process.env.TIMEOUT_RSS_URL || DEFAULT_RSS;
  const client = new Anthropic({ apiKey });

  console.log('📡 TimeOut London RSS を取得中...');
  const rawItems = await fetchRSSItems(rssUrl);

  if (!rawItems.length) {
    console.warn('⚠  RSS アイテムが取得できませんでした。既存データを維持します。');
    return;
  }

  console.log(`  取得: ${rawItems.length} 件`);

  console.log('🤖 Claude API でファミリー向けイベントをフィルタリング中...');
  const selectedIndices = await filterWithClaude(client, rawItems);

  const items = selectedIndices
    .map(i => rawItems[i])
    .filter(Boolean)
    .map(formatItem);

  const outData = {
    items,
    source: 'TimeOut London',
    sourceUrl: 'https://www.timeout.com/london/family',
    updatedAt: new Date().toISOString(),
  };

  const outPath = path.join(DATA_DIR, 'events-london.json');
  fs.writeFileSync(outPath, JSON.stringify(outData, null, 2), 'utf-8');
  console.log(`✅ events-london.json を更新しました（${items.length} 件）`);
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});

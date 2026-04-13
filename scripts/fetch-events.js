#!/usr/bin/env node
/**
 * fetch-events.js
 * 全10カ国のファミリー向けイベント情報を取得・生成する。
 *
 * - ロンドン：TimeOut London RSS + Claude API フィルタリング
 * - 他9カ国：Claude API で季節のイベント・アクティビティを生成
 *
 * 出力：data/events-{slug}.json
 *
 * 必要な環境変数：
 *   ANTHROPIC_API_KEY — Claude API キー
 */

const RSSParser = require('rss-parser');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { notifySlack } = require('./lib/slack-notify');

const DATA_DIR = path.join(__dirname, '..', 'data');

// ── 国ごとの設定 ────────────────────────────────────────────
const COUNTRIES = [
  {
    slug: 'london',
    name: 'ロンドン',
    nameEn: 'London',
    rssUrl: 'https://www.timeout.com/london/kids/rss.xml',
    source: 'TimeOut London',
    sourceUrl: 'https://www.timeout.com/london/kids',
  },
  {
    slug: 'taipei',
    name: '台北',
    nameEn: 'Taipei',
    source: 'Claude AI 生成',
  },
  {
    slug: 'paris',
    name: 'パリ',
    nameEn: 'Paris',
    source: 'Claude AI 生成',
  },
  {
    slug: 'stockholm',
    name: 'ストックホルム',
    nameEn: 'Stockholm',
    source: 'Claude AI 生成',
  },
  {
    slug: 'singapore',
    name: 'シンガポール',
    nameEn: 'Singapore',
    source: 'Claude AI 生成',
  },
  {
    slug: 'bangkok',
    name: 'バンコク',
    nameEn: 'Bangkok',
    source: 'Claude AI 生成',
  },
  {
    slug: 'manila',
    name: 'マニラ',
    nameEn: 'Manila',
    source: 'Claude AI 生成',
  },
  {
    slug: 'la',
    name: 'ロサンゼルス',
    nameEn: 'Los Angeles',
    source: 'Claude AI 生成',
  },
  {
    slug: 'hawaii',
    name: 'ハワイ',
    nameEn: 'Hawaii',
    source: 'Claude AI 生成',
  },
  {
    slug: 'seoul',
    name: 'ソウル',
    nameEn: 'Seoul',
    source: 'Claude AI 生成',
  },
  {
    slug: 'hongkong',
    name: '香港',
    nameEn: 'Hong Kong',
    source: 'Claude AI 生成',
  },
];

// ──────────────────────────────────────────────────────────
// RSS 取得（ロンドン用）
// ──────────────────────────────────────────────────────────

async function fetchRSSItems(url) {
  const parser = new RSSParser();
  try {
    const feed = await parser.parseURL(url);
    return feed.items.slice(0, 20);
  } catch (err) {
    console.warn(`  ⚠  RSS 取得に失敗: ${err.message}`);
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// Claude API でRSSフィルタリング（ロンドン用）
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
// Claude API でイベント生成（ロンドン以外の国用）
// ──────────────────────────────────────────────────────────

async function generateEventsWithClaude(client, country) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const currentMonth = monthNames[month - 1];

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `あなたは${country.name}（${country.nameEn}）の子連れ旅行の専門家です。
${year}年${currentMonth}に${country.name}を子連れ（乳幼児〜小学生）で訪れる家族向けに、おすすめのイベント・季節のアクティビティを4〜5件教えてください。

以下の条件で:
- その季節ならではのイベントや行事（祭り、マーケット、季節の花見など）
- 子ども向け施設の特別プログラム
- 無料で楽しめるものを1〜2件含める
- 屋外アクティビティを1件以上含める
- 実在するイベント・場所を優先（架空のものは避ける）

JSON形式で返してください:
{
  "items": [
    {
      "title": "イベント名",
      "description": "120文字以内の説明",
      "date": "${currentMonth}の時期（例: ${currentMonth}上旬〜下旬）",
      "place": "場所名・住所",
      "free": true/false,
      "link": "公式サイトや観光局のURL（実在するURLのみ。不明なら空文字）"
    }
  ]
}

linkには実在するURLのみ入れてください。公式サイト、観光局、イベント公式ページなどが望ましいです。URLが不明な場合は空文字にしてください。
JSONのみ返してください。`,
    }],
  });

  try {
    const text = message.content[0].text;
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const data = JSON.parse(match[0]);
      if (Array.isArray(data.items)) {
        return data.items.map(item => ({
          title: item.title || '',
          description: (item.description || '').slice(0, 120),
          date: item.date || currentMonth,
          place: item.place || '',
          link: item.link || '',
          free: !!item.free,
        }));
      }
    }
  } catch (err) {
    console.warn(`  ⚠  JSON パースエラー: ${err.message}`);
  }

  return [];
}

// ──────────────────────────────────────────────────────────
// RSS アイテムを整形（ロンドン用）
// ──────────────────────────────────────────────────────────

function formatRSSItem(item) {
  const titleLower = (item.title + ' ' + (item.contentSnippet || '')).toLowerCase();
  const isFree = titleLower.includes('free') || titleLower.includes('無料');

  let date = '';
  if (item.pubDate) {
    const d = new Date(item.pubDate);
    date = `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  return {
    title: item.title || '',
    description: (item.contentSnippet || '').slice(0, 120),
    date,
    place: '',
    link: item.link || '',
    free: isFree,
  };
}

// ──────────────────────────────────────────────────────────
// 1カ国分のイベントを処理
// ──────────────────────────────────────────────────────────

async function processCountry(client, country) {
  let items = [];

  if (country.rssUrl) {
    // RSS ベース（ロンドン）
    console.log(`  📡 RSS 取得中: ${country.rssUrl}`);
    const rawItems = await fetchRSSItems(country.rssUrl);

    if (rawItems.length) {
      console.log(`     ${rawItems.length} 件取得 → Claude フィルタリング中...`);
      const selectedIndices = await filterWithClaude(client, rawItems);
      items = selectedIndices.map(i => rawItems[i]).filter(Boolean).map(formatRSSItem);
    } else {
      console.log('     RSS 取得失敗 → 既存データを維持');
      return null; // 既存データを維持
    }
  } else {
    // Claude 生成（ロンドン以外）
    console.log(`  🤖 Claude API でイベント生成中...`);
    items = await generateEventsWithClaude(client, country);
  }

  if (!items.length) {
    console.log('     イベント 0 件 → スキップ');
    return null;
  }

  return {
    items,
    source: country.source,
    sourceUrl: country.sourceUrl || '',
    updatedAt: new Date().toISOString(),
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

  const client = new Anthropic({ apiKey });

  console.log('🌍 全10カ国のイベント情報を取得・生成します...\n');

  let updatedCount = 0;
  let errorCount = 0;

  for (const country of COUNTRIES) {
    console.log(`🗺  ${country.name}（${country.slug}）:`);

    try {
      const data = await processCountry(client, country);

      if (data) {
        const outPath = path.join(DATA_DIR, `events-${country.slug}.json`);
        fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`  ✅ events-${country.slug}.json 更新（${data.items.length} 件）\n`);
        updatedCount++;
      } else {
        console.log(`  ⏭️  スキップ\n`);
      }
    } catch (err) {
      console.error(`  ❌ エラー: ${err.message}\n`);
      errorCount++;
    }

    // API レート制限対策
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('🎉 全カ国イベント処理完了！');

  await notifySlack({
    channel: 'patrol',
    icon: updatedCount > 0 ? '🟢' : '⚠️',
    title: `[パトロール部] イベント更新 ${errorCount > 0 ? '一部エラー' : '完了'}`,
    body: `${updatedCount}カ国更新`,
    color: errorCount > 0 ? 'warning' : 'success',
    fields: [
      { label: '更新国数', value: `${updatedCount}カ国` },
      { label: 'エラー', value: `${errorCount}件` },
    ],
  });
}

main().catch(async err => {
  console.error('❌ エラー:', err.message);
  await notifySlack({
    channel: 'patrol',
    icon: '🔴',
    title: '[パトロール部] イベント更新 エラー',
    body: err.message,
    color: 'error',
  });
  process.exit(1);
});

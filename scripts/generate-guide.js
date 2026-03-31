#!/usr/bin/env node
/**
 * generate-guide.js
 * Claude APIを使って週次コンテンツを自動生成し、Notionに投稿する。
 *
 * 処理内容：
 *   1. 「最近の動き」に各国の季節・旅行ヒントを自動投稿（週1回）
 *   2. 「キュレーション」に YouTube/Instagram/ブログ提案を追加（月1回）
 *
 * 必要な環境変数：
 *   ANTHROPIC_API_KEY
 *   NOTION_API_KEY
 *   NOTION_LIVEFEED_DB_ID   — 最近の動きDB
 *   NOTION_CURATION_DB_ID   — キュレーションDB
 */

const Anthropic = require('@anthropic-ai/sdk');
const { Client } = require('@notionhq/client');

// ──────────────────────────────────────────────────────────
// 設定
// ──────────────────────────────────────────────────────────

// Wamilyが扱う9カ国の設定
const COUNTRIES = [
  { slug: 'london',     notionName: '🇬🇧 ロンドン',  curationName: 'ロンドン',   status: 'active',   priority: 'high' },
  { slug: 'taipei',     notionName: '🇹🇼 台湾',       curationName: '台湾',       status: 'active',   priority: 'high' },
  { slug: 'paris',      notionName: '🇫🇷 パリ',        curationName: 'パリ',       status: 'active',   priority: 'normal' },
  { slug: 'stockholm',  notionName: '🇸🇪 ストックホルム', curationName: 'ストックホルム', status: 'active', priority: 'normal' },
  { slug: 'singapore',  notionName: '🇸🇬 シンガポール', curationName: 'シンガポール', status: 'active', priority: 'normal' },
  { slug: 'bangkok',    notionName: '🇹🇭 バンコク',    curationName: 'バンコク',   status: 'active',   priority: 'normal' },
  { slug: 'manila',     notionName: '🇵🇭 マニラ',      curationName: 'マニラ',     status: 'active',   priority: 'normal' },
  { slug: 'la',         notionName: '🇺🇸 LA',          curationName: 'LA',         status: 'active',   priority: 'normal' },
  { slug: 'hawaii',     notionName: '🇺🇸 ハワイ',      curationName: 'ハワイ',     status: 'active',   priority: 'normal' },
  { slug: 'seoul',      notionName: '🇰🇷 ソウル',      curationName: 'ソウル',     status: 'active',   priority: 'normal' },
];

// ──────────────────────────────────────────────────────────
// 現在の季節・月情報
// ──────────────────────────────────────────────────────────

function getCurrentContext() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const season = month >= 3 && month <= 5 ? '春' :
                 month >= 6 && month <= 8 ? '夏' :
                 month >= 9 && month <= 11 ? '秋' : '冬';

  return {
    year,
    month,
    season,
    label: `${year}年${month}月`,
    dateStr: now.toISOString().slice(0, 10),
  };
}

// ──────────────────────────────────────────────────────────
// 重複チェック：今週すでに投稿されているか
// ──────────────────────────────────────────────────────────

async function getRecentFeedDates(notion, dbId) {
  if (!dbId) return new Set();

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    const res = await notion.databases.query({
      database_id: dbId,
      filter: {
        property: '投稿日',
        date: { on_or_after: sevenDaysAgo },
      },
      page_size: 50,
    });

    // 「投稿者種別=owner かつ 今週投稿済みの国名」を返す
    const recentCountries = new Set();
    for (const page of res.results) {
      const type = page.properties['投稿者種別']?.select?.name;
      const country = page.properties['国名']?.select?.name;
      if (type === 'owner' && country) {
        recentCountries.add(country);
      }
    }
    return recentCountries;
  } catch {
    return new Set();
  }
}

async function getRecentCurationCountries(notion, dbId) {
  if (!dbId) return new Set();

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10);

    const res = await notion.databases.query({
      database_id: dbId,
      filter: {
        property: '追加日',
        date: { on_or_after: thirtyDaysAgo },
      },
      page_size: 100,
    });

    const recentCountries = new Set();
    for (const page of res.results) {
      const country = page.properties['国名']?.select?.name;
      if (country) recentCountries.add(country);
    }
    return recentCountries;
  } catch {
    return new Set();
  }
}

// ──────────────────────────────────────────────────────────
// Claude API で「最近の動き」を生成
// ──────────────────────────────────────────────────────────

async function generateLiveFeedEntry(claude, country, ctx) {
  const message = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `あなたはWamily（子連れ海外旅行ガイド）のコンテンツライター「サワディー」です。
子連れで${country.notionName.replace(/🇬🇧|🇹🇼|🇫🇷|🇸🇪|🇸🇬|🇹🇭|🇵🇭|🇺🇸|🇰🇷/g, '')}を旅行する日本人ファミリー向けに、
${ctx.label}（${ctx.season}）の旅行情報として「最近の動き」に投稿する1〜2文を書いてください。

条件：
- 季節に合わせた現地のリアルな情報（天気・イベント・注意点・豆知識など）
- 「子連れ目線」が伝わる内容
- 体温のある言葉で。情報サイト的でなく「居酒屋の常連が教えてくれる情報」のトーンで
- 文末は「〜ですよ」「〜でした」「〜がおすすめ」など自然な語尾
- 50〜80文字程度

本文のみ返してください（記号・絵文字・引用符なし）。`,
    }],
  });

  return message.content[0].text.trim();
}

// ──────────────────────────────────────────────────────────
// Claude API で「キュレーション」を生成
// ──────────────────────────────────────────────────────────

async function generateCurationEntries(claude, country, ctx) {
  const message = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `子連れで${country.curationName}を旅行する日本人ファミリー向けに役立つコンテンツを3件提案してください。

条件：
- YouTube / Instagram / ブログ の中からバランスよく
- 日本語コンテンツ優先（英語でも有名なものはOK）
- 実際に存在しそうなアカウント・チャンネル・ブログのみ（架空は不可）
- 説明は「サワディーがおすすめする理由」を体温のある一言で（30〜50文字）

以下のJSON形式で返してください（コードブロックなし）：
[
  {
    "name": "コンテンツ名またはアカウント名",
    "type": "YouTube",
    "description": "おすすめの理由（30〜50文字）",
    "url": "URLが明確に分かる場合のみ記入、不明な場合は空文字"
  }
]`,
    }],
  });

  try {
    const text = message.content[0].text.trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch (e) {
    console.warn('  ⚠  キュレーション JSON パース失敗:', e.message);
  }
  return [];
}

// ──────────────────────────────────────────────────────────
// Notion への投稿
// ──────────────────────────────────────────────────────────

async function postLiveFeedEntry(notion, dbId, country, body, dateStr) {
  await notion.pages.create({
    parent: { database_id: dbId },
    properties: {
      '投稿者': { title: [{ text: { content: 'サワディー' } }] },
      '投稿者種別': { select: { name: 'owner' } },
      '国名': { select: { name: country.notionName } },
      '本文': { rich_text: [{ text: { content: body } }] },
      '投稿日': { date: { start: dateStr } },
    },
  });
}

async function postCurationEntry(notion, dbId, country, item, dateStr) {
  const props = {
    '名前': { title: [{ text: { content: item.name } }] },
    '国名': { select: { name: country.curationName } },
    'タイプ': { select: { name: item.type } },
    '説明': { rich_text: [{ text: { content: item.description } }] },
    '追加日': { date: { start: dateStr } },
  };

  // URLは有効な場合のみセット
  if (item.url && item.url.startsWith('http')) {
    props['URL'] = { url: item.url };
  }

  await notion.pages.create({
    parent: { database_id: dbId },
    properties: props,
  });
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const notionKey = process.env.NOTION_API_KEY;
  const livefeedDbId = process.env.NOTION_LIVEFEED_DB_ID;
  const curationDbId = process.env.NOTION_CURATION_DB_ID;

  if (!anthropicKey || !notionKey) {
    console.error('❌ ANTHROPIC_API_KEY と NOTION_API_KEY が必要です。');
    process.exit(1);
  }

  const claude = new Anthropic({ apiKey: anthropicKey });
  const notion = new Client({ auth: notionKey });
  const ctx = getCurrentContext();

  console.log(`\n🤖 Wamily コンテンツ自動生成 — ${ctx.label}（${ctx.season}）\n`);

  // 重複チェック
  const recentFeedCountries = await getRecentFeedDates(notion, livefeedDbId);
  const recentCurationCountries = await getRecentCurationCountries(notion, curationDbId);

  // ── 最近の動き ──────────────────────────────────────────
  if (livefeedDbId) {
    console.log('📝 最近の動きを生成中...');

    for (const country of COUNTRIES) {
      if (recentFeedCountries.has(country.notionName)) {
        console.log(`  スキップ（今週投稿済み）: ${country.notionName}`);
        continue;
      }

      try {
        process.stdout.write(`  生成中: ${country.notionName} ... `);
        const body = await generateLiveFeedEntry(claude, country, ctx);
        await postLiveFeedEntry(notion, livefeedDbId, country, body, ctx.dateStr);
        console.log('✅');

        // API レート制限対策
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.log(`❌ ${err.message}`);
      }
    }
  } else {
    console.warn('⚠  NOTION_LIVEFEED_DB_ID が未設定。最近の動き生成をスキップ。');
  }

  // ── キュレーション ──────────────────────────────────────
  if (curationDbId) {
    console.log('\n🎬 キュレーションを生成中...');

    // 優先度highの国のみ毎週、normalは月次チェックで未投稿のみ
    const targetCountries = COUNTRIES.filter(c =>
      c.priority === 'high' || !recentCurationCountries.has(c.curationName)
    );

    for (const country of targetCountries) {
      if (recentCurationCountries.has(country.curationName) && country.priority !== 'high') {
        console.log(`  スキップ（今月投稿済み）: ${country.curationName}`);
        continue;
      }

      try {
        process.stdout.write(`  生成中: ${country.curationName} ... `);
        const items = await generateCurationEntries(claude, country, ctx);

        for (const item of items) {
          await postCurationEntry(notion, curationDbId, country, item, ctx.dateStr);
          await new Promise(r => setTimeout(r, 500));
        }
        console.log(`✅ ${items.length}件`);

        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        console.log(`❌ ${err.message}`);
      }
    }
  } else {
    console.warn('⚠  NOTION_CURATION_DB_ID が未設定。キュレーション生成をスキップ。');
  }

  console.log('\n🎉 コンテンツ自動生成 完了');
}

main().catch(err => {
  console.error('❌ 予期しないエラー:', err.message);
  process.exit(1);
});

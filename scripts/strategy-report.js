/**
 * 参謀室 — 月次業界レポート
 *
 * 処理フロー:
 *   1. Notion ウォッチリストDB から全エントリを取得
 *   2. 企業タイプ: 各URLにアクセス、ニュース・更新を確認
 *   3. キーワードタイプ: Claude API で最新トレンドを分析
 *   4. 情報源タイプ: 各URLにアクセスし関連記事を取得
 *   5. Claude API で統合分析 → 企業動向・トレンド・Wamilyへの示唆
 *   6. Notion 参謀室DB にレポート保存
 *   7. ウォッチリストDB の最終チェック日を更新
 *   8. #strategy にレポート通知
 *
 * 環境変数:
 *   NOTION_API_KEY         — Notion API
 *   NOTION_STRATEGY_DB_ID  — 参謀室DB ID
 *   NOTION_WATCHLIST_DB_ID — ウォッチリストDB ID
 *   ANTHROPIC_API_KEY      — Claude API
 *   SLACK_WEBHOOK_STRATEGY — Slack通知
 *
 * Usage:
 *   node scripts/strategy-report.js
 */

const { Client } = require('@notionhq/client');
const Anthropic = require('@anthropic-ai/sdk');
const { notifySlack } = require('./lib/slack-notify');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_STRATEGY_DB_ID = process.env.NOTION_STRATEGY_DB_ID;
const NOTION_WATCHLIST_DB_ID = process.env.NOTION_WATCHLIST_DB_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ──────────────────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────────────────

function richText(prop) {
  return prop?.rich_text?.map(t => t.plain_text).join('') ?? '';
}

function titleText(prop) {
  return prop?.title?.map(t => t.plain_text).join('') ?? '';
}

function selectName(prop) {
  return prop?.select?.name ?? '';
}

async function fetchPageContent(url, timeoutMs = 10000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'WamilyBot/1.0' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const text = await res.text();
    // 最初の2000文字のみ（ヘッドライン取得用）
    return text.slice(0, 2000);
  } catch {
    return null;
  }
}

function getReportMonth() {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月`;
}

// ──────────────────────────────────────────────────────────
// 1. ウォッチリスト取得
// ──────────────────────────────────────────────────────────

async function getWatchlist(notion) {
  const res = await notion.databases.query({
    database_id: NOTION_WATCHLIST_DB_ID,
  });

  return res.results.map(page => ({
    id: page.id,
    name: titleText(page.properties['企業名']),
    url: page.properties['URL']?.url ?? '',
    category: selectName(page.properties['カテゴリ']),
    type: selectName(page.properties['タイプ']),
    memo: richText(page.properties['メモ']),
  }));
}

// ──────────────────────────────────────────────────────────
// 2-4. データ収集
// ──────────────────────────────────────────────────────────

async function collectData(watchlist) {
  const companies = [];
  const keywords = [];
  const sources = [];

  for (const item of watchlist) {
    if (item.type === '企業' && item.url) {
      const content = await fetchPageContent(item.url);
      companies.push({
        name: item.name,
        category: item.category,
        memo: item.memo,
        content: content ? content.slice(0, 500) : '(アクセス不可)',
      });
    } else if (item.type === 'キーワード') {
      keywords.push({ name: item.name, memo: item.memo });
    } else if (item.type === '情報源' && item.url) {
      const content = await fetchPageContent(item.url);
      sources.push({
        name: item.name,
        content: content ? content.slice(0, 500) : '(アクセス不可)',
      });
    }
  }

  return { companies, keywords, sources };
}

// ──────────────────────────────────────────────────────────
// 5. Claude API で統合分析
// ──────────────────────────────────────────────────────────

async function generateReport(data) {
  const anthropic = new Anthropic();
  const month = getReportMonth();

  const prompt = `あなたはWamily（子連れ家族向け海外旅行ガイドブックサービス）の参謀です。
以下のウォッチリスト情報をもとに、${month}の月次業界レポートを作成してください。

## ウォッチリスト

### 企業
${data.companies.map(c => `- ${c.name}（${c.category}）: ${c.memo}\n  サイト情報: ${c.content}`).join('\n') || '(なし)'}

### キーワード
${data.keywords.map(k => `- ${k.name}: ${k.memo}`).join('\n') || '(なし)'}

### 情報源
${data.sources.map(s => `- ${s.name}: ${s.content}`).join('\n') || '(なし)'}

## 出力フォーマット
以下の3セクションで、簡潔に（各セクション3〜5行）レポートを作成してください。

🏢 企業動向
（各企業の最新動向を箇条書き）

📰 トレンド
（子連れ海外旅行に関する最新トレンドを箇条書き）

💡 示唆
（Wamilyにとっての機会・リスク・アクション提案を箇条書き）`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  return response.content[0]?.text ?? '';
}

// ──────────────────────────────────────────────────────────
// 6. Notion 保存
// ──────────────────────────────────────────────────────────

async function saveToNotion(notion, report) {
  const month = getReportMonth();
  const now = new Date();

  await notion.pages.create({
    parent: { database_id: NOTION_STRATEGY_DB_ID },
    properties: {
      'タイトル': {
        title: [{ text: { content: `${month} 月次業界レポート` } }],
      },
      'タイプ': { select: { name: '月次レポート' } },
      '日付': { date: { start: now.toISOString().split('T')[0] } },
      'ステータス': { select: { name: '確定' } },
    },
    children: [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ text: { content: report.slice(0, 2000) } }],
        },
      },
    ],
  });

  console.log('[参謀室] Notionにレポートを保存しました');
}

// ──────────────────────────────────────────────────────────
// 7. ウォッチリスト最終チェック日更新
// ──────────────────────────────────────────────────────────

async function updateWatchlistDates(notion, watchlist) {
  const today = new Date().toISOString().split('T')[0];
  for (const item of watchlist) {
    try {
      await notion.pages.update({
        page_id: item.id,
        properties: {
          '最終チェック日': { date: { start: today } },
        },
      });
    } catch (e) {
      console.warn(`[参謀室] ウォッチリスト更新エラー (${item.name}):`, e.message);
    }
  }
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  console.log('[参謀室] 月次業界レポート 開始');

  if (!NOTION_API_KEY || !NOTION_STRATEGY_DB_ID || !NOTION_WATCHLIST_DB_ID) {
    console.log('[参謀室] Notion未設定。処理をスキップします。');
    return;
  }

  if (!ANTHROPIC_API_KEY) {
    console.log('[参謀室] Claude API未設定。処理をスキップします。');
    return;
  }

  const notion = new Client({ auth: NOTION_API_KEY });

  try {
    // 1. ウォッチリスト取得
    const watchlist = await getWatchlist(notion);
    console.log(`[参謀室] ウォッチリスト: ${watchlist.length}件`);

    if (!watchlist.length) {
      console.log('[参謀室] ウォッチリストが空です。スキップします。');
      return;
    }

    // 2-4. データ収集
    console.log('[参謀室] データ収集中...');
    const data = await collectData(watchlist);

    // 5. Claude分析
    console.log('[参謀室] Claude APIでレポート生成中...');
    const report = await generateReport(data);
    console.log('\n' + report);

    // 6. Notion保存
    await saveToNotion(notion, report);

    // 7. 最終チェック日更新
    await updateWatchlistDates(notion, watchlist);

    // 8. Slack通知
    const month = getReportMonth();
    // Slackには要約のみ送信
    const slackBody = report.length > 800 ? report.slice(0, 800) + '\n\n→ 詳細: Notion参謀室DB' : report;

    await notifySlack({
      channel: 'strategy',
      icon: '📋',
      title: `[参謀室] ${month} 月次レポート`,
      body: slackBody,
      color: 'success',
    });

    console.log('[参謀室] 月次レポート 完了');
  } catch (err) {
    console.error('[参謀室] エラー:', err.message);
    await notifySlack({
      channel: 'strategy',
      icon: '🚨',
      title: '[参謀室] 月次レポートエラー',
      body: err.message,
      color: 'error',
    });
  }
}

main().catch(err => {
  console.error('[参謀室] 致命的エラー:', err);
});

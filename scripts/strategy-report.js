/**
 * 参謀室 — 月次業界レポート + 戦略パートナー
 *
 * 処理フロー:
 *   1. Notion ウォッチリストDB から全エントリを取得
 *   2. Wamily 内部データ収集（スポット数、購読者数、バトン数、GA4）
 *   3. 過去の壁打ちログ・意思決定ログ取得（直近5件）
 *   4. 企業/キーワード/情報源のデータ収集
 *   5. Claude API で統合分析 + 問いかけ生成
 *   6. Notion 参謀室DB にレポート保存
 *   7. ウォッチリストDB の最終チェック日を更新
 *   8. #strategy にレポート + 問いかけ通知
 *
 * 環境変数:
 *   NOTION_API_KEY         — Notion API
 *   NOTION_STRATEGY_DB_ID  — 参謀室DB ID
 *   NOTION_WATCHLIST_DB_ID — ウォッチリストDB ID
 *   ANTHROPIC_API_KEY      — Claude API
 *   SLACK_WEBHOOK_STRATEGY — Slack通知
 *   （オプション）NEWSLETTER_SUBSCRIBERS_DB_ID, NOTION_BATON_DB_ID,
 *   GA4_PROPERTY_ID, GA4_CREDENTIALS — 内部データ用
 *
 * Usage:
 *   node scripts/strategy-report.js
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('@notionhq/client');
const Anthropic = require('@anthropic-ai/sdk');
const { notifySlack } = require('./lib/slack-notify');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_STRATEGY_DB_ID = process.env.NOTION_STRATEGY_DB_ID;
const NOTION_WATCHLIST_DB_ID = process.env.NOTION_WATCHLIST_DB_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DATA_DIR = path.join(__dirname, '..', 'data');

const SLUGS = [
  'london', 'taipei', 'paris', 'stockholm', 'singapore',
  'bangkok', 'manila', 'la', 'hawaii', 'seoul', 'hongkong'
];

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
    return text.slice(0, 2000);
  } catch {
    return null;
  }
}

function getReportMonth() {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月`;
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
// 2. Wamily 内部データ収集
// ──────────────────────────────────────────────────────────

async function collectInternalData(notion) {
  const data = {
    totalSpots: 0,
    countries: [],
    subscribers: 0,
    batons: 0,
    ga4_7d: null,
    ga4_30d: null,
  };

  // スポット数（JSONファイルから）
  for (const slug of SLUGS) {
    try {
      const spots = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `spots-${slug}.json`), 'utf8'));
      const count = spots.spots?.length || 0;
      data.totalSpots += count;
      if (count > 0) data.countries.push({ slug, spots: count });
    } catch {}
  }

  // 購読者数
  if (process.env.NEWSLETTER_SUBSCRIBERS_DB_ID) {
    try {
      data.subscribers = await countAll(notion, process.env.NEWSLETTER_SUBSCRIBERS_DB_ID,
        { property: 'ステータス', select: { equals: 'アクティブ' } });
    } catch {}
  }

  // バトン数
  if (process.env.NOTION_BATON_DB_ID) {
    try {
      data.batons = await countAll(notion, process.env.NOTION_BATON_DB_ID);
    } catch {}
  }

  // GA4
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
        const v = week.rows[0].metricValues;
        data.ga4_7d = { pv: Number(v[0].value), users: Number(v[1].value), sessions: Number(v[2].value) };
      }

      const month = await runReport(client, {
        propertyId, startDate: '30daysAgo', endDate: 'today',
        dimensions: [], metrics: ['screenPageViews', 'totalUsers', 'sessions'],
      });
      if (month.rows?.[0]) {
        const v = month.rows[0].metricValues;
        data.ga4_30d = { pv: Number(v[0].value), users: Number(v[1].value), sessions: Number(v[2].value) };
      }
    } catch (e) {
      console.warn('[参謀室] GA4取得エラー（スキップ）:', e.message);
    }
  }

  return data;
}

// ──────────────────────────────────────────────────────────
// 3. 過去の壁打ちログ取得（直近5件）
// ──────────────────────────────────────────────────────────

async function getRecentStrategyNotes(notion) {
  try {
    const res = await notion.databases.query({
      database_id: NOTION_STRATEGY_DB_ID,
      sorts: [{ property: '日付', direction: 'descending' }],
      page_size: 5,
    });

    const notes = [];
    for (const page of res.results) {
      const title = titleText(page.properties['タイトル']);
      const type = selectName(page.properties['タイプ']);
      const date = page.properties['日付']?.date?.start ?? '';

      // ページのコンテンツを取得（最初の2ブロック分）
      let content = '';
      try {
        const blocks = await notion.blocks.children.list({ block_id: page.id, page_size: 2 });
        content = blocks.results
          .filter(b => b.type === 'paragraph')
          .map(b => b.paragraph?.rich_text?.map(t => t.plain_text).join('') ?? '')
          .join('\n')
          .slice(0, 300);
      } catch {}

      notes.push({ title, type, date, content });
    }
    return notes;
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────
// 4. 外部データ収集
// ──────────────────────────────────────────────────────────

async function collectExternalData(watchlist) {
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
// 5. Claude API で統合分析 + 問いかけ
// ──────────────────────────────────────────────────────────

async function generateReport(externalData, internalData, recentNotes) {
  const anthropic = new Anthropic();
  const month = getReportMonth();

  // 内部データのサマリーを構築
  let internalSummary = `## Wamily 現在の状態\n`;
  internalSummary += `- 対応国数: ${internalData.countries.length}カ国（スポット合計 ${internalData.totalSpots}件）\n`;
  internalSummary += `- メルマガ購読者: ${internalData.subscribers}人\n`;
  internalSummary += `- 旅のバトン投稿: ${internalData.batons}件\n`;

  if (internalData.ga4_7d) {
    internalSummary += `- 直近7日: PV ${internalData.ga4_7d.pv} / ユーザー ${internalData.ga4_7d.users} / セッション ${internalData.ga4_7d.sessions}\n`;
  }
  if (internalData.ga4_30d) {
    internalSummary += `- 直近30日: PV ${internalData.ga4_30d.pv} / ユーザー ${internalData.ga4_30d.users} / セッション ${internalData.ga4_30d.sessions}\n`;
  }

  // 過去の壁打ちログ
  let notesContext = '';
  if (recentNotes.length > 0) {
    notesContext = `\n## 過去の壁打ち・意思決定ログ（直近）\n`;
    for (const note of recentNotes) {
      notesContext += `- [${note.date}] ${note.title}（${note.type}）: ${note.content}\n`;
    }
  }

  const prompt = `あなたはWamily（子連れ家族向け海外旅行ガイドブック＆コミュニティ）の参謀パートナーです。
ただレポートを出すだけでなく、Wamilyの現在地を踏まえて「次にどう動くべきか」を一緒に考える存在です。

Wamilyの特徴:
- 広告費をかけない。オーガニックと思想で仲間を作る
- サワディー家が実際に旅した記録をガイドブック化 → 旅行後に公開 → SNSで発信というサイクル
- コンテンツの「精度」が武器。量ではなく質
- まだ初期段階。数字は小さいが、だからこそ戦い方がある

${internalSummary}
${notesContext}

## ウォッチリスト（外部環境）

### 企業
${externalData.companies.map(c => `- ${c.name}（${c.category}）: ${c.memo}\n  サイト情報: ${c.content}`).join('\n') || '(なし)'}

### キーワード
${externalData.keywords.map(k => `- ${k.name}: ${k.memo}`).join('\n') || '(なし)'}

### 情報源
${externalData.sources.map(s => `- ${s.name}: ${s.content}`).join('\n') || '(なし)'}

## 出力フォーマット
以下の4セクションで作成してください。

🏢 企業動向
（各企業の最新動向を箇条書き・3〜5行）

📰 トレンド
（子連れ海外旅行に関する最新トレンドを箇条書き・3〜5行）

💡 Wamilyの現在地から見た示唆
（内部データと外部環境を照らし合わせて、Wamilyにとっての機会・リスクを箇条書き・3〜5行。数字が小さい段階だからこその視点を大事に）

❓ 今月、サワディーに問いかけたいこと
（以下の観点から、具体的で考えやすい問いを3つ。Yes/Noではなく「どうする？」系の問い）
- 過去の壁打ちログで決めたことの進捗や振り返り
- 外部環境の変化を踏まえて今月やるべきこと
- Wamilyの長期的なポジショニングに関すること`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
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

  // レポートを2000文字ずつのブロックに分割
  const blocks = [];
  for (let i = 0; i < report.length; i += 2000) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ text: { content: report.slice(i, i + 2000) } }],
      },
    });
  }

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
    children: blocks,
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

    // 2. 内部データ収集
    console.log('[参謀室] Wamily内部データ収集中...');
    const internalData = await collectInternalData(notion);
    console.log(`[参謀室] 内部データ: ${internalData.totalSpots}スポット / ${internalData.subscribers}購読者 / ${internalData.batons}バトン`);

    // 3. 過去の壁打ちログ取得
    console.log('[参謀室] 過去のログ取得中...');
    const recentNotes = await getRecentStrategyNotes(notion);
    console.log(`[参謀室] 過去ログ: ${recentNotes.length}件`);

    // 4. 外部データ収集
    console.log('[参謀室] 外部データ収集中...');
    const externalData = await collectExternalData(watchlist);

    // 5. Claude分析 + 問いかけ
    console.log('[参謀室] Claude APIでレポート + 問いかけ生成中...');
    const report = await generateReport(externalData, internalData, recentNotes);
    console.log('\n' + report);

    // 6. Notion保存
    await saveToNotion(notion, report);

    // 7. 最終チェック日更新
    await updateWatchlistDates(notion, watchlist);

    // 8. Slack通知
    const month = getReportMonth();
    const slackBody = report.length > 1200 ? report.slice(0, 1200) + '\n\n→ 全文: Notion参謀室DB' : report;

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

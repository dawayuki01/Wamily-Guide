/**
 * SNS部 — Instagram Graph API 週次アナリティクス分析
 *
 * 処理フロー:
 *   1. トークン有効期限チェック
 *   2. Instagram Graph API でデータ取得
 *   3. Notion Instagram投稿DB にデータ書き戻し
 *   4. 分析: ベスト投稿 / カテゴリ別平均リーチ / フォロワー増減
 *   5. #sns に週次レポート送信
 *
 * 環境変数:
 *   INSTAGRAM_ACCESS_TOKEN        — Instagram Graph API Long-lived Token
 *   INSTAGRAM_BUSINESS_ACCOUNT_ID — Instagram ビジネスアカウント ID
 *   NOTION_API_KEY                — Notion API
 *   NOTION_INSTAGRAM_DB_ID        — Instagram投稿DB ID
 *   SLACK_WEBHOOK_SNS             — Slack通知
 *
 * Instagram未設定時: 全処理をスキップしてconsole.logに出力。絶対にthrowしない。
 *
 * Usage:
 *   node scripts/sns-analytics.js
 *   node scripts/sns-analytics.js --reset-token-date
 */

const fs = require('fs');
const path = require('path');
const { notifySlack } = require('./lib/slack-notify');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TOKEN_STATE_PATH = path.join(DATA_DIR, '.sns-token-state.json');
const FOLLOWERS_STATE_PATH = path.join(DATA_DIR, '.sns-followers-state.json');

const INSTAGRAM_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const INSTAGRAM_ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_INSTAGRAM_DB_ID = process.env.NOTION_INSTAGRAM_DB_ID;

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

async function graphAPI(endpoint, params = {}) {
  const url = new URL(`https://graph.facebook.com/v19.0/${endpoint}`);
  url.searchParams.set('access_token', INSTAGRAM_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph API error ${res.status}: ${err}`);
  }
  return res.json();
}

// ──────────────────────────────────────────────────────────
// 1. トークン有効期限チェック
// ──────────────────────────────────────────────────────────

async function checkTokenExpiry() {
  let state = loadJson(TOKEN_STATE_PATH);

  // --reset-token-date フラグ
  if (process.argv.includes('--reset-token-date')) {
    state = { tokenCreatedAt: new Date().toISOString() };
    saveJson(TOKEN_STATE_PATH, state);
    console.log('[SNS] トークン作成日をリセットしました');
    return 'ok';
  }

  if (!state || !state.tokenCreatedAt) {
    // 初回: 現在日時を記録
    state = { tokenCreatedAt: new Date().toISOString() };
    saveJson(TOKEN_STATE_PATH, state);
    return 'ok';
  }

  const created = new Date(state.tokenCreatedAt);
  const now = new Date();
  const daysSinceCreation = Math.floor((now - created) / (1000 * 60 * 60 * 24));

  if (daysSinceCreation >= 60) {
    console.error('[SNS] トークンが期限切れ（60日経過）。処理を中断します。');
    await notifySlack({
      channel: 'sns',
      icon: '🚨',
      title: '[SNS部] Instagram トークン期限切れ',
      body: 'Long-lived Token が60日を超えています。処理を中断しました。\n手順: Meta Graph API Explorer → 新トークン取得 → GitHub Secrets 更新\n更新後: node scripts/sns-analytics.js --reset-token-date',
      color: 'error',
    });
    return 'expired';
  }

  if (daysSinceCreation >= 50) {
    console.warn(`[SNS] トークン更新リマインド（残り${60 - daysSinceCreation}日）`);
    await notifySlack({
      channel: 'sns',
      icon: '⚠️',
      title: '[SNS部] Instagram トークン更新リマインド',
      body: `Long-lived Token の有効期限が残り${60 - daysSinceCreation}日です。\n手順: Meta Graph API Explorer → 新トークン取得 → GitHub Secrets 更新\n更新後: node scripts/sns-analytics.js --reset-token-date`,
      color: 'warning',
    });
  }

  return 'ok';
}

// ──────────────────────────────────────────────────────────
// 2. Instagram データ取得
// ──────────────────────────────────────────────────────────

async function fetchAccountData() {
  const account = await graphAPI(INSTAGRAM_ACCOUNT_ID, {
    fields: 'followers_count,media_count',
  });
  return account;
}

async function fetchInsights() {
  try {
    const insights = await graphAPI(`${INSTAGRAM_ACCOUNT_ID}/insights`, {
      metric: 'profile_views,website_clicks',
      period: 'day',
      since: Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60,
      until: Math.floor(Date.now() / 1000),
    });
    return insights.data || [];
  } catch (e) {
    console.warn('[SNS] インサイト取得エラー:', e.message);
    return [];
  }
}

async function fetchRecentMedia() {
  const media = await graphAPI(`${INSTAGRAM_ACCOUNT_ID}/media`, {
    fields: 'id,caption,timestamp,like_count,comments_count,media_type',
    limit: '20',
  });

  const posts = media.data || [];

  // 各投稿のインサイトを取得
  for (const post of posts) {
    try {
      const insights = await graphAPI(`${post.id}/insights`, {
        metric: 'reach,saved,engagement',
      });
      post.insights = {};
      for (const metric of (insights.data || [])) {
        post.insights[metric.name] = metric.values?.[0]?.value ?? 0;
      }
    } catch {
      post.insights = { reach: 0, saved: 0, engagement: 0 };
    }
  }

  return posts;
}

// ──────────────────────────────────────────────────────────
// 3. Notion 書き戻し
// ──────────────────────────────────────────────────────────

async function updateNotionPosts(posts) {
  if (!NOTION_API_KEY || !NOTION_INSTAGRAM_DB_ID) {
    console.log('[SNS] Notion未設定。書き戻しスキップ');
    return;
  }

  const { Client } = require('@notionhq/client');
  const notion = new Client({ auth: NOTION_API_KEY });

  // 「投稿済み」ページを取得
  const res = await notion.databases.query({
    database_id: NOTION_INSTAGRAM_DB_ID,
    filter: {
      property: 'ステータス',
      select: { equals: '投稿済み' },
    },
  });

  for (const page of res.results) {
    const igId = page.properties['Instagram投稿ID']?.rich_text?.[0]?.plain_text;
    if (!igId) continue;

    const matchPost = posts.find(p => p.id === igId);
    if (!matchPost) continue;

    const updates = {};
    if (matchPost.insights?.reach != null) updates['リーチ'] = { number: matchPost.insights.reach };
    if (matchPost.like_count != null) updates['いいね'] = { number: matchPost.like_count };
    if (matchPost.insights?.saved != null) updates['保存数'] = { number: matchPost.insights.saved };
    if (matchPost.comments_count != null) updates['コメント数'] = { number: matchPost.comments_count };

    if (Object.keys(updates).length) {
      try {
        await notion.pages.update({ page_id: page.id, properties: updates });
      } catch (e) {
        console.warn(`[SNS] Notion更新エラー (${igId}):`, e.message);
      }
    }
  }

  console.log('[SNS] Notion書き戻し完了');
}

// ──────────────────────────────────────────────────────────
// 4. 分析 + レポート
// ──────────────────────────────────────────────────────────

function analyzeAndReport(account, insights, posts) {
  // フォロワー増減
  const followersState = loadJson(FOLLOWERS_STATE_PATH) || {};
  const prevFollowers = followersState.followers ?? account.followers_count;
  const followersDiff = account.followers_count - prevFollowers;

  // フォロワー状態を保存
  saveJson(FOLLOWERS_STATE_PATH, {
    followers: account.followers_count,
    updatedAt: new Date().toISOString(),
  });

  // インサイト集計
  let profileViews = 0;
  let websiteClicks = 0;
  for (const metric of insights) {
    const total = (metric.values || []).reduce((sum, v) => sum + (v.value || 0), 0);
    if (metric.name === 'profile_views') profileViews = total;
    if (metric.name === 'website_clicks') websiteClicks = total;
  }

  // ベスト投稿
  let bestPost = null;
  let bestReach = 0;
  for (const post of posts) {
    const reach = post.insights?.reach ?? 0;
    if (reach > bestReach) {
      bestReach = reach;
      bestPost = post;
    }
  }

  // カテゴリ別平均リーチ（キャプションからカテゴリ推定）
  const categoryReach = {};
  for (const post of posts) {
    const caption = post.caption || '';
    let cat = 'その他';
    if (caption.includes('#体験談') || caption.includes('体験')) cat = '体験談';
    else if (caption.includes('#スポット') || caption.includes('スポット')) cat = 'スポット紹介';
    else if (caption.includes('#Tips') || caption.includes('tips')) cat = 'Tips';

    if (!categoryReach[cat]) categoryReach[cat] = { total: 0, count: 0 };
    categoryReach[cat].total += (post.insights?.reach ?? 0);
    categoryReach[cat].count += 1;
  }

  // レポート構成
  const diffStr = followersDiff >= 0 ? `+${followersDiff}` : `${followersDiff}`;

  let body = `📊 アカウント状況\n┌ フォロワー: ${account.followers_count}人（${diffStr} 今週）\n├ プロフィール閲覧: ${profileViews}回\n└ ウェブサイトクリック: ${websiteClicks}回`;

  if (bestPost) {
    const caption = (bestPost.caption || '').slice(0, 30);
    const likes = bestPost.like_count || 0;
    const saved = bestPost.insights?.saved || 0;
    const engagement = bestPost.insights?.engagement || 0;
    const engRate = bestReach > 0 ? ((engagement / bestReach) * 100).toFixed(1) : '0.0';
    body += `\n\n🔥 今週のベスト投稿\n┌ 「${caption}...」\n├ リーチ: ${bestReach} / いいね: ${likes} / 保存: ${saved}\n└ エンゲージメント率: ${engRate}%`;
  }

  const catLines = Object.entries(categoryReach).map(([cat, data]) => {
    const avg = data.count > 0 ? Math.round(data.total / data.count) : 0;
    return `├ ${cat}: avg リーチ ${avg}`;
  });
  if (catLines.length) {
    catLines[catLines.length - 1] = catLines[catLines.length - 1].replace('├', '└');
    body += `\n\n📈 カテゴリ別パフォーマンス\n┌ ${catLines.join('\n')}`;
  }

  // 月次分析（25日以降）
  const today = new Date();
  if (today.getDate() >= 25) {
    body += `\n\n📅 月間集計\n┌ 投稿数: ${posts.length}件\n├ 平均リーチ: ${posts.length > 0 ? Math.round(posts.reduce((s, p) => s + (p.insights?.reach ?? 0), 0) / posts.length) : 0}\n└ フォロワー推移: ${prevFollowers} → ${account.followers_count}`;
  }

  return body;
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  console.log('[SNS] 週次Instagram分析 開始');

  // Instagram未設定時: 全スキップ
  if (!INSTAGRAM_TOKEN || !INSTAGRAM_ACCOUNT_ID) {
    console.log('[SNS] Instagram未設定。全処理をスキップします。');
    return;
  }

  // 1. トークンチェック
  const tokenStatus = await checkTokenExpiry();
  if (tokenStatus === 'expired') return;

  // --reset-token-date 時はここで終了
  if (process.argv.includes('--reset-token-date')) return;

  try {
    // 2. データ取得
    console.log('[SNS] Instagram APIからデータ取得中...');
    const account = await fetchAccountData();
    const insights = await fetchInsights();
    const posts = await fetchRecentMedia();

    console.log(`[SNS] アカウント: フォロワー${account.followers_count}人, 投稿${account.media_count}件`);
    console.log(`[SNS] 最新投稿${posts.length}件を取得`);

    // 3. Notion書き戻し
    await updateNotionPosts(posts);

    // 4. 分析 + レポート
    const body = analyzeAndReport(account, insights, posts);
    console.log('\n' + body);

    // 5. Slack通知
    await notifySlack({
      channel: 'sns',
      icon: '📱',
      title: '[SNS部] 週次Instagramレポート',
      body,
      color: 'success',
    });

    console.log('[SNS] 週次分析 完了');
  } catch (err) {
    console.error('[SNS] エラー:', err.message);
    await notifySlack({
      channel: 'sns',
      icon: '🚨',
      title: '[SNS部] Instagram分析エラー',
      body: err.message,
      color: 'error',
    });
  }
}

main().catch(err => {
  console.error('[SNS] 致命的エラー:', err);
  // 絶対にthrowしない
});

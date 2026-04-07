#!/usr/bin/env node
/**
 * Wamily Letter — メルマガ配信メインスクリプト
 *
 * RSS → Claude キュレーション → HTML メール生成 → Resend 配信
 *
 * 環境変数:
 *   ANTHROPIC_API_KEY          - Claude API キー
 *   RESEND_API_KEY             - Resend API キー
 *   NOTION_API_KEY             - Notion API キー
 *   NEWSLETTER_SUBSCRIBERS_DB_ID - Notion 購読者DB ID
 *   NEWSLETTER_GAS_URL         - GAS 配信停止エンドポイント（任意）
 */

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { Client: NotionClient } = require('@notionhq/client');
const { fetchAllArticles } = require('./newsletter/rss-fetcher');
const { buildCurationPrompt } = require('./newsletter/curate-prompt');
const { buildCuratedHtml } = require('./newsletter/email-template');

// ===== 設定 =====
const SITE_URL = 'https://dawayuki01.github.io/Wamily-Guide';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'hello@send.tomoyukisawada.com';
const BATCH_SIZE = 50;
const HISTORY_PATH = path.join(__dirname, '..', 'data', 'newsletter-history.json');

/** 過去に配信した記事URLを読み込む */
function loadHistory() {
  try {
    const raw = fs.readFileSync(HISTORY_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/** 配信した記事URLを履歴に追加して保存（直近8週分 = 40記事を保持） */
function saveHistory(existingHistory, newUrls) {
  const updated = [...existingHistory, ...newUrls].slice(-40);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(updated, null, 2) + '\n');
  return updated;
}

async function main() {
  console.log('=== Wamily Letter 配信開始 ===');
  console.log(`日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);

  // ===== 1. RSS フィードから記事を収集 =====
  console.log('\n[1/5] RSS フィード収集中...');
  const allArticles = await fetchAllArticles();

  if (allArticles.length === 0) {
    console.error('記事が取得できませんでした。配信を中止します。');
    process.exit(1);
  }

  // 過去に配信した記事を除外
  const history = loadHistory();
  const historySet = new Set(history);
  const rawArticles = allArticles.filter(a => !historySet.has(a.url));

  console.log(`  → ${allArticles.length} 件取得 → 履歴除外後 ${rawArticles.length} 件`);

  if (rawArticles.length < 5) {
    console.error('新しい記事が5件未満です。配信を中止します。');
    process.exit(1);
  }

  // ===== 2. Claude でキュレーション =====
  console.log('\n[2/5] Claude でキュレーション中...');
  const anthropic = new Anthropic();

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: buildCurationPrompt(rawArticles) }],
  });

  const curationRaw = response.content[0].text;

  let curatedItems;
  try {
    const jsonMatch = curationRaw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found');
    const parsed = JSON.parse(jsonMatch[0]);
    curatedItems = parsed.items;
  } catch (err) {
    console.error('Claude の出力をパースできません:', err.message);
    console.error('生の出力:', curationRaw.slice(0, 500));
    process.exit(1);
  }

  if (!curatedItems || curatedItems.length === 0) {
    console.error('Claude がキュレーション結果を返しませんでした。');
    process.exit(1);
  }

  console.log(`  → ${curatedItems.length} 件の記事をキュレーション`);
  curatedItems.forEach((item, i) => {
    console.log(`    [${i + 1}] ${item.title_ja} (${item.category_label})`);
  });

  // ===== 3. 購読者を取得 =====
  console.log('\n[3/5] Notion から購読者を取得中...');
  const notion = new NotionClient({ auth: process.env.NOTION_API_KEY });
  const dbId = process.env.NEWSLETTER_SUBSCRIBERS_DB_ID;

  const subscribers = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: dbId,
      filter: { property: 'ステータス', select: { equals: 'アクティブ' } },
      start_cursor: cursor,
    });
    for (const page of res.results) {
      const email = page.properties['メールアドレス']?.title?.[0]?.plain_text;
      const token = page.properties['解除トークン']?.rich_text?.[0]?.plain_text;
      if (email && token) {
        subscribers.push({ email, unsubscribe_token: token });
      }
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  console.log(`  → ${subscribers.length} 人のアクティブ購読者`);

  if (subscribers.length === 0) {
    console.log('アクティブな購読者がいません。配信をスキップします。');
    return;
  }

  // ===== 4. HTML メール生成 & Resend で配信 =====
  console.log('\n[4/5] メール配信中...');

  // Resend SDK（動的インポート — ESM パッケージ対応）
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  const issueDate = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const subject = `🌱 今週の「旅と家族」の種 — ${curatedItems.length}本のキュレーション`;

  // GAS 配信停止URL のベース
  const gasUrl = process.env.NEWSLETTER_GAS_URL || '';

  let successCount = 0;
  const errors = [];

  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const batch = subscribers.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async sub => {
        const unsubscribeUrl = gasUrl
          ? `${gasUrl}?action=unsubscribe&token=${sub.unsubscribe_token}`
          : `${SITE_URL}/connect/#unsubscribe`;

        const html = buildCuratedHtml({
          subject,
          issueDate,
          items: curatedItems,
          unsubscribeUrl,
          siteUrl: SITE_URL,
        });

        try {
          const result = await resend.emails.send({
            from: `Wamily <${FROM_EMAIL}>`,
            to: sub.email,
            subject,
            html,
          });

          if (result.error) {
            errors.push(`${sub.email}: ${result.error.message}`);
          } else {
            successCount++;
          }
        } catch (err) {
          errors.push(`${sub.email}: ${err.message}`);
        }
      })
    );
  }

  console.log(`  → ${successCount}/${subscribers.length} 件送信成功`);
  if (errors.length > 0) {
    console.warn('  送信エラー:');
    errors.forEach(e => console.warn(`    - ${e}`));
  }

  // ===== 5. 配信履歴を保存 & 完了 =====
  console.log('\n[5/5] 配信履歴を保存中...');
  const sentUrls = curatedItems.map(item => item.url);
  saveHistory(history, sentUrls);
  console.log(`  → ${sentUrls.length} 件を履歴に追加（合計 ${Math.min(history.length + sentUrls.length, 40)} 件保持）`);

  console.log('\n配信完了');
  console.log(`件名: ${subject}`);
  console.log(`記事数: ${curatedItems.length}`);
  console.log(`送信成功: ${successCount}`);
  console.log(`送信失敗: ${errors.length}`);
  console.log('\n=== Wamily Letter 配信完了 ===');
}

main().catch(err => {
  console.error('致命的エラー:', err);
  process.exit(1);
});

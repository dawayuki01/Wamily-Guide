#!/usr/bin/env node
/**
 * newsletter-sequence.js
 * 登録日からの経過日数に応じてシーケンスメールを配信する。
 *
 * 環境変数:
 *   NOTION_API_KEY              — Notion API
 *   NEWSLETTER_SUBSCRIBERS_DB_ID — 購読者DB ID
 *   RESEND_API_KEY              — Resend メール送信
 *   RESEND_FROM_EMAIL           — 送信元（デフォルト: hello@send.tomoyukisawada.com）
 *   SLACK_WEBHOOK_NEWSLETTER    — Slack通知
 *   NEWSLETTER_GAS_URL          — GAS 配信停止エンドポイント（任意）
 *   DRY_RUN                     — 'true' でメール送信・Notion更新をスキップ
 */

const { Client: NotionClient } = require('@notionhq/client');
const { notifySlack } = require('./lib/slack-notify');
const templates = require('./newsletter/sequence-templates');

const SITE_URL = 'https://dawayuki01.github.io/Wamily-Guide';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'hello@send.tomoyukisawada.com';
const DRY_RUN = process.env.DRY_RUN === 'true';

// ── シーケンス定義 ──
// Phase 1: ウェルカムメール1通のみ
// Phase 2（Wamily成長後）: ステップ追加を検討
const SEQUENCE = [
  { step: 1, daysAfter: 1,  template: 'welcome',   subject: 'Wamilyへようこそ — 仲間になってくれてありがとうございます' },
];

// ──────────────────────────────────────────────────────────
// 購読者取得
// ──────────────────────────────────────────────────────────

async function fetchSequenceSubscribers(notion, dbId) {
  const subscribers = [];
  let cursor;

  do {
    const res = await notion.databases.query({
      database_id: dbId,
      filter: {
        and: [
          { property: 'ステータス', select: { equals: 'アクティブ' } },
          { property: 'シーケンスステップ', number: { less_than: 999 } },
        ],
      },
      start_cursor: cursor,
    });

    for (const page of res.results) {
      const email = page.properties['メールアドレス']?.title?.[0]?.plain_text;
      const token = page.properties['解除トークン']?.rich_text?.[0]?.plain_text;
      const registeredDate = page.properties['登録日']?.date?.start;
      const currentStep = page.properties['シーケンスステップ']?.number ?? 0;

      if (email) {
        subscribers.push({
          pageId: page.id,
          email,
          unsubscribe_token: token || '',
          registeredDate,
          currentStep,
        });
      }
    }

    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return subscribers;
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  console.log('=== シーケンスメール配信 ===');
  console.log(`日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
  if (DRY_RUN) console.log('⚠️  DRY_RUN モード: 送信・更新はスキップされます\n');

  const notion = new NotionClient({ auth: process.env.NOTION_API_KEY });
  const dbId = process.env.NEWSLETTER_SUBSCRIBERS_DB_ID;

  if (!dbId) {
    console.error('❌ NEWSLETTER_SUBSCRIBERS_DB_ID が未設定');
    process.exit(1);
  }

  // 購読者取得
  console.log('\n[1] シーケンス対象の購読者を取得中...');
  const subscribers = await fetchSequenceSubscribers(notion, dbId);
  console.log(`  → ${subscribers.length} 人が対象`);

  if (subscribers.length === 0) {
    console.log('  対象者なし。終了します。');
    await notifySlack({
      channel: 'newsletter',
      icon: '📧',
      title: '[メルマガ部] シーケンスメール — 対象者なし',
      body: '本日の配信対象者はいませんでした',
      color: 'success',
    });
    return;
  }

  // Resend SDK（DRY_RUN でなければ）
  let resend;
  if (!DRY_RUN) {
    const { Resend } = await import('resend');
    resend = new Resend(process.env.RESEND_API_KEY);
  }

  const gasUrl = process.env.NEWSLETTER_GAS_URL || '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let sentCount = 0;
  let skipCount = 0;
  const errors = [];

  console.log('\n[2] シーケンスメール送信中...');

  for (const sub of subscribers) {
    // 登録日チェック
    if (!sub.registeredDate) {
      console.warn(`  ⚠️ ${sub.email}: 登録日が未設定 → スキップ`);
      skipCount++;
      continue;
    }

    const regDate = new Date(sub.registeredDate);
    regDate.setHours(0, 0, 0, 0);
    const daysSinceReg = Math.floor((today - regDate) / (1000 * 60 * 60 * 24));

    // 次のステップを決定（currentStep は完了済みステップ数）
    const nextSeq = SEQUENCE.find(s => s.step === sub.currentStep + 1);

    if (!nextSeq) {
      // 全ステップ完了済み → 999 に更新
      if (sub.currentStep < 999 && sub.currentStep >= SEQUENCE.length) {
        if (!DRY_RUN) {
          await notion.pages.update({
            page_id: sub.pageId,
            properties: { 'シーケンスステップ': { number: 999 } },
          });
        }
        console.log(`  ✅ ${sub.email}: 全ステップ完了 → 999 に更新`);
      }
      continue;
    }

    // 経過日数チェック
    if (daysSinceReg < nextSeq.daysAfter) {
      continue; // まだ送信タイミングではない
    }

    // テンプレート取得
    const templateFn = templates[nextSeq.template];
    if (!templateFn) {
      console.error(`  ❌ テンプレート未定義: ${nextSeq.template}`);
      errors.push(`${sub.email}: テンプレート ${nextSeq.template} 未定義`);
      continue;
    }

    const unsubscribeUrl = gasUrl
      ? `${gasUrl}?action=unsubscribe&token=${sub.unsubscribe_token}`
      : `${SITE_URL}/connect/#unsubscribe`;

    const html = templateFn(sub, unsubscribeUrl);
    const subject = nextSeq.subject;

    if (DRY_RUN) {
      console.log(`  📧 [DRY_RUN] ${sub.email}: Step ${nextSeq.step} "${subject}" (${daysSinceReg}日目)`);
      sentCount++;
      continue;
    }

    // メール送信（1回リトライ）
    let sent = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await resend.emails.send({
          from: `Wamily <${FROM_EMAIL}>`,
          to: sub.email,
          subject,
          html,
        });

        if (result.error) {
          if (attempt === 0) {
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          errors.push(`${sub.email}: ${result.error.message}`);
        } else {
          sent = true;
        }
        break;
      } catch (err) {
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        errors.push(`${sub.email}: ${err.message}`);
      }
    }

    if (sent) {
      // Notion更新
      const newStep = nextSeq.step >= SEQUENCE.length ? 999 : nextSeq.step;
      await notion.pages.update({
        page_id: sub.pageId,
        properties: { 'シーケンスステップ': { number: newStep } },
      });
      sentCount++;
      console.log(`  ✅ ${sub.email}: Step ${nextSeq.step} "${subject}" 送信完了`);
    } else {
      console.log(`  ❌ ${sub.email}: Step ${nextSeq.step} 送信失敗`);
    }

    // レート制限対策
    await new Promise(r => setTimeout(r, 500));
  }

  // 結果表示
  console.log(`\n=== 結果 ===`);
  console.log(`送信成功: ${sentCount}件`);
  console.log(`スキップ: ${skipCount}件`);
  console.log(`エラー: ${errors.length}件`);
  if (errors.length > 0) {
    errors.forEach(e => console.warn(`  - ${e}`));
  }

  // Slack通知
  await notifySlack({
    channel: 'newsletter',
    icon: errors.length ? '⚠️' : '📧',
    title: `[メルマガ部] シーケンスメール ${errors.length ? '一部エラー' : '完了'}`,
    body: DRY_RUN ? `[DRY_RUN] ${sentCount}件処理` : `${sentCount}件送信`,
    color: errors.length ? 'warning' : 'success',
    fields: [
      { label: '送信', value: `${sentCount}件` },
      { label: 'スキップ', value: `${skipCount}件` },
      { label: 'エラー', value: `${errors.length}件` },
    ],
  });
}

main().catch(async err => {
  console.error('致命的エラー:', err);
  await notifySlack({
    channel: 'newsletter',
    icon: '🔴',
    title: '[メルマガ部] シーケンスメール エラー',
    body: err.message || String(err),
    color: 'error',
  });
  process.exit(1);
});

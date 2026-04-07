#!/usr/bin/env node
/**
 * Wamily Letter — お知らせ配信スクリプト
 *
 * Notion「メルマガお知らせDB」から配信予定日が今日のお知らせを取得し、
 * ページ本文（ブロック）を読み取ってHTMLメールに変換、購読者全員に配信する。
 *
 * 環境変数:
 *   RESEND_API_KEY             - Resend API キー
 *   NOTION_API_KEY             - Notion API キー
 *   NEWSLETTER_SUBSCRIBERS_DB_ID - Notion 購読者DB ID
 *   NEWSLETTER_GAS_URL         - GAS 配信停止エンドポイント（任意）
 */

const { Client: NotionClient } = require('@notionhq/client');
const { buildAnnounceHtml } = require('./newsletter/announce-template');

// ===== 設定 =====
const SITE_URL = 'https://dawayuki01.github.io/Wamily-Guide';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'hello@send.tomoyukisawada.com';
const BATCH_SIZE = 50;
const ANNOUNCE_DB_ID = process.env.NEWSLETTER_ANNOUNCE_DB_ID || '8735e68462ce47b18fb4fd99e9a0725e';
const TEST_EMAIL = process.env.NEWSLETTER_TEST_EMAIL || 'pr@tomoyukisawada.com';

// ===== Notion ブロック → メール用 HTML 変換 =====

/** リッチテキスト配列をインラインHTMLに変換 */
function richTextToHtml(richTexts) {
  if (!richTexts || richTexts.length === 0) return '';
  return richTexts.map(rt => {
    let text = rt.plain_text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // 改行を <br> に
    text = text.replace(/\n/g, '<br>');
    if (rt.annotations.bold) text = `<strong>${text}</strong>`;
    if (rt.annotations.italic) text = `<em>${text}</em>`;
    if (rt.annotations.underline) text = `<u>${text}</u>`;
    if (rt.href) {
      text = `<a href="${rt.href}" style="color: #2a9d8f; text-decoration: none;">${text}</a>`;
    }
    return text;
  }).join('');
}

/** Notion ブロック配列 → メール用 HTML 文字列 */
function blocksToHtml(blocks) {
  const parts = [];
  let listBuffer = []; // 連続するリストアイテムをまとめる
  let listType = null;

  function flushList() {
    if (listBuffer.length === 0) return;
    const tag = listType === 'numbered' ? 'ol' : 'ul';
    const items = listBuffer.map(li =>
      `<li style="margin-bottom: 4px;">${li}</li>`
    ).join('');
    parts.push(`<${tag} style="margin: 0 0 16px 0; padding-left: 24px; font-size: 13px; color: #4a4a4a; line-height: 1.9;">${items}</${tag}>`);
    listBuffer = [];
    listType = null;
  }

  for (const block of blocks) {
    const type = block.type;

    // リスト以外が来たらリストバッファをフラッシュ
    if (type !== 'bulleted_list_item' && type !== 'numbered_list_item') {
      flushList();
    }

    switch (type) {
      case 'paragraph': {
        const html = richTextToHtml(block.paragraph.rich_text);
        if (html) {
          parts.push(`<p style="margin: 0 0 16px 0; font-size: 13px; color: #4a4a4a; line-height: 1.9; font-weight: 300;">${html}</p>`);
        } else {
          // 空段落 = スペーサー
          parts.push('<div style="height: 8px;"></div>');
        }
        break;
      }
      case 'heading_2': {
        const html = richTextToHtml(block.heading_2.rich_text);
        parts.push(`<h2 style="margin: 8px 0 14px 0; font-family: 'Noto Serif JP', Georgia, 'Times New Roman', serif; font-size: 18px; font-weight: 500; color: #2c2c2c; line-height: 1.5;">${html}</h2>`);
        break;
      }
      case 'heading_3': {
        const html = richTextToHtml(block.heading_3.rich_text);
        parts.push(`<h3 style="margin: 8px 0 10px 0; font-family: 'Noto Serif JP', Georgia, 'Times New Roman', serif; font-size: 15px; font-weight: 500; color: #2c2c2c; line-height: 1.5;">${html}</h3>`);
        break;
      }
      case 'bulleted_list_item': {
        listType = 'bulleted';
        listBuffer.push(richTextToHtml(block.bulleted_list_item.rich_text));
        break;
      }
      case 'numbered_list_item': {
        listType = 'numbered';
        listBuffer.push(richTextToHtml(block.numbered_list_item.rich_text));
        break;
      }
      case 'quote': {
        const html = richTextToHtml(block.quote.rich_text);
        parts.push(`<blockquote style="margin: 0 0 16px 0; padding-left: 14px; border-left: 2px solid #2a9d8f; font-size: 13px; color: #6b6b6b; line-height: 1.9; font-style: italic;">${html}</blockquote>`);
        break;
      }
      case 'callout': {
        const icon = block.callout.icon?.emoji || '💡';
        const html = richTextToHtml(block.callout.rich_text);
        parts.push(`<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px;"><tr><td style="background-color: #f0faf8; border-radius: 8px; padding: 16px 20px;"><span style="font-size: 16px; margin-right: 8px;">${icon}</span><span style="font-size: 13px; color: #4a4a4a; line-height: 1.8;">${html}</span></td></tr></table>`);
        break;
      }
      case 'bookmark': {
        const url = block.bookmark.url;
        if (url) {
          parts.push(`<p style="margin: 0 0 16px 0;"><a href="${url}" style="display: inline-block; padding: 10px 22px; background-color: #2a9d8f; color: #FFFFFF; text-decoration: none; font-size: 12px; letter-spacing: 0.08em; border-radius: 999px;">詳しくはこちら →</a></p>`);
        }
        break;
      }
      case 'divider': {
        parts.push('<div style="border-top: 1px solid #e8e4de; margin: 20px 0;"></div>');
        break;
      }
      case 'image': {
        const url = block.image.type === 'file' ? block.image.file.url : block.image.external?.url;
        if (url) {
          const caption = block.image.caption?.length > 0 ? richTextToHtml(block.image.caption) : '';
          parts.push(`<div style="margin: 0 0 16px 0; text-align: center;"><img src="${url}" alt="${caption}" style="max-width: 100%; border-radius: 8px;" />${caption ? `<p style="margin: 4px 0 0 0; font-size: 11px; color: #8a8a8a;">${caption}</p>` : ''}</div>`);
        }
        break;
      }
      // 未対応ブロックは無視
      default:
        break;
    }
  }

  flushList(); // 最後のリストバッファをフラッシュ
  return parts.join('\n');
}

// ===== Notion DB & ページ取得 =====

/**
 * Notion からお知らせを取得（ページ本文含む）
 * - ステータス＝未配信
 * - 配信予定日＝今日 or 過去（取りこぼし対応）
 */
/**
 * Notion からお知らせを取得（ページ本文含む）
 * - 「テスト」ステータス → テスト送信用（配信予定日は無視）
 * - 「未配信」＋配信予定日≦今日 → 本番配信用
 */
async function fetchAnnouncements(notion) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // テスト送信分を取得
  const testRes = await notion.databases.query({
    database_id: ANNOUNCE_DB_ID,
    filter: { property: 'ステータス', select: { equals: 'テスト' } },
  });

  // 本番配信分を取得
  const prodRes = await notion.databases.query({
    database_id: ANNOUNCE_DB_ID,
    filter: {
      and: [
        { property: 'ステータス', select: { equals: '未配信' } },
        { property: '配信予定日', date: { on_or_before: today } },
      ],
    },
  });

  const results = [];

  for (const page of testRes.results) {
    const title = page.properties['タイトル']?.title?.[0]?.plain_text || '';
    if (!title) continue;
    const blocksRes = await notion.blocks.children.list({ block_id: page.id });
    results.push({
      pageId: page.id,
      title,
      bodyHtml: blocksToHtml(blocksRes.results),
      isTest: true,
    });
  }

  for (const page of prodRes.results) {
    const title = page.properties['タイトル']?.title?.[0]?.plain_text || '';
    if (!title) continue;
    const blocksRes = await notion.blocks.children.list({ block_id: page.id });
    results.push({
      pageId: page.id,
      title,
      bodyHtml: blocksToHtml(blocksRes.results),
      isTest: false,
    });
  }

  return results;
}

/** お知らせのステータスを「配信済み」に更新 */
async function markAnnouncementsSent(notion, announcements) {
  for (const a of announcements) {
    try {
      await notion.pages.update({
        page_id: a.pageId,
        properties: { 'ステータス': { select: { name: '配信済み' } } },
      });
    } catch (err) {
      console.warn(`  ステータス更新エラー: ${err.message}`);
    }
  }
}

// ===== メイン =====

/** メール送信ヘルパー */
async function sendEmails(resend, recipients, subject, announcements, gasUrl, issueDate) {
  let successCount = 0;
  const errors = [];

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(
      batch.map(async sub => {
        const unsubscribeUrl = gasUrl
          ? `${gasUrl}?action=unsubscribe&token=${sub.unsubscribe_token}`
          : `${SITE_URL}/connect/#unsubscribe`;

        const html = buildAnnounceHtml({
          issueDate,
          announcements,
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

  return { successCount, errors };
}

async function main() {
  console.log('=== Wamily Letter お知らせ配信 ===');
  console.log(`日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);

  const notion = new NotionClient({ auth: process.env.NOTION_API_KEY });

  // ===== 1. お知らせを取得 =====
  console.log('\n[1] お知らせ確認中...');
  const allAnnouncements = await fetchAnnouncements(notion);

  const testItems = allAnnouncements.filter(a => a.isTest);
  const prodItems = allAnnouncements.filter(a => !a.isTest);

  if (testItems.length === 0 && prodItems.length === 0) {
    console.log('  → 配信予定のお知らせはありません。終了します。');
    return;
  }

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const gasUrl = process.env.NEWSLETTER_GAS_URL || '';
  const issueDate = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // ===== 2. テスト送信（ステータス=テスト → サワディーだけに送信） =====
  if (testItems.length > 0) {
    console.log(`\n[テスト送信] ${testItems.length} 件 → ${TEST_EMAIL} のみ`);
    testItems.forEach(a => console.log(`    - ${a.title}`));

    const subject = testItems.length === 1
      ? `🧪 【テスト】${testItems[0].title}`
      : `🧪 【テスト】Wamily お知らせ（${testItems.length}件）`;

    const { successCount, errors } = await sendEmails(
      resend,
      [{ email: TEST_EMAIL, unsubscribe_token: 'test' }],
      subject,
      testItems,
      gasUrl,
      issueDate,
    );

    console.log(`  → ${successCount > 0 ? '送信成功 ✓' : '送信失敗 ✗'}`);
    if (errors.length > 0) errors.forEach(e => console.warn(`    - ${e}`));

    // テスト → テスト済みに更新
    if (successCount > 0) {
      for (const a of testItems) {
        await notion.pages.update({
          page_id: a.pageId,
          properties: { 'ステータス': { select: { name: 'テスト済み' } } },
        });
      }
      console.log(`  → ${testItems.length} 件を「テスト済み」に更新`);
    }
  }

  // ===== 3. 本番配信（ステータス=未配信＋配信予定日≦今日 → 全購読者） =====
  if (prodItems.length > 0) {
    console.log(`\n[本番配信] ${prodItems.length} 件 → 全購読者`);
    prodItems.forEach(a => console.log(`    - ${a.title}`));

    // 購読者を取得
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

    if (subscribers.length > 0) {
      const subject = prodItems.length === 1
        ? `📢 ${prodItems[0].title}`
        : `📢 Wamily からのお知らせ（${prodItems.length}件）`;

      const { successCount, errors } = await sendEmails(
        resend, subscribers, subject, prodItems, gasUrl, issueDate,
      );

      console.log(`  → ${successCount}/${subscribers.length} 件送信成功`);
      if (errors.length > 0) errors.forEach(e => console.warn(`    - ${e}`));

      // 配信済みに更新
      if (successCount > 0) {
        await markAnnouncementsSent(notion, prodItems);
        console.log(`  → ${prodItems.length} 件を「配信済み」に更新`);
      }
    }
  }

  console.log('\n=== Wamily Letter お知らせ配信完了 ===');
}

main().catch(err => {
  console.error('致命的エラー:', err);
  process.exit(1);
});

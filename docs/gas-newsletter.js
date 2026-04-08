/**
 * Wamily メルマガ — GAS Web App
 *
 * 機能:
 * 1. メルマガ登録（doPost）→ Notion購読者DB追加 + ウェルカムメール即時送信 + 管理者通知
 * 2. 配信停止（doGet ?action=unsubscribe&token=xxx）→ Notion ステータス「停止」に更新
 *
 * スクリプトプロパティ:
 *   NOTION_API_KEY    - Notion API キー
 *   NEWSLETTER_DB_ID  - 購読者DB ID
 *   NOTIFY_EMAIL      - 管理者通知先メール
 *   RESEND_API_KEY    - Resend API キー（ウェルカムメール送信用）
 */

// ===== 設定 =====
const PROPS = PropertiesService.getScriptProperties();
const NOTION_API_KEY = PROPS.getProperty('NOTION_API_KEY');
const DB_ID = PROPS.getProperty('NEWSLETTER_DB_ID');
const NOTIFY_EMAIL = PROPS.getProperty('NOTIFY_EMAIL');
const RESEND_API_KEY = PROPS.getProperty('RESEND_API_KEY');

const SITE_URL = 'https://dawayuki01.github.io/Wamily-Guide';
const FROM_EMAIL = 'Wamily <hello@send.tomoyukisawada.com>';
const GAS_URL = ScriptApp.getService().getUrl();

// ===== メルマガ登録（POST）=====
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const email = (data.email || '').trim().toLowerCase();
    const source = data.source || '不明';

    // バリデーション
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return jsonResponse(400, { success: false, error: 'invalid_email' });
    }

    // 重複チェック
    const existing = findSubscriber(email);

    if (existing) {
      const status = existing.properties['ステータス']?.select?.name;
      if (status === 'アクティブ') {
        return jsonResponse(200, { success: false, error: 'already_subscribed' });
      }
      // 停止中 → 再アクティブ化
      reactivateSubscriber(existing.id);
      notifyAdmin(email, source, '再登録');
      return jsonResponse(200, { success: true });
    }

    // 新規登録
    const token = Utilities.getUuid();
    createSubscriber(email, source, token);
    notifyAdmin(email, source, '新規登録');

    // ウェルカムメール送信
    const unsubscribeUrl = GAS_URL + '?action=unsubscribe&token=' + token;
    sendWelcomeEmail(email, unsubscribeUrl);

    return jsonResponse(200, { success: true });

  } catch (err) {
    console.error('doPost error:', err);
    return jsonResponse(500, { success: false, error: 'server_error' });
  }
}

// ===== 配信停止（GET）=====
function doGet(e) {
  const action = (e.parameter.action || '').toLowerCase();
  const token = e.parameter.token || '';

  if (action === 'unsubscribe' && token) {
    const subscriber = findSubscriberByToken(token);
    if (subscriber) {
      updateStatus(subscriber.id, '停止');
      return HtmlService.createHtmlOutput(
        '<html><body style="font-family:sans-serif;text-align:center;padding:60px;">' +
        '<h2>配信を停止しました</h2>' +
        '<p>Wamily Letterの配信を停止しました。</p>' +
        '<p>またいつでも再登録できます。</p>' +
        '<p><a href="' + SITE_URL + '">Wamily Guide に戻る</a></p>' +
        '</body></html>'
      );
    }
    return HtmlService.createHtmlOutput(
      '<html><body style="font-family:sans-serif;text-align:center;padding:60px;">' +
      '<h2>トークンが見つかりません</h2>' +
      '<p>すでに配信停止済みか、リンクが無効です。</p>' +
      '</body></html>'
    );
  }

  return HtmlService.createHtmlOutput('Wamily Newsletter API');
}

// ===== Notion API ヘルパー =====

function notionFetch(endpoint, options) {
  const url = 'https://api.notion.com/v1' + endpoint;
  const defaultOptions = {
    headers: {
      'Authorization': 'Bearer ' + NOTION_API_KEY,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
  };
  const merged = Object.assign({}, defaultOptions, options);
  if (options.payload) {
    merged.payload = JSON.stringify(options.payload);
    merged.method = 'post';
  }
  if (options.method) merged.method = options.method;
  const res = UrlFetchApp.fetch(url, merged);
  return JSON.parse(res.getContentText());
}

function findSubscriber(email) {
  const res = notionFetch('/databases/' + DB_ID + '/query', {
    payload: {
      filter: {
        property: 'メールアドレス',
        title: { equals: email },
      },
    },
  });
  return res.results.length > 0 ? res.results[0] : null;
}

function findSubscriberByToken(token) {
  const res = notionFetch('/databases/' + DB_ID + '/query', {
    payload: {
      filter: {
        property: '解除トークン',
        rich_text: { equals: token },
      },
    },
  });
  return res.results.length > 0 ? res.results[0] : null;
}

function createSubscriber(email, source, token) {
  const today = new Date().toISOString().split('T')[0];
  return notionFetch('/pages', {
    payload: {
      parent: { database_id: DB_ID },
      properties: {
        'メールアドレス': { title: [{ text: { content: email } }] },
        'ステータス': { select: { name: 'アクティブ' } },
        '登録元': { select: { name: source } },
        '登録日': { date: { start: today } },
        '解除トークン': { rich_text: [{ text: { content: token } }] },
        'シーケンスステップ': { number: 1 },
      },
    },
  });
}

function reactivateSubscriber(pageId) {
  return notionFetch('/pages/' + pageId, {
    method: 'patch',
    payload: {
      properties: {
        'ステータス': { select: { name: 'アクティブ' } },
      },
    },
  });
}

function updateStatus(pageId, status) {
  return notionFetch('/pages/' + pageId, {
    method: 'patch',
    payload: {
      properties: {
        'ステータス': { select: { name: status } },
      },
    },
  });
}

// ===== ウェルカムメール送信（Resend API）=====

function sendWelcomeEmail(email, unsubscribeUrl) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY が未設定。ウェルカムメール送信をスキップ。');
    return;
  }

  const subject = '🌱 Wamily Letterへのご登録ありがとうございます';
  const html = buildWelcomeHtml(unsubscribeUrl);

  try {
    const res = UrlFetchApp.fetch('https://api.resend.com/emails', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
      },
      payload: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: subject,
        html: html,
      }),
    });
    console.log('ウェルカムメール送信成功:', email, res.getContentText());
  } catch (err) {
    console.error('ウェルカムメール送信エラー:', err);
    // エラーでも登録自体は成功させる（ウェルカムメールは best effort）
  }
}

function buildWelcomeHtml(unsubscribeUrl) {
  return '<!DOCTYPE html>' +
  '<html lang="ja">' +
  '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Wamilyへようこそ</title></head>' +
  '<body style="margin: 0; padding: 0; background-color: #faf8f4; font-family: \'Helvetica Neue\', Arial, \'Hiragino Kaku Gothic ProN\', \'Hiragino Sans\', Meiryo, sans-serif;">' +
  '<div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; color: #faf8f4;">Wamily Letterへのご登録ありがとうございます。</div>' +
  '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #faf8f4;">' +
  '<tr><td align="center" style="padding: 40px 16px;">' +
  '<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.04);">' +

  // HEADER
  '<tr><td style="padding: 32px 40px 24px; border-bottom: 1px solid #e8e4de;">' +
  '<div style="font-family: \'Noto Serif JP\', Georgia, \'Times New Roman\', serif; font-size: 22px; font-weight: 500; color: #2c2c2c; letter-spacing: 0.04em;"><span style="color: #2a9d8f;">W</span>amily</div>' +
  '<div style="font-size: 10px; color: #8a8a8a; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 2px;">Family Travel Guide</div>' +
  '</td></tr>' +

  // BODY
  '<tr><td style="padding: 32px 40px;">' +
  '<div style="width: 32px; height: 2px; background-color: #e4a853; margin-bottom: 20px;"></div>' +

  '<h1 style="margin: 0 0 24px 0; font-family: \'Noto Serif JP\', Georgia, \'Times New Roman\', serif; font-size: 20px; font-weight: 500; color: #2c2c2c; line-height: 1.6;">Wamily Letterへようこそ</h1>' +

  '<p style="margin: 0 0 20px 0; font-size: 13px; color: #4a4a4a; line-height: 2.0; font-weight: 300;">' +
  'Wamily Letterにご登録いただき、本当にありがとうございます。</p>' +

  '<p style="margin: 0 0 20px 0; font-size: 13px; color: #4a4a4a; line-height: 2.0; font-weight: 300;">' +
  '毎週月曜日に、世界中のメディアからまだ日本に届いていない<br>「旅と家族」の種をお届けします。<br>楽しんでいただけたら嬉しいです。</p>' +

  '<p style="margin: 0 0 20px 0; font-size: 13px; color: #4a4a4a; line-height: 2.0; font-weight: 300;">' +
  'Wamilyは「子連れで海外に行きたい」と思ったときに、<br>いちばん最初に開くガイドブックを目指しています。<br>まだまだ小さなガイドブックですが、<br>みんなで少しずつ育てていけたらと思っています。</p>' +

  '<p style="margin: 0 0 20px 0; font-size: 13px; color: #4a4a4a; line-height: 2.0; font-weight: 300;">' +
  'Wamilyの成長とともに、みんながつながれる場も<br>少しずつ作っていきたいと思っています。<br>これからよろしくお願いします。</p>' +

  '<p style="margin: 0 0 0 0; font-size: 13px; color: #4a4a4a; line-height: 2.0; font-weight: 300;">' +
  'Wamily オーナー サワディー</p>' +

  '</td></tr>' +

  // CTA
  '<tr><td style="padding: 8px 40px 40px;">' +
  '<table cellpadding="0" cellspacing="0" border="0"><tr>' +
  '<td style="background-color: #2a9d8f; border-radius: 999px;">' +
  '<a href="' + SITE_URL + '/guidebook/" style="display: block; padding: 14px 28px; color: #FFFFFF; text-decoration: none; font-size: 12px; letter-spacing: 0.1em;">Wamilyのガイドブックはこちら &rarr;</a>' +
  '</td></tr></table>' +
  '</td></tr>' +

  // DIVIDER
  '<tr><td style="padding: 0 40px;"><div style="border-top: 1px solid #e8e4de;"></div></td></tr>' +

  // FOOTER
  '<tr><td style="padding: 24px 40px 32px;">' +
  '<p style="margin: 0 0 8px 0; font-size: 11px; color: #8a8a8a; line-height: 1.7;">' +
  'このメールは Wamily Letter の登録者にお送りしています。<br>' +
  '配信停止をご希望の方は <a href="' + unsubscribeUrl + '" style="color: #2a9d8f; text-decoration: none;">こちら</a> からお手続きください。</p>' +
  '<p style="margin: 0; font-size: 11px; color: #8a8a8a;">' +
  '<a href="' + SITE_URL + '" style="color: #8a8a8a; text-decoration: none;">Wamily Guide</a>' +
  ' &middot; ' +
  '<a href="https://note.com/tomosawa" style="color: #8a8a8a; text-decoration: none;">note</a></p>' +
  '</td></tr>' +

  '</table>' +
  '</td></tr></table>' +
  '</body></html>';
}

// ===== 管理者通知 =====

function notifyAdmin(email, source, type) {
  if (!NOTIFY_EMAIL) return;
  try {
    GmailApp.sendEmail(
      NOTIFY_EMAIL,
      '📬 Wamily Letter ' + type + ': ' + email,
      type + '\nメール: ' + email + '\n登録元: ' + source + '\n日時: ' + new Date().toLocaleString('ja-JP')
    );
  } catch (err) {
    console.error('管理者通知エラー:', err);
  }
}

// ===== ユーティリティ =====

function jsonResponse(code, obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

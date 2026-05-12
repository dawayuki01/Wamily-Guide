/**
 * Wamily おすすめスポット送信 — Google Apps Script (Web App)
 *
 * 用途:
 *   /connect/ ページの「📍 おすすめスポットを置く」フォームから来る
 *   POST リクエストを受け取り、Notion「おすすめスポット候補DB」に登録する。
 *
 * セットアップ手順:
 *   1. https://script.google.com/ で新規プロジェクト作成
 *      プロジェクト名: 「Wamily おすすめスポット送信」
 *   2. 既存の Code.gs に、このファイルの内容をすべて貼り付け
 *   3. 「プロジェクトの設定（⚙️）」→「スクリプトプロパティ」で下記を追加:
 *        - NOTION_API_KEY        : 既存と同じ Notion インテグレーションキー
 *        - NOTION_SPOT_DB_ID     : 81a00d306-59e-4ca4-856f-3de605507eea
 *        - SLACK_WEBHOOK_CONTENT : 既存と同じ Slack Webhook URL（任意・空でも動く）
 *   4. 「デプロイ」→「新しいデプロイ」→「種類: ウェブアプリ」
 *        - 説明: v1
 *        - 次のユーザーとして実行: 自分
 *        - アクセスできるユーザー: 全員
 *      → デプロイ → 表示される「ウェブアプリのURL」をコピー
 *   5. そのURLをサワディーが Claude に共有
 *      Claude が /connect/index.html の 'PLACEHOLDER_SPOT_GAS_URL' を置換
 *
 * 重要:
 *   - Notion インテグレーション「Wamily Site Sync」（既存）に
 *     「おすすめスポット候補」DB の「アクセス権限を共有」を必ず実施
 *     （DB 右上「…」→「コネクト」→ Wamily Site Sync を追加）
 *
 * テスト:
 *   doGet を実行 → ブラウザで GAS URL 開いて "ok" 表示確認
 *   実際のフォームから1件投稿 → Notion DB に「候補🟡」で出るか確認
 */

// ===== 設定（スクリプトプロパティから取得）=====
const PROPS = PropertiesService.getScriptProperties();
const NOTION_API_KEY = PROPS.getProperty('NOTION_API_KEY');
const NOTION_SPOT_DB_ID = PROPS.getProperty('NOTION_SPOT_DB_ID');
const SLACK_WEBHOOK = PROPS.getProperty('SLACK_WEBHOOK_CONTENT'); // 任意

const NOTION_VERSION = '2022-06-28';

// ===== Web App エンドポイント =====
function doPost(e) {
  try {
    if (!NOTION_API_KEY || !NOTION_SPOT_DB_ID) {
      throw new Error('スクリプトプロパティに NOTION_API_KEY / NOTION_SPOT_DB_ID を設定してください');
    }

    // フォームから JSON が text/plain で届く想定
    const data = JSON.parse(e.postData.contents);

    // 必須チェック
    if (!data.url || !data.country || !data.genre) {
      return jsonResponse({ status: 'error', error: 'URL・国・ジャンルは必須です' });
    }

    // Notion ページ作成
    const properties = {
      '名前': {
        title: [{ text: { content: trimTitle(data.url, 100) } }]
      },
      'URL': { url: data.url },
      'ジャンル': { select: { name: data.genre } },
      'コメント': {
        rich_text: [{ text: { content: data.comment || '' } }]
      },
      '投稿者名': {
        rich_text: [{ text: { content: data.name || '（匿名）' } }]
      },
      '投稿日': {
        date: { start: new Date().toISOString().split('T')[0] }
      },
      'ステータス': { select: { name: '候補' } }
    };

    // 国名は「その他」と通常の出し分け
    if (data.country === 'その他') {
      properties['国名（その他）'] = {
        rich_text: [{ text: { content: data.countryOther || '（未指定）' } }]
      };
    } else {
      properties['国名'] = { select: { name: data.country } };
    }

    const res = UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + NOTION_API_KEY,
        'Notion-Version': NOTION_VERSION
      },
      payload: JSON.stringify({
        parent: { database_id: NOTION_SPOT_DB_ID },
        properties: properties
      }),
      muteHttpExceptions: true
    });

    const code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      console.error('Notion API error:', code, res.getContentText());
      throw new Error('Notion 登録に失敗しました（HTTP ' + code + '）');
    }

    // Slack 通知（任意）
    if (SLACK_WEBHOOK) {
      const country = data.country === 'その他'
        ? data.countryOther + '（その他）'
        : data.country;
      notifySlack({
        text: '📍 新しいおすすめスポットが届きました',
        color: '#2a9d8f',
        fields: [
          { title: '投稿者', value: data.name || '（匿名）', short: true },
          { title: '国・エリア', value: country, short: true },
          { title: 'ジャンル', value: data.genre, short: true },
          { title: 'URL', value: data.url, short: false },
          { title: 'コメント', value: data.comment || '（なし）', short: false }
        ]
      });
    }

    return jsonResponse({ status: 'ok' });

  } catch (err) {
    console.error('doPost error:', err);
    return jsonResponse({ status: 'error', error: err.message });
  }
}

// 動作確認用（ブラウザで GAS URL を直接開いた時の応答）
function doGet() {
  return ContentService
    .createTextOutput('Wamily Spot Submit endpoint OK')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ===== ヘルパー =====
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function trimTitle(s, max) {
  s = String(s || '');
  return s.length <= max ? s : s.substring(0, max - 1) + '…';
}

function notifySlack(opts) {
  try {
    const payload = {
      text: opts.text,
      attachments: [{
        color: opts.color || '#2a9d8f',
        fields: opts.fields || []
      }]
    };
    UrlFetchApp.fetch(SLACK_WEBHOOK, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    console.error('Slack notify error:', e);
  }
}

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

    // urls は配列で来る前提（旧版互換: data.url が来たら配列化）
    let urls = Array.isArray(data.urls) ? data.urls : (data.url ? [data.url] : []);
    urls = urls.map(s => String(s || '').trim()).filter(s => s.length > 0);

    // 必須チェック
    if (urls.length === 0 || !data.country || !data.genre) {
      return jsonResponse({ status: 'error', error: 'URL・国・ジャンルは必須です' });
    }

    const today = new Date().toISOString().split('T')[0];
    const countryDisplay = data.country === 'その他'
      ? (data.countryOther || '（その他）')
      : data.country;

    // 各 URL ごとに Notion ページを作成
    let added = 0;
    let errors = [];
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      // タイトル: 「[国] / [ジャンル] / [コメント先頭 or URL末尾]」
      let titleSuffix;
      if (data.comment) {
        titleSuffix = trimTitle(data.comment, 30);
      } else {
        // URL の末尾（パス末尾）を抜き出して短く
        titleSuffix = url.split('/').filter(Boolean).pop() || url;
        titleSuffix = trimTitle(titleSuffix, 30);
      }
      const title = countryDisplay + ' / ' + data.genre + ' / ' + titleSuffix;

      const properties = {
        '名前': { title: [{ text: { content: trimTitle(title, 100) } }] },
        'URL': { url: url },
        'ジャンル': { select: { name: data.genre } },
        'コメント': { rich_text: [{ text: { content: data.comment || '' } }] },
        '投稿者名': { rich_text: [{ text: { content: data.name || '（匿名）' } }] },
        '投稿日': { date: { start: today } },
        'ステータス': { select: { name: '候補' } }
      };

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
      if (code >= 200 && code < 300) {
        added++;
      } else {
        console.error('Notion API error:', code, res.getContentText());
        errors.push({ url: url, code: code });
      }
    }

    if (added === 0) {
      throw new Error('全件 Notion 登録失敗（最初のエラー HTTP ' + (errors[0] && errors[0].code) + '）');
    }

    // Slack 通知（任意）
    if (SLACK_WEBHOOK) {
      const fields = [
        { title: '投稿者', value: data.name || '（匿名）', short: true },
        { title: '国・エリア', value: countryDisplay, short: true },
        { title: 'ジャンル', value: data.genre, short: true },
        { title: '件数', value: added + ' 件' + (errors.length > 0 ? '（失敗 ' + errors.length + '）' : ''), short: true },
        { title: 'URL', value: urls.join('\n'), short: false },
        { title: 'コメント', value: data.comment || '（なし）', short: false }
      ];
      notifySlack({
        text: '📍 おすすめスポットが届きました（' + added + '件）',
        color: '#2a9d8f',
        fields: fields
      });
    }

    return jsonResponse({ status: 'ok', added: added, failed: errors.length });

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

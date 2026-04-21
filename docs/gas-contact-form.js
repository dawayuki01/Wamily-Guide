/**
 * Wamily お問い合わせ・要望フォーム 自動返信 + 管理者通知
 *
 * 対象フォーム:
 *   https://docs.google.com/forms/d/e/1FAIpQLSf6NzN7a4J3AcFMPY-1aHBu8EpM4qxie0x4OwFOMMS--cX8dQ/viewform
 *
 * セットアップ手順:
 *   1. 上記フォームを開く → 右上「︙」メニュー → スクリプトエディタ
 *      （または https://script.google.com/ で新規プロジェクト → フォームをバインド）
 *   2. このファイルの内容を Code.gs に貼り付け
 *   3. 上部の「関数を選択」→ onFormSubmit → 実行（初回のみ権限承認ダイアログが出る）
 *   4. 時計アイコン（トリガー）→ トリガーを追加:
 *        - 実行する関数: onFormSubmit
 *        - イベントのソース: フォームから
 *        - イベントの種類: フォーム送信時
 *
 * 重要:
 *   - 件名に絵文字を入れない（Gmail送信時に文字化けする既知の挙動）
 *   - 管理者通知先 OWNER_EMAIL と FROM_NAME は下記定数で設定
 */

// ===== 設定 =====
const OWNER_EMAIL = 'pr@tomoyukisawada.com';
const FROM_NAME   = 'Wamily / サワディー';

// 自動返信の件名（絵文字なし・Gmail文字化け回避）
const REPLY_SUBJECT  = '【Wamily】お問い合わせありがとうございます';
const NOTIFY_SUBJECT = '【Wamily】新規お問い合わせ';

// 自動返信本文（プレーンテキスト）
const REPLY_BODY = [
  'この度は Wamily にお問い合わせいただき、ありがとうございます。',
  '内容を確認のうえ、改めてサワディーよりご返信いたします（通常2〜3日以内）。',
  '',
  'ガイドブックは「みなさんの声をもとに育てていく」ことを大切にしています。',
  'ご質問・ご要望、どれも嬉しく受け取らせていただきました。',
  '',
  'しばらくお待ちくださいませ。',
  '',
  '— サワディー / Wamily',
  'https://wamily.jp',
].join('\n');


// ===== メイン：フォーム送信時に起動 =====
function onFormSubmit(e) {
  try {
    // 1. 回答を取り出す（フォーム設定に依らず動くよう両対応）
    const parsed = parseResponse(e);

    // 2. 回答者へ自動返信（メールが拾えた場合のみ）
    if (parsed.email) {
      GmailApp.sendEmail(parsed.email, REPLY_SUBJECT, REPLY_BODY, {
        name: FROM_NAME,
        replyTo: OWNER_EMAIL,
      });
    }

    // 3. サワディーへ通知（メールが拾えなくても通知は飛ばす）
    const notifyBody = buildNotifyBody(parsed);
    GmailApp.sendEmail(OWNER_EMAIL, NOTIFY_SUBJECT, notifyBody, {
      name: FROM_NAME,
      replyTo: parsed.email || OWNER_EMAIL,
    });

  } catch (err) {
    // エラー時もサワディーには必ず通知（デバッグ用）
    console.error('onFormSubmit error:', err);
    try {
      GmailApp.sendEmail(
        OWNER_EMAIL,
        '【Wamily】フォーム処理エラー',
        'onFormSubmit で例外が発生しました。\n\n' + err.stack
      );
    } catch (_) { /* 黙殺 */ }
  }
}


// ===== 回答パース：フォーム設定の差異を吸収 =====
function parseResponse(e) {
  const result = { email: '', entries: [] };

  // フォーム側で「メールアドレスを収集する」をONにしている場合
  if (e && e.response && typeof e.response.getRespondentEmail === 'function') {
    const respondent = e.response.getRespondentEmail();
    if (respondent) result.email = respondent;
  }

  // 各質問の回答を順に格納
  if (e && e.response && typeof e.response.getItemResponses === 'function') {
    const items = e.response.getItemResponses();
    items.forEach(function(ir) {
      const title = ir.getItem().getTitle();
      const ans = ir.getResponse();
      result.entries.push({ title: title, answer: formatAnswer(ans) });

      // メール列が質問として存在する場合（タイトルに「メール」か"mail"を含む）
      if (!result.email && /メール|mail|e-mail/i.test(title) && typeof ans === 'string') {
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ans)) result.email = ans;
      }
    });
  }

  return result;
}


function formatAnswer(ans) {
  if (Array.isArray(ans)) return ans.join(', ');
  return String(ans == null ? '' : ans);
}


// ===== 管理者通知メールの本文 =====
function buildNotifyBody(parsed) {
  const lines = [];
  lines.push('Wamily お問い合わせ・要望フォームに新しい回答がありました。');
  lines.push('');
  lines.push('■ 回答者メール: ' + (parsed.email || '（取得できず）'));
  lines.push('■ 受信日時: ' + new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  lines.push('');
  lines.push('─────────────────');
  parsed.entries.forEach(function(ent) {
    lines.push('● ' + ent.title);
    lines.push(ent.answer || '（未回答）');
    lines.push('');
  });
  lines.push('─────────────────');
  lines.push('');
  lines.push('返信はこのメールに返信するだけで回答者に届きます（Reply-To設定済み）。');
  return lines.join('\n');
}


// ===== 手動テスト用：エディタから実行して動作確認 =====
function testNotify() {
  GmailApp.sendEmail(OWNER_EMAIL, NOTIFY_SUBJECT + '（テスト）',
    'これは GAS 手動テストです。届いていれば権限・トリガー設定はOK。', {
    name: FROM_NAME,
  });
}

/**
 * Slack通知共通モジュール
 * 全スクリプトから利用される。Webhook URL未設定時はconsole.logにフォールバック。
 */

const CHANNEL_MAP = {
  patrol:     'SLACK_WEBHOOK_PATROL',
  content:    'SLACK_WEBHOOK_CONTENT',
  newsletter: 'SLACK_WEBHOOK_NEWSLETTER',
};

const COLOR_MAP = {
  success: '#2a9d8f',  // Wamilyブランドティール
  warning: '#e9c46a',  // マスタード
  error:   '#e76f51',  // レッド
};

/**
 * Slackに通知を送信する
 * @param {Object} opts
 * @param {'patrol'|'content'|'newsletter'} opts.channel
 * @param {string} [opts.icon]  - メッセージ先頭のアイコン
 * @param {string} opts.title   - タイトル
 * @param {string} [opts.body]  - 本文
 * @param {'success'|'warning'|'error'} [opts.color='success']
 * @param {Array<{label:string, value:string}>} [opts.fields]
 */
async function notifySlack(opts) {
  const { channel, icon = '', title, body = '', color = 'success', fields = [] } = opts;

  const envKey = CHANNEL_MAP[channel];
  if (!envKey) {
    console.log(`[Slack] 不明なチャンネル: ${channel}`);
    return;
  }

  const webhookUrl = process.env[envKey];
  if (!webhookUrl) {
    console.log(`[Slack → ${channel}] ${icon} ${title}`);
    if (body) console.log(`  ${body}`);
    fields.forEach(f => console.log(`  ${f.label}: ${f.value}`));
    return;
  }

  const text = icon ? `${icon} ${title}` : title;
  const attachment = {
    color: COLOR_MAP[color] || COLOR_MAP.success,
    text: body || undefined,
    fields: fields.length > 0
      ? fields.map(f => ({ title: f.label, value: f.value, short: true }))
      : undefined,
  };

  const payload = {
    text,
    attachments: (body || fields.length > 0) ? [attachment] : undefined,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) return;
      console.error(`[Slack] HTTP ${res.status} (attempt ${attempt + 1})`);
    } catch (err) {
      console.error(`[Slack] ネットワークエラー (attempt ${attempt + 1}): ${err.message}`);
    }
    if (attempt === 0) await new Promise(r => setTimeout(r, 5000));
  }
}

module.exports = { notifySlack };

/**
 * コミュニティ部（host）— ホストリマインダー + プロフィール自動生成
 *
 * Usage:
 *   node scripts/host-reminder.js
 */

const { Client } = require('@notionhq/client');
const Anthropic = require('@anthropic-ai/sdk');
const { notifySlack } = require('./lib/slack-notify');

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

function dateStr(prop) {
  return prop?.date?.start ?? '';
}

function numberVal(prop) {
  return prop?.number ?? null;
}

const COUNTRY_NAME_JA = {
  london: 'ロンドン', taipei: '台湾', paris: 'パリ', stockholm: 'ストックホルム',
  singapore: 'シンガポール', bangkok: 'バンコク', manila: 'マニラ',
  la: 'LA', hawaii: 'ハワイ', seoul: 'ソウル',
};

// ──────────────────────────────────────────────────────────
// Claude API プロンプト
// ──────────────────────────────────────────────────────────

const CONTACT_DRAFT_PROMPT = `あなたはWamilyオーナーの「サワディー」です。
Wamilyは子連れ家族向け海外旅行ガイドブックサイトで、現地在住の日本人家族が「Wamilyホスト」として旅する家族を助けています。

以下のホストへの定期連絡メッセージを書いてください。

ホスト情報:
- ニックネーム: {nickname}
- 在住国: {country}
- 在住歴: {years}
- 家族構成: {family}
- 前回の連絡メモ: {lastNote}

ルール:
- サワディーの口調で書く（カジュアルだけど丁寧、居酒屋の常連に話しかけるような温かさ）
- 営業臭くしない。「何かお願い」ではなく「元気？最近どう？」のスタンス
- 200文字以内
- LINEメッセージを想定（メールではない）
- 季節の話題や子どもの成長に触れると自然`;

const PROFILE_GENERATE_PROMPT = `あなたはWamilyオーナーの「サワディー」です。
新しくWamilyホストに応募してくれた方のプロフィールを作成してください。

応募者情報:
- 名前: {name}
- 在住国: {country}
- 家族構成: {family}
- 子どもの年齢: {kidsAge}
- 在住歴: {years}
- フォーム回答（自由記述）: {formResponse}

参考: 既存ホストの紹介文のトーン
- 「ロンドン親子旅の図書館」と、僕は呼んでいます。
- 「マニラの太陽みたいな家族」と、僕は呼んでいます。
- 「ハワイのお母さん」と、僕は呼んでいます。

以下の2つを生成してください:
1. キャッチフレーズ（15文字以内）: 「〇〇」と、僕は呼んでいます。の「〇〇」部分
2. 紹介文（100〜150文字）: サワディーがその人を温かく紹介する文章。スペック説明ではなく、その人の魅力が伝わる表現で。

JSON形式で返してください:
{ "catchphrase": "...", "intro": "..." }`;

// ──────────────────────────────────────────────────────────
// メイン処理
// ──────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.error('❌ NOTION_API_KEY が設定されていません。');
    process.exit(1);
  }

  const notion = new Client({ auth: apiKey });
  const hostDbId = process.env.NOTION_HOST_DB_ID;
  if (!hostDbId) {
    console.warn('⚠  NOTION_HOST_DB_ID が設定されていません。スキップ。');
    return;
  }

  // 全ホスト取得（退会以外）
  const res = await notion.databases.query({
    database_id: hostDbId,
    filter: {
      property: 'ステータス',
      select: { does_not_equal: '退会' },
    },
  });

  const hosts = res.results;
  console.log(`🏠 ホスト: ${hosts.length}人`);

  // Claude APIクライアント（必要時のみ初期化）
  let anthropic = null;
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic();
  }

  // ── 1. リマインダー判定 ──
  console.log('\n🔔 リマインダーチェック...');
  const today = new Date();

  for (const host of hosts) {
    const status = selectName(host.properties['ステータス']);
    if (status !== 'アクティブ') continue;

    const nickname = richText(host.properties['ニックネーム']) || titleText(host.properties['名前']);
    const lastContact = dateStr(host.properties['最終連絡日']);
    const interval = numberVal(host.properties['リマインド間隔']) || 30;
    const slug = selectName(host.properties['国スラッグ']);
    const countryJa = COUNTRY_NAME_JA[slug] || slug;

    if (!lastContact) {
      console.log(`  ${nickname} — 最終連絡日未設定、スキップ`);
      continue;
    }

    const lastDate = new Date(lastContact);
    const daysSince = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

    if (daysSince < interval) {
      console.log(`  ${nickname} — ${daysSince}日経過（間隔${interval}日）、まだOK`);
      continue;
    }

    console.log(`  ${nickname} — ${daysSince}日経過 → リマインド対象`);

    // Claude APIで連絡ドラフト生成
    let draft = '';
    if (anthropic) {
      try {
        const family = richText(host.properties['家族構成']);
        const years = richText(host.properties['在住歴']);
        const lastNote = richText(host.properties['連絡メモ']);

        const prompt = CONTACT_DRAFT_PROMPT
          .replace('{nickname}', nickname)
          .replace('{country}', countryJa)
          .replace('{years}', years || '不明')
          .replace('{family}', family || '不明')
          .replace('{lastNote}', lastNote || 'なし');

        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        });

        draft = response.content[0]?.text || '';
      } catch (err) {
        console.error(`  ⚠ Claude API エラー (${nickname}):`, err.message);
      }
    }

    const notionUrl = `https://notion.so/${host.id.replace(/-/g, '')}`;
    const draftSection = draft ? `\n\n📝 連絡ドラフト:\n「${draft}」` : '';

    await notifySlack({
      channel: 'community_host',
      icon: '🔔',
      title: '[コミュニティ部] ホストリマインダー',
      body: `${nickname}（${countryJa}）— 最終連絡から${daysSince}日経過${draftSection}\n\n→ Notionで確認: ${notionUrl}`,
      color: 'warning',
    });
  }

  // ── 2. 新規ホストプロフィール生成 ──
  console.log('\n✨ 新規ホストプロフィール生成チェック...');

  for (const host of hosts) {
    const status = selectName(host.properties['ステータス']);
    if (status !== '審査中') continue;

    const intro = richText(host.properties['紹介文']);
    if (intro) continue; // 紹介文がすでにある場合はスキップ

    const name = titleText(host.properties['名前']);
    const nickname = richText(host.properties['ニックネーム']) || name;
    const slug = selectName(host.properties['国スラッグ']);
    const countryJa = COUNTRY_NAME_JA[slug] || slug;

    console.log(`  ${name} — 紹介文なし → 自動生成`);

    if (!anthropic) {
      console.warn('  ⚠ ANTHROPIC_API_KEY 未設定、スキップ');
      continue;
    }

    try {
      const family = richText(host.properties['家族構成']);
      const kidsAge = richText(host.properties['子どもの年齢']);
      const years = richText(host.properties['在住歴']);
      const formResponse = richText(host.properties['フォーム回答']);

      const prompt = PROFILE_GENERATE_PROMPT
        .replace('{name}', name)
        .replace('{country}', countryJa)
        .replace('{family}', family || '不明')
        .replace('{kidsAge}', kidsAge || '不明')
        .replace('{years}', years || '不明')
        .replace('{formResponse}', formResponse || 'なし');

      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0]?.text || '';

      // JSON部分を抽出
      const jsonMatch = text.match(/\{[\s\S]*"catchphrase"[\s\S]*"intro"[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`  ⚠ JSON解析失敗 (${name})`);
        continue;
      }

      const profile = JSON.parse(jsonMatch[0]);

      // Notionに書き込み
      await notion.pages.update({
        page_id: host.id,
        properties: {
          'キャッチフレーズ': { rich_text: [{ text: { content: profile.catchphrase } }] },
          '紹介文':          { rich_text: [{ text: { content: profile.intro } }] },
          'ニックネーム':     nickname ? undefined : { rich_text: [{ text: { content: name } }] },
        },
      });

      const notionUrl = `https://notion.so/${host.id.replace(/-/g, '')}`;

      await notifySlack({
        channel: 'community_host',
        icon: '✨',
        title: '[コミュニティ部] 新規ホストプロフィール生成',
        body: `${name}（${countryJa}）のプロフィールを自動生成しました\n\nキャッチフレーズ: 「${profile.catchphrase}」\n紹介文: 「${profile.intro}」\n\n⚠️ サワディーの確認後、ステータスを「アクティブ」に変更してください\n→ Notionで確認: ${notionUrl}`,
        color: 'success',
      });

      console.log(`  ✅ ${name} のプロフィール生成完了`);
    } catch (err) {
      console.error(`  ⚠ プロフィール生成エラー (${name}):`, err.message);
    }
  }

  console.log('\n✅ ホストリマインダー完了');
}

main().catch(err => {
  console.error('❌ 予期しないエラー:', err.message);
  process.exit(1);
});

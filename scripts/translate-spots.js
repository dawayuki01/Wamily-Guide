#!/usr/bin/env node
/**
 * Wamily — スポット説明文を日本語に翻訳
 * Notion上の英語説明文をClaude APIで日本語1文に変換
 *
 * Usage:
 *   node scripts/translate-spots.js             # 本番実行
 *   node scripts/translate-spots.js --dry-run   # ドライラン
 */

const { Client } = require('@notionhq/client');
const Anthropic = require('@anthropic-ai/sdk').default;

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SPOTS_DB_ID = process.env.NOTION_SPOTS_DB_ID || '61864001-cf96-4afb-b7f2-94b07cd445a1';
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  if (!NOTION_API_KEY || !ANTHROPIC_API_KEY) {
    console.error('❌ NOTION_API_KEY と ANTHROPIC_API_KEY が必要です');
    process.exit(1);
  }

  const notion = new Client({ auth: NOTION_API_KEY });
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  console.log(`🌐 スポット説明文の日本語化 ${DRY_RUN ? '(ドライラン)' : ''}`);

  // 英語の説明文を持つスポットを取得
  let cursor;
  let englishSpots = [];

  do {
    const res = await notion.databases.query({
      database_id: SPOTS_DB_ID,
      start_cursor: cursor || undefined,
      page_size: 100,
    });

    for (const page of res.results) {
      const name = page.properties['スポット名']?.title?.map(t => t.plain_text).join('') || '';
      const desc = page.properties['説明']?.rich_text?.map(t => t.plain_text).join('') || '';

      // 英語っぽい説明文を検出（ラテン文字が50%以上）
      const latinChars = (desc.match(/[a-zA-Z]/g) || []).length;
      const isEnglish = desc.length > 0 && latinChars / desc.length > 0.5;

      if (isEnglish) {
        englishSpots.push({ id: page.id, name, desc });
      }
    }

    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);

  console.log(`📋 英語説明文のスポット: ${englishSpots.length} 件\n`);

  if (englishSpots.length === 0) {
    console.log('✅ 翻訳対象なし');
    return;
  }

  // バッチで翻訳（10件ずつ）
  let translated = 0;
  const batchSize = 10;

  for (let i = 0; i < englishSpots.length; i += batchSize) {
    const batch = englishSpots.slice(i, i + batchSize);

    const spotsText = batch.map((s, idx) => `${idx + 1}. ${s.name}: ${s.desc}`).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `以下のスポット説明文を日本語に翻訳してください。各スポットにつき1文（50文字以内）で、子連れ家族向けのやわらかい口調で書いてください。番号付きで返してください。

${spotsText}`
      }],
    });

    const text = response.content[0].text;
    const lines = text.split('\n').filter(l => /^\d+\./.test(l.trim()));

    for (let j = 0; j < batch.length; j++) {
      const spot = batch[j];
      const line = lines[j] || '';
      const jaDesc = line.replace(/^\d+\.\s*/, '').replace(/^.*?:\s*/, '').trim();

      if (!jaDesc) {
        console.log(`   ⚠️ ${spot.name}: 翻訳失敗、スキップ`);
        continue;
      }

      console.log(`   • ${spot.name}: ${jaDesc}`);

      if (!DRY_RUN) {
        await notion.pages.update({
          page_id: spot.id,
          properties: {
            '説明': { rich_text: [{ text: { content: jaDesc.substring(0, 200) } }] },
          },
        });
        translated++;
        await new Promise(r => setTimeout(r, 350));
      } else {
        translated++;
      }
    }

    // API レート制限
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n✅ ${translated} 件を日本語化 ${DRY_RUN ? '（ドライラン）' : '完了'}`);
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});

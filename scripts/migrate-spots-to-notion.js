#!/usr/bin/env node
/**
 * migrate-spots-to-notion.js
 * data/spots-*.json の内容を Notion スポットDB に一括インポートする（初回のみ実行）
 *
 * 使い方：
 *   cd scripts
 *   NOTION_API_KEY=xxx NOTION_SPOTS_DB_ID=yyy node migrate-spots-to-notion.js
 *
 * ※ ロンドンは既にNotionにあるのでスキップします
 */

const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// slug → Notion の「国名」セレクト値
const SLUG_TO_NOTION_COUNTRY = {
  taipei:    '台湾',
  paris:     'パリ',
  stockholm: 'ストックホルム',
  singapore: 'シンガポール',
  bangkok:   'バンコク',
  manila:    'マニラ',
  la:        'LA',
  hawaii:    'ハワイ',
  seoul:     'ソウル',
};

// category key → Notion「カテゴリ」セレクト値
const CATEGORY_TO_NOTION = {
  vital: 'いざという時',
  local: '現地の日常へ',
  food:  '親子で食べる',
  play:  '遊びに行く',
};

// layer key → Notion「層」セレクト値
const LAYER_TO_NOTION = {
  vital: 'vital',
  local: 'local',
  play:  'play',
};

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const apiKey = process.env.NOTION_API_KEY;
  const dbId   = process.env.NOTION_SPOTS_DB_ID;

  if (!apiKey || !dbId) {
    console.error('❌ NOTION_API_KEY と NOTION_SPOTS_DB_ID が必要です。');
    process.exit(1);
  }

  const notion = new Client({ auth: apiKey });

  for (const [slug, notionCountry] of Object.entries(SLUG_TO_NOTION_COUNTRY)) {
    const filePath = path.join(DATA_DIR, `spots-${slug}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠  ${filePath} が見つかりません。スキップします。`);
      continue;
    }

    const { spots } = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`\n📍 ${notionCountry}（${spots.length}件）を登録中...`);

    for (const spot of spots) {
      try {
        process.stdout.write(`  ${spot.name} ... `);

        const props = {
          'スポット名': { title: [{ text: { content: spot.name } }] },
          '国名':       { select: { name: notionCountry } },
          'カテゴリ':   { select: { name: CATEGORY_TO_NOTION[spot.category] || '遊びに行く' } },
          '層':         { select: { name: LAYER_TO_NOTION[spot.layer] || 'play' } },
          '説明':       { rich_text: [{ text: { content: spot.description } }] },
          '料金':       { checkbox: spot.free === true },
          '絵文字':     { rich_text: [{ text: { content: spot.emoji || '📍' } }] },
        };

        if (spot.placeId) {
          props['Google Place ID'] = { rich_text: [{ text: { content: spot.placeId } }] };
        }

        await notion.pages.create({
          parent: { database_id: dbId },
          properties: props,
        });

        console.log('✅');
        await sleep(400); // レート制限対策
      } catch (err) {
        console.log(`❌ ${err.message}`);
      }
    }
  }

  console.log('\n🎉 全スポットのNotionインポート完了！');
  console.log('次回からは GitHub Actions の fetch-notion.js が自動同期します。');
}

main().catch(err => {
  console.error('❌ 予期しないエラー:', err.message);
  process.exit(1);
});

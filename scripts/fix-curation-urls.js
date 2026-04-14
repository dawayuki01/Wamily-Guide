#!/usr/bin/env node
/**
 * キュレーションDB精査: URL空レコードを非公開に、実在確認済みはURL更新
 * 一回限りの実行スクリプト
 */

const { Client } = require('@notionhq/client');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const CURATION_DB_ID = process.env.NOTION_CURATION_DB_ID || '4f146e35-f680-46e1-acf2-8e4cc86851fb';

// 実在確認済み: 名前 → 正しいURL
const CONFIRMED_URLS = {
  'ロンドンナビ': 'https://www.londonnavi.com/',
  '台湾さんぽ': 'https://www.instagram.com/taiwansampo/',
  'Aloha Street': 'https://www.aloha-street.com/',
  'ロサンゼルス観光ガイド': 'https://www.la-kanko.com/',
};

async function main() {
  if (!NOTION_API_KEY) {
    console.error('❌ NOTION_API_KEY が必要です');
    process.exit(1);
  }

  const notion = new Client({ auth: NOTION_API_KEY });
  console.log('🔍 キュレーションDB精査開始\n');

  let cursor;
  let updated = 0;
  let hidden = 0;
  let skipped = 0;

  do {
    const res = await notion.databases.query({
      database_id: CURATION_DB_ID,
      start_cursor: cursor || undefined,
      page_size: 100,
    });

    for (const page of res.results) {
      const name = page.properties['名前']?.title?.map(t => t.plain_text).join('') || '';
      const url = page.properties['URL']?.url || '';
      const status = page.properties['ステータス']?.select?.name || '';

      // 既に公開でURLがあるものはスキップ
      if (url && url.length > 0) {
        skipped++;
        continue;
      }

      // URL空のレコード
      // 実在確認済みリストに名前があるか？（部分一致も）
      let matchedUrl = null;
      for (const [confirmedName, confirmedUrl] of Object.entries(CONFIRMED_URLS)) {
        if (name.includes(confirmedName) || confirmedName.includes(name)) {
          matchedUrl = confirmedUrl;
          break;
        }
      }

      if (matchedUrl) {
        // URL更新
        console.log(`  ✅ URL更新: ${name} → ${matchedUrl}`);
        await notion.pages.update({
          page_id: page.id,
          properties: {
            'URL': { url: matchedUrl },
            'ステータス': { select: { name: '候補' } },
          },
        });
        updated++;
      } else {
        // 非公開に変更
        console.log(`  ⛔ 非公開: ${name}`);
        await notion.pages.update({
          page_id: page.id,
          properties: {
            'ステータス': { select: { name: '非公開' } },
          },
        });
        hidden++;
      }

      await new Promise(r => setTimeout(r, 350));
    }

    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);

  console.log(`\n══════════════════════════════════════`);
  console.log(`📊 完了`);
  console.log(`  URL更新: ${updated} 件`);
  console.log(`  非公開: ${hidden} 件`);
  console.log(`  スキップ（URL有り）: ${skipped} 件`);
  console.log(`══════════════════════════════════════\n`);
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});

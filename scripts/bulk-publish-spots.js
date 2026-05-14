#!/usr/bin/env node
/**
 * bulk-publish-spots.js（一回限りのマイグレーションスクリプト）
 *
 * Notion スポットDB のステータス未設定スポットを「公開」に一括更新。
 *
 * 使い方:
 *   GitHub Actions の bulk-publish-spots.yml を手動実行（workflow_dispatch）
 *   または、ローカルで:
 *     NOTION_API_KEY=xxx NOTION_SPOTS_DB_ID=yyy node scripts/bulk-publish-spots.js
 *
 * 副作用:
 *   - ステータス === '候補' / '非公開' のものは触らない
 *   - ステータス === null（未設定）または '公開' のものを「公開」に統一
 *   - dry-run モードあり: DRY_RUN=1 で実行
 */

const { Client } = require('@notionhq/client');

async function main() {
  const apiKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_SPOTS_DB_ID;
  const dryRun = process.env.DRY_RUN === '1';
  if (!apiKey || !dbId) {
    console.error('❌ NOTION_API_KEY / NOTION_SPOTS_DB_ID が必要');
    process.exit(1);
  }

  const notion = new Client({ auth: apiKey });

  console.log(`📥 Notion スポットDB を取得中...${dryRun ? ' (DRY RUN)' : ''}`);
  const all = [];
  let cursor;
  do {
    const r = await notion.databases.query({
      database_id: dbId,
      page_size: 100,
      start_cursor: cursor,
    });
    all.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);

  console.log(`   合計 ${all.length} 件取得\n`);

  let toUpdate = 0;
  let already = 0;
  let skipped = 0;
  const targets = [];

  for (const page of all) {
    const status = page.properties['ステータス']?.select?.name;
    if (status === '候補' || status === '非公開') {
      skipped++;
      continue;
    }
    if (status === '公開') {
      already++;
      continue;
    }
    // null か未知の値 → 公開に設定
    toUpdate++;
    targets.push(page);
  }

  console.log(`📊 集計:`);
  console.log(`   既に公開:  ${already} 件`);
  console.log(`   候補/非公開:${skipped} 件 (触らない)`);
  console.log(`   公開化対象: ${toUpdate} 件\n`);

  if (dryRun) {
    console.log('DRY_RUN モードのため更新はスキップ');
    return;
  }

  let done = 0, failed = 0;
  for (const page of targets) {
    const name = page.properties['スポット名']?.title?.[0]?.plain_text || '(no name)';
    try {
      await notion.pages.update({
        page_id: page.id,
        properties: {
          'ステータス': { select: { name: '公開' } },
        },
      });
      done++;
      if (done % 20 === 0) console.log(`   ✅ ${done}/${toUpdate}`);
    } catch (err) {
      failed++;
      console.error(`   ❌ ${name}: ${err.message}`);
    }
  }

  console.log(`\n🎉 完了: ${done} 件公開化 / ${failed} 件失敗`);
}

main().catch(err => {
  console.error('❌ エラー:', err);
  process.exit(1);
});

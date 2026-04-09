/**
 * 参謀室 — 壁打ちログアーカイブ
 *
 * Claude Codeセッションでの壁打ち結論をNotionに保存するユーティリティ。
 *
 * Usage:
 *   node scripts/save-strategy-note.js --type "壁打ちメモ" --title "SNS戦略について" --content "..."
 *
 * 環境変数:
 *   NOTION_API_KEY        — Notion API
 *   NOTION_STRATEGY_DB_ID — 参謀室DB ID
 */

const { Client } = require('@notionhq/client');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_STRATEGY_DB_ID = process.env.NOTION_STRATEGY_DB_ID;

// ──────────────────────────────────────────────────────────
// 引数パース
// ──────────────────────────────────────────────────────────

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--') && i + 1 < argv.length) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1];
      i++;
    }
  }
  return args;
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  if (!args.title || !args.content) {
    console.error('Usage: node scripts/save-strategy-note.js --type "壁打ちメモ" --title "テーマ" --content "内容"');
    process.exit(1);
  }

  if (!NOTION_API_KEY || !NOTION_STRATEGY_DB_ID) {
    console.error('[参謀室] 環境変数が未設定です: NOTION_API_KEY, NOTION_STRATEGY_DB_ID');
    process.exit(1);
  }

  const type = args.type || '壁打ちメモ';
  const title = args.title;
  const content = args.content;

  const notion = new Client({ auth: NOTION_API_KEY });
  const today = new Date().toISOString().split('T')[0];

  // Notionにページ作成
  const page = await notion.pages.create({
    parent: { database_id: NOTION_STRATEGY_DB_ID },
    properties: {
      'タイトル': {
        title: [{ text: { content: title } }],
      },
      'タイプ': { select: { name: type } },
      '日付': { date: { start: today } },
      'ステータス': { select: { name: '確定' } },
    },
    children: splitContentToBlocks(content),
  });

  console.log(`✅ 参謀室DBに保存しました: ${title}`);
  console.log(`   URL: ${page.url}`);
}

/**
 * 長いコンテンツをNotionブロックに分割（2000文字制限対応）
 */
function splitContentToBlocks(content) {
  const blocks = [];
  const chunks = [];
  for (let i = 0; i < content.length; i += 2000) {
    chunks.push(content.slice(i, i + 2000));
  }

  for (const chunk of chunks) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ text: { content: chunk } }],
      },
    });
  }

  return blocks;
}

main().catch(err => {
  console.error('[参謀室] エラー:', err.message);
  process.exit(1);
});

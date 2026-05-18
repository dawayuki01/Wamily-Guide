#!/usr/bin/env node
/**
 * generate-spot-descriptions.js
 * Notion スポットDB の「説明」が短い（一言メモ）スポットを Claude で拡張する。
 *
 * フロー：
 *   1. Notion から全スポットを取得
 *   2. 処理済みフラグ（data/.spot-descriptions-processed.json）で未処理を抽出
 *   3. 各スポットについて Google Places API で公式情報を補強
 *   4. Claude に投げて Wamily トーンで200〜280字に拡張
 *   5. Notion DB「説明」を上書き
 *   6. 処理済みフラグを保存
 *
 * 必要な環境変数：
 *   ANTHROPIC_API_KEY        — Claude API キー
 *   NOTION_API_KEY           — Notion API キー
 *   NOTION_SPOTS_DB_ID       — スポット DB ID（既定値あり）
 *   GOOGLE_PLACES_API_KEY    — Places API キー（省略可・あれば情報リッチに）
 *
 * Usage:
 *   node scripts/generate-spot-descriptions.js              # 本番実行
 *   node scripts/generate-spot-descriptions.js --dry-run    # ドライラン
 *   node scripts/generate-spot-descriptions.js --limit 5    # 5件だけ処理
 *   node scripts/generate-spot-descriptions.js --slug hongkong  # 特定の国だけ
 *   node scripts/generate-spot-descriptions.js --force      # 処理済みフラグを無視
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('@notionhq/client');
const Anthropic = require('@anthropic-ai/sdk').default;
const { notifySlack } = require('./lib/slack-notify');
const { retryClaude } = require('./lib/claude-retry');

// ===== 設定 =====
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const SPOTS_DB_ID = process.env.NOTION_SPOTS_DB_ID || '61864001-cf96-4afb-b7f2-94b07cd445a1';

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, '.spot-descriptions-processed.json');

// 「拡張すべき」と判定するメモ文字数の閾値（これ以下＝一言メモとみなす）
const MEMO_THRESHOLD = 80;

// 生成する説明文の文字数目安
const TARGET_LENGTH_MIN = 180;
const TARGET_LENGTH_MAX = 280;

// CLI 引数
const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const FORCE = ARGS.includes('--force');
const LIMIT = (() => {
  const i = ARGS.indexOf('--limit');
  return i >= 0 ? parseInt(ARGS[i + 1], 10) : null;
})();
const SLUG_FILTER = (() => {
  const i = ARGS.indexOf('--slug');
  return i >= 0 ? ARGS[i + 1] : null;
})();

// 国名（Notion）→ slug マッピング（fetch-notion.js と同じ）
const COUNTRY_SLUG = {
  'ロンドン': 'london', '台湾': 'taipei', '台北': 'taipei',
  'パリ': 'paris', 'ストックホルム': 'stockholm', 'シンガポール': 'singapore',
  'バンコク': 'bangkok', 'マニラ': 'manila', 'LA': 'la',
  'ハワイ': 'hawaii', 'ソウル': 'seoul', '香港': 'hongkong',
};

// ──────────────────────────────────────────────────────────
// 状態管理（処理済みフラグ）
// ──────────────────────────────────────────────────────────

function loadProcessed() {
  try {
    return new Set(JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')));
  } catch {
    return new Set();
  }
}

function saveProcessed(set) {
  if (DRY_RUN) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify([...set], null, 2) + '\n');
}

// ──────────────────────────────────────────────────────────
// Google Places API でスポット詳細を取得
// ──────────────────────────────────────────────────────────

async function fetchPlaceDetails(placeId) {
  if (!PLACES_API_KEY || !placeId) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('language', 'ja');
  url.searchParams.set('fields', [
    'name', 'formatted_address', 'types', 'rating', 'user_ratings_total',
    'editorial_summary', 'reviews', 'price_level',
  ].join(','));
  url.searchParams.set('key', PLACES_API_KEY);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.status !== 'OK') return null;
    return data.result;
  } catch {
    return null;
  }
}

function buildPlacesContext(details) {
  if (!details) return '';

  const parts = [];

  if (details.editorial_summary?.overview) {
    parts.push(`Google公式紹介: ${details.editorial_summary.overview}`);
  }

  if (details.types && details.types.length) {
    const types = details.types.slice(0, 4).join(', ');
    parts.push(`種別: ${types}`);
  }

  if (details.rating && details.user_ratings_total) {
    parts.push(`評価: ${details.rating}/5 (${details.user_ratings_total}件のレビュー)`);
  }

  if (details.formatted_address) {
    parts.push(`住所: ${details.formatted_address}`);
  }

  // レビュー上位3件（評価4以上）の要旨
  if (details.reviews && details.reviews.length) {
    const topReviews = details.reviews
      .filter(r => r.rating >= 4)
      .slice(0, 3)
      .map(r => `「${(r.text || '').slice(0, 100)}」`);
    if (topReviews.length) {
      parts.push(`高評価レビュー要約:\n${topReviews.join('\n')}`);
    }
  }

  return parts.join('\n');
}

// ──────────────────────────────────────────────────────────
// Claude で説明文を生成
// ──────────────────────────────────────────────────────────

function buildPrompt(spot, placesContext) {
  return `あなたは日本人ファミリー向け海外旅行ガイドブック「Wamily」の編集者サワディーです。
現地でサワディーが残した一言メモと、Google Mapsの公式情報を元に、
スポット説明文を1本書いてください。

【スポット名】
${spot.name}

【国・地域】
${spot.country}

【サワディーの現地メモ（最重要・必ず反映する）】
${spot.memo || '（メモなし）'}

【Google Maps からの情報（補強用）】
${placesContext || '（情報なし）'}

【書き方のルール】
- ${TARGET_LENGTH_MIN}〜${TARGET_LENGTH_MAX}字程度の本文（プレーンテキスト1段落）
- サワディーの現地メモがある場合、その視点・感覚を必ず核として残す
- メモが「子連れOK・広場・夜景」のような単語列でも、それを文章として活かす
- Google情報は補強のため。事実関係（種類・場所・特徴）を正確に
- 子連れ家族（就学前〜高校生）が判断できる具体性
- 「○○な場所」「○○がおすすめ」のような営業臭・煽りはNG
- 「必見」「圧巻」「絶対」「○○選」「最強」などの誇大表現は使わない
- 日本語、丁寧語ベース（「〜です」「〜ます」）。ただし固すぎず
- 数字・地名・時間・料金など、具体性が出る情報があれば入れる
- 1段落・改行なし

【出力】
本文のみ。前置き・引用符・補足説明は一切なし。`;
}

async function generateDescription(anthropic, spot, placesContext) {
  const response = await retryClaude(
    () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: buildPrompt(spot, placesContext) }],
    }),
    { label: `generate-desc-${spot.name || 'spot'}` }
  );
  const text = (response.content[0]?.text || '').trim();
  // 引用符・前置きを除去
  return text
    .replace(/^["「『]+|["」』]+$/g, '')
    .replace(/^.*?[:：]\s*/, '')
    .trim();
}

// ──────────────────────────────────────────────────────────
// Notion DB からスポットを取得
// ──────────────────────────────────────────────────────────

async function fetchAllSpots(notion) {
  const spots = [];
  let cursor;

  do {
    const res = await notion.databases.query({
      database_id: SPOTS_DB_ID,
      start_cursor: cursor || undefined,
      page_size: 100,
    });

    for (const page of res.results) {
      const name = page.properties['スポット名']?.title?.map(t => t.plain_text).join('') || '';
      const desc = page.properties['説明']?.rich_text?.map(t => t.plain_text).join('') || '';
      const country = page.properties['国名']?.select?.name || '';
      const placeId = page.properties['Google Place ID']?.rich_text?.map(t => t.plain_text).join('') || '';
      const status = page.properties['ステータス']?.select?.name || '';

      spots.push({
        id: page.id,
        name,
        memo: desc,        // 既存の「説明」を「現地メモ」として扱う
        country,
        slug: COUNTRY_SLUG[country] || null,
        placeId,
        status,
      });
    }

    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);

  return spots;
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  if (!NOTION_API_KEY || !ANTHROPIC_API_KEY) {
    console.error('❌ NOTION_API_KEY と ANTHROPIC_API_KEY が必要です');
    process.exit(1);
  }

  const notion = new Client({ auth: NOTION_API_KEY });
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const processed = FORCE ? new Set() : loadProcessed();

  console.log(`✏️  スポット説明文の AI 拡張 ${DRY_RUN ? '(ドライラン)' : ''}`);
  console.log(`   閾値: メモ ${MEMO_THRESHOLD}字以下 → 拡張対象`);
  console.log(`   生成: ${TARGET_LENGTH_MIN}〜${TARGET_LENGTH_MAX}字`);
  if (SLUG_FILTER) console.log(`   フィルター: ${SLUG_FILTER}`);
  if (LIMIT) console.log(`   上限: ${LIMIT} 件`);
  if (FORCE) console.log(`   モード: 強制（処理済みフラグ無視）`);
  console.log();

  console.log('📥 Notion からスポット一覧を取得中...');
  const allSpots = await fetchAllSpots(notion);
  console.log(`   → ${allSpots.length} 件取得\n`);

  // 拡張対象を抽出
  const targets = allSpots.filter(s => {
    if (s.status === '閉業' || s.status === '非公開') return false;
    if (processed.has(s.id)) return false;
    if (SLUG_FILTER && s.slug !== SLUG_FILTER) return false;
    if (!s.memo) return false;  // メモゼロは対象外（後日メモ書く前提）
    if (s.memo.length > MEMO_THRESHOLD) return false;  // 既に長文なら対象外
    return true;
  });

  console.log(`🎯 拡張対象: ${targets.length} 件\n`);

  if (targets.length === 0) {
    console.log('✅ 拡張対象なし');
    return;
  }

  const limit = LIMIT || targets.length;
  let success = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < Math.min(limit, targets.length); i++) {
    const spot = targets[i];
    const idx = `[${i + 1}/${Math.min(limit, targets.length)}]`;

    console.log(`${idx} ${spot.name} (${spot.country})`);
    console.log(`   メモ: ${spot.memo}`);

    try {
      // Places API で補強
      const details = await fetchPlaceDetails(spot.placeId);
      const placesContext = buildPlacesContext(details);
      if (placesContext) {
        console.log(`   Places: ${placesContext.split('\n')[0].slice(0, 80)}...`);
      }

      // Claude で生成
      const description = await generateDescription(anthropic, spot, placesContext);

      if (!description || description.length < TARGET_LENGTH_MIN - 30) {
        console.log(`   ⚠️ 生成失敗 or 短すぎ（${description.length}字）→ スキップ`);
        skipped++;
        continue;
      }

      console.log(`   生成 (${description.length}字): ${description.slice(0, 100)}...`);

      // Notion 更新
      if (!DRY_RUN) {
        await notion.pages.update({
          page_id: spot.id,
          properties: {
            '説明': { rich_text: [{ text: { content: description } }] },
          },
        });
      }

      processed.add(spot.id);
      success++;

      // レート制限対策
      await new Promise(r => setTimeout(r, 800));
    } catch (err) {
      console.warn(`   ❌ エラー: ${err.message}`);
      errors.push(`${spot.name}: ${err.message}`);
    }

    console.log();
  }

  saveProcessed(processed);

  console.log('═══════════════════════════════════════');
  console.log(`✅ 拡張完了: ${success} 件 / スキップ ${skipped} 件 / エラー ${errors.length} 件`);
  console.log('═══════════════════════════════════════');

  if (!DRY_RUN && (success > 0 || errors.length > 0)) {
    await notifySlack({
      channel: 'content',
      icon: errors.length ? '🟡' : '🟢',
      title: `[コンテンツ部] スポット説明文 AI 拡張 ${errors.length ? '一部エラー' : '完了'}`,
      body: `${success} 件のスポット説明をWamilyトーンで生成`,
      color: errors.length ? 'warning' : 'success',
      fields: [
        { label: '生成成功', value: `${success} 件` },
        { label: 'スキップ', value: `${skipped} 件` },
        { label: 'エラー', value: `${errors.length} 件` },
        SLUG_FILTER ? { label: '対象', value: SLUG_FILTER } : null,
      ].filter(Boolean),
    });
  }
}

main().catch(async err => {
  console.error('❌ 致命的エラー:', err);
  await notifySlack({
    channel: 'content',
    icon: '🔴',
    title: '[コンテンツ部] スポット説明文 AI 拡張 エラー',
    body: err.message || String(err),
    color: 'error',
  });
  process.exit(1);
});

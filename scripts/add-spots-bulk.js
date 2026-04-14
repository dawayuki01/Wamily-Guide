#!/usr/bin/env node
/**
 * Wamily — 全都市スポット自動追加
 * Google Places API (New) で子連れ向けスポットを検索し、NotionスポットDBに投入
 *
 * Usage:
 *   node scripts/add-spots-bulk.js             # 本番実行
 *   node scripts/add-spots-bulk.js --dry-run   # ドライラン（Notion投入なし）
 */

const { Client } = require('@notionhq/client');

// ──────────────────────────────────────────────────────────
// 設定
// ──────────────────────────────────────────────────────────

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const SPOTS_DB_ID = process.env.NOTION_SPOTS_DB_ID || '61864001-cf96-4afb-b7f2-94b07cd445a1';
const DRY_RUN = process.argv.includes('--dry-run');

const CITIES = [
  { query: 'London', notion: 'ロンドン' },
  { query: 'Taipei', notion: '台湾' },
  { query: 'Paris', notion: 'パリ' },
  { query: 'Stockholm', notion: 'ストックホルム' },
  { query: 'Singapore', notion: 'シンガポール' },
  { query: 'Bangkok', notion: 'バンコク' },
  { query: 'Seoul', notion: 'ソウル' },
  { query: 'Manila', notion: 'マニラ' },
  { query: 'Los Angeles', notion: 'LA' },
  { query: 'Hawaii', notion: 'ハワイ' },
];

const CATEGORIES = [
  {
    name: '親子で食べる',
    emoji: '🍽️',
    types: ['restaurant', 'cafe'],
    keyword: 'family friendly',
    maxPerType: 3, // 各typeから最大3件 → 合計最大5件に絞る
  },
  {
    name: '遊びに行く',
    emoji: '🎡',
    types: ['tourist_attraction', 'museum', 'amusement_park', 'park'],
    keyword: 'kids family',
    maxPerType: 2, // 各typeから最大2件 → 合計最大5件に絞る
  },
];

const MIN_RATING = 4.3;
const MIN_REVIEWS = 1000;
const MAX_PER_CATEGORY = 5;

// ──────────────────────────────────────────────────────────
// Notion ヘルパー
// ──────────────────────────────────────────────────────────

let notion;

function richText(prop) {
  if (!prop || !prop.rich_text) return '';
  return prop.rich_text.map(t => t.plain_text).join('');
}

function titleText(prop) {
  if (!prop || !prop.title) return '';
  return prop.title.map(t => t.plain_text).join('');
}

function selectName(prop) {
  return prop?.select?.name || '';
}

/**
 * NotionスポットDBから既存スポットを都市別に取得
 */
async function fetchExistingSpots() {
  const map = new Map(); // 国名 → [スポット名, ...]
  let cursor;

  do {
    const res = await notion.databases.query({
      database_id: SPOTS_DB_ID,
      start_cursor: cursor || undefined,
      page_size: 100,
    });

    for (const page of res.results) {
      const country = selectName(page.properties['国名']);
      const name = titleText(page.properties['スポット名']);
      if (!country || !name) continue;

      if (!map.has(country)) map.set(country, []);
      map.get(country).push(name);
    }

    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);

  return map;
}

// ──────────────────────────────────────────────────────────
// Google Places API (New)
// ──────────────────────────────────────────────────────────

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.editorialSummary',
  'places.formattedAddress',
  'places.location',
].join(',');

/**
 * Places API searchText で検索
 */
async function searchPlaces(textQuery, includedType) {
  const url = 'https://places.googleapis.com/v1/places:searchText';

  const body = {
    textQuery,
    languageCode: 'en',
  };
  // includedType は単一文字列のみ受け付ける
  if (includedType) {
    body.includedType = includedType;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`  ❌ Places API error (${res.status}): ${errText.substring(0, 200)}`);
    return [];
  }

  const data = await res.json();
  return data.places || [];
}

/**
 * 品質フィルタ
 */
function filterPlaces(places) {
  return places.filter(p => {
    if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') return false;
    if ((p.rating || 0) < MIN_RATING) return false;
    if ((p.userRatingCount || 0) < MIN_REVIEWS) return false;
    return true;
  });
}

// ──────────────────────────────────────────────────────────
// 重複チェック
// ──────────────────────────────────────────────────────────

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9\u3000-\u9fff]/g, '');
}

function isDuplicate(newName, existingNames) {
  const n = normalize(newName);
  if (!n) return false;
  return existingNames.some(e => {
    const en = normalize(e);
    if (!en) return false;
    return en === n || en.includes(n) || n.includes(en);
  });
}

// ──────────────────────────────────────────────────────────
// Notion投入
// ──────────────────────────────────────────────────────────

async function addSpotToNotion(spot, city, category) {
  const name = spot.displayName?.text || spot.displayName?.languageCode || 'Unknown';
  const description = spot.editorialSummary?.text || `Rating: ${spot.rating} (${spot.userRatingCount} reviews)`;
  const placeId = spot.id || '';

  await notion.pages.create({
    parent: { database_id: SPOTS_DB_ID },
    properties: {
      'スポット名': { title: [{ text: { content: name } }] },
      '国名': { select: { name: city.notion } },
      'カテゴリ': { select: { name: category.name } },
      '層': { select: { name: 'play' } },
      '説明': { rich_text: [{ text: { content: description.substring(0, 200) } }] },
      '絵文字': { rich_text: [{ text: { content: category.emoji } }] },
      'Google Place ID': { rich_text: [{ text: { content: placeId } }] },
      '料金': { checkbox: false },
    },
  });
}

// ──────────────────────────────────────────────────────────
// メイン処理
// ──────────────────────────────────────────────────────────

async function main() {
  // 環境変数チェック
  if (!PLACES_API_KEY) {
    console.error('❌ GOOGLE_PLACES_API_KEY が設定されていません。');
    process.exit(1);
  }
  if (!NOTION_API_KEY) {
    console.error('❌ NOTION_API_KEY が設定されていません。');
    process.exit(1);
  }

  notion = new Client({ auth: NOTION_API_KEY });

  console.log('🌍 Wamily スポット自動追加');
  console.log(`   モード: ${DRY_RUN ? '🔍 ドライラン' : '🚀 本番実行'}`);
  console.log('');

  // Step 1: 既存スポット取得
  console.log('📋 既存スポットを取得中...');
  const existingSpots = await fetchExistingSpots();
  let totalExisting = 0;
  for (const [country, spots] of existingSpots) {
    totalExisting += spots.length;
  }
  console.log(`   ${existingSpots.size} 都市、${totalExisting} 件のスポットを取得\n`);

  // Step 2: 都市×カテゴリ ループ
  const summary = [];
  let totalAdded = 0;

  for (const city of CITIES) {
    console.log(`\n🏙️  ${city.notion}（${city.query}）`);
    const existing = existingSpots.get(city.notion) || [];
    console.log(`   既存: ${existing.length} 件`);

    for (const cat of CATEGORIES) {
      console.log(`\n   📂 ${cat.emoji} ${cat.name}`);

      // 各typeで検索して候補を集める
      let allCandidates = [];

      for (const type of cat.types) {
        const query = `${cat.keyword} ${type.replace('_', ' ')} in ${city.query}`;
        console.log(`      🔍 "${query}"`);

        const raw = await searchPlaces(query, type);
        const filtered = filterPlaces(raw);
        console.log(`      → ${raw.length} 件取得, ${filtered.length} 件が条件クリア`);

        // 重複除外
        const unique = filtered.filter(p => {
          const name = p.displayName?.text || '';
          // 既存Notionスポットとの重複
          if (isDuplicate(name, existing)) return false;
          // このバッチ内での重複
          if (isDuplicate(name, allCandidates.map(c => c.displayName?.text || ''))) return false;
          return true;
        });

        allCandidates.push(...unique);

        // API レート制限対策
        await new Promise(r => setTimeout(r, 300));
      }

      // ratingでソートして上位5件
      allCandidates.sort((a, b) => {
        const scoreA = (a.rating || 0) * Math.log10((a.userRatingCount || 1));
        const scoreB = (b.rating || 0) * Math.log10((b.userRatingCount || 1));
        return scoreB - scoreA;
      });
      const toAdd = allCandidates.slice(0, MAX_PER_CATEGORY);

      console.log(`      ✅ 追加候補: ${toAdd.length} 件`);

      for (const spot of toAdd) {
        const name = spot.displayName?.text || 'Unknown';
        const desc = spot.editorialSummary?.text || '';
        console.log(`         • ${name} (★${spot.rating}, ${spot.userRatingCount}件) ${desc.substring(0, 40)}`);

        if (!DRY_RUN) {
          try {
            await addSpotToNotion(spot, city, cat);
            console.log(`           → Notion に追加 ✓`);
          } catch (err) {
            console.error(`           → ❌ Notion エラー: ${err.message}`);
          }
          // Notion API レート制限対策
          await new Promise(r => setTimeout(r, 400));
        }

        // 追加したスポットを既存リストにも追加（以降の重複チェック用）
        existing.push(name);
      }

      summary.push({
        city: city.notion,
        category: cat.name,
        count: toAdd.length,
      });
      totalAdded += toAdd.length;
    }
  }

  // Step 3: サマリー出力
  console.log('\n\n══════════════════════════════════════');
  console.log(`📊 完了サマリー ${DRY_RUN ? '(ドライラン)' : ''}`);
  console.log('══════════════════════════════════════');

  for (const s of summary) {
    const bar = '█'.repeat(s.count) + '░'.repeat(MAX_PER_CATEGORY - s.count);
    console.log(`  ${s.city.padEnd(12)} ${s.category.padEnd(10)} ${bar} ${s.count}件`);
  }

  console.log(`\n  合計: ${totalAdded} 件 ${DRY_RUN ? '（投入なし）' : 'をNotionに追加'}`);
  console.log('══════════════════════════════════════\n');
}

main().catch(err => {
  console.error('❌ 致命的エラー:', err);
  process.exit(1);
});

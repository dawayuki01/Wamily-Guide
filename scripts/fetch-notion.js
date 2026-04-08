#!/usr/bin/env node
/**
 * fetch-notion.js
 * Notion API から各種DBを取得して data/*.json に書き出す
 *
 * 取得対象：
 *   1. 最近の動きDB  → data/live-feed.json
 *   2. スポットDB    → data/spots-{country}.json（例: spots-london.json）
 *   3. キュレーションDB → data/curation-{country}.json（例: curation-london.json）
 *
 * 必要な環境変数：
 *   NOTION_API_KEY         — Notion インテグレーションのシークレット
 *   NOTION_LIVEFEED_DB_ID  — 「最近の動き」DB の ID
 *   NOTION_SPOTS_DB_ID     — スポット DB の ID（省略可）
 *   NOTION_CURATION_DB_ID  — キュレーション DB の ID（省略可）
 *
 * Notion DB のプロパティ定義は docs/notion-setup.md を参照
 */

const { Client } = require('@notionhq/client');
const fs = require('fs');
const path = require('path');
const { notifySlack } = require('./lib/slack-notify');

const DATA_DIR = path.join(__dirname, '..', 'data');

// 国名 → ファイル名サフィックスのマッピング
const COUNTRY_SLUG = {
  'イギリス': 'london',
  'ロンドン': 'london',
  'フランス': 'paris',
  'パリ': 'paris',
  'スウェーデン': 'stockholm',
  'ストックホルム': 'stockholm',
  'シンガポール': 'singapore',
  'タイ': 'bangkok',
  'バンコク': 'bangkok',
  'フィリピン': 'manila',
  'マニラ': 'manila',
  'アメリカ（LA）': 'la',
  'LA': 'la',
  'ハワイ': 'hawaii',
  '韓国': 'seoul',
  'ソウル': 'seoul',
  '台湾': 'taipei',
  '台北': 'taipei',
};

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

function checkBox(prop) {
  return prop?.checkbox ?? false;
}

function urlProp(prop) {
  return prop?.url ?? '';
}

function slugify(countryName) {
  return COUNTRY_SLUG[countryName] ?? countryName.toLowerCase().replace(/\s+/g, '-');
}

// ──────────────────────────────────────────────────────────
// 1. 最近の動き
// ──────────────────────────────────────────────────────────

async function fetchLiveFeed(notion) {
  const dbId = process.env.NOTION_LIVEFEED_DB_ID;
  if (!dbId) {
    console.warn('⚠  NOTION_LIVEFEED_DB_ID が設定されていません。スキップします。');
    return null;
  }

  const response = await notion.databases.query({
    database_id: dbId,
    sorts: [{ property: '投稿日', direction: 'descending' }],
    page_size: 10,
  });

  const items = response.results.map(page => ({
    id: page.id,
    author: richText(page.properties['投稿者']),
    authorType: selectName(page.properties['投稿者種別']) || 'traveler',
    country: selectName(page.properties['国名']),
    body: richText(page.properties['本文']),
    date: dateStr(page.properties['投稿日']),
  }));

  return { items, updatedAt: new Date().toISOString() };
}

// ──────────────────────────────────────────────────────────
// 2. スポットDB
// ──────────────────────────────────────────────────────────

async function fetchSpots(notion) {
  const dbId = process.env.NOTION_SPOTS_DB_ID;
  if (!dbId) {
    console.warn('⚠  NOTION_SPOTS_DB_ID が設定されていません。スキップします。');
    return null;
  }

  // 全スポットを取得（ページネーション対応）
  const allResults = [];
  let cursor;
  do {
    const response = await notion.databases.query({
      database_id: dbId,
      sorts: [
        { property: '国名', direction: 'ascending' },
        { property: '層', direction: 'ascending' },
      ],
      start_cursor: cursor,
      page_size: 100,
    });
    allResults.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  // 国名ごとにグループ化
  const byCountry = {};
  for (const page of allResults) {
    const country = selectName(page.properties['国名']);
    if (!country) continue;

    const slug = slugify(country);
    if (!byCountry[slug]) byCountry[slug] = [];

    const layer = selectName(page.properties['層']) || 'play';
    const category = selectName(page.properties['カテゴリ']) || 'play';

    byCountry[slug].push({
      id: page.id,
      name: titleText(page.properties['スポット名']),
      emoji: richText(page.properties['絵文字']) || '📍',
      category: categoryToKey(category),
      layer: layerToKey(layer),
      description: richText(page.properties['説明']),
      status: 'check',           // Google Places で後から更新される
      statusLabel: '要確認',
      free: checkBox(page.properties['料金']),
      checkedDate: new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' }),
      placeId: richText(page.properties['Google Place ID']) || null,
      extra: false,
    });
  }

  return byCountry;
}

function categoryToKey(label) {
  const map = {
    '親子で食べる': 'food',
    '遊びに行く': 'play',
    '現地の日常へ': 'local',
    'いざという時': 'vital',
  };
  return map[label] ?? 'play';
}

function layerToKey(label) {
  const map = {
    'vital': 'vital',
    '緊急': 'vital',
    'local': 'local',
    'ローカル': 'local',
    'play': 'play',
    '可変': 'play',
  };
  return map[label] ?? 'play';
}

// ──────────────────────────────────────────────────────────
// 3. キュレーションDB
// ──────────────────────────────────────────────────────────

async function fetchCuration(notion) {
  const dbId = process.env.NOTION_CURATION_DB_ID;
  if (!dbId) {
    console.warn('⚠  NOTION_CURATION_DB_ID が設定されていません。スキップします。');
    return null;
  }

  const allResults = [];
  let cursor;
  do {
    const response = await notion.databases.query({
      database_id: dbId,
      filter: {
        property: 'ステータス',
        select: { equals: '公開' },
      },
      sorts: [{ property: '追加日', direction: 'descending' }],
      start_cursor: cursor,
      page_size: 100,
    });
    allResults.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  // 国名ごとにグループ化
  const byCountry = {};
  for (const page of allResults) {
    const country = selectName(page.properties['国名']);
    if (!country) continue;

    const slug = slugify(country);
    if (!byCountry[slug]) byCountry[slug] = [];

    byCountry[slug].push({
      id: page.id,
      name: titleText(page.properties['名前']),
      type: selectName(page.properties['タイプ']),   // YouTube / Instagram / ブログ
      description: richText(page.properties['説明']),
      url: urlProp(page.properties['URL']),
      addedDate: dateStr(page.properties['追加日']),
    });
  }

  return byCountry;
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    console.error('❌ NOTION_API_KEY が設定されていません。');
    process.exit(1);
  }

  const notion = new Client({ auth: apiKey });

  // ── 最近の動き ──
  console.log('\n📥 最近の動きを取得中...');
  try {
    const feedData = await fetchLiveFeed(notion);
    if (feedData) {
      const outPath = path.join(DATA_DIR, 'live-feed.json');
      fs.writeFileSync(outPath, JSON.stringify(feedData, null, 2), 'utf-8');
      console.log(`  ✅ live-feed.json 更新（${feedData.items.length} 件）`);
    }
  } catch (err) {
    console.error('  ❌ 最近の動き取得エラー:', err.message);
  }

  // ── スポット ──
  console.log('\n🗺  スポットDBを取得中...');
  try {
    const spotsData = await fetchSpots(notion);
    if (spotsData) {
      for (const [slug, spots] of Object.entries(spotsData)) {
        const outPath = path.join(DATA_DIR, `spots-${slug}.json`);

        // 既存ファイルがある場合は placeId と status を引き継ぐ
        let existing = {};
        if (fs.existsSync(outPath)) {
          try {
            const prev = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
            existing = Object.fromEntries((prev.spots || []).map(s => [s.id, s]));
          } catch {}
        }

        const mergedSpots = spots.map(spot => {
          const prev = existing[spot.id];
          return {
            ...spot,
            status: prev?.status ?? spot.status,
            statusLabel: prev?.statusLabel ?? spot.statusLabel,
            checkedDate: prev?.checkedDate ?? spot.checkedDate,
            // placeId: Notion側を優先。Notionにない場合は既存ファイルの値を引き継ぐ
            placeId: spot.placeId || prev?.placeId || null,
            // 座標: 既存ファイルの値を引き継ぐ（手動管理）
            lat: prev?.lat || null,
            lng: prev?.lng || null,
          };
        });

        const output = {
          spots: mergedSpots,
          checkedAt: new Date().toISOString(),
        };
        fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
        console.log(`  ✅ spots-${slug}.json 更新（${spots.length} 件）`);
      }
    }
  } catch (err) {
    console.error('  ❌ スポット取得エラー:', err.message);
  }

  // ── キュレーション ──
  console.log('\n🎬 キュレーションDBを取得中...');
  try {
    const curationData = await fetchCuration(notion);
    if (curationData) {
      for (const [slug, items] of Object.entries(curationData)) {
        const outPath = path.join(DATA_DIR, `curation-${slug}.json`);
        const output = {
          items,
          updatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
        console.log(`  ✅ curation-${slug}.json 更新（${items.length} 件）`);
      }
    }
  } catch (err) {
    console.error('  ❌ キュレーション取得エラー:', err.message);
  }

  console.log('\n🎉 完了しました');

  // Slack通知
  await notifySlack({
    channel: 'patrol',
    icon: '🟢',
    title: '[パトロール部] Notion同期 完了',
    body: 'Notion DBからデータを同期しました',
    color: 'success',
    fields: [
      { label: 'フィード', value: 'live-feed.json' },
      { label: 'スポット', value: `${SLUGS_COUNT}カ国` },
    ],
  });
}

// スポットの国数カウント用（main内で使えるよう変数化は避け、通知時に概算）
const SLUGS_COUNT = 10;

main().catch(async err => {
  console.error('❌ 予期しないエラー:', err.message);
  await notifySlack({
    channel: 'patrol',
    icon: '🔴',
    title: '[パトロール部] Notion同期 エラー',
    body: err.message,
    color: 'error',
  });
  process.exit(1);
});

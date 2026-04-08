#!/usr/bin/env node
/**
 * check-spots.js
 * data/spots-*.json の各スポットについて Google Places API で
 * 営業状況を確認し、status フィールドを更新する。
 *
 * 必要な環境変数：
 *   GOOGLE_PLACES_API_KEY — Google Places API キー
 *
 * status の値：
 *   "open"   — 現在営業中
 *   "check"  — 要確認（営業時間外 or 情報なし）
 *   "closed" — 閉業（CLOSED_PERMANENTLY）
 */

const fs = require('fs');
const path = require('path');
const { notifySlack } = require('./lib/slack-notify');

const DATA_DIR = path.join(__dirname, '..', 'data');
const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// 対象の全国スラグ
const SLUGS = [
  'london', 'taipei', 'paris', 'stockholm', 'singapore',
  'bangkok', 'manila', 'la', 'hawaii', 'seoul'
];

// ──────────────────────────────────────────────────────────
// Google Places API で営業状況を取得
// ──────────────────────────────────────────────────────────

async function checkPlaceStatus(placeId) {
  if (!API_KEY || !placeId) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'business_status,opening_hours');
  url.searchParams.set('key', API_KEY);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status !== 'OK') {
      console.warn(`  Places API エラー (${placeId}): ${data.status}`);
      return null;
    }

    const result = data.result;
    if (result.business_status === 'CLOSED_PERMANENTLY') return 'closed';
    if (result.opening_hours?.open_now === true) return 'open';
    if (result.opening_hours?.open_now === false) return 'check';
    return 'check';  // 情報なし
  } catch (err) {
    console.warn(`  取得失敗 (${placeId}): ${err.message}`);
    return null;
  }
}

// ──────────────────────────────────────────────────────────
// 1つの国のスポットファイルを処理
// ──────────────────────────────────────────────────────────

async function processCountry(slug) {
  const spotsFile = path.join(DATA_DIR, `spots-${slug}.json`);

  if (!fs.existsSync(spotsFile)) {
    console.log(`⚠️  ${slug}: ファイルが見つかりません（スキップ）`);
    return null;
  }

  const spotsData = JSON.parse(fs.readFileSync(spotsFile, 'utf-8'));
  const spots = spotsData.spots || [];
  const withPlaceId = spots.filter(s => s.placeId);

  if (withPlaceId.length === 0) {
    console.log(`⏭️  ${slug}: placeId 設定済みスポットなし（スキップ）`);
    return null;
  }

  console.log(`\n🗺  ${slug}: ${withPlaceId.length} 件を確認中...`);

  let updatedCount = 0;
  let open = 0, check = 0, closed = 0;
  const closedSpots = [];

  for (const spot of spots) {
    if (!spot.placeId) continue;

    process.stdout.write(`  ${spot.name} ... `);
    const newStatus = await checkPlaceStatus(spot.placeId);

    if (newStatus === null) {
      console.log('スキップ');
      continue;
    }

    if (newStatus !== spot.status) {
      console.log(`${spot.status} → ${newStatus}`);
      spot.status = newStatus;
      spot.statusLabel = newStatus === 'open' ? '営業中'
        : newStatus === 'closed' ? '閉業'
        : '要確認';
      spot.checkedDate = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' });
      updatedCount++;

      if (newStatus === 'closed') {
        closedSpots.push({ slug, name: spot.name });
      }
    } else {
      console.log('変化なし');
    }

    if (spot.status === 'open') open++;
    else if (spot.status === 'closed') closed++;
    else check++;

    // API レート制限対策
    await new Promise(r => setTimeout(r, 200));
  }

  spotsData.checkedAt = new Date().toISOString();
  fs.writeFileSync(spotsFile, JSON.stringify(spotsData, null, 2), 'utf-8');

  console.log(`  ✅ ${updatedCount > 0 ? `${updatedCount} 件更新` : '変化なし'}`);
  return { checked: withPlaceId.length, open, check, closed, closedSpots };
}

// ──────────────────────────────────────────────────────────
// Notion 閉業スポット自動更新
// ──────────────────────────────────────────────────────────

async function updateNotionClosedSpot(spotName) {
  const notionKey = process.env.NOTION_API_KEY;
  const spotsDbId = process.env.NOTION_SPOTS_DB_ID;
  if (!notionKey || !spotsDbId) return;

  try {
    const { Client } = require('@notionhq/client');
    const notion = new Client({ auth: notionKey });

    // スポット名で検索
    const res = await notion.databases.query({
      database_id: spotsDbId,
      filter: {
        property: 'スポット名',
        title: { equals: spotName },
      },
      page_size: 1,
    });

    if (res.results.length > 0) {
      await notion.pages.update({
        page_id: res.results[0].id,
        properties: {
          'ステータス': { select: { name: '閉業' } },
        },
      });
      console.log(`    📝 Notion更新: ${spotName} → 閉業`);
    }
  } catch (err) {
    console.warn(`    ⚠️ Notion更新失敗 (${spotName}): ${err.message}`);
  }
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    console.error('❌ GOOGLE_PLACES_API_KEY が設定されていません。');
    process.exit(1);
  }

  console.log('🌍 全10カ国のスポット営業状況チェックを開始します...');

  let totalChecked = 0;
  let totalOpen = 0;
  let totalCheck = 0;
  let totalClosed = 0;
  const closedSpots = [];

  for (const slug of SLUGS) {
    const result = await processCountry(slug);
    if (result) {
      totalChecked += result.checked;
      totalOpen += result.open;
      totalCheck += result.check;
      totalClosed += result.closed;
      closedSpots.push(...result.closedSpots);
    }
  }

  // 閉業スポットをNotionに反映
  for (const spot of closedSpots) {
    await updateNotionClosedSpot(spot.name);
  }

  console.log('\n🎉 全カ国チェック完了！');

  await notifySlack({
    channel: 'patrol',
    icon: closedSpots.length > 0 ? '⚠️' : '🟢',
    title: `[パトロール部] スポットチェック ${closedSpots.length > 0 ? '閉業検知あり' : '完了'}`,
    body: closedSpots.length > 0
      ? closedSpots.map(s => `⚠️ 閉業: ${s.slug} - ${s.name}`).join('\n')
      : `${totalChecked}件チェック完了`,
    color: closedSpots.length > 0 ? 'warning' : 'success',
    fields: [
      { label: 'チェック数', value: `${totalChecked}件` },
      { label: 'open', value: `${totalOpen}件` },
      { label: 'check', value: `${totalCheck}件` },
      { label: 'closed', value: `${totalClosed}件` },
    ],
  });
}

main().catch(async err => {
  console.error('❌ エラー:', err.message);
  await notifySlack({
    channel: 'patrol',
    icon: '🔴',
    title: '[パトロール部] スポットチェック エラー',
    body: err.message,
    color: 'error',
  });
  process.exit(1);
});

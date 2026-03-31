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
    return;
  }

  const spotsData = JSON.parse(fs.readFileSync(spotsFile, 'utf-8'));
  const spots = spotsData.spots || [];
  const withPlaceId = spots.filter(s => s.placeId);

  if (withPlaceId.length === 0) {
    console.log(`⏭️  ${slug}: placeId 設定済みスポットなし（スキップ）`);
    return;
  }

  console.log(`\n🗺  ${slug}: ${withPlaceId.length} 件を確認中...`);

  let updatedCount = 0;

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
    } else {
      console.log('変化なし');
    }

    // API レート制限対策
    await new Promise(r => setTimeout(r, 200));
  }

  spotsData.checkedAt = new Date().toISOString();
  fs.writeFileSync(spotsFile, JSON.stringify(spotsData, null, 2), 'utf-8');

  console.log(`  ✅ ${updatedCount > 0 ? `${updatedCount} 件更新` : '変化なし'}`);
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

  for (const slug of SLUGS) {
    await processCountry(slug);
  }

  console.log('\n🎉 全カ国チェック完了！');
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});

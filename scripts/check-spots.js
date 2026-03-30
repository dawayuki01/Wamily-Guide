#!/usr/bin/env node
/**
 * check-spots.js
 * data/spots-london.json の各スポットについて Google Places API で
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
const SPOTS_FILE = path.join(DATA_DIR, 'spots-london.json');

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

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
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    console.error('❌ GOOGLE_PLACES_API_KEY が設定されていません。');
    process.exit(1);
  }

  if (!fs.existsSync(SPOTS_FILE)) {
    console.error(`❌ ${SPOTS_FILE} が見つかりません。`);
    process.exit(1);
  }

  const spotsData = JSON.parse(fs.readFileSync(SPOTS_FILE, 'utf-8'));
  const spots = spotsData.spots || [];

  console.log(`🗺  ${spots.length} 件のスポットを確認中...`);

  let updatedCount = 0;

  for (const spot of spots) {
    if (!spot.placeId) {
      // Place ID なしは手動管理 → スキップ
      continue;
    }

    process.stdout.write(`  チェック中: ${spot.name} ... `);
    const newStatus = await checkPlaceStatus(spot.placeId);

    if (newStatus === null) {
      console.log('スキップ');
      continue;
    }

    if (newStatus !== spot.status) {
      console.log(`${spot.status} → ${newStatus}`);
      spot.status = newStatus;
      // statusLabel も更新
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
  fs.writeFileSync(SPOTS_FILE, JSON.stringify(spotsData, null, 2), 'utf-8');

  if (updatedCount > 0) {
    console.log(`✅ ${updatedCount} 件のスポット状況を更新しました`);
  } else {
    console.log('✅ 全スポットの状況に変化はありませんでした');
  }
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});

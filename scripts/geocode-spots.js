#!/usr/bin/env node
/**
 * スポットの座標（lat/lng）とPlace IDを自動取得
 * Google Places API (New) の searchText を使って名前+都市名で検索
 *
 * Usage:
 *   node scripts/geocode-spots.js             # 本番実行
 *   node scripts/geocode-spots.js --dry-run   # ドライラン
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const DATA_DIR = path.join(__dirname, '..', 'data');

const CITIES = [
  { slug: 'london', query: 'London' },
  { slug: 'taipei', query: 'Taipei Taiwan' },
  { slug: 'paris', query: 'Paris France' },
  { slug: 'stockholm', query: 'Stockholm Sweden' },
  { slug: 'singapore', query: 'Singapore' },
  { slug: 'bangkok', query: 'Bangkok Thailand' },
  { slug: 'manila', query: 'Manila Philippines' },
  { slug: 'la', query: 'Los Angeles USA' },
  { slug: 'hawaii', query: 'Hawaii USA' },
  { slug: 'seoul', query: 'Seoul South Korea' },
];

async function searchPlace(spotName, cityQuery) {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.location',
    },
    body: JSON.stringify({
      textQuery: `${spotName} in ${cityQuery}`,
      languageCode: 'en',
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data.places || data.places.length === 0) return null;

  const place = data.places[0];
  return {
    placeId: place.id || null,
    lat: place.location?.latitude || null,
    lng: place.location?.longitude || null,
  };
}

async function main() {
  if (!API_KEY) {
    console.error('❌ GOOGLE_PLACES_API_KEY が必要です');
    process.exit(1);
  }

  console.log(`📍 スポット座標自動取得 ${DRY_RUN ? '(ドライラン)' : ''}\n`);

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const city of CITIES) {
    const filePath = path.join(DATA_DIR, `spots-${city.slug}.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ ${city.slug}: ファイルなし、スキップ`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const spots = data.spots || [];
    const needCoords = spots.filter(s => !s.lat || !s.lng);

    if (needCoords.length === 0) {
      console.log(`✅ ${city.slug}: 全スポット座標あり`);
      continue;
    }

    console.log(`\n🏙️ ${city.slug}: ${needCoords.length}/${spots.length} 件の座標を取得`);

    for (const spot of needCoords) {
      const result = await searchPlace(spot.name, city.query);

      if (result && result.lat && result.lng) {
        console.log(`  ✅ ${spot.name} → (${result.lat.toFixed(4)}, ${result.lng.toFixed(4)})`);
        spot.lat = result.lat;
        spot.lng = result.lng;
        if (result.placeId && !spot.placeId) {
          spot.placeId = result.placeId;
        }
        totalUpdated++;
      } else {
        console.log(`  ❌ ${spot.name} → 座標取得失敗`);
        totalFailed++;
      }

      // レート制限対策
      await new Promise(r => setTimeout(r, 300));
    }

    if (!DRY_RUN) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
      console.log(`  💾 ${filePath} を更新`);
    }
  }

  console.log(`\n══════════════════════════════════════`);
  console.log(`📊 完了 ${DRY_RUN ? '(ドライラン)' : ''}`);
  console.log(`  座標取得成功: ${totalUpdated} 件`);
  console.log(`  座標取得失敗: ${totalFailed} 件`);
  console.log(`  スキップ（座標あり）: ${totalSkipped} 件`);
  console.log(`══════════════════════════════════════\n`);
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});

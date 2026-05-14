#!/usr/bin/env node
/**
 * export-spots-to-csv.js（一回限りの移行用スクリプト）
 *
 * data/spots-{slug}.json から国別 CSV を生成する。
 * Google My Maps「インポート」機能で各国マップに一括取り込みするための形式。
 *
 * 出力: kml-export/spots-{slug}.csv（11 ファイル）
 *
 * CSV 列:
 *   名前      : 絵文字付きスポット名（My Maps のピン名になる）
 *   緯度      : lat（あれば）
 *   経度      : lng（あれば）
 *   住所      : lat/lng がない場合のフォールバック（My Maps が geocode する）
 *   カテゴリ   : 親子で食べる / 遊びに行く / 現地の日常へ / いざという時
 *               （My Maps の「データ列でスタイル設定」で色分けに使える）
 *   説明      : 説明文 + 「カテゴリ: XXX」（fetch-mymaps の round-trip 対応）
 *
 * 使い方:
 *   node scripts/export-spots-to-csv.js
 *
 *   または GitHub Actions「Export Spots to CSV」を手動実行 → Artifacts でダウンロード
 *
 * My Maps 取り込み手順:
 *   1. Wamily Spots ◯◯ マップを開く
 *   2. 既存レイヤーの「⋮」→「このレイヤを削除」（重複防止）
 *   3. 「+ 新しいレイヤを追加」→「インポート」→ CSV をアップロード
 *   4. 列マッピング:
 *      - 「目印を配置する列」: 緯度 と 経度（または 住所）
 *      - 「目印のタイトルとして使用する列」: 名前
 *   5. 完了
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT_DIR = path.join(__dirname, '..', 'kml-export');

const COUNTRIES = ['london', 'paris', 'stockholm', 'singapore', 'bangkok', 'manila', 'la', 'hawaii', 'seoul', 'taipei', 'hongkong'];

const COUNTRY_LABEL = {
  london: 'ロンドン', paris: 'パリ', stockholm: 'ストックホルム',
  singapore: 'シンガポール', bangkok: 'バンコク', manila: 'マニラ',
  la: 'ロサンゼルス', hawaii: 'ハワイ', seoul: 'ソウル',
  taipei: '台北', hongkong: '香港',
};

const CATEGORY_LABEL = {
  food:  '親子で食べる',
  play:  '遊びに行く',
  local: '現地の日常へ',
  vital: 'いざという時',
};

function escapeCsv(s) {
  if (s == null || s === '') return '';
  s = String(s);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

let totalSpots = 0;
let totalCountries = 0;

for (const slug of COUNTRIES) {
  const file = path.join(DATA_DIR, `spots-${slug}.json`);
  if (!fs.existsSync(file)) {
    console.log(`⏭  skip: ${slug} (file not found)`);
    continue;
  }

  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const spots = data.spots || [];
  if (spots.length === 0) {
    console.log(`⏭  skip: ${slug} (no spots)`);
    continue;
  }

  const lines = ['名前,緯度,経度,住所,カテゴリ,説明'];
  let withCoords = 0;
  let geocodeNeeded = 0;

  for (const s of spots) {
    const cat = CATEGORY_LABEL[s.category] || s.category || '';
    const emoji = s.emoji || '📍';
    const name = `${emoji} ${s.name}`;
    const desc = (s.description || '') + (cat ? `\nカテゴリ: ${cat}` : '');
    const lat = (s.lat != null) ? s.lat : '';
    const lng = (s.lng != null) ? s.lng : '';
    const addr = (lat === '' || lng === '')
      ? `${s.name} ${COUNTRY_LABEL[slug] || ''}`
      : '';

    if (lat !== '' && lng !== '') withCoords++;
    else geocodeNeeded++;

    lines.push([
      escapeCsv(name),
      escapeCsv(lat),
      escapeCsv(lng),
      escapeCsv(addr),
      escapeCsv(cat),
      escapeCsv(desc),
    ].join(','));
  }

  // BOM 付きで UTF-8 保存（Excel・My Maps で文字化け回避）
  const csv = '﻿' + lines.join('\r\n') + '\r\n';
  const outFile = path.join(OUT_DIR, `spots-${slug}.csv`);
  fs.writeFileSync(outFile, csv, 'utf-8');
  console.log(`✅ ${path.basename(outFile)}: ${spots.length} 件 (lat/lng有り: ${withCoords} / 住所のみ要geocode: ${geocodeNeeded})`);
  totalSpots += spots.length;
  totalCountries++;
}

console.log(`\n🎉 完了: ${totalSpots} 件 / ${totalCountries} カ国 → ${OUT_DIR}/`);

#!/usr/bin/env node
/**
 * fetch-mymaps.js
 * Google My Maps から KML を取得し、新規スポットを data/spots-*.json に追加する。
 *
 * - 既存スポット（名前一致）はスキップ（上書きしない）
 * - 新規スポットのみ追加
 * - My Maps のフォルダ名で国を判定
 *
 * 必要な環境変数：
 *   GOOGLE_MYMAPS_ID — My Maps の ID（mid=XXX の部分）
 *     省略時はデフォルト値を使用
 */

const fs = require('fs');
const path = require('path');
const { notifySlack } = require('./lib/slack-notify');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DEFAULT_MAP_ID = '1HiGInkF-pvsI8iaNZSdQ5fXCVj6McVM';
const MAP_ID = process.env.GOOGLE_MYMAPS_ID || DEFAULT_MAP_ID;

// フォルダ名（国名） → ファイルスラグ
const FOLDER_TO_SLUG = {
  'イギリス・ロンドン': 'london',
  'ロンドン': 'london',
  '台湾・台北': 'taipei',
  '台北': 'taipei',
  'フランス・パリ': 'paris',
  'パリ': 'paris',
  'スウェーデン・ストックホルム': 'stockholm',
  'ストックホルム': 'stockholm',
  'シンガポール': 'singapore',
  'タイ・バンコク': 'bangkok',
  'バンコク': 'bangkok',
  'フィリピン・マニラ': 'manila',
  'マニラ': 'manila',
  'アメリカ・ロサンゼルス': 'la',
  'ロサンゼルス': 'la',
  'LA': 'la',
  'アメリカ・ハワイ': 'hawaii',
  'ハワイ': 'hawaii',
  '韓国・ソウル': 'seoul',
  'ソウル': 'seoul',
};

// カテゴリキーワード → カテゴリキー
const CATEGORY_MAP = {
  'いざという時': 'vital',
  '親子で食べる': 'food',
  '現地の日常へ': 'local',
  '遊びに行く': 'play',
};

// ──────────────────────────────────────────────────────────
// KML パーサー（軽量・依存なし）
// ──────────────────────────────────────────────────────────

function parseKML(kmlText) {
  const folders = [];
  // フォルダごとに分割
  const folderRegex = /<Folder>([\s\S]*?)<\/Folder>/g;
  let folderMatch;

  while ((folderMatch = folderRegex.exec(kmlText)) !== null) {
    const folderContent = folderMatch[1];
    // フォルダ名は最初の<name>（Placemarkより前）から取得
    const beforePlacemark = folderContent.split('<Placemark>')[0];
    const folderName = extractTag(beforePlacemark, 'name');
    if (!folderName) continue;

    const placemarks = [];
    const pmRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g;
    let pmMatch;

    while ((pmMatch = pmRegex.exec(folderContent)) !== null) {
      const pm = pmMatch[1];
      const rawName = extractTag(pm, 'name') || '';
      const description = extractCDATA(pm) || extractTag(pm, 'description') || '';
      const coords = extractCoordinates(pm);

      if (!rawName || !coords) continue;

      // 絵文字とスポット名を分離（先頭の絵文字を取得）
      const emojiMatch = rawName.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}]+)\s*/u);
      const emoji = emojiMatch ? emojiMatch[1] : '📍';
      const name = emojiMatch ? rawName.slice(emojiMatch[0].length) : rawName;

      // description からカテゴリを抽出
      let category = 'play';
      for (const [keyword, key] of Object.entries(CATEGORY_MAP)) {
        if (description.includes(keyword)) {
          category = key;
          break;
        }
      }

      // description からカテゴリ・確認日の行を除去してクリーンに
      let cleanDesc = description
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/\n*カテゴリ:.*$/m, '')
        .replace(/\n*確認:.*$/m, '')
        .trim();

      placemarks.push({
        name,
        emoji,
        category,
        layer: category === 'vital' ? 'vital' : (category === 'local' || category === 'food') ? 'local' : 'play',
        description: cleanDesc,
        lat: coords.lat,
        lng: coords.lng,
        status: 'check',
        statusLabel: '要確認',
        free: false,
        checkedDate: new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' }),
        placeId: null,
        extra: false,
      });
    }

    folders.push({ name: folderName, placemarks });
  }

  return folders;
}

function extractTag(xml, tag) {
  // CDATA対応
  const cdataRegex = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`);
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function extractCDATA(xml) {
  const match = xml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
  return match ? match[1].trim() : null;
}

function extractCoordinates(xml) {
  const match = xml.match(/<coordinates>\s*([-\d.]+),([-\d.]+)/);
  if (!match) return null;
  return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  const kmlUrl = `https://www.google.com/maps/d/kml?mid=${MAP_ID}&forcekml=1`;
  console.log(`📥 Google My Maps KML を取得中...`);
  console.log(`   ${kmlUrl}\n`);

  const res = await fetch(kmlUrl);
  if (!res.ok) {
    console.error(`❌ KML取得失敗: ${res.status} ${res.statusText}`);
    console.error('   My Maps が「リンクを知っている人なら誰でも表示できる」設定か確認してください');
    process.exit(1);
  }

  const kmlText = await res.text();
  const folders = parseKML(kmlText);

  console.log(`📊 ${folders.length} フォルダ（国）を検出\n`);

  let totalNew = 0;

  for (const folder of folders) {
    const slug = FOLDER_TO_SLUG[folder.name];
    if (!slug) {
      console.log(`⚠️  「${folder.name}」は未知のフォルダ名です（スキップ）`);
      continue;
    }

    const spotsFile = path.join(DATA_DIR, `spots-${slug}.json`);

    // 既存データを読み込み
    let existingData = { spots: [], checkedAt: null };
    if (fs.existsSync(spotsFile)) {
      existingData = JSON.parse(fs.readFileSync(spotsFile, 'utf-8'));
    }

    // 名前の正規化（絵文字・バリエーションセレクタ・ZWJ等を除去して比較）
    function normalizeName(n) {
      return n
        .replace(/[\u200D\uFE00-\uFE0F\u20E3\u2600-\u27BF]/g, '')
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
    const existingNamesNorm = new Set(existingData.spots.map(s => normalizeName(s.name)));
    let newCount = 0;

    for (const pm of folder.placemarks) {
      if (existingNamesNorm.has(normalizeName(pm.name))) continue; // 既存スポットはスキップ

      // 新規スポットを追加
      existingData.spots.push({
        id: 'mymaps-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        ...pm,
      });
      newCount++;
      console.log(`  ✨ [${slug}] 新規追加: ${pm.emoji} ${pm.name}`);
    }

    if (newCount > 0) {
      existingData.checkedAt = new Date().toISOString();
      fs.writeFileSync(spotsFile, JSON.stringify(existingData, null, 2), 'utf-8');
      totalNew += newCount;
    }

    console.log(`  📍 ${folder.name}: ${folder.placemarks.length} 件中 ${newCount} 件が新規`);
  }

  console.log(`\n🎉 完了！ 新規追加: ${totalNew} 件`);

  // 新規追加がある場合のみ通知
  if (totalNew > 0) {
    await notifySlack({
      channel: 'patrol',
      icon: '🟢',
      title: '[パトロール部] My Maps同期 完了',
      body: `${totalNew}件の新規スポットを追加`,
      color: 'success',
      fields: [
        { label: '新規追加', value: `${totalNew}件` },
      ],
    });
  }
}

main().catch(async err => {
  console.error('❌ エラー:', err.message);
  await notifySlack({
    channel: 'patrol',
    icon: '🔴',
    title: '[パトロール部] My Maps同期 エラー',
    body: err.message,
    color: 'error',
  });
  process.exit(1);
});

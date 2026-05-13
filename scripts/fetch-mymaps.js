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
const DEFAULT_MAP_IDS = ['1HiGInkF-pvsI8iaNZSdQ5fXCVj6McVM'];

// マップ設定を解釈:
//   1. JSON object 形式（推奨／per-country対応）:
//      '{"_legacy":["旧Map1","旧Map2"],"london":"新Map","hongkong":"新Map2"}'
//      - per-country: そのマップのピンは指定 slug の国として扱う（フォルダ名関係なし）
//      - _legacy: 従来通りフォルダ名 → 国 の自動判定
//      - per-country で指定された slug は legacy マップ側でスキップされる（重複防止）
//
//   2. カンマ区切り形式（後方互換／全マップ legacy 扱い）:
//      "Map1,Map2,Map3"
//
//   3. 未設定: DEFAULT_MAP_IDS を legacy として使用
function parseMapIdsConfig(raw) {
  const fallback = { legacy: DEFAULT_MAP_IDS.slice(), perCountry: {} };
  if (!raw) return fallback;
  const trimmed = String(raw).trim();
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed);
      const legacy = Array.isArray(obj._legacy) ? obj._legacy
                   : (typeof obj._legacy === 'string' ? [obj._legacy] : []);
      const perCountry = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k === '_legacy') continue;
        if (typeof v === 'string' && v) perCountry[k] = v;
      }
      return { legacy, perCountry };
    } catch (e) {
      console.warn('⚠  GOOGLE_MYMAPS_IDS の JSON パース失敗。カンマ区切りとしてフォールバック:', e.message);
    }
  }
  return {
    legacy: trimmed.split(',').map(s => s.trim()).filter(Boolean),
    perCountry: {}
  };
}

const MAP_CONFIG = parseMapIdsConfig(
  process.env.GOOGLE_MYMAPS_IDS || process.env.GOOGLE_MYMAPS_ID
);

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
  '香港': 'hongkong',
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
      const address = extractTag(pm, 'address');

      if (!rawName) continue;
      // 座標 or 住所のどちらかが必要（住所だけの場合は後で Places API でジオコーディング）
      if (!coords && !address) continue;

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
        layer: category === 'vital' ? 'vital' : category === 'local' ? 'local' : 'play',
        description: cleanDesc,
        lat: coords ? coords.lat : null,
        lng: coords ? coords.lng : null,
        address: address || null,  // 座標なしのピンは後で Places API でジオコーディング
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
// Places API で住所＋名前から座標と placeId を解決
// （CSVインポートで作られた住所のみのピン用）
// ──────────────────────────────────────────────────────────

async function geocodePlacemark(placemark) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn(`   ⚠️ GOOGLE_PLACES_API_KEY 未設定: ${placemark.name} をスキップ`);
    return null;
  }

  // 名前 + 住所を検索クエリに（住所だけより精度高い）
  const query = `${placemark.name} ${placemark.address || ''}`.trim();

  const url = new URL('https://maps.googleapis.com/maps/api/place/findplacefromtext/json');
  url.searchParams.set('input', query);
  url.searchParams.set('inputtype', 'textquery');
  url.searchParams.set('fields', 'place_id,geometry,name,formatted_address');
  url.searchParams.set('language', 'ja');
  url.searchParams.set('key', apiKey);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.status !== 'OK' || !data.candidates || data.candidates.length === 0) {
      console.warn(`   ⚠️ Places API で見つからず: "${query}" (status=${data.status})`);
      return null;
    }
    const c = data.candidates[0];
    return {
      lat: c.geometry?.location?.lat ?? null,
      lng: c.geometry?.location?.lng ?? null,
      placeId: c.place_id || null,
      formattedAddress: c.formatted_address || null,
    };
  } catch (err) {
    console.warn(`   ⚠️ Places API 呼び出し失敗: ${err.message}`);
    return null;
  }
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function fetchMapKML(mapId, label) {
  const kmlUrl = `https://www.google.com/maps/d/kml?mid=${mapId}&forcekml=1`;
  const shortId = mapId.slice(0, 8);
  console.log(`\n${label} ${shortId}...`);
  const res = await fetch(kmlUrl);
  if (!res.ok) {
    console.error(`   ❌ KML取得失敗: ${res.status} ${res.statusText}`);
    console.error('      共有設定を「リンクを知っている人なら誰でも表示できる」に確認してください');
    return null;
  }
  return res.text();
}

async function main() {
  const legacyCount = MAP_CONFIG.legacy.length;
  const perCountryCount = Object.keys(MAP_CONFIG.perCountry).length;
  const totalMaps = legacyCount + perCountryCount;
  console.log(`📥 Google My Maps から ${totalMaps} 個の地図を取得中（legacy: ${legacyCount} / per-country: ${perCountryCount}）...`);

  // 国別マップ（slug → mapId）優先で先に集める
  const taggedFolders = []; // [{slug, folder}]
  const legacyFolders = []; // [folder]
  let fetchErrors = 0;

  // ── per-country マップを処理 ──
  let i = 0;
  for (const [slug, mapId] of Object.entries(MAP_CONFIG.perCountry)) {
    i++;
    const kmlText = await fetchMapKML(mapId, `[per-country ${i}/${perCountryCount} → ${slug}]`);
    if (!kmlText) { fetchErrors++; continue; }
    const mapFolders = parseKML(kmlText);
    console.log(`   → ${mapFolders.length} フォルダ検出（全て slug=${slug} として扱う）`);
    for (const folder of mapFolders) {
      taggedFolders.push({ slug, folder });
    }
  }

  // ── legacy マップを処理 ──
  for (let j = 0; j < MAP_CONFIG.legacy.length; j++) {
    const mapId = MAP_CONFIG.legacy[j];
    const kmlText = await fetchMapKML(mapId, `[legacy ${j + 1}/${legacyCount}]`);
    if (!kmlText) { fetchErrors++; continue; }
    const mapFolders = parseKML(kmlText);
    console.log(`   → ${mapFolders.length} フォルダ検出`);
    legacyFolders.push(...mapFolders);
  }

  // すべての地図が失敗した場合だけ中止
  if (taggedFolders.length === 0 && legacyFolders.length === 0 && fetchErrors === totalMaps) {
    console.error('\n❌ すべての地図でKML取得に失敗しました');
    process.exit(1);
  }

  console.log(`\n📊 per-country: ${taggedFolders.length} フォルダ / legacy: ${legacyFolders.length} フォルダ\n`);

  // 統合: {slug, placemarks} のリストに正規化
  const folders = [];

  // per-country: slug は env で確定
  for (const { slug, folder } of taggedFolders) {
    folders.push({ name: folder.name, slug, placemarks: folder.placemarks });
  }

  // legacy: フォルダ名から slug を判定。per-country で管理済みの slug は重複防止のためスキップ
  const migratedSlugs = new Set(Object.keys(MAP_CONFIG.perCountry));
  for (const folder of legacyFolders) {
    const slug = FOLDER_TO_SLUG[folder.name];
    if (!slug) {
      console.log(`⚠️  「${folder.name}」は未知のフォルダ名です（スキップ）`);
      continue;
    }
    if (migratedSlugs.has(slug)) {
      console.log(`↩️  「${folder.name}」は per-country マップで管理済み → legacy 側はスキップ`);
      continue;
    }
    folders.push({ name: folder.name, slug, placemarks: folder.placemarks });
  }

  let totalNew = 0;

  for (const folder of folders) {
    const slug = folder.slug;
    if (!slug) continue;

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

      // 座標が空（CSVインポートで作られた住所のみのピン）なら Places API で解決
      if (pm.lat === null || pm.lng === null) {
        process.stdout.write(`  🌐 [${slug}] ${pm.name} をジオコーディング中... `);
        const geo = await geocodePlacemark(pm);
        if (geo && geo.lat && geo.lng) {
          pm.lat = geo.lat;
          pm.lng = geo.lng;
          pm.placeId = geo.placeId;
          console.log('✅ 解決');
          // レート制限対策
          await new Promise(r => setTimeout(r, 200));
        } else {
          console.log('❌ スキップ');
          continue;  // 座標が解決できなければ追加しない
        }
      }

      // 一時用の address フィールドは保存しない
      const { address: _addr, ...spotData } = pm;

      // 新規スポットを追加
      existingData.spots.push({
        id: 'mymaps-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        ...spotData,
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

#!/usr/bin/env node
/**
 * add-country.js — 新しい国を Wamily Guide に追加する
 *
 * 使い方:
 *   node scripts/add-country.js
 *   → 対話形式で国の情報を入力
 *
 * 自動で行うこと（8箇所を一括更新）:
 *   1. /{slug}/index.html — 国ページを生成
 *   2. data/spots-{slug}.json — 空のスポットファイル生成
 *   3. js/data-loader.js — SLUG_TO_COUNTRY に追加
 *   4. js/spots-map.js — COUNTRY_CONFIG に追加
 *   5. scripts/fetch-events.js — COUNTRIES 配列に追加
 *   6. scripts/fetch-notion.js — COUNTRY_SLUG に追加
 *   7. scripts/fetch-mymaps.js — FOLDER_TO_SLUG に追加
 *   8. scripts/check-spots.js — SLUGS 配列に追加
 *
 * 手動で行うこと（スクリプト実行後に案内表示）:
 *   - guidebook/index.html にカード追加
 *   - Google My Maps にフォルダ追加
 *   - Notion DB にビュー追加
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.join(__dirname, '..');

// ── 対話入力 ──────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function getInput() {
  console.log('\n🌍 Wamily Guide — 新しい国を追加\n');

  const slug = await ask('スラグ（URLパス / 英小文字）: ');
  const nameJa = await ask('日本語名（例: ドイツ・ベルリン）: ');
  const nameEn = await ask('英語名（例: Germany / Berlin）: ');
  const flag = await ask('国旗絵文字（例: 🇩🇪）: ');
  const lat = parseFloat(await ask('緯度 lat（例: 52.5200）: '));
  const lng = parseFloat(await ask('経度 lng（例: 13.4050）: '));
  const zoom = parseInt(await ask('ズームレベル（デフォルト12）: ') || '12');
  const imageUrl = await ask('Unsplash画像URL（省略可）: ') || 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1920&q=80';
  const notionName = await ask('Notion国名（例: ドイツ）: ');
  const myMapsFolder = await ask('My Mapsフォルダ名（例: ドイツ・ベルリン）: ') || nameJa;

  return { slug, nameJa, nameEn, flag, lat, lng, zoom, imageUrl, notionName, myMapsFolder };
}

// ── 1. 国ページ生成 ───────────────────────────────────────

function createCountryPage(c) {
  const dir = path.join(ROOT, c.slug);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${c.nameJa} — Wamily ガイドブック</title>
  <meta name="description" content="子連れ${c.nameJa}旅行のガイド。医療・交通・おすすめスポットまで。">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/style.css">
</head>
<body data-country="${c.slug}">

  <!-- ======= のれん ======= -->
  <nav class="noren">
    <a href="../" class="noren-logo"><em>W</em>amily</a>
    <span class="noren-breadcrumb">ガイドブック &rsaquo; <span>${c.nameJa}</span></span>
  </nav>

  <!-- ======= 写真ヘッダー ======= -->
  <div class="page-photo-header">
    <img src="${c.imageUrl}" alt="${c.nameJa}" loading="eager">
    <div class="page-photo-gradient"></div>
    <div class="page-photo-title">
      <span class="page-photo-title-flag">${c.flag}</span>
      <h1>${c.nameJa}</h1>
    </div>
  </div>

  <!-- ======= ページヘッダー ======= -->
  <header class="page-header">
    <div class="page-header-inner">
      <div class="page-flag" aria-hidden="true">${c.flag}</div>
      <h1 class="page-title">${c.nameJa}</h1>
      <p class="page-en">${c.nameEn}</p>

      <div class="page-meta">
        <span class="tag" style="background:#fff3cd;color:#856404;border-color:#ffc107">まだ旅の途中</span>
        <span class="page-meta-item">最終更新：${new Date().getFullYear()}年${new Date().getMonth() + 1}月</span>
      </div>
    </div>
  </header>

  <!-- ======= タブナビ ======= -->
  <nav class="tab-nav" aria-label="ガイドセクション">
    <div class="tab-nav-inner">
      <button class="tab-btn active" data-tab="tab-about">🏙️ ${c.nameJa.split('・').pop()}について</button>
      <button class="tab-btn" data-tab="tab-before">🧭 行く前に</button>
      <button class="tab-btn" data-tab="tab-enjoy">✨ 現地で楽しむ</button>
      <button class="tab-btn" data-tab="tab-baton">🪃 旅のバトン</button>
    </div>
  </nav>

  <!-- ======= タブ 1：この国について ======= -->
  <div id="tab-about" class="tab-pane active">
    <div class="section">
      <p class="about-lead">${c.nameJa}のガイドは準備中です。</p>
      <p class="about-body">
        このページは現在作成中です。スポット情報やイベント情報は自動で更新されていきます。<br><br>
        「旅のバトン」タブから、あなたの体験を教えていただけると嬉しいです。
      </p>
    </div>
  </div>

  <!-- ======= タブ 2：行く前に ======= -->
  <div id="tab-before" class="tab-pane">
    <div class="section">
      <p style="color:var(--text-muted)">準備中です。</p>
    </div>
  </div>

  <!-- ======= タブ 3：現地で楽しむ ======= -->
  <div id="tab-enjoy" class="tab-pane">
    <div class="section">

      <!-- フィルター -->
      <div class="filter-bar" role="group" aria-label="カテゴリーフィルター">
        <button class="filter-btn active" data-category="all">すべて</button>
        <button class="filter-btn" data-category="food">🍽️ 親子で食べる</button>
        <button class="filter-btn" data-category="play">🎡 遊びに行く</button>
        <button class="filter-btn" data-category="local">🛒 現地の日常へ</button>
        <button class="filter-btn" data-category="vital">🏥 いざという時</button>
      </div>

      <!-- Google Maps スポット一覧 -->
      <div class="spots-map-wrapper" id="spots-map-section">
        <div id="spots-map"></div>
        <div class="spots-map-footer">
          <div class="spots-map-legend">
            <span class="spots-map-legend-item">
              <span class="spots-map-legend-dot" style="background:#e74c3c"></span>いざという時
            </span>
            <span class="spots-map-legend-item">
              <span class="spots-map-legend-dot" style="background:#f39c12"></span>現地の日常へ
            </span>
            <span class="spots-map-legend-item">
              <span class="spots-map-legend-dot" style="background:#2a9d8f"></span>遊びに行く
            </span>
          </div>
        </div>
      </div>

      <!-- スポット -->
      <div id="spot-layers">
        <p style="color:var(--text-muted);font-size:13px">スポット情報を読み込み中...</p>
      </div>

      <div class="divider"></div>

      <!-- 今週のイベント -->
      <div>
        <div class="event-section-header">
          <div class="pulse-dot" aria-hidden="true"></div>
          <h3>今週のイベント</h3>
          <span class="event-source" id="events-updated-at">自動取得</span>
        </div>
        <div class="event-list" id="event-list">
          <p style="font-size:13px;color:var(--text-muted)">イベント情報を読み込み中...</p>
        </div>
      </div>

    </div>
  </div>

  <!-- ======= タブ 4：旅のバトン ======= -->
  <div id="tab-baton" class="tab-pane">
    <div class="section">

      <!-- キュレーション -->
      <div class="baton-block">
        <h3 class="baton-block-title">📚 サワディーのおすすめ</h3>
        <div id="curation-list">
          <p style="font-size:13px;color:var(--text-muted)">キュレーション情報を読み込み中...</p>
        </div>
      </div>

      <div class="divider"></div>

      <!-- 最近の動き -->
      <div>
        <h3 style="margin-bottom:16px">📡 最近の動き</h3>
        <div class="feed-list" id="feed-list"></div>
      </div>

    </div>
  </div>

  <!-- ======= フッター ======= -->
  <footer class="footer">
    <p class="footer-logo"><em>W</em>amily</p>
    <p class="footer-text">家族の数だけ、旅がある。誰かの経験が、誰かの地図になる。</p>
    <p class="footer-text" style="margin-top:6px">
      <a href="../" style="color:var(--teal)">← ガイドブックに戻る</a>
      &nbsp;｜&nbsp;
      © 2024 Wamily — サワディー
    </p>
  </footer>

  <script src="../js/main.js"></script>
  <script>window.WAMILY_BASE = '../';</script>
  <script src="../js/data-loader.js"></script>
  <script src="../js/maps-config.js"></script>
  <script src="../js/spots-map.js"></script>
</body>
</html>`;

  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf-8');
  console.log(`  ✅ ${c.slug}/index.html 作成`);
}

// ── 1.5. countries.json に draft で追加 ────────────────────

function updateCountriesJson(c) {
  const countriesPath = path.join(ROOT, 'data', 'countries.json');
  let countriesData;
  try {
    countriesData = JSON.parse(fs.readFileSync(countriesPath, 'utf-8'));
  } catch {
    countriesData = { countries: [] };
  }

  if (countriesData.countries.some(entry => entry.slug === c.slug)) {
    console.log(`  ⏭️  countries.json に ${c.slug} は既に存在します`);
    return;
  }

  countriesData.countries.push({
    slug: c.slug,
    nameJa: c.nameJa.split('・').pop(),
    nameEn: c.nameEn.split(' / ').pop(),
    flag: c.flag,
    status: 'draft',
    maturity: '準備中',
    tripDate: null,
    spots: 0,
    hasHost: false,
    center: { lat: c.lat, lng: c.lng },
    zoom: c.zoom,
  });

  fs.writeFileSync(countriesPath, JSON.stringify(countriesData, null, 2) + '\n', 'utf-8');
  console.log(`  ✅ countries.json に draft で追加`);
}

// ── 2. 空のスポットファイル生成 ──────────────────────────

function createSpotsJSON(c) {
  const fp = path.join(ROOT, 'data', `spots-${c.slug}.json`);
  if (fs.existsSync(fp)) {
    console.log(`  ⏭️  data/spots-${c.slug}.json は既に存在します`);
    return;
  }
  fs.writeFileSync(fp, JSON.stringify({ spots: [], checkedAt: new Date().toISOString() }, null, 2), 'utf-8');
  console.log(`  ✅ data/spots-${c.slug}.json 作成`);
}

function createCurationJSON(c) {
  const fp = path.join(ROOT, 'data', `curation-${c.slug}.json`);
  if (fs.existsSync(fp)) {
    console.log(`  ⏭️  data/curation-${c.slug}.json は既に存在します`);
    return;
  }
  fs.writeFileSync(fp, JSON.stringify({ items: [] }, null, 2) + '\n', 'utf-8');
  console.log(`  ✅ data/curation-${c.slug}.json 作成`);
}

function createEventsJSON(c) {
  const fp = path.join(ROOT, 'data', `events-${c.slug}.json`);
  if (fs.existsSync(fp)) {
    console.log(`  ⏭️  data/events-${c.slug}.json は既に存在します`);
    return;
  }
  fs.writeFileSync(fp, JSON.stringify({ items: [], updatedAt: null }, null, 2) + '\n', 'utf-8');
  console.log(`  ✅ data/events-${c.slug}.json 作成`);
}

// ── 3〜8. 各設定ファイルに追記 ────────────────────────────

function insertAfterPattern(filePath, pattern, insertion) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const idx = content.lastIndexOf(pattern);
  if (idx === -1) {
    console.log(`  ⚠️  パターン未検出: ${filePath}`);
    return false;
  }
  content = content.slice(0, idx + pattern.length) + insertion + content.slice(idx + pattern.length);
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
}

function updateDataLoader(c) {
  const fp = path.join(ROOT, 'js', 'data-loader.js');
  const pattern = `'seoul':     ['ソウル'],`;
  const insertion = `\n    '${c.slug}':${' '.repeat(Math.max(1, 9 - c.slug.length))}['${c.notionName}'],`;
  if (insertAfterPattern(fp, pattern, insertion)) {
    console.log(`  ✅ data-loader.js SLUG_TO_COUNTRY に追加`);
  }
}

function updateSpotsMap(c) {
  const fp = path.join(ROOT, 'js', 'spots-map.js');
  const pattern = `seoul:     { lat: 37.5665,  lng: 126.9780,  zoom: 12 },`;
  // Also try the new COUNTRY_CONFIG_DEFAULT format
  const patternAlt = `seoul:     { lat: 37.5665,  lng: 126.9780,  zoom: 12 },`;
  const insertion = `\n    ${c.slug}:${' '.repeat(Math.max(1, 11 - c.slug.length))}{ lat: ${c.lat.toFixed(4)},  lng: ${c.lng.toFixed(4)}, zoom: ${c.zoom} },`;
  if (insertAfterPattern(fp, pattern, insertion)) {
    console.log(`  ✅ spots-map.js COUNTRY_CONFIG に追加`);
  }
}

function updateFetchEvents(c) {
  const fp = path.join(ROOT, 'scripts', 'fetch-events.js');
  const pattern = `    source: 'Claude AI 生成',\n  },\n];`;
  const insertion = `\n  {\n    slug: '${c.slug}',\n    name: '${c.nameJa.split('・').pop()}',\n    nameEn: '${c.nameEn.split(' / ').pop()}',\n    source: 'Claude AI 生成',\n  },`;
  // Insert before the closing ];
  let content = fs.readFileSync(fp, 'utf-8');
  const closingIdx = content.indexOf("\n];", content.indexOf("const COUNTRIES"));
  if (closingIdx !== -1) {
    content = content.slice(0, closingIdx) + insertion + content.slice(closingIdx);
    fs.writeFileSync(fp, content, 'utf-8');
    console.log(`  ✅ fetch-events.js COUNTRIES に追加`);
  }
}

function updateFetchNotion(c) {
  const fp = path.join(ROOT, 'scripts', 'fetch-notion.js');
  const pattern = `  '台北': 'taipei',`;
  const insertion = `\n  '${c.notionName}': '${c.slug}',`;
  if (insertAfterPattern(fp, pattern, insertion)) {
    console.log(`  ✅ fetch-notion.js COUNTRY_SLUG に追加`);
  }
}

function updateFetchMyMaps(c) {
  const fp = path.join(ROOT, 'scripts', 'fetch-mymaps.js');
  const pattern = `  'ソウル': 'seoul',`;
  const insertion = `\n  '${c.myMapsFolder}': '${c.slug}',`;
  if (insertAfterPattern(fp, pattern, insertion)) {
    console.log(`  ✅ fetch-mymaps.js FOLDER_TO_SLUG に追加`);
  }
}

function updateCheckSpots(c) {
  const fp = path.join(ROOT, 'scripts', 'check-spots.js');
  const pattern = `'bangkok', 'manila', 'la', 'hawaii', 'seoul'`;
  const replacement = `'bangkok', 'manila', 'la', 'hawaii', 'seoul', '${c.slug}'`;
  let content = fs.readFileSync(fp, 'utf-8');
  content = content.replace(pattern, replacement);
  fs.writeFileSync(fp, content, 'utf-8');
  console.log(`  ✅ check-spots.js SLUGS に追加`);
}

// ── メイン ─────────────────────────────────────────────────

async function main() {
  const c = await getInput();

  // 確認
  console.log(`\n📋 以下の内容で国を追加します:`);
  console.log(`   スラグ:     ${c.slug}`);
  console.log(`   日本語名:   ${c.nameJa}`);
  console.log(`   英語名:     ${c.nameEn}`);
  console.log(`   国旗:       ${c.flag}`);
  console.log(`   座標:       ${c.lat}, ${c.lng} (zoom: ${c.zoom})`);
  console.log(`   Notion国名: ${c.notionName}`);
  console.log(`   My Maps:    ${c.myMapsFolder}`);

  const confirm = await ask('\n実行しますか？ (y/n): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('キャンセルしました。');
    return;
  }

  console.log('\n🔧 ファイルを更新中...\n');

  // 1. 国ページ生成
  createCountryPage(c);

  // 1.5. countries.json に追加
  updateCountriesJson(c);

  // 2. データファイル生成
  createSpotsJSON(c);
  createCurationJSON(c);
  createEventsJSON(c);

  // 3〜8. 設定ファイル更新
  updateDataLoader(c);
  updateSpotsMap(c);
  updateFetchEvents(c);
  updateFetchNotion(c);
  updateFetchMyMaps(c);
  updateCheckSpots(c);

  console.log(`
🎉 完了！「${c.nameJa}」が追加されました。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 あと手動でやること:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Google My Maps にフォルダ「${c.myMapsFolder}」を追加
   → https://www.google.com/maps/d/edit?mid=1HiGInkF-pvsI8iaNZSdQ5fXCVj6McVM

2. guidebook/index.html にカードを追加（該当リージョンのパネルに）

3. git commit & push

4. GitHub Actions を実行してイベント生成
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});

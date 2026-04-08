#!/usr/bin/env node
/**
 * health-check.js
 * データファイルの健全性を検証し、Slackに結果を報告する。
 * パトロール部 + コンテンツ部 の統合チェック。
 *
 * sync.yml の最終ステップとして実行される。
 * STEP_* 環境変数で各ステップの成否を受け取り、レポートに含める。
 */

const fs = require('fs');
const path = require('path');
const { notifySlack } = require('./lib/slack-notify');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BASELINE_PATH = path.join(DATA_DIR, '.health-baseline.json');

const SLUGS = [
  'london', 'taipei', 'paris', 'stockholm', 'singapore',
  'bangkok', 'manila', 'la', 'hawaii', 'seoul',
];

const SLUG_LABELS = {
  london: '🇬🇧 ロンドン', taipei: '🇹🇼 台北', paris: '🇫🇷 パリ',
  stockholm: '🇸🇪 ストックホルム', singapore: '🇸🇬 シンガポール',
  bangkok: '🇹🇭 バンコク', manila: '🇵🇭 マニラ', la: '🇺🇸 LA',
  hawaii: '🇺🇸 ハワイ', seoul: '🇰🇷 ソウル',
};

// ──────────────────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────────────────

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function hoursAgo(isoStr, hours) {
  if (!isoStr) return true;
  const diff = Date.now() - new Date(isoStr).getTime();
  return diff > hours * 60 * 60 * 1000;
}

function isISO(str) {
  return typeof str === 'string' && !isNaN(Date.parse(str));
}

// ──────────────────────────────────────────────────────────
// 検証ルール
// ──────────────────────────────────────────────────────────

function validateLiveFeed(errors, warnings) {
  const filePath = path.join(DATA_DIR, 'live-feed.json');
  const data = readJSON(filePath);
  if (!data) { errors.push('data/live-feed.json: ファイルが読めない'); return; }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    errors.push('data/live-feed.json: items が空');
  }
  if (!isISO(data.updatedAt)) {
    errors.push('data/live-feed.json: updatedAt が不正');
  } else if (hoursAgo(data.updatedAt, 48)) {
    warnings.push('data/live-feed.json: updatedAt が48時間以上前');
  }
  // コンテンツ部: 7日チェック
  if (data.updatedAt && hoursAgo(data.updatedAt, 7 * 24)) {
    warnings.push('data/live-feed.json: updatedAt が7日以上前');
  }
}

function validateSpots(errors, warnings, stats) {
  for (const slug of SLUGS) {
    const filePath = path.join(DATA_DIR, `spots-${slug}.json`);
    const data = readJSON(filePath);
    if (!data) { errors.push(`data/spots-${slug}.json: ファイルが読めない`); continue; }
    if (!Array.isArray(data.spots) || data.spots.length === 0) {
      errors.push(`data/spots-${slug}.json: spots が空`);
      continue;
    }

    let open = 0, check = 0, closed = 0, noCoords = 0, noPlaceId = 0;
    for (const spot of data.spots) {
      if (!spot.name || !spot.category || !spot.layer) {
        warnings.push(`spots-${slug}: 必須フィールド欠損 (${spot.name || 'unknown'})`);
      }
      if (spot.status === 'open') open++;
      else if (spot.status === 'closed') closed++;
      else check++;

      if (spot.lat == null || spot.lng == null) noCoords++;
      if (!spot.placeId) noPlaceId++;

      // 閉業スポット検知
      if (spot.status === 'closed') {
        warnings.push(`⚠️ 閉業: ${SLUG_LABELS[slug]} - ${spot.name}`);
      }
    }

    stats.spotsByCountry[slug] = { total: data.spots.length, open, check, closed };
    stats.totalSpots += data.spots.length;
    stats.totalOpen += open;
    stats.totalCheck += check;
    stats.totalClosed += closed;
    stats.noCoords += noCoords;
    stats.noPlaceId += noPlaceId;
    stats.withCoords += data.spots.length - noCoords;
    stats.withPlaceId += data.spots.length - noPlaceId;
  }
}

function validateCuration(errors, warnings) {
  for (const slug of SLUGS) {
    const filePath = path.join(DATA_DIR, `curation-${slug}.json`);
    const data = readJSON(filePath);
    if (!data) { errors.push(`data/curation-${slug}.json: ファイルが読めない`); continue; }
    if (!Array.isArray(data.items)) {
      errors.push(`data/curation-${slug}.json: items が配列でない`);
    }
    if (!isISO(data.updatedAt)) {
      errors.push(`data/curation-${slug}.json: updatedAt が不正`);
    } else if (hoursAgo(data.updatedAt, 48)) {
      warnings.push(`data/curation-${slug}.json: updatedAt が48時間以上前`);
    }
  }
}

function validateEvents(errors, warnings) {
  for (const slug of SLUGS) {
    const filePath = path.join(DATA_DIR, `events-${slug}.json`);
    const data = readJSON(filePath);
    if (!data) { errors.push(`data/events-${slug}.json: ファイルが読めない`); continue; }
    if (!Array.isArray(data.items) || data.items.length === 0) {
      errors.push(`data/events-${slug}.json: items が空`);
    }
    if (!isISO(data.updatedAt)) {
      errors.push(`data/events-${slug}.json: updatedAt が不正`);
    } else if (hoursAgo(data.updatedAt, 48)) {
      warnings.push(`data/events-${slug}.json: updatedAt が48時間以上前`);
    }
  }
}

function validateNewsletterHistory(errors) {
  const filePath = path.join(DATA_DIR, 'newsletter-history.json');
  const data = readJSON(filePath);
  if (!data) { errors.push('data/newsletter-history.json: ファイルが読めない'); return; }
  if (!Array.isArray(data)) {
    errors.push('data/newsletter-history.json: 配列でない');
  }
}

// ──────────────────────────────────────────────────────────
// スポット数変動チェック
// ──────────────────────────────────────────────────────────

function checkBaseline(stats, warnings) {
  const baseline = readJSON(BASELINE_PATH);
  if (baseline) {
    for (const slug of SLUGS) {
      const prev = baseline[slug] || 0;
      const curr = stats.spotsByCountry[slug]?.total || 0;
      if (prev > 0 && curr > 0) {
        const change = Math.abs(curr - prev) / prev;
        if (change >= 0.2) {
          warnings.push(`spots-${slug}: スポット数が20%以上変動 (${prev} → ${curr})`);
        }
      }
    }
  }

  // 新しいベースラインを保存
  const newBaseline = {};
  for (const slug of SLUGS) {
    newBaseline[slug] = stats.spotsByCountry[slug]?.total || 0;
  }
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(newBaseline, null, 2), 'utf-8');
}

// ──────────────────────────────────────────────────────────
// 週次品質レポート（月曜のみ）
// ──────────────────────────────────────────────────────────

async function checkCurationUrls() {
  const results = { ok: 0, broken: [] };

  for (const slug of SLUGS) {
    const filePath = path.join(DATA_DIR, `curation-${slug}.json`);
    const data = readJSON(filePath);
    if (!data || !Array.isArray(data.items)) continue;

    for (const item of data.items) {
      if (!item.url) continue;
      try {
        const res = await fetch(item.url, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok || res.status === 405 || res.status === 403) {
          results.ok++;
        } else {
          results.broken.push({ slug, name: item.name, status: res.status });
        }
      } catch {
        results.broken.push({ slug, name: item.name, status: 'timeout' });
      }
    }
  }

  return results;
}

async function sendWeeklyQualityReport(stats) {
  // スポット状況
  const spotsLines = SLUGS.map((slug, i) => {
    const s = stats.spotsByCountry[slug] || { total: 0, open: 0, check: 0, closed: 0 };
    const prefix = i === 0 ? '┌' : i === SLUGS.length - 1 ? '└' : '├';
    return `${prefix} ${SLUG_LABELS[slug]}: ${s.total}件（open:${s.open} / check:${s.check} / closed:${s.closed}）`;
  }).join('\n');

  // キュレーションURL疎通
  console.log('  🔗 キュレーションURL疎通チェック中...');
  const urlResults = await checkCurationUrls();
  const totalUrls = urlResults.ok + urlResults.broken.length;
  let curationLines = `┌ URL疎通OK: ${urlResults.ok}/${totalUrls}件`;
  if (urlResults.broken.length > 0) {
    const brokenDetails = urlResults.broken.slice(0, 5).map(b =>
      `└ ⚠️ リンク切れ疑い: ${SLUG_LABELS[b.slug]} - "${b.name}"（${b.status}）`
    ).join('\n');
    curationLines += '\n' + brokenDetails;
  }

  // イベント鮮度
  const staleEvents = [];
  for (const slug of SLUGS) {
    const data = readJSON(path.join(DATA_DIR, `events-${slug}.json`));
    if (data?.updatedAt && hoursAgo(data.updatedAt, 48)) {
      staleEvents.push(SLUG_LABELS[slug]);
    }
  }
  const eventsLine = staleEvents.length === 0
    ? '└ 全10カ国 更新済み ✅'
    : `└ ⚠️ 更新遅延: ${staleEvents.join(', ')}`;

  const body = `スポット状況:\n${spotsLines}\n\nキュレーション:\n${curationLines}\n\nイベント:\n${eventsLine}`;

  await notifySlack({
    channel: 'content',
    icon: '📊',
    title: '[コンテンツ部] 週次品質レポート',
    body,
    color: urlResults.broken.length > 0 || staleEvents.length > 0 ? 'warning' : 'success',
  });
}

// ──────────────────────────────────────────────────────────
// ステップ結果の収集
// ──────────────────────────────────────────────────────────

function getStepResults() {
  const steps = {
    generate: process.env.STEP_GENERATE,
    notion:   process.env.STEP_NOTION,
    events:   process.env.STEP_EVENTS,
    mymaps:   process.env.STEP_MYMAPS,
    spots:    process.env.STEP_SPOTS,
  };

  const lines = [];
  const labels = {
    generate: 'コンテンツ生成',
    notion: 'Notion同期',
    events: 'イベント更新',
    mymaps: 'My Maps同期',
    spots: 'スポットチェック',
  };

  let hasFailure = false;
  for (const [key, outcome] of Object.entries(steps)) {
    if (!outcome) continue; // 未実行（条件スキップ）
    const icon = outcome === 'success' ? '✅' : outcome === 'failure' ? '❌' : '⏭️';
    if (outcome === 'failure') hasFailure = true;
    lines.push(`${icon} ${labels[key]}`);
  }

  return { lines, hasFailure };
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍 ヘルスチェック開始...\n');

  const errors = [];
  const warnings = [];
  const stats = {
    spotsByCountry: {},
    totalSpots: 0, totalOpen: 0, totalCheck: 0, totalClosed: 0,
    noCoords: 0, noPlaceId: 0, withCoords: 0, withPlaceId: 0,
  };

  // データ検証
  validateLiveFeed(errors, warnings);
  validateSpots(errors, warnings, stats);
  validateCuration(errors, warnings);
  validateEvents(errors, warnings);
  validateNewsletterHistory(errors);

  // ベースライン比較
  checkBaseline(stats, warnings);

  // ステップ結果
  const stepResults = getStepResults();

  // コンソール出力
  const totalFiles = 1 + 10 + 10 + 10 + 1; // live-feed + spots*10 + curation*10 + events*10 + history
  console.log(`📊 ファイル検証: ${totalFiles}ファイル`);
  console.log(`   エラー: ${errors.length}件 / 警告: ${warnings.length}件`);
  errors.forEach(e => console.error(`  ❌ ${e}`));
  warnings.forEach(w => console.warn(`  ⚠️ ${w}`));
  console.log(`\n📍 スポット: ${stats.totalSpots}件（open:${stats.totalOpen} / check:${stats.totalCheck} / closed:${stats.totalClosed}）`);
  console.log(`   座標あり: ${stats.withCoords}件 / placeIdあり: ${stats.withPlaceId}件`);

  // ── パトロール部 Slack通知 ──
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
  const hasProblems = errors.length > 0 || stepResults.hasFailure;

  let bodyLines = [];

  // ステップ結果があれば表示
  if (stepResults.lines.length > 0) {
    bodyLines.push('ステップ結果:');
    bodyLines.push(...stepResults.lines);
    bodyLines.push('');
  }

  if (hasProblems) {
    bodyLines.push(`${errors.length}件の問題を検出`);
    errors.forEach(e => bodyLines.push(`❌ ${e}`));
    warnings.slice(0, 5).forEach(w => bodyLines.push(`⚠️ ${w}`));
  } else {
    bodyLines.push(`全${totalFiles}ファイル正常`);
    bodyLines.push(`┌ スポット総数: ${stats.totalSpots}件（open:${stats.totalOpen} / check:${stats.totalCheck} / closed:${stats.totalClosed}）`);
    bodyLines.push(`├ 座標あり: ${stats.withCoords}件 / placeIdあり: ${stats.withPlaceId}件`);
    bodyLines.push(`└ 最終チェック: ${now} JST`);
    // 閉業警告は正常時でも表示
    const closedWarnings = warnings.filter(w => w.includes('閉業'));
    closedWarnings.forEach(w => bodyLines.push(w));
  }

  await notifySlack({
    channel: 'patrol',
    icon: hasProblems ? '🔴' : '🟢',
    title: `[パトロール部] ${hasProblems ? 'ヘルスチェック 異常検知' : '日次ヘルスチェック 完了'}`,
    body: bodyLines.join('\n'),
    color: hasProblems ? 'error' : 'success',
  });

  // ── コンテンツ部 日次チェック ──
  const contentWarnings = warnings.filter(w =>
    w.includes('48時間') || w.includes('7日')
  );
  if (contentWarnings.length > 0) {
    await notifySlack({
      channel: 'content',
      icon: '⚠️',
      title: '[コンテンツ部] 鮮度アラート',
      body: contentWarnings.join('\n'),
      color: 'warning',
    });
  }

  // ── コンテンツ部 週次レポート（月曜のみ） ──
  const isMonday = new Date().getDay() === 1;
  const isManualRun = !process.env.STEP_NOTION; // ステップ環境変数なし = ローカル実行 or 手動
  if (isMonday || isManualRun) {
    console.log('\n📊 週次品質レポート生成中...');
    await sendWeeklyQualityReport(stats);
  }

  console.log('\n🎉 ヘルスチェック完了');
}

main().catch(err => {
  console.error('❌ ヘルスチェック エラー:', err.message);
  process.exit(1);
});

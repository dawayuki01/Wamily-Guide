/**
 * ガイドブック編集部 — 週次レポート + 成熟度自動判定
 *
 * 各国の data/ ファイルを読み取り、成熟度を自動判定して countries.json を更新。
 * Slack #editorial に週次レポートを送信。
 *
 * Usage:
 *   node scripts/editorial-report.js
 */

const fs = require('fs');
const path = require('path');
const { notifySlack } = require('./lib/slack-notify');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COUNTRIES_PATH = path.join(DATA_DIR, 'countries.json');

// ──────────────────────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────────────────────

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * 成熟度の自動判定
 * - 準備中: spots < 5
 * - 基本: spots >= 5 AND (hasHost = false OR curation < 3)
 * - 充実: spots >= 15 AND hasHost = true AND curation >= 3
 */
function calcMaturity(spots, hasHost, curationCount) {
  if (spots < 5) return '準備中';
  if (spots >= 15 && hasHost && curationCount >= 3) return '充実';
  return '基本';
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  console.log('[編集部] 週次レポート開始');

  const countriesData = loadJson(COUNTRIES_PATH);
  if (!countriesData || !countriesData.countries) {
    console.error('[編集部] countries.json が見つかりません');
    return;
  }

  const countries = countriesData.countries;
  let totalSpots = 0;
  let publicCount = 0;
  let draftCount = 0;
  let hostCount = 0;
  let updated = false;

  const lines = [];

  for (const country of countries) {
    // スポット数を実データから取得
    const spotsData = loadJson(path.join(DATA_DIR, `spots-${country.slug}.json`));
    const spotsCount = spotsData?.spots?.length ?? 0;

    // キュレーション数を取得
    const curationData = loadJson(path.join(DATA_DIR, `curation-${country.slug}.json`));
    const curationCount = curationData?.items?.length ?? 0;

    // ホスト情報を取得
    const hostsData = loadJson(path.join(DATA_DIR, 'hosts.json'));
    const hasHost = Array.isArray(hostsData) && hostsData.some(h => h.slug === country.slug);

    // 成熟度を再計算
    const newMaturity = calcMaturity(spotsCount, hasHost, curationCount);

    // countries.json を更新
    if (country.spots !== spotsCount || country.hasHost !== hasHost || country.maturity !== newMaturity) {
      country.spots = spotsCount;
      country.hasHost = hasHost;
      country.maturity = newMaturity;
      updated = true;
    }

    totalSpots += spotsCount;
    if (country.status === 'public') publicCount++;
    if (country.status === 'draft') draftCount++;
    if (hasHost) hostCount++;

    const hostLabel = hasHost ? 'ホストあり' : 'ホストなし';
    const statusLabel = country.status === 'public' ? '公開' : country.status === 'draft' ? '下書き' : 'アーカイブ';
    const prefix = country === countries[countries.length - 1] ? '└' : '├';

    let line = `${prefix} ${country.flag} ${country.nameJa}: ${statusLabel} / ${newMaturity}（${spotsCount}スポット・${hostLabel}）`;
    if (country.status === 'draft' && country.tripDate) {
      line += `（渡航予定: ${country.tripDate}）`;
    }
    lines.push(line);
  }

  // countries.json を保存
  if (updated) {
    saveJson(COUNTRIES_PATH, countriesData);
    console.log('[編集部] countries.json を更新しました');
  }

  // レポート本文
  const body = `🗺 国別ステータス\n┌ ${lines.join('\n')}\n\n📊 全体サマリー\n┌ 公開国: ${publicCount} / 下書き: ${draftCount}\n├ スポット総数: ${totalSpots}件\n└ ホスト国: ${hostCount}カ国`;

  console.log('\n' + body);

  // Slack通知
  await notifySlack({
    channel: 'editorial',
    icon: '📝',
    title: '[ガイドブック編集部] 週次レポート',
    body,
    color: 'success',
  });

  console.log('[編集部] 週次レポート完了');
}

main().catch(err => {
  console.error('[編集部] エラー:', err);
  process.exit(1);
});

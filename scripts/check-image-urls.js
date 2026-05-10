#!/usr/bin/env node
/**
 * check-image-urls.js
 * 全HTMLファイル内の画像URL（Unsplash等）の死活チェック。
 * 404 が見つかったら Slack（patrol）に通知する。
 *
 * 自動修復はしない（適切な代替画像を機械的に選べないため）。
 *
 * Usage:
 *   node scripts/check-image-urls.js              # 本番実行
 *   node scripts/check-image-urls.js --verbose    # 全URL結果を表示
 */

const fs = require('fs');
const path = require('path');
const { notifySlack } = require('./lib/slack-notify');

const ARGS = process.argv.slice(2);
const VERBOSE = ARGS.includes('--verbose');

const ROOT = path.resolve(__dirname, '..');
const TIMEOUT_MS = 10000;
const CONCURRENCY = 5;
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.github', 'docs']);

// 対象ホスト（外部画像CDNのみチェック。同一オリジンの assets/ は対象外）
const IMAGE_HOST_PATTERN = /https:\/\/(images\.unsplash\.com|source\.unsplash\.com)\/[^"' )]+/g;

// ──────────────────────────────────────────────────────────
// HTMLファイル収集
// ──────────────────────────────────────────────────────────

function collectHtmlFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectHtmlFiles(full, acc);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      acc.push(full);
    }
  }
  return acc;
}

function extractImageUrls(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const matches = text.matchAll(IMAGE_HOST_PATTERN);
  const found = [];
  for (const m of matches) {
    const url = m[0];
    // 行番号を計算
    const before = text.slice(0, m.index);
    const line = before.split('\n').length;
    found.push({ url, line });
  }
  return found;
}

// ──────────────────────────────────────────────────────────
// URL 死活チェック（HEAD → GET フォールバック）
// ──────────────────────────────────────────────────────────

async function checkUrl(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    clearTimeout(timer);

    if (res.status >= 200 && res.status < 400) return { alive: true, status: res.status };
    if (res.status === 404 || res.status === 410) return { alive: false, status: res.status };
    return await retryWithGet(url);
  } catch (err) {
    if (err.name === 'AbortError') return await retryWithGet(url);
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      return { alive: false, status: null, error: `DNS失敗: ${err.code}` };
    }
    return await retryWithGet(url);
  }
}

async function retryWithGet(url) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    clearTimeout(timer);

    if (res.status >= 200 && res.status < 400) return { alive: true, status: res.status };
    if (res.status === 404 || res.status === 410) return { alive: false, status: res.status };
    return { alive: true, status: res.status, note: 'アクセス制限の可能性' };
  } catch (err) {
    if (err.name === 'AbortError') return { alive: false, status: null, error: 'タイムアウト' };
    return { alive: true, status: null, error: `${err.message}（不明・OK扱い）` };
  }
}

// ──────────────────────────────────────────────────────────
// 並列実行（CONCURRENCY 件ずつ）
// ──────────────────────────────────────────────────────────

async function checkInBatches(items) {
  const results = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (it) => ({ ...it, ...(await checkUrl(it.url)) }))
    );
    results.push(...batchResults);
  }
  return results;
}

// ──────────────────────────────────────────────────────────
// メイン
// ──────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 HTMLファイル内の画像URL死活チェック開始');

  const files = collectHtmlFiles(ROOT);
  console.log(`  対象HTMLファイル: ${files.length}件`);

  // 全URLを集約（重複は file:line を保持して個別にチェック）
  const allUrls = [];
  for (const file of files) {
    const found = extractImageUrls(file);
    for (const { url, line } of found) {
      allUrls.push({ file: path.relative(ROOT, file), line, url });
    }
  }
  console.log(`  チェック対象URL: ${allUrls.length}件\n`);

  if (allUrls.length === 0) {
    console.log('  対象URLなし。終了。');
    return;
  }

  const results = await checkInBatches(allUrls);

  const dead = results.filter(r => !r.alive);
  const okCount = results.length - dead.length;

  console.log(`✅ 生存: ${okCount}件`);
  console.log(`❌ 死亡: ${dead.length}件`);

  if (VERBOSE) {
    console.log('\n--- 詳細 ---');
    for (const r of results) {
      const mark = r.alive ? '✅' : '❌';
      const status = r.status ?? '-';
      console.log(`${mark} [${status}] ${r.file}:${r.line}  ${r.url}`);
    }
  }

  if (dead.length === 0) {
    await notifySlack({
      channel: 'patrol',
      icon: '🖼️',
      title: '画像URL死活チェック完了',
      body: `全${results.length}件のリンク切れなし。`,
      color: 'success',
    });
    return;
  }

  // 死亡URLを Slack 通知（最大10件まで）
  const sample = dead.slice(0, 10).map(r =>
    `• \`${r.file}:${r.line}\` — ${r.url} (${r.error || `HTTP ${r.status}`})`
  ).join('\n');
  const more = dead.length > 10 ? `\n…他 ${dead.length - 10}件` : '';

  await notifySlack({
    channel: 'patrol',
    icon: '🚨',
    title: `画像URL死活チェック：${dead.length}件のリンク切れを検出`,
    body: `下記の画像URLが404等で表示できなくなっています。HTMLを修正してください。\n\n${sample}${more}`,
    color: 'error',
  });

  // 終了コードは 0（ワークフロー失敗扱いにはしない）
}

main().catch(err => {
  console.error('Fatal:', err);
  notifySlack({
    channel: 'patrol',
    icon: '⚠️',
    title: '画像URL死活チェック実行エラー',
    body: `\`\`\`${err.message}\n${err.stack}\`\`\``,
    color: 'error',
  }).finally(() => process.exit(1));
});

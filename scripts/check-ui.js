#!/usr/bin/env node
/**
 * UI Patrol — ブラウザレベルのサイト健全性チェック
 *
 * Playwright で全公開ページを巡回し、以下を検知:
 *   - 横スクロール（モバイル / PC それぞれで body.scrollWidth > innerWidth）
 *   - HTTP エラー（4xx / 5xx）
 *   - JS コンソールエラー
 *   - ネットワーク失敗（画像 404 など）
 *
 * 異常があれば Slack #patrol に通知 + 終了コード 1。
 *
 * チェック対象 URL は data/countries.json から動的に組み立てるので、
 * 新しい国を追加してもパトロールに自動で含まれる。
 *
 * 使い方:
 *   node scripts/check-ui.js              # 本番 wamily.jp をチェック
 *   UI_PATROL_BASE_URL=http://localhost:8888 node scripts/check-ui.js  # ローカル
 *   NOTIFY_SUCCESS=1 node scripts/check-ui.js  # 成功時も通知
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { notifySlack } = require('./lib/slack-notify');

const BASE_URL = (process.env.UI_PATROL_BASE_URL || 'https://wamily.jp').replace(/\/$/, '');

// チェックするビューポート
const VIEWPORTS = [
  { name: 'mobile',  width: 375,  height: 812 },
  { name: 'desktop', width: 1280, height: 800 },
];

// 横スクロール判定の許容ピクセル（subpixel rendering 対策）
const OVERFLOW_TOLERANCE = 2;

// 検知対象外にする failed request URL パターン（外部広告・分析等）
const IGNORE_REQUEST_PATTERNS = [
  /google-analytics\.com/,
  /googletagmanager\.com/,
  /facebook\.com/,
  /doubleclick\.net/,
  /\.googleadservices\.com/,
];

// 検知対象外にする console error メッセージパターン（フレームワーク等の既知エラー）
const IGNORE_CONSOLE_PATTERNS = [
  /favicon\.ico/,
  /Failed to load resource.*404/i, // 404 は failedRequests で別途検知
];

/** countries.json から公開中の国 slug を取得 */
function loadPublicCountries() {
  const p = path.join(__dirname, '..', 'data', 'countries.json');
  if (!fs.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return (data.countries || [])
      .filter(c => c.status === 'public' && c.slug)
      .map(c => c.slug);
  } catch {
    return [];
  }
}

/** チェック対象 URL を組み立て */
function buildUrls() {
  const paths = ['/', '/concept/', '/guidebook/', '/connect/', '/about/'];
  for (const slug of loadPublicCountries()) {
    paths.push(`/${slug}/`);
  }
  return paths.map(p => BASE_URL + p);
}

/** 1ページ × 1ビューポートをチェック */
async function checkPage(browser, url, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    userAgent: viewport.name === 'mobile'
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
      : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  });
  const page = await context.newPage();
  const issues = [];
  const consoleErrors = [];
  const failedRequests = [];

  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORE_CONSOLE_PATTERNS.some(p => p.test(text))) return;
    consoleErrors.push(text.slice(0, 200));
  });

  page.on('requestfailed', req => {
    const u = req.url();
    if (IGNORE_REQUEST_PATTERNS.some(p => p.test(u))) return;
    failedRequests.push({ url: u, error: req.failure()?.errorText });
  });

  page.on('response', resp => {
    if (resp.status() >= 400) {
      const u = resp.url();
      if (IGNORE_REQUEST_PATTERNS.some(p => p.test(u))) return;
      // ページ本体の HTTP エラーは下で別途扱う。アセットの 4xx/5xx をここで拾う
      if (u !== url) {
        failedRequests.push({ url: u, error: `HTTP ${resp.status()}` });
      }
    }
  });

  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // ページ本体の HTTP ステータス
    if (!response || !response.ok()) {
      issues.push({
        type: 'http_error',
        message: `HTTP ${response?.status() || 'no response'}`,
      });
    }

    // jp-wrap.js, data-loader.js 等の動的処理を待つ
    await page.waitForTimeout(2500);

    // 横スクロール検知
    const dim = await page.evaluate(() => ({
      scrollWidth: document.body.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    const overflow = dim.scrollWidth - dim.innerWidth;
    if (overflow > OVERFLOW_TOLERANCE) {
      issues.push({
        type: 'horizontal_overflow',
        message: `scrollWidth ${dim.scrollWidth} > innerWidth ${dim.innerWidth} (+${overflow}px)`,
      });
    }

    if (consoleErrors.length > 0) {
      issues.push({
        type: 'console_error',
        message: `${consoleErrors.length}件のJSエラー`,
        details: consoleErrors.slice(0, 3),
      });
    }

    if (failedRequests.length > 0) {
      issues.push({
        type: 'failed_request',
        message: `${failedRequests.length}件のネットワーク失敗`,
        details: failedRequests.slice(0, 5).map(r => `${r.url} (${r.error})`),
      });
    }
  } catch (err) {
    issues.push({
      type: 'navigation_error',
      message: err.message.slice(0, 150),
    });
  } finally {
    await context.close();
  }

  return { url, viewport: viewport.name, issues };
}

async function main() {
  console.log(`🚓 UI Patrol 開始 — ${BASE_URL}`);
  const urls = buildUrls();
  console.log(`  📋 対象: ${urls.length} URL × ${VIEWPORTS.length} viewport = ${urls.length * VIEWPORTS.length} チェック\n`);

  const browser = await chromium.launch();
  const results = [];

  try {
    for (const url of urls) {
      for (const vp of VIEWPORTS) {
        const tag = `[${vp.name.padEnd(7)}]`;
        process.stdout.write(`  ${tag} ${url.replace(BASE_URL, '') || '/'} `);
        const result = await checkPage(browser, url, vp);
        results.push(result);
        if (result.issues.length === 0) {
          console.log('✅');
        } else {
          console.log(`❌ ${result.issues.length}件`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  // 集計
  const failures = results.filter(r => r.issues.length > 0);
  const totalIssues = failures.reduce((sum, r) => sum + r.issues.length, 0);

  console.log(`\n📊 結果: ${failures.length}/${results.length} ページで異常 (計 ${totalIssues} 件)`);

  if (failures.length > 0) {
    console.log('\n=== 異常詳細 ===');
    for (const f of failures) {
      console.log(`\n❌ [${f.viewport}] ${f.url}`);
      for (const issue of f.issues) {
        console.log(`   ${issue.type}: ${issue.message}`);
        if (issue.details) {
          for (const d of issue.details) console.log(`     - ${d}`);
        }
      }
    }

    // Slack 通知（要約）
    const lines = [];
    const grouped = {};
    for (const f of failures) {
      const path = f.url.replace(BASE_URL, '') || '/';
      const key = path;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(`${f.viewport}: ${f.issues.map(i => i.type).join(', ')}`);
    }
    for (const [path, items] of Object.entries(grouped)) {
      lines.push(`• ${path}\n  ${items.join('\n  ')}`);
    }

    await notifySlack({
      channel: 'patrol',
      icon: '🚨',
      title: '[パトロール部] UI 異常検知',
      body: `${failures.length}/${results.length} ページで異常 (計 ${totalIssues} 件)\n\n${lines.join('\n')}\n\n→ Actions ログで詳細確認をお願いします`,
      color: 'danger',
      fields: [
        { label: '対象', value: BASE_URL },
        { label: '異常件数', value: `${totalIssues} 件` },
      ],
    });

    process.exit(1);
  }

  console.log('\n✨ 全 OK！');

  if (process.env.NOTIFY_SUCCESS === '1') {
    await notifySlack({
      channel: 'patrol',
      icon: '✅',
      title: '[パトロール部] UI 巡回 全件 OK',
      body: `${results.length} チェック / 異常なし`,
      color: 'success',
    });
  }
}

main().catch(err => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});

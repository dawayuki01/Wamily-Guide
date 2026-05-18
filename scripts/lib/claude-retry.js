/**
 * Claude API リトライヘルパー
 *
 * 一時的なエラー（529 Overloaded / 429 Rate Limit / 5xx）に対して
 * 指数バックオフでリトライする。
 *
 * 使い方:
 *   const { retryClaude } = require('./lib/claude-retry');
 *   const response = await retryClaude(() => anthropic.messages.create({...}));
 *
 *   // または:
 *   const response = await retryClaude(
 *     () => anthropic.messages.create({...}),
 *     { maxRetries: 5, label: 'newsletter-curation' }
 *   );
 */

/** リトライすべきエラーか判定 */
function isRetryableError(err) {
  if (!err) return false;

  // Anthropic SDK の APIError ステータスコード
  const status = err.status || err.statusCode;
  if (status === 529) return true; // Overloaded
  if (status === 429) return true; // Rate limit
  if (status >= 500 && status < 600) return true; // 5xx server errors

  // エラータイプ
  const errorType = err.error?.error?.type || err.error?.type;
  if (errorType === 'overloaded_error') return true;
  if (errorType === 'rate_limit_error') return true;
  if (errorType === 'api_error') return true;

  // ネットワーク系の一時障害
  const code = err.code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') return true;

  // x-should-retry ヘッダー（Anthropic 側のリトライ推奨）
  if (err.headers?.['x-should-retry'] === 'true') return true;

  return false;
}

/**
 * 指数バックオフ + ジッターで待機時間を計算
 * リトライ 1 回目: ~2 秒
 * リトライ 2 回目: ~4 秒
 * リトライ 3 回目: ~8 秒
 * リトライ 4 回目: ~16 秒
 * リトライ 5 回目: ~32 秒
 */
function backoffMs(attempt) {
  const base = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s, ...
  const jitter = Math.random() * 500; // 0-500ms のジッター
  return base + jitter;
}

/**
 * Claude API 呼び出しをリトライ付きで実行
 *
 * @param {Function} fn  Claude API 呼び出しを返す関数 (async)
 * @param {Object} opts
 * @param {number} opts.maxRetries  最大リトライ回数（デフォルト 5）
 * @param {string} opts.label       ログ用ラベル（デフォルト 'claude'）
 * @returns Claude API のレスポンス
 */
async function retryClaude(fn, opts = {}) {
  const maxRetries = opts.maxRetries ?? 5;
  const label = opts.label || 'claude';

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      if (!isRetryableError(err) || attempt === maxRetries) {
        throw err;
      }

      const waitMs = backoffMs(attempt);
      const errType = err.error?.error?.type || err.error?.type || err.code || err.status;
      console.warn(
        `[${label}] retry ${attempt + 1}/${maxRetries} after ${(waitMs / 1000).toFixed(1)}s ` +
        `(reason: ${errType})`
      );
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  throw lastErr;
}

module.exports = { retryClaude, isRetryableError };

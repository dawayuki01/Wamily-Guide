/**
 * RSSフェッチャー
 * Layer 1（編集媒体）+ Layer 2（Google News）を並列取得して正規化する
 */

const Parser = require('rss-parser');
const { ALL_SOURCES } = require('./rss-sources');

const parser = new Parser({
  timeout: 8000,
  headers: {
    'User-Agent': 'Wamily Newsletter Bot/1.0 (https://dawayuki01.github.io/Wamily-Guide/)',
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
  },
});

/** HTMLタグ除去して最大N文字に切り詰め */
function stripHtml(text, maxLen = 200) {
  if (!text) return '';
  return String(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/** 1つのRSSフィードを取得してRawArticle[]を返す */
async function fetchFeed(source) {
  try {
    const feed = await parser.parseURL(source.url);
    if (!feed.items || feed.items.length === 0) return [];

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return feed.items
      .filter(item => {
        if (!item.pubDate && !item.isoDate) return true;
        const t = new Date(item.pubDate || item.isoDate).getTime();
        return isNaN(t) || t > sevenDaysAgo;
      })
      .slice(0, 5)
      .map(item => {
        const title = (item.title || '').trim();
        const url = (item.link || '').trim();
        if (!title || !url) return null;
        return {
          title,
          url,
          source: source.name,
          category: source.category,
          description: stripHtml(item.contentSnippet || item.content || item.summary || ''),
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.warn(`[rss] Failed to fetch ${source.name}: ${err.message}`);
    return [];
  }
}

/**
 * 全ソースから記事を並列取得する
 * 1つのソースが失敗しても他は継続
 */
async function fetchAllArticles() {
  const results = await Promise.allSettled(
    ALL_SOURCES.map(source => fetchFeed(source))
  );

  const articles = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      articles.push(...result.value);
    }
  }

  // 重複URL除去
  const seen = new Set();
  const unique = articles.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  console.log(`[rss] Fetched ${unique.length} unique articles from ${ALL_SOURCES.length} sources`);

  // Claude へ渡す量を最大40件に制限（ソース拡張に合わせて）
  return unique.slice(0, 40);
}

module.exports = { fetchAllArticles };

/**
 * RSS情報ソース定義
 *
 * Layer 1: 信頼できる編集媒体（常時監視）
 * Layer 2: Google News RSSキーワード検索（トレンドの「種」を拾う）
 */

const GOOGLE_NEWS_BASE = 'https://news.google.com/rss/search?hl=en&gl=US&ceid=US:en&q=';

// ===== Layer 1: 信頼できる編集媒体 =====
const EDITORIAL_SOURCES = [
  { name: 'The Guardian Travel', url: 'https://www.theguardian.com/travel/rss', category: 'travel', layer: 1 },
  { name: 'BBC Travel', url: 'https://www.bbc.com/travel/feed.rss', category: 'travel', layer: 1 },
  { name: 'The Atlantic', url: 'https://www.theatlantic.com/feed/all/', category: 'culture', layer: 1 },
  { name: 'Wired', url: 'https://www.wired.com/feed/rss', category: 'culture', layer: 1 },
  { name: 'Reasons to be Cheerful', url: 'https://reasonstobecheerful.world/feed/', category: 'culture', layer: 1 },
  { name: 'NYT Travel', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Travel.xml', category: 'travel', layer: 1 },
  // --- 本番追加 ---
  { name: 'Condé Nast Traveler', url: 'https://www.cntraveler.com/feed/rss', category: 'travel', layer: 1 },
  { name: 'Monocle', url: 'https://monocle.com/feed/', category: 'urban', layer: 1 },
  { name: 'The New Yorker Culture', url: 'https://www.newyorker.com/feed/culture', category: 'culture', layer: 1 },
  { name: 'TIME', url: 'https://time.com/feed/', category: 'culture', layer: 1 },
];

// ===== Layer 2: Google News キーワード検索 =====
const KEYWORDS = [
  { keyword: 'family travel trend 2026', category: 'travel' },
  { keyword: 'slow travel family children', category: 'travel' },
  { keyword: 'educational travel children', category: 'parenting' },
  { keyword: 'childhood outdoor culture trend', category: 'parenting' },
  // --- 本番追加 ---
  { keyword: 'family friendly city design', category: 'urban' },
  { keyword: 'cultural exchange family', category: 'culture' },
  { keyword: 'expat family life', category: 'culture' },
  { keyword: 'multigenerational travel', category: 'travel' },
  { keyword: 'Europe family holiday destination trend', category: 'travel' },
  { keyword: 'best family travel destinations 2026', category: 'travel' },
];

const KEYWORD_SOURCES = KEYWORDS.map(({ keyword, category }) => ({
  name: `Google News: ${keyword}`,
  url: `${GOOGLE_NEWS_BASE}${encodeURIComponent(keyword)}`,
  category,
  layer: 2,
}));

const ALL_SOURCES = [...EDITORIAL_SOURCES, ...KEYWORD_SOURCES];

module.exports = { EDITORIAL_SOURCES, KEYWORD_SOURCES, ALL_SOURCES };

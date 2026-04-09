/* ============================================================
   Wamily ガイドブック — データローダー
   data/*.json を fetch して DOM を動的に更新する
   ============================================================ */

(function () {
  'use strict';

  // ページごとの basePath（index.html → '' / london/ → '../'）
  const BASE = window.WAMILY_BASE || '';

  // ──────────────────────────────────────────────────────────
  // ユーティリティ
  // ──────────────────────────────────────────────────────────

  async function fetchJSON(path) {
    const res = await fetch(BASE + path + '?_=' + Date.now());
    if (!res.ok) throw new Error(`fetch failed: ${path}`);
    return res.json();
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  // サワディーアイコン SVG（28px）
  function ownerSVG() {
    return `<svg width="28" height="28" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#fef8d8" stroke="#c8a820" stroke-width="1.5"/>
      <ellipse cx="16" cy="10" rx="9" ry="5" fill="#2a2418"/>
      <circle cx="16" cy="15" r="8" fill="#f5d0b8"/>
      <circle cx="12.5" cy="14" r="1.8" fill="#2a2418"/>
      <circle cx="19.5" cy="14" r="1.8" fill="#2a2418"/>
      <ellipse cx="10" cy="17" rx="3" ry="2" fill="#f8a898" opacity="0.55"/>
      <ellipse cx="22" cy="17" rx="3" ry="2" fill="#f8a898" opacity="0.55"/>
      <path d="M12 19 Q16 23 20 19" stroke="#c47858" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    </svg>`;
  }

  // ──────────────────────────────────────────────────────────
  // ライブフィード（index.html）
  // ──────────────────────────────────────────────────────────

  function renderFeedItem(item) {
    const isOwner = item.authorType === 'owner';
    const avatar = isOwner
      ? `<div class="feed-avatar owner" aria-label="${item.author}">${ownerSVG()}</div>`
      : `<div class="feed-avatar resident" aria-label="${item.author}">🏡</div>`;

    return `
      <div class="feed-item">
        ${avatar}
        <div class="feed-text">
          <p class="feed-country">${item.country}</p>
          <p class="feed-body">${item.body}</p>
          <p class="feed-date">${formatDate(item.date)}</p>
        </div>
      </div>`;
  }

  // 国スラッグ → Notion国名キーワードのマッピング
  const SLUG_TO_COUNTRY = {
    'london':    ['ロンドン'],
    'taipei':    ['台湾'],
    'paris':     ['パリ'],
    'stockholm': ['ストックホルム'],
    'singapore': ['シンガポール'],
    'bangkok':   ['バンコク'],
    'manila':    ['マニラ'],
    'la':        ['LA'],
    'hawaii':    ['ハワイ'],
    'seoul':     ['ソウル'],
  };

  async function loadLiveFeed() {
    const container = document.getElementById('feed-list');
    if (!container) return;

    try {
      const { items } = await fetchJSON('data/live-feed.json');
      if (!items || !items.length) return;

      const slug = document.body.dataset.country;
      let filtered = items;

      // 国ページではその国の投稿だけに絞る（最大5件）
      if (slug && SLUG_TO_COUNTRY[slug]) {
        const keywords = SLUG_TO_COUNTRY[slug];
        filtered = items
          .filter(item => keywords.some(kw => item.country && item.country.includes(kw)))
          .slice(0, 5);
      }

      if (!filtered.length) return;
      container.innerHTML = filtered.map(renderFeedItem).join('');
    } catch (e) {
      // 静的HTMLがフォールバックとして残るのでエラーは握りつぶす
    }
  }

  // ──────────────────────────────────────────────────────────
  // スポット（london/index.html）
  // ──────────────────────────────────────────────────────────

  function statusTag(spot) {
    if (spot.status === 'open') {
      return `<span class="tag tag-open">● ${spot.statusLabel || '営業中'}</span>`;
    } else if (spot.status === 'closed') {
      return `<span class="tag" style="background:#f0f0f0;color:#888;border-color:#ddd">● 閉業</span>`;
    }
    return `<span class="tag tag-check">● ${spot.statusLabel || '要確認'}</span>`;
  }

  function renderSpotCard(spot) {
    const extraClass = spot.extra ? ' extra hidden' : '';
    const vitalClass = spot.layer === 'vital' ? ' vital' : '';
    const residentBadge = spot.residentPick
      ? `<span class="badge badge-resident" style="margin-left:4px">在住者おすすめ</span>` : '';
    const freeTag = spot.free
      ? `<span class="tag tag-free">無料</span>`
      : `<span class="tag tag-paid">有料</span>`;

    return `
      <div class="spot-card${vitalClass}${extraClass}" data-category="${spot.category}">
        <div class="spot-head">
          <span class="spot-emoji">${spot.emoji}</span>
          <span class="spot-name">${spot.name}</span>
        </div>
        <p class="spot-desc">${spot.description}</p>
        <div class="spot-meta">
          ${statusTag(spot)}
          ${freeTag}
          ${residentBadge}
          <span class="spot-date">✓ サワディー確認済み（${spot.checkedDate}）</span>
        </div>
      </div>`;
  }

  async function loadSpots() {
    const container = document.getElementById('spot-layers');
    if (!container) return;

    try {
      const slug = document.body.dataset.country || 'london';
      const data = await fetchJSON(`data/spots-${slug}.json`);
      const spots = data.spots || [];

      const layers = {
        vital: spots.filter(s => s.layer === 'vital'),
        local: spots.filter(s => s.layer === 'local'),
        play:  spots.filter(s => s.layer === 'play'),
      };

      const PAGE_SIZE = 5;
      const layerPages = { vital: 0, local: 0, play: 0 };

      function renderLayerPage(layerKey, label, spotsArr) {
        if (!spotsArr.length) return '';
        const page = layerPages[layerKey];
        const start = page * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        const slice = spotsArr.slice(start, end);
        const total = spotsArr.length;
        const hasMore = end < total;
        const hasPrev = page > 0;

        let cards = slice.map(renderSpotCard).join('');

        let pager = '';
        if (hasMore || hasPrev) {
          pager = `<div class="spot-pager">`;
          if (hasPrev) {
            pager += `<button class="spot-pager-btn" data-layer="${layerKey}" data-dir="-1">← 前の${PAGE_SIZE}件</button>`;
          }
          pager += `<span class="spot-pager-count">${start + 1}–${Math.min(end, total)} / ${total}件</span>`;
          if (hasMore) {
            const remaining = Math.min(PAGE_SIZE, total - end);
            pager += `<button class="spot-pager-btn" data-layer="${layerKey}" data-dir="1">次の${remaining}件 →</button>`;
          }
          pager += `</div>`;
        }

        return `
        <div class="spot-layer" data-layer-key="${layerKey}">
          <p class="layer-label">${label}</p>
          <div class="spot-list">${cards}</div>
          ${pager}
        </div>`;
      }

      function renderAllLayers() {
        container.innerHTML =
          renderLayerPage('vital', '🔴 いざという時', layers.vital) +
          renderLayerPage('local', '🟢 現地の日常へ', layers.local) +
          renderLayerPage('play',  '🟢 遊びに行く・親子で食べる', layers.play);

        container.querySelectorAll('.spot-pager-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const key = btn.dataset.layer;
            layerPages[key] += parseInt(btn.dataset.dir);
            const layerEl = btn.closest('.spot-layer');
            renderAllLayers();
            // スクロール：ページ切り替え後にそのレイヤーの位置へ
            const newLayer = container.querySelector(`[data-layer-key="${key}"]`);
            if (newLayer) newLayer.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      }

      // フィルターカテゴリ用ページ切り替え
      let filterPage = 0;
      let filterCategory = null;

      function renderFilteredPage(cat) {
        const filtered = spots.filter(s => s.category === cat);
        if (!filtered.length) { container.innerHTML = ''; return; }
        const start = filterPage * PAGE_SIZE;
        const end = start + PAGE_SIZE;
        const slice = filtered.slice(start, end);
        const total = filtered.length;
        const hasMore = end < total;
        const hasPrev = filterPage > 0;

        let html = `<div class="spot-layer"><div class="spot-list">${slice.map(renderSpotCard).join('')}</div>`;
        if (hasMore || hasPrev) {
          html += `<div class="spot-pager">`;
          if (hasPrev) html += `<button class="spot-pager-btn" data-dir="-1">← 前の${PAGE_SIZE}件</button>`;
          html += `<span class="spot-pager-count">${start + 1}–${Math.min(end, total)} / ${total}件</span>`;
          if (hasMore) {
            const remaining = Math.min(PAGE_SIZE, total - end);
            html += `<button class="spot-pager-btn" data-dir="1">次の${remaining}件 →</button>`;
          }
          html += `</div>`;
        }
        html += `</div>`;
        container.innerHTML = html;

        container.querySelectorAll('.spot-pager-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            filterPage += parseInt(btn.dataset.dir);
            renderFilteredPage(cat);
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      }

      // グローバルに公開（main.jsのフィルターから呼び出す）
      window._wamilySpots = {
        renderAll: function() {
          filterCategory = null;
          filterPage = 0;
          Object.keys(layerPages).forEach(k => layerPages[k] = 0);
          renderAllLayers();
        },
        renderFiltered: function(cat) {
          filterCategory = cat;
          filterPage = 0;
          renderFilteredPage(cat);
        }
      };

      renderAllLayers();

      // 最終確認日を表示
      if (data.checkedAt) {
        const checkedEl = document.getElementById('spots-checked-at');
        if (checkedEl) {
          checkedEl.textContent = '最終確認：' + formatDate(data.checkedAt.slice(0, 10));
        }
      }

      // Google Maps スポット地図を初期化
      if (typeof window.initSpotsMap === 'function') {
        window.initSpotsMap(spots, slug);
      }
    } catch (e) {
      // 静的HTMLがフォールバック
    }
  }

  // ──────────────────────────────────────────────────────────
  // イベント（london/index.html）
  // ──────────────────────────────────────────────────────────

  function renderEventCard(item) {
    const freeTag = item.free
      ? `<span class="tag tag-free">無料</span>`
      : `<span class="tag tag-paid">有料</span>`;

    const placeHtml = item.place
      ? `<p class="event-place">📍 ${item.place}</p>` : '';

    const linkHtml = item.link
      ? `<a href="${item.link}" target="_blank" rel="noopener noreferrer" class="event-link">🔗 詳細を見る</a>` : '';

    return `
      <div class="event-card">
        <div class="event-card-top">
          <span class="event-date">${item.date}</span>
          ${freeTag}
        </div>
        <p class="event-title">${item.title}</p>
        <p class="event-desc">${item.description}</p>
        ${placeHtml}
        ${linkHtml}
      </div>`;
  }

  async function loadEvents() {
    const container = document.getElementById('event-list');
    if (!container) return;

    try {
      const slug = document.body.dataset.country || 'london';
      const data = await fetchJSON(`data/events-${slug}.json`);
      const items = data.items || [];
      if (!items.length) return;

      container.innerHTML = items.map(renderEventCard).join('');

      // 更新日時
      if (data.updatedAt) {
        const updEl = document.getElementById('events-updated-at');
        if (updEl) updEl.textContent = '最終更新：' + formatDate(data.updatedAt.slice(0, 10));
      }
    } catch (e) {
      // 静的HTMLがフォールバック
    }
  }

  // ──────────────────────────────────────────────────────────
  // キュレーション（london/index.html）
  // ──────────────────────────────────────────────────────────

  const CURATION_TYPE_ICON = {
    'YouTube':   '▶️',
    'Instagram': '📸',
    'ブログ':    '📝',
  };

  function renderCurationCard(item) {
    const icon = CURATION_TYPE_ICON[item.type] || '🔗';
    const nameLink = item.url
      ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer" class="curation-name-link">${item.name}</a>`
      : `<span class="curation-name">${item.name}</span>`;

    return `
      <div class="curation-card">
        <span class="curation-icon">${icon}</span>
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            ${nameLink}
            <span class="badge badge-owner">サワディーおすすめ</span>
          </div>
          <p class="curation-desc">${item.description}</p>
        </div>
      </div>`;
  }

  async function loadCuration() {
    const container = document.getElementById('curation-list');
    if (!container) return;

    const slug = document.body.dataset.country
      || window.location.pathname.replace(/\//g, '').replace('index.html', '') || 'london';

    try {
      const data = await fetchJSON(`data/curation-${slug}.json`);
      const items = data.items || [];
      if (!items.length) return;

      const PAGE = 5; // 1ページの表示件数
      let page = 0;

      function renderPage() {
        const start = page * PAGE;
        const end   = start + PAGE;
        const slice = items.slice(start, end);
        const total = items.length;
        const hasMore = end < total;
        const hasPrev = page > 0;

        let html = slice.map(renderCurationCard).join('');

        // ページネーション
        if (hasMore || hasPrev) {
          html += `<div class="curation-pager">`;
          if (hasPrev) {
            html += `<button class="curation-pager-btn" data-dir="-1">← 前の${PAGE}件</button>`;
          }
          html += `<span class="curation-pager-count">${start + 1}–${Math.min(end, total)} / ${total}件</span>`;
          if (hasMore) {
            html += `<button class="curation-pager-btn" data-dir="1">次の${PAGE}件 →</button>`;
          }
          html += `</div>`;
        }

        container.innerHTML = html;

        container.querySelectorAll('.curation-pager-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            page += parseInt(btn.dataset.dir);
            renderPage();
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      }

      renderPage();
    } catch (e) {
      // 静的HTMLがフォールバック
    }
  }

  // ──────────────────────────────────────────────────────────
  // 国カルーセル（他の国を見る）
  // ──────────────────────────────────────────────────────────

  // カルーセル用の画像マッピング（Unsplash）
  const COUNTRY_IMAGES = {
    london:    'photo-1513635269975-59663e0ac1ad',
    taipei:    'photo-1470004914212-05527e49370b',
    paris:     'photo-1502602898657-3e91760cbb34',
    stockholm: 'photo-1509356843151-3e7d96241e11',
    singapore: 'photo-1525625293386-3f8f99389edd',
    bangkok:   'photo-1508009603885-50cf7c579365',
    manila:    'photo-1518509562904-e7ef99cdcc86',
    la:        'photo-1534190239940-9ba8944ea261',
    hawaii:    'photo-1507876466758-bc54f384809c',
    seoul:     'photo-1534274988757-a28bf1a57c17',
  };

  // カルーセル用の表示名マッピング
  const COUNTRY_DISPLAY_NAME = {
    london:    'イギリス・ロンドン',
    taipei:    '台湾・台北',
    paris:     'フランス・パリ',
    stockholm: 'ストックホルム',
    singapore: 'シンガポール',
    bangkok:   'タイ・バンコク',
    manila:    'フィリピン・マニラ',
    la:        'アメリカ・LA',
    hawaii:    'アメリカ・ハワイ',
    seoul:     '韓国・ソウル',
  };

  // countries.json から動的読み込み（公開国のみ）
  let ALL_COUNTRIES = [];
  let COUNTRIES_DATA = [];

  // デフォルトの国リスト（フォールバック用）
  const DEFAULT_SLUGS = ['london','taipei','paris','stockholm','singapore','bangkok','manila','la','hawaii','seoul'];

  async function loadCountriesConfig() {
    try {
      const res = await fetch(`${BASE}data/countries.json?_=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        COUNTRIES_DATA = data.countries;
        const publicCountries = COUNTRIES_DATA.filter(c => c.status === 'public');
        ALL_COUNTRIES = publicCountries.map(c => ({
          slug: c.slug,
          flag: c.flag,
          name: COUNTRY_DISPLAY_NAME[c.slug] || c.nameJa,
          img: COUNTRY_IMAGES[c.slug] || '',
        }));
      }
    } catch (e) {
      console.warn('countries.json の取得に失敗。デフォルト値を使用:', e);
    }
    // フォールバック
    if (!ALL_COUNTRIES.length) {
      ALL_COUNTRIES = DEFAULT_SLUGS.map(slug => ({
        slug,
        flag: '',
        name: COUNTRY_DISPLAY_NAME[slug] || slug,
        img: COUNTRY_IMAGES[slug] || '',
      }));
    }
  }

  function loadCountryCarousel() {
    const container = document.getElementById('country-carousel');
    if (!container) return;

    const currentSlug = document.body.dataset.country;
    const others = ALL_COUNTRIES.filter(c => c.slug !== currentSlug);

    // 全カ国を表示（元の順番を維持）
    const shuffled = others;

    container.innerHTML = `
      <div class="carousel-section">
        <p class="carousel-title">📚 他の国のガイドブック</p>
        <div class="carousel-scroll">
          ${shuffled.map(c => `
            <a href="${BASE}${c.slug}/" class="carousel-card">
              <img src="https://images.unsplash.com/${c.img}?w=400&h=200&fit=crop&q=70" alt="${c.name}" loading="lazy">
              <div class="carousel-card-info">
                <span class="carousel-flag">${c.flag}</span>
                <span class="carousel-name">${c.name}</span>
              </div>
            </a>
          `).join('')}
        </div>
      </div>`;
  }

  // ──────────────────────────────────────────────────────────
  // ホストセクション（旅のバトン）
  // ──────────────────────────────────────────────────────────

  const INQUIRY_FORM_URL  = 'https://docs.google.com/forms/d/e/1FAIpQLScEBeQA3p8bZOm3Wd-H1v5QUz5A-8AjCmgMo6E9g5yZsUgs3g/viewform';
  const RECRUIT_FORM_URL  = 'https://docs.google.com/forms/d/e/1FAIpQLScyoeAMB3YqqreMo7KFWjQnlMfPF0RqDmOmhtV5DjCeGM7FqA/viewform';

  const COUNTRY_NAME_JA = {
    london:    'ロンドン',
    taipei:    '台湾・台北',
    paris:     'フランス・パリ',
    stockholm: 'ストックホルム',
    singapore: 'シンガポール',
    bangkok:   'タイ・バンコク',
    manila:    'フィリピン・マニラ',
    la:        'アメリカ・LA',
    hawaii:    'アメリカ・ハワイ',
    seoul:     '韓国・ソウル',
  };

  function hostIconSVG() {
    return `<svg class="host-card-icon-svg" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="26" cy="26" r="25" fill="#fff0f5" stroke="#f5b8d0" stroke-width="1.5"/>
      <ellipse cx="26" cy="14" rx="12" ry="8" fill="#8b5e3c"/>
      <circle cx="33" cy="8" r="5" fill="#8b5e3c"/>
      <circle cx="26" cy="23" r="11" fill="#f5d0b8"/>
      <ellipse cx="15" cy="23" rx="3.5" ry="7" fill="#8b5e3c"/>
      <ellipse cx="37" cy="23" rx="3.5" ry="7" fill="#8b5e3c"/>
      <ellipse cx="21" cy="22" rx="1.8" ry="2.2" fill="#2a2418"/>
      <ellipse cx="31" cy="22" rx="1.8" ry="2.2" fill="#2a2418"/>
      <circle cx="22" cy="21" r="0.8" fill="white"/>
      <circle cx="32" cy="21" r="0.8" fill="white"/>
      <ellipse cx="18" cy="26" rx="3.2" ry="2" fill="#f8a898" opacity="0.55"/>
      <ellipse cx="34" cy="26" rx="3.2" ry="2" fill="#f8a898" opacity="0.55"/>
      <path d="M21 29 Q26 33.5 31 29" stroke="#c47858" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M18 36 Q26 41 34 36" fill="#f5b8d0" stroke="none"/>
    </svg>`;
  }

  async function loadHostSection() {
    const container = document.getElementById('host-section');
    if (!container) return;

    const slug   = document.body.dataset.country || 'london';
    const nameJa = COUNTRY_NAME_JA[slug] || slug;

    // hosts.json を動的に取得
    let hosts = [];
    try {
      const res = await fetch(`${window.WAMILY_BASE || './'}data/hosts.json`);
      if (res.ok) hosts = await res.json();
    } catch (e) {
      console.warn('hosts.json の取得に失敗:', e);
    }

    const host = hosts.find(h => h.slug === slug);

    if (host) {
      const catchphraseHtml = host.catchphrase
        ? `<p class="host-card-catchphrase">「${host.catchphrase}」と、僕は呼んでいます。</p>`
        : '';
      const introHtml = host.intro
        ? `<blockquote class="host-card-quote">「${host.intro}」<cite>— サワディー</cite></blockquote>`
        : '';
      container.innerHTML = `
        <div class="host-card">
          <div class="host-card-inner">
            ${hostIconSVG()}
            <div class="host-card-body">
              <div class="host-card-badge">✦ Wamilyホスト</div>
              <h3 class="host-card-name">${host.nickname || nameJa}</h3>
              ${catchphraseHtml}
              ${introHtml}
              <a href="${INQUIRY_FORM_URL}" target="_blank" rel="noopener noreferrer" class="host-card-btn">
                💬 気軽に相談してみる
              </a>
              <p class="host-card-recruit-hint">この国に住んでいて、旅する家族の力になれそうという方、ぜひご応募ください。<a href="${RECRUIT_FORM_URL}" target="_blank" rel="noopener noreferrer">Wamilyホストに応募する →</a></p>
            </div>
          </div>
        </div>`;
    } else {
      container.innerHTML = `
        <div class="host-recruit-card">
          <div class="host-recruit-inner">
            <div class="host-recruit-icon">🙋</div>
            <div class="host-recruit-body">
              <div class="host-recruit-badge">ホスト募集中</div>
              <h3 class="host-recruit-title">${nameJa}で暮らす方へ</h3>
              <p class="host-recruit-desc">Wamilyホストとして、旅する家族の力になりませんか？あなたの経験と繋がりが、誰かの旅を変えます。詳しいことはお気軽に聞いてください。</p>
              <p class="host-recruit-note">国籍や背景は問いません。現地に暮らしていて、旅する家族の力になれそうと思ってくれる方なら。</p>
              <a href="${RECRUIT_FORM_URL}" target="_blank" rel="noopener noreferrer" class="host-recruit-btn">
                ✋ ホストについて聞いてみる
              </a>
            </div>
          </div>
        </div>`;
    }
  }

  // ──────────────────────────────────────────────────────────
  // 初期化
  // ──────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', async () => {
    await loadCountriesConfig();
    loadLiveFeed();
    loadSpots();
    loadEvents();
    loadCuration();
    loadHostSection().catch(e => console.warn('ホストセクション読み込みエラー:', e));
    loadCountryCarousel();
  });

})();

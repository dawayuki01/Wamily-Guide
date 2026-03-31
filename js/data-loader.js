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

  async function loadLiveFeed() {
    const container = document.getElementById('feed-list');
    if (!container) return;

    try {
      const { items } = await fetchJSON('data/live-feed.json');
      if (!items || !items.length) return;
      container.innerHTML = items.map(renderFeedItem).join('');
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
          <span class="spot-date">確認：${spot.checkedDate}</span>
        </div>
      </div>`;
  }

  async function loadSpots() {
    const container = document.getElementById('spot-layers');
    if (!container) return;

    try {
      const data = await fetchJSON('data/spots-london.json');
      const spots = data.spots || [];

      const layers = {
        vital: spots.filter(s => s.layer === 'vital'),
        local: spots.filter(s => s.layer === 'local'),
        play:  spots.filter(s => s.layer === 'play'),
      };

      const playCards  = layers.play.map(renderSpotCard).join('');
      const hasExtras  = layers.play.some(s => s.extra);

      container.innerHTML = `
        <div class="spot-layer">
          <p class="layer-label">🔴 いざという時</p>
          <div class="spot-list">${layers.vital.map(renderSpotCard).join('')}</div>
        </div>

        <div class="spot-layer">
          <p class="layer-label">🟢 現地の日常へ</p>
          <div class="spot-list">${layers.local.map(renderSpotCard).join('')}</div>
        </div>

        <div class="spot-layer">
          <p class="layer-label">🟢 遊びに行く・親子で食べる</p>
          <div class="spot-list">${playCards}</div>
          ${hasExtras ? '<button class="show-more">もっと見る ↓</button>' : ''}
        </div>`;

      // show-more を再初期化（main.js は DOMContentLoaded 後に実行済みのため手動で）
      container.querySelectorAll('.show-more').forEach(btn => {
        btn.addEventListener('click', () => {
          container.querySelectorAll('.spot-card.extra').forEach(c => c.classList.remove('hidden'));
          btn.style.display = 'none';
        });
      });

      // フィルターが既にアクティブなら再適用
      const activeFilter = document.querySelector('.filter-btn.active');
      if (activeFilter && activeFilter.dataset.category !== 'all') {
        activeFilter.click();
      }

      // 最終確認日を表示
      if (data.checkedAt) {
        const checkedEl = document.getElementById('spots-checked-at');
        if (checkedEl) {
          checkedEl.textContent = '最終確認：' + formatDate(data.checkedAt.slice(0, 10));
        }
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

    return `
      <div class="event-card">
        <div class="event-card-top">
          <span class="event-date">${item.date}</span>
          ${freeTag}
        </div>
        <p class="event-title">${item.title}</p>
        <p class="event-desc">${item.description}</p>
        ${placeHtml}
      </div>`;
  }

  async function loadEvents() {
    const container = document.getElementById('event-list');
    if (!container) return;

    try {
      const data = await fetchJSON('data/events-london.json');
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

    // ページの country スラッグを取得（data属性 or URLから推定）
    const slug = document.body.dataset.country
      || window.location.pathname.replace(/\//g, '').replace('index.html', '') || 'london';

    try {
      const data = await fetchJSON(`data/curation-${slug}.json`);
      const items = data.items || [];
      if (!items.length) return;

      container.innerHTML = items.map(renderCurationCard).join('');
    } catch (e) {
      // 静的HTMLがフォールバック
    }
  }

  // ──────────────────────────────────────────────────────────
  // 初期化
  // ──────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    loadLiveFeed();
    loadSpots();
    loadEvents();
    loadCuration();
  });

})();

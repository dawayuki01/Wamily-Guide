/* ============================================================
   Wamily ガイドブック — 共通 JavaScript
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initAccordion();
  initSpotFilter();
  initShowMore();
  initNavScroll();
});

/* ---------- Nav Scroll Blur ---------- */
function initNavScroll() {
  const noren = document.querySelector('.noren');
  if (!noren) return;
  window.addEventListener('scroll', () => {
    noren.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

/* ---------- Tab Switching ---------- */
function initTabs() {
  const btns  = document.querySelectorAll('.tab-btn');
  const panes = document.querySelectorAll('.tab-pane');
  if (!btns.length) return;

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

/* ---------- Accordion ---------- */
function initAccordion() {
  document.querySelectorAll('.accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.accordion-item');
      const body = item.querySelector('.accordion-body');
      const isOpen = item.classList.contains('open');

      if (isOpen) {
        item.classList.remove('open');
        body.style.maxHeight = '0';
      } else {
        item.classList.add('open');
        body.style.maxHeight = body.scrollHeight + 'px';
      }
    });
  });
}

/* ---------- Spot Category Filter ---------- */
function initSpotFilter() {
  const filterBtns   = document.querySelectorAll('.filter-btn');
  const spotCards    = document.querySelectorAll('.spot-card');
  const layerLabels  = document.querySelectorAll('.layer-label');
  const showMoreBtns = document.querySelectorAll('.show-more');
  if (!filterBtns.length) return;

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const category = btn.dataset.category;

      if (category === 'all') {
        // Restore default view
        layerLabels.forEach(l => l.style.display = '');
        showMoreBtns.forEach(b => b.style.display = '');
        spotCards.forEach(card => {
          if (card.classList.contains('extra')) {
            card.classList.add('hidden');
          } else {
            card.style.display = '';
          }
        });
      } else {
        // Filtered view: hide layers, show all matching
        layerLabels.forEach(l => l.style.display = 'none');
        showMoreBtns.forEach(b => b.style.display = 'none');
        spotCards.forEach(card => {
          if (card.dataset.category === category) {
            card.style.display = '';
            card.classList.remove('hidden'); // reveal extras too
          } else {
            card.style.display = 'none';
          }
        });
      }
    });
  });
}

/* ---------- Show More ---------- */
function initShowMore() {
  document.querySelectorAll('.show-more').forEach(btn => {
    btn.addEventListener('click', () => {
      const layer = btn.closest('.spot-layer');
      layer.querySelectorAll('.spot-card.extra').forEach(card => {
        card.classList.remove('hidden');
      });
      btn.style.display = 'none';
    });
  });
}

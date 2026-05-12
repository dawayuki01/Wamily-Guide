/**
 * jp-wrap.js
 *
 * 日本語テキストを「、」「。」で改行されるよう、<wbr> タグを自動挿入する。
 * CSS 側で `word-break: keep-all` を当てると、それ以外の位置では改行されなくなる。
 *
 * - 全ページ共通で読み込む
 * - 動的に読み込まれるコンテンツ（スポット・キュレーション・フィード）にも対応
 *   → 初回 + 一定間隔で MutationObserver 風にリトライ
 */
(function () {
  'use strict';

  // 対象タグ。本文・見出し系のみ。ナビ・ボタン・コードは除外
  const TARGET_SELECTOR = [
    'p',
    'h1', 'h2', 'h3', 'h4',
    'li',
    'figcaption',
    'blockquote',
    'dt', 'dd',
    '.spot-card-title', '.spot-card-desc',
    '.cur-card-text', '.curation-item-desc',
    '.feed-card-text', '.feed-text',
    '.tab-text', '.section-lead'
  ].join(',');

  // 親が以下に該当するテキスト要素はスキップ（ナビ・コードなど）
  const SKIP_ANCESTORS = ['NAV', 'CODE', 'PRE', 'BUTTON', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'SCRIPT', 'STYLE'];
  const SKIP_CLASSES = new Set([
    'gnav', 'gnav-links', 'gnav-ctas', 'gnav-pill', 'gnav-logo',
    'cp-footer', 'cn-footer', 'site-footer'
  ]);

  function hasSkippedAncestor(el) {
    let n = el;
    while (n && n !== document.body) {
      if (n.nodeType === 1) {
        if (SKIP_ANCESTORS.includes(n.tagName)) return true;
        if (n.classList) {
          for (const c of SKIP_CLASSES) {
            if (n.classList.contains(c)) return true;
          }
        }
        if (n.dataset && n.dataset.noJpWrap === '1') return true;
      }
      n = n.parentNode;
    }
    return false;
  }

  function injectWbr(el) {
    if (!el || el.dataset.jpWrapped === '1') return;
    if (hasSkippedAncestor(el)) return;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!/[、。]/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        // 親要素がスキップ対象なら除外
        if (SKIP_ANCESTORS.includes(node.parentNode?.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);

    for (const node of nodes) {
      const text = node.nodeValue;
      const parts = text.split(/([、。])/);
      if (parts.length <= 1) continue;
      const frag = document.createDocumentFragment();
      for (const part of parts) {
        if (part === '') continue;
        frag.appendChild(document.createTextNode(part));
        if (part === '、' || part === '。') {
          frag.appendChild(document.createElement('wbr'));
        }
      }
      node.parentNode.replaceChild(frag, node);
    }

    el.dataset.jpWrapped = '1';
  }

  function run() {
    document.querySelectorAll(TARGET_SELECTOR).forEach(injectWbr);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  // 動的読み込みコンテンツ（data-loader.js でレンダーされるスポット/キュレーション/フィード）に対応
  // 初回ロード後に複数回リトライ
  setTimeout(run, 1000);
  setTimeout(run, 2500);
  setTimeout(run, 5000);

  // MutationObserver でさらに保険
  if ('MutationObserver' in window) {
    const observer = new MutationObserver((mutations) => {
      let needsRun = false;
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length > 0) {
          needsRun = true;
          break;
        }
      }
      if (needsRun) {
        // デバウンス
        clearTimeout(observer._t);
        observer._t = setTimeout(run, 200);
      }
    });
    const start = () => observer.observe(document.body, { childList: true, subtree: true });
    if (document.body) start();
    else document.addEventListener('DOMContentLoaded', start);
  }
})();

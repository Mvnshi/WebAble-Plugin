// WebAble Embed — the website widget runtime.
//
// This is the drop-in companion to the WebAble browser extension. A company
// adds ONE <script> tag to their site and every visitor gets the WebAble
// accessibility panel — no extension install required. It wraps the shared
// WebAble.Engine (core/webable-engine.js) with a launcher, a glass panel,
// per-visitor localStorage memory, and a configuration surface.
//
// USER-SIDE in spirit: it adapts the page for the visitor who opens it. It
// does NOT inject fake "WCAG compliant" badges, cloak content for crawlers,
// or claim to fix the website. (See FTC v. accessiBe, 2026.)
//
// Config (data-* attributes on the <script>, or window.WebAbleConfig):
//   brand        blue | green | purple | mono            (accent palette)
//   color        #2F80FF                                  (custom accent, overrides brand)
//   theme        auto | light | dark                     (panel chrome only)
//   position     bottom-right | bottom-left | top-right | top-left
//   layout       floating | sidebar-right | sidebar-left
//   name         "WebAble"                                (white-label panel name)
//   tools        comma list of tool ids                  (allowlist; default all)
//   profiles     true | false                            (show the Profiles tab)
//   remember     true | false                            (persist + re-apply per visitor)
//   autoOpen     true | false                            (open the panel on load)
//   hideLauncher true | false                            (host opens via WebAble.open())
//   attribution  true | false                            (show "Powered by WebAble")
//   z            2147483600                               (base z-index)

(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__WEBABLE_EMBED__) return;
  window.__WEBABLE_EMBED__ = true;

  var Engine = (window.WebAble && window.WebAble.Engine) || (typeof WebAble !== 'undefined' && WebAble.Engine);
  if (!Engine) { if (window.console) console.error('[WebAble] engine not found — load webable-engine.js first.'); return; }

  var doc = document;
  var ICONS = Engine.ICONS;
  var ALL_TOOLS = Engine.ALL_TOOLS;
  var TOOL_META = Engine.TOOL_META;
  var PROFILES = Engine.PROFILES;
  var GROUP_LABELS = Engine.GROUP_LABELS;

  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // ─── Configuration ─────────────────────────────────────────────────────
  function findScript() {
    if (doc.currentScript) return doc.currentScript;
    var marked = doc.querySelector('script[data-webable]');
    if (marked) return marked;
    var bySrc = $$('script[src]').filter(function (s) { return /webable(\.embed)?(\.min)?\.js/i.test(s.src); });
    return bySrc[bySrc.length - 1] || null;
  }
  var SCRIPT = findScript();
  function attr(name, fallback) {
    var v = SCRIPT && SCRIPT.getAttribute('data-webable-' + name);
    return (v == null || v === '') ? fallback : v;
  }
  function boolAttr(name, fallback) {
    var v = SCRIPT && SCRIPT.getAttribute('data-webable-' + name);
    if (v == null || v === '') return fallback;
    return !/^(false|0|no|off)$/i.test(v);
  }
  var override = window.WebAbleConfig || {};
  function cfgVal(key, attrName, fallback, isBool) {
    if (override[key] != null) return override[key];
    return isBool ? boolAttr(attrName, fallback) : attr(attrName, fallback);
  }

  var cfg = {
    brand:        cfgVal('brand', 'brand', 'blue'),
    color:        cfgVal('color', 'color', ''),
    theme:        cfgVal('theme', 'theme', 'auto'),
    position:     cfgVal('position', 'position', 'bottom-right'),
    layout:       cfgVal('layout', 'layout', 'floating'),
    name:         cfgVal('name', 'name', 'WebAble'),
    tools:        (override.tools || attr('tools', '')),
    profiles:     cfgVal('profiles', 'profiles', true, true),
    remember:     cfgVal('remember', 'remember', true, true),
    autoOpen:     cfgVal('autoOpen', 'auto-open', false, true),
    hideLauncher: cfgVal('hideLauncher', 'hide-launcher', false, true),
    attribution:  cfgVal('attribution', 'attribution', true, true),
    z:            cfgVal('z', 'z', '')
  };

  // Tool allowlist.
  var allowList = (function () {
    var raw = cfg.tools;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string' && raw.trim()) return raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    return ALL_TOOLS.slice();
  })();
  var TOOLS = ALL_TOOLS.filter(function (id) { return allowList.indexOf(id) >= 0; });
  function toolAllowed(id) { return TOOLS.indexOf(id) >= 0; }

  // ─── Persistence (per-origin localStorage) ─────────────────────────────
  var STORE_KEY = 'webable.embed.v1';
  var store = { v: 1, enabled: true, ui: {}, tools: {} };
  function loadStore() {
    try { var raw = window.localStorage.getItem(STORE_KEY); if (raw) { var p = JSON.parse(raw); if (p && typeof p === 'object') store = Object.assign(store, p); } } catch (_) {}
  }
  var persistTimer = null;
  function persist() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (_) {}
  }
  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      if (cfg.remember) store.tools = engine.snapshotActive();
      persist();
    }, 160);
  }

  // Effective UI value: user override (stored) wins over site config default.
  function uiVal(key) { return store.ui[key] != null ? store.ui[key] : cfg[key]; }

  // ─── Toast + live region ───────────────────────────────────────────────
  var $toastHost, $live;
  function toast(msg, opts) {
    opts = opts || {};
    if (!$toastHost) return;
    var t = doc.createElement('div');
    t.className = 'webable-toast' + (opts.kind ? ' webable-toast-' + opts.kind : '');
    var prefix = opts.kind === 'error' ? '<strong>Heads up:</strong> ' : '<strong>' + escapeHtml(cfg.name) + ':</strong> ';
    t.innerHTML = '<span class="webable-toast-mark">' + ICONS.accessibility(16) + '</span><span class="webable-toast-text">' + prefix + escapeHtml(msg) + '</span>';
    $toastHost.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('webable-toast-in'); });
    setTimeout(function () { t.classList.remove('webable-toast-in'); t.classList.add('webable-toast-out'); setTimeout(function () { t.remove(); }, 320); }, opts.duration || 3600);
  }
  function announce(text) { if ($live) { $live.textContent = ''; setTimeout(function () { $live.textContent = text; }, 30); } }

  // ─── Lazy web-font loading (so dyslexia fonts actually render) ──────────
  var fontsInjected = false;
  function ensureFonts() {
    if (fontsInjected) return;
    fontsInjected = true;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Lexend:wght@300;400;500;600&display=swap';
    link.setAttribute('data-webable-fonts', '1');
    doc.head.appendChild(link);
    // OpenDyslexic (not on Google Fonts) — from a public CDN, @font-face injected.
    var st = doc.createElement('style');
    st.setAttribute('data-webable-fonts', '1');
    st.textContent = "@font-face{font-family:'OpenDyslexic';font-display:swap;src:url('https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Regular.woff') format('woff');}@font-face{font-family:'OpenDyslexic';font-weight:700;font-display:swap;src:url('https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/woff/OpenDyslexic-Bold.woff') format('woff');}";
    doc.head.appendChild(st);
  }

  // ─── Engine ────────────────────────────────────────────────────────────
  var engine = Engine.createEngine({
    document: doc, window: window,
    toast: toast, announce: announce, escapeHtml: escapeHtml,
    onChange: function () { handleEngineChange(); }
  });
  // Expose the rich global API alongside WebAble.Engine.
  window.WebAble = window.WebAble || {};
  window.WebAble.Engine = Engine;
  window.WebAble.engine = engine;
  window.WebAble.version = Engine.VERSION;

  function handleEngineChange() {
    renderPanelBody();
    schedulePersist();
  }

  // ─── State (panel/ui only — tool state lives in the engine) ─────────────
  var ui = { open: false, view: 'tools', detail: null, search: '', activeCat: 'all', collapsed: {} };
  var $launcher, $panel, $colorStyle;
  var ROOT = doc.documentElement;
  function setRootClass(c, on) { ROOT.classList.toggle(c, !!on); }

  // ─── Launcher ──────────────────────────────────────────────────────────
  function injectToastHost() {
    $toastHost = doc.createElement('div');
    $toastHost.className = 'webable-toast-host';
    doc.body.appendChild($toastHost);
  }

  function injectLauncher() {
    $launcher = doc.createElement('button');
    $launcher.className = 'webable-launcher';
    $launcher.type = 'button';
    $launcher.setAttribute('aria-label', 'Open ' + cfg.name + ' accessibility menu');
    $launcher.setAttribute('aria-haspopup', 'dialog');
    $launcher.setAttribute('aria-expanded', 'false');
    $launcher.innerHTML =
      '<span class="webable-launcher-ring" aria-hidden="true"></span>' +
      '<span class="webable-launcher-mark">' + ICONS.accessibility(20) + '</span>' +
      '<span class="webable-launcher-grip">' + ICONS.grip(10) + '</span>';
    if (cfg.hideLauncher) $launcher.style.display = 'none';
    doc.body.appendChild($launcher);
    placeLauncher();
    bindLauncherDrag();
  }

  function placeLauncher() {
    var pos = store.ui.launcherPos || {};
    var margin = 24, W = window.innerWidth, H = window.innerHeight, sz = 56, left, top;
    if (pos.left != null && pos.top != null) {
      left = Math.max(8, Math.min(W - sz - 8, pos.left));
      top = Math.max(8, Math.min(H - sz - 8, pos.top));
    } else {
      switch (cfg.position) {
        case 'bottom-left': left = margin; top = H - sz - margin; break;
        case 'top-right': left = W - sz - margin; top = margin; break;
        case 'top-left': left = margin; top = margin; break;
        default: left = W - sz - margin; top = H - sz - margin;
      }
    }
    $launcher.style.left = left + 'px';
    $launcher.style.top = top + 'px';
  }

  function bindLauncherDrag() {
    var drag = null;
    var onMove = function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.moved) {
        $launcher.classList.add('webable-launcher-dragging');
        var W = window.innerWidth, H = window.innerHeight, sz = 56;
        $launcher.style.left = Math.max(4, Math.min(W - sz - 4, drag.lx + dx)) + 'px';
        $launcher.style.top = Math.max(4, Math.min(H - sz - 4, drag.ly + dy)) + 'px';
        if (ui.open && uiVal('layout') === 'floating') placePanelNearLauncher();
      }
    };
    var onUp = function () {
      if (!drag) return;
      var moved = drag.moved, elapsed = Date.now() - drag.t;
      $launcher.classList.remove('webable-launcher-dragging');
      try { $launcher.releasePointerCapture(drag.pointerId); } catch (_) {}
      doc.removeEventListener('pointermove', onMove, true);
      doc.removeEventListener('pointerup', onUp, true);
      doc.removeEventListener('pointercancel', onUp, true);
      if (!moved && elapsed < 400) togglePanel();
      else { snapLauncherToEdge(); if (ui.open && uiVal('layout') === 'floating') placePanelNearLauncher(); }
      drag = null;
    };
    $launcher.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      drag = { startX: e.clientX, startY: e.clientY, lx: $launcher.offsetLeft, ly: $launcher.offsetTop, t: Date.now(), moved: false, pointerId: e.pointerId };
      try { $launcher.setPointerCapture(e.pointerId); } catch (_) {}
      doc.addEventListener('pointermove', onMove, true);
      doc.addEventListener('pointerup', onUp, true);
      doc.addEventListener('pointercancel', onUp, true);
    });
    window.addEventListener('resize', function () {
      placeLauncher();
      if (ui.open && uiVal('layout') === 'floating') placePanelNearLauncher();
    });
  }

  function snapLauncherToEdge() {
    var W = window.innerWidth, H = window.innerHeight, sz = 56, margin = 24;
    var cx = $launcher.offsetLeft + sz / 2, cy = $launcher.offsetTop + sz / 2;
    var distLeft = cx, distRight = W - cx, distTop = cy, distBottom = H - cy;
    var min = Math.min(distLeft, distRight, distTop, distBottom);
    if (min === distLeft) $launcher.style.left = margin + 'px';
    else if (min === distRight) $launcher.style.left = (W - sz - margin) + 'px';
    else if (min === distTop) $launcher.style.top = margin + 'px';
    else $launcher.style.top = (H - sz - margin) + 'px';
    store.ui.launcherPos = { left: $launcher.offsetLeft, top: $launcher.offsetTop };
    persist();
  }

  // ─── Panel ─────────────────────────────────────────────────────────────
  function injectPanel() {
    $panel = doc.createElement('aside');
    $panel.className = 'webable-panel';
    $panel.id = 'webable-panel';
    $panel.setAttribute('role', 'dialog');
    $panel.setAttribute('aria-label', cfg.name + ' accessibility panel');
    $panel.setAttribute('aria-modal', 'false');
    $launcher.setAttribute('aria-controls', 'webable-panel');
    var tabs = cfg.profiles
      ? '<div class="webable-panel-tabs webable-panel-tabs-2" role="tablist">' +
          '<button class="webable-ptab webable-ptab-on" data-tab="tools" role="tab">Tools</button>' +
          '<button class="webable-ptab" data-tab="profiles" role="tab">Profiles</button>' +
        '</div>'
      : '';
    var attribution = cfg.attribution
      ? '<a class="webable-powered" href="https://github.com/Mvnshi/WebAble-Plugin" target="_blank" rel="noopener">Powered by <strong>WebAble</strong></a>'
      : '';
    $panel.innerHTML =
      '<header class="webable-panel-header">' +
        '<div class="webable-brand"><span class="webable-brand-mark">' + ICONS.accessibility(16) + '</span><span class="webable-brand-name">' + escapeHtml(cfg.name) + '</span></div>' +
        '<span class="webable-site-pill mono" data-webable-site-pill></span>' +
        '<button class="webable-icon-btn" data-action="cycle-theme" title="Theme" aria-label="Switch theme">' + ICONS.sun(15) + '</button>' +
        '<button class="webable-icon-btn" data-action="cycle-layout" title="Layout: floating / sidebar" aria-label="Cycle layout">' + ICONS.layout(15) + '</button>' +
        '<button class="webable-icon-btn" data-action="close" title="Close" aria-label="Close">' + ICONS.x(15) + '</button>' +
      '</header>' +
      '<div class="webable-panel-tagline">' +
        '<span class="mono webable-tagline-eyebrow">User-side · Privacy-first</span>' +
        '<span class="webable-tagline-text">Adapts this page to <em>you</em>. Your settings stay in your browser.</span>' +
      '</div>' +
      tabs +
      '<div class="webable-aria-live" aria-live="polite" aria-atomic="true"></div>' +
      '<div class="webable-panel-search">' +
        '<span class="webable-search-icon">' + ICONS.search(14) + '</span>' +
        '<input class="webable-search-input" type="search" placeholder="Search tools — bigger text, contrast, cookies…" aria-label="Search tools" />' +
      '</div>' +
      '<div class="webable-cat-row" role="tablist" aria-label="Tool categories">' + renderCategoryPills() + '</div>' +
      '<div class="webable-panel-body" role="tabpanel" tabindex="-1"></div>' +
      '<footer class="webable-panel-footer">' +
        '<div class="webable-foot-meta">' +
          '<span class="mono" data-webable-count>' + engine.countActive() + ' active</span>' +
          '<button class="webable-link-btn" data-action="reset-all">' + ICONS.rotate(12) + '<span>Reset</span></button>' +
        '</div>' +
        attribution +
      '</footer>';
    doc.body.appendChild($panel);
    $live = $('.webable-aria-live', $panel);

    $panel.addEventListener('click', onPanelClick);
    $('.webable-search-input', $panel).addEventListener('input', function (e) { ui.search = e.target.value || ''; renderPanelBody(); });
    $$('.webable-ptab', $panel).forEach(function (tab) { tab.addEventListener('click', function () { setView(tab.dataset.tab); }); });
    $$('.webable-cat-pill', $panel).forEach(function (p) { p.addEventListener('click', function () { setCat(p.dataset.cat); }); });
  }

  function activeCategories() {
    return Engine.CATEGORIES.filter(function (c) {
      if (c.id === 'all') return true;
      return TOOLS.some(function (id) { return TOOL_META[id].cat === c.id; });
    });
  }
  function renderCategoryPills() {
    return activeCategories().map(function (c) {
      return '<button class="webable-cat-pill ' + (ui.activeCat === c.id ? 'webable-cat-pill-on' : '') + '" data-cat="' + c.id + '" role="tab" aria-selected="' + (ui.activeCat === c.id) + '">' +
        '<span class="webable-cat-icon">' + c.icon(13) + '</span><span class="webable-cat-text">' + c.label + '</span></button>';
    }).join('');
  }

  function setView(view) {
    ui.view = view;
    $$('.webable-ptab', $panel).forEach(function (t) { t.classList.toggle('webable-ptab-on', t.dataset.tab === view); });
    var onTools = view === 'tools';
    var cr = $('.webable-cat-row', $panel); if (cr) cr.style.display = onTools ? '' : 'none';
    var sr = $('.webable-panel-search', $panel); if (sr) sr.style.display = onTools ? '' : 'none';
    renderPanelBody();
    var body = $('.webable-panel-body', $panel); if (body) body.scrollTo(0, 0);
  }
  function setCat(cat) {
    ui.activeCat = cat;
    $$('.webable-cat-pill', $panel).forEach(function (p) { p.classList.toggle('webable-cat-pill-on', p.dataset.cat === cat); });
    renderPanelBody();
    var body = $('.webable-panel-body', $panel); if (body) body.scrollTo(0, 0);
  }

  function openPanel(view) {
    if (view) { ui.view = view; $$('.webable-ptab', $panel).forEach(function (t) { t.classList.toggle('webable-ptab-on', t.dataset.tab === view); }); }
    if (ui.open) { renderPanelBody(); return; }
    ui.open = true;
    $launcher.setAttribute('aria-expanded', 'true');
    placePanelNearLauncher();
    $panel.classList.add('webable-open');
    renderPanelBody();
    syncSitePill();
    doc.addEventListener('keydown', onPanelKey);
    setTimeout(function () { doc.addEventListener('mousedown', onOutsideClick); }, 50);
    var firstInput = $('.webable-search-input', $panel);
    setTimeout(function () { try { (firstInput || $panel).focus(); } catch (_) {} }, 60);
  }
  function closePanel() {
    ui.open = false;
    $panel.classList.remove('webable-open');
    $launcher.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('keydown', onPanelKey);
    doc.removeEventListener('mousedown', onOutsideClick);
    try { $launcher.focus(); } catch (_) {}
  }
  function togglePanel() { ui.open ? closePanel() : openPanel(); }
  function onPanelKey(e) { if (e.key === 'Escape') closePanel(); }
  function onOutsideClick(e) {
    if (!ui.open) return;
    if ($panel.contains(e.target) || $launcher.contains(e.target)) return;
    closePanel();
  }

  function placePanelNearLauncher() {
    if (uiVal('layout') !== 'floating') return;
    var W = window.innerWidth, H = window.innerHeight;
    var pw = Math.min(400, W - 16), ph = Math.min(640, H - 32);
    $panel.style.width = pw + 'px';
    $panel.style.maxHeight = ph + 'px';
    var lr = $launcher.getBoundingClientRect(), left, top;
    if (lr.left + lr.width / 2 > W / 2) left = Math.max(8, lr.left - pw - 12);
    else left = Math.min(W - pw - 8, lr.right + 12);
    top = lr.top + lr.height / 2 - ph / 2;
    top = Math.max(8, Math.min(H - ph - 8, top));
    $panel.style.left = left + 'px';
    $panel.style.top = top + 'px';
    $panel.style.transformOrigin = (left < lr.left ? 'right' : 'left') + ' ' + (top < lr.top ? 'top' : 'center');
  }

  function syncSitePill() {
    var pill = $('[data-webable-site-pill]', $panel);
    if (pill) pill.innerHTML = '<span class="webable-status-dot"></span>Active · ' + escapeHtml(location.hostname || 'this page');
  }

  // ─── Render ────────────────────────────────────────────────────────────
  function renderPanelBody() {
    if (!$panel) return;
    syncSitePill();
    var body = $('.webable-panel-body', $panel);
    if (!body) return;
    var safeRender = function (fn, label) {
      try { body.replaceChildren(fn()); }
      catch (e) {
        if (window.console) console.error('[WebAble] render failed in ' + label, e);
        var err = doc.createElement('div');
        err.className = 'webable-render-error';
        err.innerHTML = '<strong>' + escapeHtml(label) + ' failed to render.</strong><br><span class="mono">' + escapeHtml(e && e.message || String(e)) + '</span>';
        body.replaceChildren(err);
      }
    };
    if (ui.detail) safeRender(function () { return makeDetailNode(ui.detail); }, 'Detail view');
    else if (ui.view === 'profiles') safeRender(makeProfilesNode, 'Profiles');
    else safeRender(makeToolsNode, 'Tools');
    var count = $('[data-webable-count]', $panel); if (count) count.textContent = engine.countActive() + ' active';
  }

  function makeToolsNode() {
    var search = (ui.search || '').toLowerCase().trim();
    var cat = ui.activeCat;
    var groupOrder = ['vision', 'reading', 'motor', 'cognitive', 'privacy'];
    var wrap = doc.createElement('div');
    wrap.className = 'webable-tools-wrap';
    var groups = (cat === 'all') ? groupOrder : [cat];
    groups.forEach(function (g) {
      var ids = TOOLS.filter(function (id) { return TOOL_META[id].cat === g; });
      if (!ids.length) return;
      var filtered = ids.filter(function (id) {
        if (!search) return true;
        var m = TOOL_META[id];
        return (m.label + ' ' + m.desc + ' ' + g + ' ' + id).toLowerCase().indexOf(search) >= 0;
      });
      if (!filtered.length) return;
      var sec = doc.createElement('section');
      sec.className = 'webable-tool-group';
      var activeN = filtered.filter(function (id) { return engine.tools[id] && engine.tools[id].active; }).length;
      sec.innerHTML =
        '<button class="webable-group-head" data-action="toggle-group" data-group="' + g + '">' +
          '<span class="webable-group-mark">' + (ui.collapsed[g] ? ICONS.chevRight(14) : ICONS.chevDown(14)) + '</span>' +
          '<span class="webable-group-label">' + (GROUP_LABELS[g] || g) + '</span>' +
          '<span class="mono webable-group-count">' + activeN + '/' + filtered.length + '</span>' +
        '</button>';
      var collapsed = !!ui.collapsed[g];
      var tray = doc.createElement('div');
      tray.className = 'webable-tile-tray' + (collapsed ? ' webable-tray-collapsed' : '');
      filtered.forEach(function (id) { tray.appendChild(makeTileNode(id)); });
      var left = doc.createElement('button');
      left.className = 'webable-tray-nav webable-tray-nav-left';
      left.innerHTML = ICONS.arrowLeft(14);
      left.setAttribute('aria-label', 'Scroll left');
      left.addEventListener('click', function () { tray.scrollBy({ left: -200, behavior: 'smooth' }); });
      var right = doc.createElement('button');
      right.className = 'webable-tray-nav webable-tray-nav-right';
      right.innerHTML = ICONS.arrowRight(14);
      right.setAttribute('aria-label', 'Scroll right');
      right.addEventListener('click', function () { tray.scrollBy({ left: 200, behavior: 'smooth' }); });
      var trayWrap = doc.createElement('div');
      trayWrap.className = 'webable-tray-wrap';
      trayWrap.appendChild(left); trayWrap.appendChild(tray); trayWrap.appendChild(right);
      sec.appendChild(trayWrap);
      wrap.appendChild(sec);
    });
    if (!wrap.children.length) {
      var empty = doc.createElement('div');
      empty.className = 'webable-empty';
      empty.innerHTML = ICONS.search(20) + '<div><div class="webable-empty-title">No tools match "' + escapeHtml(search) + '".</div><div class="webable-empty-sub">Try "contrast", "motion", or "cookie".</div></div>';
      wrap.appendChild(empty);
    }
    return wrap;
  }

  function makeTileNode(id) {
    var m = TOOL_META[id], s = engine.tools[id];
    var tile = doc.createElement('div');
    tile.className = 'webable-tile' + (s.active ? ' webable-tile-on' : '');
    tile.setAttribute('role', 'button');
    tile.setAttribute('tabindex', '0');
    tile.setAttribute('aria-pressed', String(!!s.active));
    tile.dataset.tool = id;
    tile.innerHTML =
      '<div class="webable-tile-row">' +
        '<span class="webable-tile-icon">' + m.icon(20) + '</span>' +
        (m.hasSettings ? '<button class="webable-tile-cog" data-action="open-detail" data-tool="' + id + '" aria-label="Settings for ' + escapeHtml(m.label) + '">' + ICONS.sliders(11) + '</button>' : '') +
      '</div>' +
      '<div class="webable-tile-label">' + m.label + '</div>' +
      '<div class="webable-tile-foot">' +
        '<span class="webable-tile-state mono">' + (s.active ? 'ON' : 'off') + '</span>' +
        (m.special === 'tts' && s.active ? '<span class="webable-tile-live mono">' + (s.playing ? 'playing' : 'paused') + '</span>' : '') +
      '</div>';
    tile.addEventListener('click', function (e) { if (e.target.closest('[data-action]')) return; toggleTool(id); });
    tile.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTool(id); } });
    return tile;
  }

  function toggleTool(id) {
    maybeEnsureFonts(id);
    var before = engine.tools[id].active;
    var after = engine.toggle(id);   // engine re-renders + persists via onChange
    if (after !== before) toast(TOOL_META[id].label + (after ? ' on.' : ' off.'));
  }
  function maybeEnsureFonts(id) {
    if (id === 'dyslexiaFont' || id === 'readingMode') ensureFonts();
  }

  // ─── Detail / settings view ────────────────────────────────────────────
  function openDetail(id) { ui.detail = id; renderPanelBody(); }
  function closeDetail() { ui.detail = null; renderPanelBody(); }

  function makeDetailNode(id) {
    var m = TOOL_META[id], s = engine.tools[id];
    var wrap = doc.createElement('div');
    wrap.className = 'webable-detail';
    wrap.innerHTML =
      '<div class="webable-detail-head">' +
        '<button class="webable-icon-btn" data-action="close-detail" aria-label="Back">' + ICONS.arrowLeft(15) + '</button>' +
        '<span class="webable-detail-icon">' + m.icon(18) + '</span>' +
        '<div class="webable-detail-title"><div>' + m.label + '</div><div class="webable-detail-sub">' + m.desc + '</div></div>' +
        '<button class="webable-toggle ' + (s.active ? 'webable-toggle-on' : '') + '" data-action="detail-toggle" data-tool="' + id + '" aria-pressed="' + s.active + '"><span class="webable-toggle-thumb"></span></button>' +
      '</div>' +
      '<div class="webable-detail-body">' + detailControlsFor(id, s) + '</div>' +
      '<div class="webable-detail-foot"><button class="webable-link-btn" data-action="detail-reset" data-tool="' + id + '">' + ICONS.rotate(12) + '<span>Reset to defaults</span></button></div>';
    wrap.addEventListener('input', onDetailInput);
    wrap.addEventListener('change', onDetailInput);
    wrap.addEventListener('click', function (e) {
      var a = e.target.closest('[data-action]'); if (!a) return;
      var act = a.dataset.action;
      if (act === 'close-detail') closeDetail();
      else if (act === 'detail-toggle') toggleTool(a.dataset.tool);
      else if (act === 'detail-reset') { engine.resetTool(id); toast(m.label + ' reset.'); }
    });
    return wrap;
  }

  function onDetailInput(e) {
    var ctrl = e.target.closest('[data-control]'); if (!ctrl) return;
    var id = ctrl.dataset.tool, key = ctrl.dataset.control;
    maybeEnsureFonts(id);
    var v = ctrl.value;
    if (ctrl.type === 'range' || ctrl.type === 'number') v = parseFloat(v);
    if (ctrl.type === 'checkbox') v = ctrl.checked;
    var partial = {}; partial[key] = v;
    engine.set(id, partial);            // applies; no full re-render
    schedulePersist();
    var lbl = ctrl.parentElement.querySelector('[data-label-for="' + key + '"]');
    if (lbl) lbl.textContent = formatVal(key, v);
    var tile = $('.webable-tile[data-tool="' + id + '"]', $panel);
    if (tile) { tile.classList.add('webable-tile-on'); tile.setAttribute('aria-pressed', 'true'); }
  }

  function formatVal(key, v) {
    if (typeof v === 'number') {
      if (key === 'value') return v + '%';
      if (key === 'size') return v + 'px';
      if (key === 'lineHeight' || key === 'paragraph') return v.toFixed(1);
      if (key === 'maxWidth') return v + 'ch';
      if (key === 'letter' || key === 'word') return v.toFixed(2) + 'em';
      if (key === 'rate' || key === 'pitch' || key === 'speed' || key === 'scale' || key === 'dim') return v.toFixed(2);
      if (key === 'height') return v.toFixed(0) + ' lines';
      if (key === 'width') return v + 'px';
      return String(v);
    }
    return String(v);
  }
  function slider(id, key, min, max, step, val) {
    return '<div class="webable-ctl-row"><div class="webable-ctl-row-head"><span class="mono webable-ctl-key">' + key + '</span><span class="mono webable-ctl-val" data-label-for="' + key + '">' + formatVal(key, val) + '</span></div><input type="range" data-control="' + key + '" data-tool="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" aria-label="' + key + '" /></div>';
  }
  function selectCtl(id, key, val, options) {
    return '<div class="webable-ctl-row"><div class="webable-ctl-row-head"><span class="mono webable-ctl-key">' + key + '</span></div><select class="webable-select" data-control="' + key + '" data-tool="' + id + '" aria-label="' + key + '">' + options.map(function (o) { return '<option value="' + o.v + '" ' + (o.v === val ? 'selected' : '') + '>' + o.l + '</option>'; }).join('') + '</select></div>';
  }
  function checkboxCtl(id, key, val, label) {
    return '<label class="webable-ctl-check"><input type="checkbox" data-control="' + key + '" data-tool="' + id + '" ' + (val ? 'checked' : '') + ' /><span>' + label + '</span></label>';
  }
  function detailControlsFor(id, s) {
    if (id === 'readingMode') return [
      selectCtl(id, 'font', s.font, [{ v: 'system', l: 'System default' }, { v: 'inter', l: 'Inter' }, { v: 'lexend', l: 'Lexend (dyslexia-friendly)' }, { v: 'opendyslexic', l: 'OpenDyslexic' }, { v: 'atkinson', l: 'Atkinson Hyperlegible' }, { v: 'georgia', l: 'Georgia (serif)' }]),
      slider(id, 'size', 12, 32, 1, s.size), slider(id, 'lineHeight', 1.2, 2.4, 0.05, s.lineHeight), slider(id, 'maxWidth', 50, 100, 1, s.maxWidth),
      slider(id, 'letter', 0, 0.2, 0.01, s.letter), slider(id, 'paragraph', 1.0, 2.5, 0.05, s.paragraph),
      selectCtl(id, 'bg', s.bg, [{ v: 'cream', l: 'Cream' }, { v: 'white', l: 'White' }, { v: 'sepia', l: 'Sepia' }, { v: 'dark', l: 'Dark' }, { v: 'black', l: 'Black' }])
    ].join('');
    if (id === 'highContrast') return selectCtl(id, 'mode', s.mode, [{ v: 'invert', l: 'Inverted (whole page)' }, { v: 'darkSafe', l: 'Dark — readable' }, { v: 'lightSafe', l: 'Light — readable' }, { v: 'yellowBlack', l: 'Yellow on black' }, { v: 'blackYellow', l: 'Black on yellow' }]);
    if (id === 'colorFilter') return [
      selectCtl(id, 'type', s.type, [{ v: 'deuter', l: 'Deuteranopia (red-green)' }, { v: 'protan', l: 'Protanopia (red-green)' }, { v: 'tritan', l: 'Tritanopia (blue-yellow)' }, { v: 'achroma', l: 'Achromatopsia (no color)' }]),
      selectCtl(id, 'purpose', s.purpose, [{ v: 'correct', l: 'Correct — boost the affected channel' }, { v: 'simulate', l: 'Simulate — see the page as the user does' }])
    ].join('');
    if (id === 'textSize') return slider(id, 'value', 100, 300, 5, s.value);
    if (id === 'bigCursor') return slider(id, 'scale', 1, 4, 1, s.scale);
    if (id === 'readingRuler') return [slider(id, 'height', 1, 5, 1, s.height), slider(id, 'dim', 0, 1, 0.05, s.dim)].join('');
    if (id === 'focusRing') return [selectCtl(id, 'color', s.color, [{ v: 'electric', l: 'Electric blue' }, { v: 'amber', l: 'Amber' }, { v: 'green', l: 'Green' }, { v: 'white', l: 'White' }]), slider(id, 'width', 2, 6, 1, s.width)].join('');
    if (id === 'dyslexiaFont') return selectCtl(id, 'font', s.font, [{ v: 'opendyslexic', l: 'OpenDyslexic' }, { v: 'lexend', l: 'Lexend' }, { v: 'atkinson', l: 'Atkinson Hyperlegible' }]);
    if (id === 'letterSpacing') return [slider(id, 'letter', 0, 0.3, 0.01, s.letter), slider(id, 'word', 0, 0.5, 0.01, s.word)].join('');
    if (id === 'tts') return [
      slider(id, 'rate', 0.5, 2, 0.05, s.rate), slider(id, 'pitch', 0.5, 2, 0.05, s.pitch),
      '<div class="webable-ttsbar"><button class="webable-btn webable-btn-primary" data-action="tts-play">' + ICONS.play(13) + '<span>Read this page</span></button><button class="webable-btn webable-btn-ghost" data-action="tts-pause">' + ICONS.pause(13) + '<span>Pause</span></button><button class="webable-btn webable-btn-ghost" data-action="tts-stop">' + ICONS.x(13) + '<span>Stop</span></button></div>'
    ].join('');
    if (id === 'clickTarget') return slider(id, 'size', 32, 64, 2, s.size);
    if (id === 'stickyKill') return [checkboxCtl(id, 'headers', s.headers, 'Sticky headers'), checkboxCtl(id, 'footers', s.footers, 'Sticky footers'), checkboxCtl(id, 'chats', s.chats, 'Live-chat / Intercom bubbles'), checkboxCtl(id, 'popups', s.popups, 'Cookie banners and pinned popups')].join('');
    if (id === 'autoScroll') return [slider(id, 'speed', 0.25, 4, 0.25, s.speed), '<div class="webable-ttsbar"><button class="webable-btn webable-btn-primary" data-action="scroll-resume">' + ICONS.play(13) + '<span>Resume</span></button><button class="webable-btn webable-btn-ghost" data-action="scroll-pause">' + ICONS.pause(13) + '<span>Pause</span></button></div>'].join('');
    if (id === 'hideDistract') return [checkboxCtl(id, 'sidebars', s.sidebars, 'Sidebars'), checkboxCtl(id, 'recommends', s.recommends, 'Recommended / related content'), checkboxCtl(id, 'ads', s.ads, 'Ads, promos, sponsored blocks'), checkboxCtl(id, 'comments', s.comments, 'Comments / discussion threads')].join('');
    return '<div class="webable-empty-detail">No additional settings.</div>';
  }

  // ─── Profiles ──────────────────────────────────────────────────────────
  function makeProfilesNode() {
    var wrap = doc.createElement('div');
    wrap.className = 'webable-profiles';
    wrap.innerHTML =
      '<div class="webable-profiles-head"><div class="webable-profiles-title">Profiles</div><div class="webable-profiles-sub">Bundles tested by people who use them every day.</div></div>' +
      '<div class="webable-profiles-grid">' +
      Object.keys(PROFILES).map(function (k) {
        var p = PROFILES[k], on = engine.activeProfile === k;
        return '<button class="webable-profile-card ' + (on ? 'webable-profile-card-on' : '') + '" data-action="apply-profile" data-key="' + k + '">' +
          '<div class="webable-profile-row"><span class="webable-profile-mark">' + ICONS.accessibility(14) + '</span><span class="webable-profile-label">' + p.label + '</span>' + (on ? '<span class="webable-profile-check">' + ICONS.check(13) + '</span>' : '') + '</div>' +
          '<div class="webable-profile-desc">' + p.desc + '</div>' +
          '<div class="webable-profile-bundle mono">' + Object.keys(p.apply).map(function (id) { return (TOOL_META[id] && TOOL_META[id].label) || id; }).join(' · ') + '</div>' +
        '</button>';
      }).join('') +
      '</div>';
    return wrap;
  }

  // ─── Panel events ──────────────────────────────────────────────────────
  function onPanelClick(e) {
    var a = e.target.closest('[data-action]'); if (!a) return;
    var act = a.dataset.action;
    if (act === 'close') return closePanel();
    if (act === 'cycle-theme') return cycleTheme();
    if (act === 'cycle-layout') return cycleLayout();
    if (act === 'open-detail') return openDetail(a.dataset.tool);
    if (act === 'reset-all') { engine.reset(); ensureFontsReset(); toast('Everything reset on this page.'); return; }
    if (act === 'apply-profile') { ensureFonts(); engine.applyProfile(a.dataset.key); toast(PROFILES[a.dataset.key].label + ' on.'); return; }
    if (act === 'toggle-group') { ui.collapsed[a.dataset.group] = !ui.collapsed[a.dataset.group]; renderPanelBody(); return; }
    if (act === 'tts-play') return engine.tts.play();
    if (act === 'tts-pause') return engine.tts.pause();
    if (act === 'tts-stop') return engine.tts.stop();
    if (act === 'scroll-resume') { engine.set('autoScroll', { paused: false }); renderPanelBody(); return; }
    if (act === 'scroll-pause') { engine.set('autoScroll', { paused: true }); renderPanelBody(); return; }
  }
  function ensureFontsReset() { /* fonts already loaded stay cached; nothing to undo */ }

  // ─── Theme / brand / layout ────────────────────────────────────────────
  function applyTheme() {
    var t = uiVal('theme') || 'auto';
    setRootClass('webable-theme-light', t === 'light');
    setRootClass('webable-theme-dark', t === 'dark');
    if (t === 'auto') {
      var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      setRootClass('webable-theme-light', !!prefersLight);
      setRootClass('webable-theme-dark', !prefersLight);
    }
    // A custom color is authoritative; skip the named-brand palette so the
    // higher-specificity html.webable-brand-* rules can't override it.
    var c = cfg.color ? null : (cfg.brand || 'blue');
    ['blue', 'green', 'purple', 'mono'].forEach(function (b) { setRootClass('webable-brand-' + b, c === b); });
    applyCustomColor();
  }
  function applyCustomColor() {
    if (!cfg.color) return;
    var rgb = hexToRgb(cfg.color);
    if (!rgb) return;
    if (!$colorStyle) { $colorStyle = doc.createElement('style'); $colorStyle.setAttribute('data-webable-color', '1'); doc.head.appendChild($colorStyle); }
    var soft = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.16)';
    var active = 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',0.40)';
    $colorStyle.textContent = '.webable-panel,.webable-launcher,.webable-toast,.webable-pinned-tooltip{--wa-accent:' + cfg.color + ';--wa-accent-soft:' + soft + ';--wa-border-active:' + active + ';}';
  }
  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    if (!m) { var s = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(String(hex).trim()); if (!s) return null; return { r: parseInt(s[1] + s[1], 16), g: parseInt(s[2] + s[2], 16), b: parseInt(s[3] + s[3], 16) }; }
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }
  function applyLayout() {
    var l = uiVal('layout') || 'floating';
    setRootClass('webable-layout-floating', l === 'floating');
    setRootClass('webable-layout-sidebar-right', l === 'sidebar-right');
    setRootClass('webable-layout-sidebar-left', l === 'sidebar-left');
    if (l !== 'floating' && $panel) { $panel.style.left = ''; $panel.style.top = ''; $panel.style.width = ''; $panel.style.maxHeight = ''; $panel.style.transformOrigin = ''; }
    else if (ui.open && $panel) placePanelNearLauncher();
  }
  function cycleTheme() {
    var order = ['auto', 'light', 'dark'];
    var cur = uiVal('theme') || 'auto';
    var next = order[(order.indexOf(cur) + 1) % order.length];
    store.ui.theme = next; persist(); applyTheme();
    toast('Theme: ' + next);
  }
  function cycleLayout() {
    var order = ['floating', 'sidebar-right', 'sidebar-left'];
    var cur = uiVal('layout') || 'floating';
    var next = order[(order.indexOf(cur) + 1) % order.length];
    store.ui.layout = next; persist(); applyLayout();
    toast('Layout: ' + ({ 'floating': 'Floating', 'sidebar-right': 'Sidebar (right)', 'sidebar-left': 'Sidebar (left)' })[next]);
  }

  // ─── Public API for host pages / GTM ───────────────────────────────────
  function definePublicAPI() {
    var api = window.WebAble;
    api.open = function (view) { openPanel(view); };
    api.close = function () { closePanel(); };
    api.toggle = function () { togglePanel(); };
    api.showLauncher = function (on) { $launcher.style.display = (on === false) ? 'none' : ''; };
    api.apply = function (id, partial) { if (!engine.tools[id]) return; maybeEnsureFonts(id); if (partial) engine.set(id, partial); else engine.toggle(id); renderPanelBody(); };
    api.applyProfile = function (key) { ensureFonts(); engine.applyProfile(key); };
    api.reset = function () { engine.reset(); };
    api.destroy = function () { destroy(); };
    api.config = cfg;
  }
  function destroy() {
    engine.teardown();
    engine.reset();
    if ($panel) $panel.remove();
    if ($launcher) $launcher.remove();
    if ($toastHost) $toastHost.remove();
    if ($colorStyle) $colorStyle.remove();
    doc.removeEventListener('keydown', onPanelKey);
    doc.removeEventListener('mousedown', onOutsideClick);
    window.__WEBABLE_EMBED__ = false;
  }

  // ─── Boot ──────────────────────────────────────────────────────────────
  function boot() {
    if (cfg.z) {
      // The --wa-z token is scoped to the widget elements, so override it there.
      var zs = doc.createElement('style');
      zs.setAttribute('data-webable-z', '1');
      zs.textContent = '.webable-launcher,.webable-panel,.webable-toast-host,.webable-toast,.webable-pinned-tooltip{--wa-z:' + String(parseInt(cfg.z, 10) || cfg.z) + ';}';
      doc.head.appendChild(zs);
    }
    loadStore();
    injectToastHost();
    injectLauncher();
    injectPanel();
    applyTheme();
    applyLayout();
    definePublicAPI();

    // Restore the visitor's previous tools on this site.
    if (cfg.remember && store.tools && Object.keys(store.tools).length) {
      // If any restored tool needs a web font, load it up front.
      if (store.tools.dyslexiaFont || store.tools.readingMode) ensureFonts();
      engine.restore(store.tools);
    }

    if (window.matchMedia) {
      try { window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () { if ((uiVal('theme') || 'auto') === 'auto') applyTheme(); }); } catch (_) {}
    }

    // Ctrl+U toggles the panel (matches the extension shortcut).
    doc.addEventListener('keydown', function (e) {
      var ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && (e.key === 'u' || e.key === 'U') && !e.shiftKey && !e.altKey) {
        if (cfg.hideLauncher) return;
        e.preventDefault(); e.stopPropagation();
        togglePanel();
      }
    }, true);

    if (cfg.autoOpen) setTimeout(function () { openPanel(); }, 400);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

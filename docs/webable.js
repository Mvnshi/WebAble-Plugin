/*! WebAble v2.0.0 — embeddable accessibility widget. MIT License.
 * https://github.com/Mvnshi/WebAble-Plugin
 * One line, every visitor, no extension required. User-side by design:
 * adapts the page for the person who opens it; never fakes WCAG compliance. */
(function(){
  if (typeof document === 'undefined') return;
  if (document.getElementById('webable-embed-styles')) return;
  var css = "/* WebAble v1.1 — content styles.\n   USER-SIDE accessibility layer. Every selector is .webable-* or html.webable-*\n   so we don't poison the host page's CSS namespace. */\n\n/* ────────────────────────────────────────────────────────────────\n   Tokens — applied to every WebAble-owned element so they\n   survive page-level CSS resets.\n   ──────────────────────────────────────────────────────────────── */\n.webable-launcher,\n.webable-panel,\n.webable-toast-host,\n.webable-toast,\n.webable-pinned-tooltip,\n.webable-img-placeholder,\n#webable-ruler-top, #webable-ruler-bot, #webable-ruler-bar {\n  --wa-bg:        #0B1220;\n  --wa-bg-2:      #0E1525;\n  --wa-surface:   #131C2E;\n  --wa-surface-hi:#182238;\n  --wa-accent:    #2F80FF;\n  --wa-accent-soft: rgba(47,128,255,0.16);\n  --wa-success:   #1FCB8A;\n  --wa-amber:     #F2B340;\n  --wa-red:       #E5484D;\n  --wa-text:      #F4F6FA;\n  --wa-text-2:    #9AA4B8;\n  --wa-text-3:    #6B768F;\n  --wa-border:    var(--wa-tint-hi);\n  --wa-border-hi: var(--wa-tint-4);\n  --wa-border-active: rgba(47,128,255,0.40);\n  /* Theme-aware subtle tints. Dark = white-with-alpha; the light override\n     below flips these to dark-with-alpha so backgrounds stay visible. */\n  --wa-tint:      var(--wa-tint);\n  --wa-tint-hi:   var(--wa-tint-hi);\n  --wa-tint-2:    var(--wa-tint-2);\n  --wa-tint-3:    rgba(255, 255, 255, 0.10);\n  --wa-tint-4:    rgba(255, 255, 255, 0.12);\n  --wa-shade:     var(--wa-shade);\n  --wa-shadow:    0 24px 48px -12px rgba(0,0,0,0.6), 0 8px 16px -8px rgba(0,0,0,0.4);\n  --wa-radius:    16px;\n  --wa-radius-card: 12px;\n  --wa-radius-btn:  10px;\n  --wa-radius-input: 8px;\n  --wa-font:      'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;\n  --wa-mono:      ui-monospace, 'SF Mono', Menlo, monospace;\n  --wa-z:         2147483600;\n  /* Glass bg is intentionally near-opaque so highly-saturated page colors\n     (e.g. buffalo.edu's UB-blue hero nav) can't bleed through and tint the\n     panel chrome. Opacity below 0.9 starts to leak. */\n  --wa-glass-bg:  rgba(11, 18, 32, 0.94);\n}\n\n/* Brand color overrides */\nhtml.webable-brand-green   .webable-panel,\nhtml.webable-brand-green   .webable-launcher { --wa-accent: #1FCB8A; --wa-accent-soft: rgba(31,203,138,0.16); --wa-border-active: rgba(31,203,138,0.40); }\nhtml.webable-brand-purple  .webable-panel,\nhtml.webable-brand-purple  .webable-launcher { --wa-accent: #A574FF; --wa-accent-soft: rgba(165,116,255,0.16); --wa-border-active: rgba(165,116,255,0.40); }\nhtml.webable-brand-mono    .webable-panel,\nhtml.webable-brand-mono    .webable-launcher { --wa-accent: #E8ECF3; --wa-accent-soft: rgba(232,236,243,0.10); --wa-border-active: rgba(232,236,243,0.32); }\n\n/* Light theme (panel chrome only — host page untouched) */\nhtml.webable-theme-light .webable-panel,\nhtml.webable-theme-light .webable-launcher,\nhtml.webable-theme-light .webable-toast,\nhtml.webable-theme-light .webable-pinned-tooltip,\nhtml.webable-theme-light .webable-img-placeholder,\nhtml.webable-theme-light .webable-ocr-modal {\n  --wa-bg:        #FFFFFF;\n  --wa-bg-2:      #F5F7FB;\n  --wa-surface:   #F8FAFD;\n  --wa-surface-hi:#EEF2F8;\n  --wa-text:      #0B1220;\n  --wa-text-2:    #4A5876;\n  --wa-text-3:    #8A93A8;\n  --wa-border:    rgba(11,18,32,0.08);\n  --wa-border-hi: rgba(11,18,32,0.16);\n  --wa-glass-bg:  rgba(255,255,255,0.96);\n  /* Flip the tints so subtle backgrounds stay visible on white. */\n  --wa-tint:      rgba(11, 18, 32, 0.04);\n  --wa-tint-hi:   rgba(11, 18, 32, 0.06);\n  --wa-tint-2:    rgba(11, 18, 32, 0.08);\n  --wa-tint-3:    rgba(11, 18, 32, 0.10);\n  --wa-tint-4:    rgba(11, 18, 32, 0.14);\n  --wa-shade:     rgba(11, 18, 32, 0.04);\n  --wa-shadow:    0 24px 48px -12px rgba(11,18,32,0.18), 0 8px 16px -8px rgba(11,18,32,0.10);\n}\n\n.webable-launcher,\n.webable-launcher *,\n.webable-panel,\n.webable-panel *,\n.webable-toast,\n.webable-toast *,\n.webable-pinned-tooltip,\n.webable-pinned-tooltip * {\n  box-sizing: border-box;\n  font-family: var(--wa-font);\n  -webkit-font-smoothing: antialiased;\n}\n.webable-panel .mono,\n.webable-toast .mono,\n.webable-pinned-tooltip .mono {\n  font-family: var(--wa-mono);\n  font-variant-numeric: tabular-nums;\n}\n\n/* Force HTML `hidden` to win over any WebAble class that sets `display`.\n   Scoped to .webable-panel so we never affect host-page `[hidden]` semantics. */\n.webable-panel [hidden] { display: none !important; }\n\n/* ────────────────────────────────────────────────────────────────\n   Launcher — floating, draggable, snaps to edges\n   ──────────────────────────────────────────────────────────────── */\n.webable-launcher {\n  position: fixed;\n  width: 56px;\n  height: 56px;\n  border-radius: 999px;\n  background: var(--wa-bg);\n  border: 1px solid var(--wa-border-active);\n  color: var(--wa-text);\n  cursor: grab;\n  z-index: var(--wa-z);\n  box-shadow:\n    0 0 0 4px rgba(47,128,255,0.10),\n    0 12px 32px -8px rgba(0,0,0,0.6);\n  display: grid;\n  place-items: center;\n  padding: 0;\n  transition: box-shadow 200ms ease-out, border-color 80ms ease-out, transform 80ms ease-out;\n  touch-action: none;\n}\n.webable-launcher:hover { border-color: rgba(47,128,255,0.7); }\n.webable-launcher:focus-visible { outline: 2px solid rgba(47,128,255,0.5); outline-offset: 4px; }\n.webable-launcher.webable-launcher-dragging { cursor: grabbing; transition: none; }\n.webable-launcher.webable-launcher-quiet { opacity: 0.5; }\n.webable-launcher-mark {\n  position: relative;\n  z-index: 2;\n  color: var(--wa-accent);\n  display: grid;\n  place-items: center;\n}\n.webable-launcher-mark svg { width: 22px; height: 22px; stroke-width: 1.6; }\n.webable-launcher-grip {\n  position: absolute;\n  bottom: 4px;\n  right: 4px;\n  color: var(--wa-text-3);\n  opacity: 0;\n  transition: opacity 80ms ease-out;\n  pointer-events: none;\n}\n.webable-launcher:hover .webable-launcher-grip { opacity: 0.6; }\n.webable-launcher-ring {\n  position: absolute;\n  inset: -4px;\n  border-radius: 999px;\n  background: radial-gradient(circle at center, rgba(47,128,255,0.20), transparent 60%);\n  animation: webable-pulse 2.4s ease-in-out infinite;\n  pointer-events: none;\n}\n.webable-launcher:hover .webable-launcher-ring,\n.webable-launcher.webable-launcher-dragging .webable-launcher-ring { animation-play-state: paused; }\n@keyframes webable-pulse {\n  0%, 100% { transform: scale(1); opacity: 0.7; }\n  50% { transform: scale(1.18); opacity: 0.3; }\n}\n@media (prefers-reduced-motion: reduce) {\n  .webable-launcher-ring { animation: none; }\n}\n\n/* ────────────────────────────────────────────────────────────────\n   Panel — floating glass card, anchored near launcher\n   ──────────────────────────────────────────────────────────────── */\n.webable-panel {\n  position: fixed;\n  width: 400px;\n  max-width: calc(100vw - 16px);\n  max-height: 80vh;\n  background: var(--wa-glass-bg);\n  /* No saturation boost — on saturated pages (UB-blue nav, etc) the boost\n     amplifies any bleed-through and tints the panel chrome. Pure blur is\n     enough to read as glass. */\n  -webkit-backdrop-filter: blur(20px);\n  backdrop-filter: blur(20px);\n  border: 1px solid var(--wa-border);\n  border-radius: var(--wa-radius);\n  color: var(--wa-text);\n  z-index: calc(var(--wa-z) - 1);\n  display: flex;\n  flex-direction: column;\n  box-shadow: var(--wa-shadow);\n  font-size: 13px;\n  line-height: 1.45;\n  opacity: 0;\n  transform: scale(0.96) translateY(4px);\n  pointer-events: none;\n  transition: opacity 180ms cubic-bezier(0.22, 1, 0.36, 1), transform 180ms cubic-bezier(0.22, 1, 0.36, 1);\n}\n.webable-panel.webable-open {\n  opacity: 1;\n  transform: scale(1) translateY(0);\n  pointer-events: auto;\n}\n@media (prefers-reduced-motion: reduce) {\n  .webable-panel { transition: opacity 120ms linear, transform 120ms linear; }\n}\n\n/* ─── Sidebar layout modes ────────────────────────────────────────\n   Triggered by the layout-cycle button in the panel header.\n   When active, the panel becomes a full-height side rail like v1.0. */\nhtml.webable-layout-sidebar-right .webable-panel,\nhtml.webable-layout-sidebar-left  .webable-panel {\n  width: 420px !important;\n  max-width: 420px !important;\n  height: 100vh !important;\n  max-height: 100vh !important;\n  top: 0 !important;\n  bottom: 0 !important;\n  border-radius: 0 !important;\n  background: var(--wa-bg) !important;\n  -webkit-backdrop-filter: none !important;\n  backdrop-filter: none !important;\n}\nhtml.webable-layout-sidebar-right .webable-panel {\n  right: 0 !important;\n  left: auto !important;\n  border-left: 1px solid var(--wa-border) !important;\n  border-right: none !important;\n  border-top: none !important;\n  border-bottom: none !important;\n  transform: translateX(100%) !important;\n  transform-origin: right center !important;\n}\nhtml.webable-layout-sidebar-left .webable-panel {\n  left: 0 !important;\n  right: auto !important;\n  border-right: 1px solid var(--wa-border) !important;\n  border-left: none !important;\n  border-top: none !important;\n  border-bottom: none !important;\n  transform: translateX(-100%) !important;\n  transform-origin: left center !important;\n}\nhtml.webable-layout-sidebar-right .webable-panel.webable-open,\nhtml.webable-layout-sidebar-left  .webable-panel.webable-open {\n  transform: translateX(0) !important;\n}\n\n.webable-panel-header {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 12px 12px 10px;\n  border-bottom: 1px solid var(--wa-border);\n}\n.webable-brand {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex-shrink: 0;\n}\n.webable-brand-mark {\n  width: 24px;\n  height: 24px;\n  display: grid;\n  place-items: center;\n  border-radius: 7px;\n  background: var(--wa-accent-soft);\n  color: var(--wa-accent);\n  border: 1px solid var(--wa-border-active);\n}\n.webable-brand-name {\n  font-size: 14px;\n  font-weight: 500;\n  letter-spacing: -0.01em;\n}\n.webable-site-pill {\n  flex: 1;\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  padding: 4px 9px;\n  border-radius: 999px;\n  background: rgba(31,203,138,0.10);\n  border: 1px solid rgba(31,203,138,0.24);\n  font-size: 11px;\n  color: var(--wa-success);\n  letter-spacing: 0.02em;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  min-width: 0;\n}\n.webable-status-dot {\n  width: 5px; height: 5px;\n  border-radius: 999px;\n  background: var(--wa-success);\n  box-shadow: 0 0 0 3px rgba(31,203,138,0.16);\n  flex-shrink: 0;\n}\n.webable-status-dot-off {\n  background: var(--wa-text-3);\n  box-shadow: 0 0 0 3px rgba(154,164,184,0.16);\n}\n.webable-icon-btn {\n  width: 28px;\n  height: 28px;\n  display: grid;\n  place-items: center;\n  background: transparent;\n  border: 1px solid var(--wa-border);\n  border-radius: 8px;\n  color: var(--wa-text-2);\n  cursor: pointer;\n  padding: 0;\n  flex-shrink: 0;\n  transition: background 80ms ease-out, color 80ms ease-out, border-color 80ms ease-out;\n}\n.webable-icon-btn:hover {\n  border-color: var(--wa-border-hi);\n  color: var(--wa-text);\n  background: var(--wa-surface);\n}\n.webable-icon-btn:focus-visible {\n  outline: 2px solid rgba(47,128,255,0.5);\n  outline-offset: 2px;\n}\n\n.webable-panel-tagline {\n  padding: 8px 12px;\n  border-bottom: 1px solid var(--wa-border);\n  font-size: 11px;\n  color: var(--wa-text-2);\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  background: linear-gradient(180deg, rgba(47,128,255,0.04), transparent);\n}\n.webable-tagline-eyebrow {\n  font-size: 10px;\n  color: var(--wa-text-3);\n  text-transform: uppercase;\n  letter-spacing: 0.08em;\n}\n.webable-tagline-text em { color: var(--wa-accent); font-style: normal; font-weight: 500; }\n\n.webable-panel-tabs {\n  display: grid;\n  grid-template-columns: 1fr 1fr 1fr;\n  padding: 6px 8px 0;\n  gap: 0;\n  border-bottom: 1px solid var(--wa-border);\n}\n.webable-ptab {\n  background: transparent;\n  border: none;\n  color: var(--wa-text-2);\n  padding: 8px 6px 10px;\n  font-size: 12px;\n  font-weight: 500;\n  cursor: pointer;\n  font-family: inherit;\n  border-bottom: 1px solid transparent;\n  margin-bottom: -1px;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 4px;\n  transition: color 80ms, border-color 80ms;\n}\n.webable-ptab:hover { color: var(--wa-text); }\n.webable-ptab-on {\n  color: var(--wa-text);\n  border-bottom-color: var(--wa-accent);\n}\n.webable-soon-pill {\n  background: rgba(242,179,64,0.12);\n  color: var(--wa-amber);\n  border: 1px solid rgba(242,179,64,0.32);\n  font-family: var(--wa-mono);\n  font-size: 9px;\n  padding: 2px 6px;\n  border-radius: 999px;\n  text-transform: uppercase;\n  letter-spacing: 0.08em;\n}\n\n/* Search */\n.webable-panel-search {\n  padding: 8px 12px;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  border-bottom: 1px solid var(--wa-border);\n  position: relative;\n}\n.webable-search-icon {\n  position: absolute;\n  left: 22px;\n  color: var(--wa-text-3);\n  display: grid;\n  place-items: center;\n  pointer-events: none;\n}\n.webable-search-input {\n  width: 100%;\n  font-family: inherit;\n  font-size: 12px;\n  background: var(--wa-bg-2);\n  border: 1px solid var(--wa-border);\n  border-radius: var(--wa-radius-input);\n  color: var(--wa-text);\n  padding: 7px 10px 7px 30px;\n  outline: none;\n  transition: border-color 80ms ease-out, box-shadow 80ms ease-out;\n}\n.webable-search-input::placeholder { color: var(--wa-text-3); }\n.webable-search-input:focus {\n  border-color: var(--wa-border-active);\n  box-shadow: 0 0 0 3px rgba(47,128,255,0.16);\n}\n\n/* Category pills */\n.webable-cat-row {\n  display: flex;\n  gap: 6px;\n  padding: 10px 12px;\n  border-bottom: 1px solid var(--wa-border);\n  overflow-x: auto;\n  scrollbar-width: none;\n  -ms-overflow-style: none;\n}\n.webable-cat-row::-webkit-scrollbar { display: none; }\n.webable-cat-pill {\n  font-family: inherit;\n  font-size: 11px;\n  background: var(--wa-tint);\n  border: 1px solid var(--wa-border);\n  color: var(--wa-text-2);\n  padding: 6px 12px;\n  border-radius: 999px;\n  cursor: pointer;\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  white-space: nowrap;\n  line-height: 1.3;\n  transition: background 80ms, border-color 80ms, color 80ms;\n}\n.webable-cat-pill:hover { color: var(--wa-text); border-color: var(--wa-border-hi); }\n.webable-cat-pill-on {\n  background: var(--wa-accent-soft);\n  border-color: var(--wa-border-active);\n  color: var(--wa-accent);\n  font-weight: 500;\n}\n/* Lock every icon into the same visual cell so wide-geometry icons (the\n   \"sliders\" icon used for the All pill spans almost the full viewBox)\n   don't make their pill render denser than the rest. */\n.webable-cat-icon {\n  width: 16px;\n  height: 16px;\n  flex-shrink: 0;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n}\n.webable-cat-icon svg { width: 13px; height: 13px; }\n\n/* Body */\n.webable-panel-body {\n  flex: 1;\n  overflow-y: auto;\n  padding: 8px 12px 12px;\n  scrollbar-width: thin;\n  scrollbar-color: var(--wa-tint-4) transparent;\n}\n.webable-panel-body::-webkit-scrollbar { width: 6px; }\n.webable-panel-body::-webkit-scrollbar-thumb { background: var(--wa-tint-3); border-radius: 6px; }\n\n/* ────────────────────────────────────────────────────────────────\n   Tool tray — categories and horizontal-scroll tile rows\n   ──────────────────────────────────────────────────────────────── */\n.webable-tool-group { margin: 8px 0 12px; }\n.webable-group-head {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  width: 100%;\n  background: transparent;\n  border: none;\n  color: var(--wa-text);\n  padding: 6px 2px;\n  cursor: pointer;\n  font-family: inherit;\n  font-size: 12px;\n  font-weight: 500;\n}\n.webable-group-mark { color: var(--wa-text-2); display: grid; place-items: center; }\n.webable-group-label { flex: 1; text-align: left; letter-spacing: 0.02em; }\n.webable-group-count {\n  font-size: 10px;\n  color: var(--wa-text-3);\n  background: var(--wa-tint);\n  border: 1px solid var(--wa-border);\n  padding: 1px 6px;\n  border-radius: 999px;\n}\n\n.webable-tray-wrap {\n  position: relative;\n}\n.webable-tile-tray {\n  display: flex;\n  gap: 8px;\n  padding: 4px 4px 8px;\n  overflow-x: auto;\n  overflow-y: hidden;\n  scroll-snap-type: x mandatory;\n  scrollbar-width: none;\n  -ms-overflow-style: none;\n}\n.webable-tile-tray::-webkit-scrollbar { display: none; }\n.webable-tray-collapsed { display: none; }\n.webable-tray-nav {\n  position: absolute;\n  top: 50%;\n  transform: translateY(-50%);\n  width: 24px;\n  height: 24px;\n  background: var(--wa-bg);\n  border: 1px solid var(--wa-border);\n  border-radius: 999px;\n  color: var(--wa-text-2);\n  cursor: pointer;\n  display: grid;\n  place-items: center;\n  padding: 0;\n  z-index: 2;\n  opacity: 0;\n  transition: opacity 80ms ease-out, color 80ms;\n  box-shadow: 0 2px 8px -2px rgba(0,0,0,0.4);\n}\n.webable-tray-wrap:hover .webable-tray-nav { opacity: 1; }\n.webable-tray-nav:hover { color: var(--wa-text); }\n.webable-tray-nav-left  { left: -6px; }\n.webable-tray-nav-right { right: -6px; }\n\n/* Tiles — 96x96 with reasonable padding */\n.webable-tile {\n  flex: 0 0 96px;\n  min-height: 96px;\n  background: var(--wa-surface);\n  border: 1px solid var(--wa-border);\n  border-radius: var(--wa-radius-card);\n  padding: 8px;\n  cursor: pointer;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  scroll-snap-align: start;\n  transition: background 80ms, border-color 80ms, box-shadow 200ms;\n  position: relative;\n  user-select: none;\n}\n.webable-tile:hover { border-color: var(--wa-border-hi); background: var(--wa-surface-hi); }\n.webable-tile:focus-visible { outline: 2px solid rgba(47,128,255,0.5); outline-offset: 2px; }\n.webable-tile-on {\n  border-color: var(--wa-border-active);\n  background: linear-gradient(180deg, var(--wa-accent-soft), var(--wa-surface));\n  box-shadow:\n    inset 0 0 0 1px rgba(47,128,255,0.20),\n    0 0 0 4px rgba(47,128,255,0.06);\n}\n.webable-tile-row {\n  display: flex;\n  justify-content: space-between;\n  align-items: flex-start;\n}\n.webable-tile-icon {\n  width: 28px;\n  height: 28px;\n  display: grid;\n  place-items: center;\n  border-radius: 7px;\n  background: var(--wa-tint);\n  border: 1px solid var(--wa-border);\n  color: var(--wa-text-2);\n}\n.webable-tile-on .webable-tile-icon {\n  background: var(--wa-accent-soft);\n  border-color: var(--wa-border-active);\n  color: var(--wa-accent);\n}\n.webable-tile-cog {\n  width: 18px;\n  height: 18px;\n  display: grid;\n  place-items: center;\n  background: transparent;\n  border: 1px solid transparent;\n  border-radius: 5px;\n  color: var(--wa-text-3);\n  cursor: pointer;\n  padding: 0;\n  font-family: inherit;\n  transition: color 80ms, border-color 80ms;\n}\n.webable-tile-cog:hover { color: var(--wa-text); border-color: var(--wa-border-hi); }\n.webable-tile-label {\n  flex: 1;\n  font-size: 11px;\n  color: var(--wa-text);\n  font-weight: 500;\n  line-height: 1.3;\n  letter-spacing: -0.005em;\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n}\n.webable-tile-foot {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  font-size: 9px;\n  color: var(--wa-text-3);\n  text-transform: uppercase;\n  letter-spacing: 0.08em;\n}\n.webable-tile-on .webable-tile-state { color: var(--wa-accent); }\n.webable-tile-live {\n  background: rgba(47,128,255,0.16);\n  color: var(--wa-accent);\n  padding: 1px 5px;\n  border-radius: 3px;\n  font-weight: 500;\n}\n\n/* Empty state */\n.webable-empty {\n  display: flex;\n  align-items: flex-start;\n  gap: 10px;\n  padding: 16px;\n  background: var(--wa-surface);\n  border: 1px solid var(--wa-border);\n  border-radius: var(--wa-radius-card);\n  color: var(--wa-text-2);\n}\n.webable-empty-title { color: var(--wa-text); font-weight: 500; font-size: 13px; }\n.webable-empty-sub { font-size: 12px; margin-top: 2px; }\n\n/* Site disabled banner */\n.webable-site-off {\n  display: flex;\n  gap: 10px;\n  align-items: flex-start;\n  padding: 12px;\n  background: rgba(229,72,77,0.06);\n  border: 1px solid rgba(229,72,77,0.24);\n  border-radius: var(--wa-radius-card);\n  color: var(--wa-text);\n  font-size: 12px;\n  margin: 8px 0;\n}\n.webable-site-off-sub { color: var(--wa-text-2); margin-top: 2px; font-size: 11px; }\n\n/* ────────────────────────────────────────────────────────────────\n   Detail / settings sub-view\n   ──────────────────────────────────────────────────────────────── */\n.webable-detail {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  padding: 4px 4px 8px;\n}\n.webable-detail-head {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 4px 12px;\n  border-bottom: 1px solid var(--wa-border);\n}\n.webable-detail-icon {\n  width: 30px;\n  height: 30px;\n  display: grid;\n  place-items: center;\n  background: var(--wa-accent-soft);\n  color: var(--wa-accent);\n  border: 1px solid var(--wa-border-active);\n  border-radius: 8px;\n}\n.webable-detail-title { flex: 1; min-width: 0; }\n.webable-detail-title > div:first-child {\n  font-size: 14px;\n  font-weight: 500;\n  letter-spacing: -0.01em;\n}\n.webable-detail-sub { font-size: 11px; color: var(--wa-text-2); margin-top: 1px; }\n.webable-detail-body {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  padding: 4px 0;\n}\n.webable-detail-foot {\n  display: flex;\n  justify-content: flex-end;\n  padding-top: 8px;\n  border-top: 1px solid var(--wa-border);\n}\n.webable-empty-detail { font-size: 12px; color: var(--wa-text-3); padding: 8px; }\n\n/* Controls */\n.webable-ctl-row {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  background: var(--wa-bg-2);\n  border: 1px solid var(--wa-border);\n  border-radius: 8px;\n  padding: 10px 12px;\n}\n.webable-ctl-row-head {\n  display: flex;\n  justify-content: space-between;\n  align-items: baseline;\n}\n.webable-ctl-key {\n  font-size: 10px;\n  color: var(--wa-text-3);\n  text-transform: uppercase;\n  letter-spacing: 0.08em;\n}\n.webable-ctl-val { font-size: 11px; color: var(--wa-text); }\n.webable-ctl-row input[type=range] {\n  -webkit-appearance: none;\n  appearance: none;\n  width: 100%;\n  background: transparent;\n  height: 18px;\n  cursor: pointer;\n}\n.webable-ctl-row input[type=range]::-webkit-slider-runnable-track {\n  height: 4px;\n  border-radius: 999px;\n  background: var(--wa-tint-2);\n}\n.webable-ctl-row input[type=range]::-webkit-slider-thumb {\n  -webkit-appearance: none;\n  width: 14px; height: 14px;\n  border-radius: 999px;\n  background: var(--wa-text);\n  border: 2px solid var(--wa-accent);\n  margin-top: -5px;\n  box-shadow: 0 0 0 4px rgba(47,128,255,0.18);\n}\n.webable-ctl-row input[type=range]::-moz-range-track {\n  height: 4px; border-radius: 999px; background: var(--wa-tint-2);\n}\n.webable-ctl-row input[type=range]::-moz-range-thumb {\n  width: 14px; height: 14px;\n  border-radius: 999px;\n  background: var(--wa-text);\n  border: 2px solid var(--wa-accent);\n}\n.webable-select {\n  font-family: inherit;\n  font-size: 12px;\n  background: var(--wa-surface);\n  border: 1px solid var(--wa-border);\n  border-radius: 6px;\n  color: var(--wa-text);\n  padding: 6px 10px;\n  width: 100%;\n  cursor: pointer;\n}\n.webable-select:focus {\n  outline: 2px solid rgba(47,128,255,0.5);\n  outline-offset: 2px;\n}\n.webable-ctl-check {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 12px;\n  color: var(--wa-text);\n  background: var(--wa-bg-2);\n  border: 1px solid var(--wa-border);\n  border-radius: 8px;\n  padding: 8px 12px;\n  cursor: pointer;\n}\n.webable-ctl-check input[type=checkbox] { accent-color: var(--wa-accent); }\n\n/* ────────────────────────────────────────────────────────────────\n   Buttons / toggles / pills\n   ──────────────────────────────────────────────────────────────── */\n.webable-btn {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  font-family: inherit;\n  font-size: 12px;\n  font-weight: 500;\n  border-radius: var(--wa-radius-btn);\n  border: 1px solid var(--wa-border);\n  background: var(--wa-surface);\n  color: var(--wa-text);\n  padding: 7px 12px;\n  cursor: pointer;\n  transition: background 80ms, border-color 80ms;\n  line-height: 1;\n}\n.webable-btn:hover { border-color: var(--wa-border-hi); background: var(--wa-surface-hi); }\n.webable-btn:focus-visible { outline: 2px solid rgba(47,128,255,0.5); outline-offset: 2px; }\n.webable-btn-primary { background: var(--wa-accent); border-color: var(--wa-accent); color: #fff; }\n.webable-btn-primary:hover { filter: brightness(1.1); }\n.webable-btn-ghost { background: transparent; color: var(--wa-text-2); }\n.webable-btn-ghost:hover { color: var(--wa-text); }\n\n.webable-link-btn {\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n  background: transparent;\n  border: 1px solid var(--wa-border);\n  color: var(--wa-text-2);\n  font-family: inherit;\n  font-size: 11px;\n  padding: 4px 8px;\n  border-radius: 6px;\n  cursor: pointer;\n  transition: border-color 80ms, color 80ms;\n}\n.webable-link-btn:hover { color: var(--wa-text); border-color: var(--wa-border-hi); }\n\n.webable-toggle {\n  width: 32px;\n  height: 18px;\n  border-radius: 999px;\n  background: var(--wa-tint-hi);\n  border: 1px solid var(--wa-border);\n  position: relative;\n  cursor: pointer;\n  flex-shrink: 0;\n  padding: 0;\n  transition: background 80ms, border-color 80ms;\n}\n.webable-toggle-thumb {\n  position: absolute;\n  top: 1px; left: 1px;\n  width: 14px; height: 14px;\n  border-radius: 999px;\n  background: var(--wa-text-2);\n  transition: transform 120ms cubic-bezier(0.22, 1, 0.36, 1), background 120ms;\n}\n.webable-toggle-on {\n  background: rgba(47,128,255,0.16);\n  border-color: var(--wa-border-active);\n  box-shadow: inset 0 0 8px rgba(47,128,255,0.32);\n}\n.webable-toggle-on .webable-toggle-thumb {\n  background: var(--wa-accent);\n  transform: translateX(14px);\n  box-shadow: 0 0 6px rgba(47,128,255,0.5);\n}\n\n.webable-pill {\n  font-size: 9px;\n  font-family: var(--wa-mono);\n  padding: 2px 6px;\n  border-radius: 999px;\n  background: var(--wa-tint);\n  border: 1px solid var(--wa-border);\n  color: var(--wa-text-2);\n  text-transform: uppercase;\n  letter-spacing: 0.08em;\n  font-weight: 500;\n}\n.webable-pill-ai {\n  background: var(--wa-accent-soft);\n  color: var(--wa-accent);\n  border-color: var(--wa-border-active);\n}\n\n/* tts/scroll button bar */\n.webable-ttsbar { display: flex; gap: 6px; flex-wrap: wrap; padding-top: 4px; }\n\n/* ────────────────────────────────────────────────────────────────\n   Profiles\n   ──────────────────────────────────────────────────────────────── */\n.webable-profiles { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; }\n.webable-profiles-title { font-size: 14px; font-weight: 500; letter-spacing: -0.01em; }\n.webable-profiles-sub { font-size: 11px; color: var(--wa-text-2); margin-top: 1px; }\n.webable-profiles-grid { display: flex; flex-direction: column; gap: 8px; }\n.webable-profile-card {\n  background: var(--wa-surface);\n  border: 1px solid var(--wa-border);\n  border-radius: var(--wa-radius-card);\n  padding: 12px;\n  text-align: left;\n  cursor: pointer;\n  font-family: inherit;\n  color: var(--wa-text);\n  transition: border-color 80ms;\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n.webable-profile-card:hover { border-color: var(--wa-border-hi); }\n.webable-profile-card-on {\n  border-color: var(--wa-border-active);\n  background: linear-gradient(180deg, var(--wa-accent-soft), var(--wa-surface));\n}\n.webable-profile-row { display: flex; align-items: center; gap: 8px; }\n.webable-profile-mark {\n  width: 24px; height: 24px;\n  display: grid; place-items: center;\n  background: var(--wa-tint);\n  border: 1px solid var(--wa-border);\n  border-radius: 6px;\n  color: var(--wa-text-2);\n}\n.webable-profile-card-on .webable-profile-mark {\n  background: var(--wa-accent-soft);\n  border-color: var(--wa-border-active);\n  color: var(--wa-accent);\n}\n.webable-profile-label { flex: 1; font-size: 13px; font-weight: 500; }\n.webable-profile-check { color: var(--wa-accent); display: grid; place-items: center; }\n.webable-profile-desc { font-size: 11px; color: var(--wa-text-2); line-height: 1.45; }\n.webable-profile-bundle {\n  font-size: 10px;\n  color: var(--wa-text-3);\n  padding-top: 6px;\n  border-top: 1px dashed var(--wa-border);\n}\n\n/* ────────────────────────────────────────────────────────────────\n   Coming Soon\n   ──────────────────────────────────────────────────────────────── */\n.webable-coming { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; }\n.webable-coming-title { font-size: 14px; font-weight: 500; letter-spacing: -0.01em; }\n.webable-coming-sub { font-size: 11px; color: var(--wa-text-2); margin-top: 1px; }\n.webable-coming-sub em { color: var(--wa-text); font-style: normal; font-weight: 500; }\n.webable-coming-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }\n.webable-coming-card {\n  background: var(--wa-surface);\n  border: 1px solid var(--wa-border);\n  border-radius: var(--wa-radius-card);\n  padding: 10px;\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n.webable-coming-row { display: flex; align-items: center; gap: 6px; }\n.webable-coming-mark {\n  width: 22px; height: 22px;\n  display: grid; place-items: center;\n  background: var(--wa-accent-soft);\n  color: var(--wa-accent);\n  border: 1px solid var(--wa-border-active);\n  border-radius: 6px;\n}\n.webable-coming-label { flex: 1; font-size: 12px; font-weight: 500; }\n.webable-coming-desc { font-size: 11px; color: var(--wa-text-2); line-height: 1.45; }\n.webable-coming-foot {\n  font-size: 11px;\n  color: var(--wa-text-2);\n  padding-top: 6px;\n  border-top: 1px solid var(--wa-border);\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  flex-wrap: wrap;\n}\n\n/* ────────────────────────────────────────────────────────────────\n   Footer\n   ──────────────────────────────────────────────────────────────── */\n.webable-panel-footer {\n  border-top: 1px solid var(--wa-border);\n  padding: 10px 12px;\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  background: var(--wa-shade);\n}\n.webable-site-row {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n.webable-toggle-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  padding: 5px 0;\n  cursor: pointer;\n}\n.webable-toggle-label { font-size: 11px; color: var(--wa-text); }\n.webable-toggle-label-warn { color: var(--wa-text-2); }\n.webable-toggle-label strong { font-weight: 500; color: var(--wa-text-2); }\n.webable-foot-meta {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  font-size: 10px;\n  color: var(--wa-text-3);\n  border-top: 1px dashed var(--wa-border);\n  padding-top: 8px;\n}\n\n/* ────────────────────────────────────────────────────────────────\n   Toast\n   ──────────────────────────────────────────────────────────────── */\n.webable-toast-host {\n  position: fixed;\n  top: 24px;\n  left: 50%;\n  transform: translateX(-50%);\n  z-index: var(--wa-z);\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n  pointer-events: none;\n}\n.webable-toast {\n  display: inline-flex;\n  align-items: center;\n  gap: 10px;\n  padding: 9px 14px 9px 12px;\n  background: var(--wa-bg);\n  border: 1px solid var(--wa-border);\n  border-left: 2px solid var(--wa-accent);\n  border-radius: 10px;\n  color: var(--wa-text);\n  font-size: 12px;\n  font-family: var(--wa-font);\n  box-shadow: 0 12px 32px -8px rgba(0,0,0,0.6);\n  pointer-events: auto;\n  opacity: 0;\n  transform: translateY(-8px);\n  transition: opacity 200ms, transform 200ms;\n  max-width: 480px;\n}\n.webable-toast.webable-toast-error { border-left-color: var(--wa-amber); }\n.webable-toast strong { font-weight: 500; color: var(--wa-accent); margin-right: 4px; }\n.webable-toast-error strong { color: var(--wa-amber); }\n.webable-toast.webable-toast-in { opacity: 1; transform: translateY(0); }\n.webable-toast.webable-toast-out { opacity: 0; transform: translateY(-8px); }\n.webable-toast-mark {\n  width: 18px; height: 18px;\n  display: grid; place-items: center;\n  background: var(--wa-accent-soft);\n  color: var(--wa-accent);\n  border-radius: 5px;\n  border: 1px solid var(--wa-border-active);\n}\n\n/* ────────────────────────────────────────────────────────────────\n   Pinned tooltip\n   ──────────────────────────────────────────────────────────────── */\n.webable-pinned-tooltip {\n  position: absolute;\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  max-width: 240px;\n  padding: 8px 10px;\n  background: var(--wa-bg);\n  border: 1px solid var(--wa-border-active);\n  border-radius: 8px;\n  color: var(--wa-text);\n  font-size: 12px;\n  z-index: var(--wa-z);\n  box-shadow: 0 8px 20px -8px rgba(0,0,0,0.6);\n}\n.webable-pinned-close {\n  width: 18px; height: 18px;\n  display: grid; place-items: center;\n  background: transparent;\n  border: 1px solid var(--wa-border);\n  border-radius: 999px;\n  color: var(--wa-text-2);\n  cursor: pointer;\n  padding: 0;\n}\n.webable-pinned-close:hover { color: var(--wa-text); }\n\n/* ────────────────────────────────────────────────────────────────\n   Image-hidden placeholder\n   ──────────────────────────────────────────────────────────────── */\n.webable-img-placeholder {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  background: var(--wa-bg-2);\n  border: 1px dashed var(--wa-border-hi);\n  border-radius: 8px;\n  color: var(--wa-text-2);\n  cursor: pointer;\n  font-family: var(--wa-font);\n  font-size: 12px;\n  padding: 10px;\n}\n.webable-img-placeholder:hover { border-color: var(--wa-border-active); color: var(--wa-text); }\n\n/* ════════════════════════════════════════════════════════════════\n   PAGE-LEVEL MODIFICATIONS — :root classes\n   ════════════════════════════════════════════════════════════════ */\n\n/* Bigger text — text-only, layout preserved */\nhtml.webable-ts body p,\nhtml.webable-ts body li,\nhtml.webable-ts body h1,\nhtml.webable-ts body h2,\nhtml.webable-ts body h3,\nhtml.webable-ts body h4,\nhtml.webable-ts body h5,\nhtml.webable-ts body h6,\nhtml.webable-ts body span:not(.webable-panel *):not(.webable-launcher *):not(.webable-toast *),\nhtml.webable-ts body a:not(.webable-panel a),\nhtml.webable-ts body button:not(.webable-panel button) {\n  font-size: calc(1em * var(--webable-ts, 1)) !important;\n}\nhtml.webable-ts .webable-panel,\nhtml.webable-ts .webable-panel *,\nhtml.webable-ts .webable-launcher,\nhtml.webable-ts .webable-launcher *,\nhtml.webable-ts .webable-toast,\nhtml.webable-ts .webable-toast * { font-size: revert !important; }\n\n/* ─── HIGH CONTRAST — fixed implementation ────────────────────── */\n/* Inverted: page filtered, images re-inverted */\nhtml.webable-hc-invert body { filter: invert(1) hue-rotate(180deg); }\nhtml.webable-hc-invert img,\nhtml.webable-hc-invert video,\nhtml.webable-hc-invert picture,\nhtml.webable-hc-invert canvas,\nhtml.webable-hc-invert iframe,\nhtml.webable-hc-invert [style*=\"background-image\"] { filter: invert(1) hue-rotate(180deg); }\nhtml.webable-hc-invert .webable-panel,\nhtml.webable-hc-invert .webable-launcher,\nhtml.webable-hc-invert .webable-toast,\nhtml.webable-hc-invert .webable-toast-host,\nhtml.webable-hc-invert .webable-pinned-tooltip { filter: invert(1) hue-rotate(180deg); }\n\n/* Dark — readable. Bg painted on body only; descendants are transparent so\n   text reads against the body. Buttons/inputs get explicit re-styling.\n   This is the fix for \"the whole page goes black blob.\" */\nhtml.webable-hc-darkSafe { background: #0a0a0a !important; }\nhtml.webable-hc-darkSafe body {\n  background: #0a0a0a !important;\n  color: #f5f5f5 !important;\n}\nhtml.webable-hc-darkSafe body :not(.webable-panel):not(.webable-launcher):not(.webable-toast):not(.webable-toast *):not(.webable-panel *):not(.webable-launcher *):not(svg):not(svg *):not(img):not(picture):not(video):not(canvas):not(iframe) {\n  background: transparent !important;\n  background-image: none !important;\n  color: #f5f5f5 !important;\n  border-color: rgba(255,255,255,0.30) !important;\n}\nhtml.webable-hc-darkSafe a:not(.webable-panel a) { color: #66BFFF !important; text-decoration: underline !important; }\nhtml.webable-hc-darkSafe button:not(.webable-panel button):not(.webable-launcher):not(.webable-toast button),\nhtml.webable-hc-darkSafe input:not(.webable-panel input),\nhtml.webable-hc-darkSafe select:not(.webable-panel select),\nhtml.webable-hc-darkSafe textarea:not(.webable-panel textarea) {\n  background: #1a1a1a !important;\n  color: #f5f5f5 !important;\n  border: 2px solid #f5f5f5 !important;\n}\n\n/* Light — readable. Same approach inverted. */\nhtml.webable-hc-lightSafe { background: #ffffff !important; }\nhtml.webable-hc-lightSafe body {\n  background: #ffffff !important;\n  color: #000000 !important;\n}\nhtml.webable-hc-lightSafe body :not(.webable-panel):not(.webable-launcher):not(.webable-toast):not(.webable-toast *):not(.webable-panel *):not(.webable-launcher *):not(svg):not(svg *):not(img):not(picture):not(video):not(canvas):not(iframe) {\n  background: transparent !important;\n  background-image: none !important;\n  color: #000000 !important;\n  border-color: #000000 !important;\n}\nhtml.webable-hc-lightSafe a:not(.webable-panel a) { color: #0033cc !important; text-decoration: underline !important; }\nhtml.webable-hc-lightSafe button:not(.webable-panel button):not(.webable-launcher):not(.webable-toast button),\nhtml.webable-hc-lightSafe input:not(.webable-panel input),\nhtml.webable-hc-lightSafe select:not(.webable-panel select),\nhtml.webable-hc-lightSafe textarea:not(.webable-panel textarea) {\n  background: #ffffff !important;\n  color: #000000 !important;\n  border: 2px solid #000000 !important;\n}\n\n/* Yellow on black */\nhtml.webable-hc-yellowBlack { background: #000 !important; }\nhtml.webable-hc-yellowBlack body { background: #000 !important; color: #FFEE00 !important; }\nhtml.webable-hc-yellowBlack body :not(.webable-panel):not(.webable-launcher):not(.webable-toast):not(.webable-toast *):not(.webable-panel *):not(.webable-launcher *):not(svg):not(svg *):not(img):not(picture):not(video):not(canvas):not(iframe) {\n  background: transparent !important;\n  background-image: none !important;\n  color: #FFEE00 !important;\n  border-color: #FFEE00 !important;\n}\nhtml.webable-hc-yellowBlack a:not(.webable-panel a) { color: #FFFFFF !important; text-decoration: underline !important; }\n\n/* Black on yellow */\nhtml.webable-hc-blackYellow { background: #FFEE00 !important; }\nhtml.webable-hc-blackYellow body { background: #FFEE00 !important; color: #000 !important; }\nhtml.webable-hc-blackYellow body :not(.webable-panel):not(.webable-launcher):not(.webable-toast):not(.webable-toast *):not(.webable-panel *):not(.webable-launcher *):not(svg):not(svg *):not(img):not(picture):not(video):not(canvas):not(iframe) {\n  background: transparent !important;\n  background-image: none !important;\n  color: #000 !important;\n  border-color: #000 !important;\n}\n\n/* ─── COLOR FILTERS ──────────────────────────────────────────── */\nhtml.webable-cf-deuter-correct  body { filter: url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"f\"><feColorMatrix values=\"0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0\"/></filter></svg>#f'); }\nhtml.webable-cf-protan-correct  body { filter: url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"f\"><feColorMatrix values=\"0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0\"/></filter></svg>#f'); }\nhtml.webable-cf-tritan-correct  body { filter: url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"f\"><feColorMatrix values=\"0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0\"/></filter></svg>#f'); }\nhtml.webable-cf-achroma-correct body { filter: grayscale(1) contrast(1.2); }\nhtml.webable-cf-deuter-simulate body { filter: url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"f\"><feColorMatrix values=\"0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0\"/></filter></svg>#f'); }\nhtml.webable-cf-protan-simulate body { filter: url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"f\"><feColorMatrix values=\"0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0\"/></filter></svg>#f'); }\nhtml.webable-cf-tritan-simulate body { filter: url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\"><filter id=\"f\"><feColorMatrix values=\"0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0\"/></filter></svg>#f'); }\nhtml.webable-cf-achroma-simulate body { filter: grayscale(1); }\nhtml[class*=webable-cf-] .webable-panel,\nhtml[class*=webable-cf-] .webable-launcher,\nhtml[class*=webable-cf-] .webable-toast,\nhtml[class*=webable-cf-] .webable-pinned-tooltip { filter: none !important; }\n\n/* ─── BIG CURSOR ─────────────────────────────────────────────── */\n/* Apply to body + descendants except WebAble's own chrome — the plugin\n   keeps its native cursor so it doesn't look \"weird\" when this tool is on. */\nhtml.webable-bc-1 body, html.webable-bc-1 body *:not(.webable-panel):not(.webable-panel *):not(.webable-launcher):not(.webable-launcher *):not(.webable-toast):not(.webable-toast *):not(.webable-pinned-tooltip):not(.webable-pinned-tooltip *):not(.webable-ocr-modal):not(.webable-ocr-modal *) {\n  cursor: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><path d='M5 3l16 14-7 1-2 7L5 3z' stroke='%23000' stroke-width='2' fill='%23fff'/></svg>\") 5 3, auto !important;\n}\nhtml.webable-bc-2 body, html.webable-bc-2 body *:not(.webable-panel):not(.webable-panel *):not(.webable-launcher):not(.webable-launcher *):not(.webable-toast):not(.webable-toast *):not(.webable-pinned-tooltip):not(.webable-pinned-tooltip *):not(.webable-ocr-modal):not(.webable-ocr-modal *) {\n  cursor: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'><path d='M8 5l24 21-10 1-3 11L8 5z' stroke='%23000' stroke-width='2.5' fill='%23fff'/></svg>\") 8 5, auto !important;\n}\nhtml.webable-bc-3 body, html.webable-bc-3 body *:not(.webable-panel):not(.webable-panel *):not(.webable-launcher):not(.webable-launcher *):not(.webable-toast):not(.webable-toast *):not(.webable-pinned-tooltip):not(.webable-pinned-tooltip *):not(.webable-ocr-modal):not(.webable-ocr-modal *) {\n  cursor: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><path d='M11 7l32 28-13 1-4 14L11 7z' stroke='%23000' stroke-width='3' fill='%23fff'/></svg>\") 11 7, auto !important;\n}\nhtml.webable-bc-4 body, html.webable-bc-4 body *:not(.webable-panel):not(.webable-panel *):not(.webable-launcher):not(.webable-launcher *):not(.webable-toast):not(.webable-toast *):not(.webable-pinned-tooltip):not(.webable-pinned-tooltip *):not(.webable-ocr-modal):not(.webable-ocr-modal *) {\n  cursor: url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><path d='M14 9l40 36-16 1-5 18L14 9z' stroke='%23000' stroke-width='3.5' fill='%23fff'/></svg>\") 14 9, auto !important;\n}\n\n/* Focus ring — excluded from WebAble's own chrome so the plugin keeps its\n   normal focus styles when user enables this tool. */\nhtml.webable-fr-on a:focus:not(.webable-panel *):not(.webable-launcher):not(.webable-toast *):not(.webable-pinned-tooltip *),\nhtml.webable-fr-on button:focus:not(.webable-panel *):not(.webable-launcher):not(.webable-toast *):not(.webable-pinned-tooltip *),\nhtml.webable-fr-on input:focus:not(.webable-panel *):not(.webable-toast *),\nhtml.webable-fr-on select:focus:not(.webable-panel *):not(.webable-toast *),\nhtml.webable-fr-on textarea:focus:not(.webable-panel *):not(.webable-toast *),\nhtml.webable-fr-on [tabindex]:focus:not(.webable-panel *):not(.webable-launcher):not(.webable-toast *),\nhtml.webable-fr-on [role=button]:focus:not(.webable-panel *):not(.webable-launcher):not(.webable-toast *) {\n  outline: var(--webable-fr-width, 3px) solid var(--webable-fr-color, #2F80FF) !important;\n  outline-offset: 2px !important;\n  box-shadow: 0 0 0 var(--webable-fr-width, 3px) rgba(0,0,0,0.5) !important;\n}\n\n/* Dyslexia font */\nhtml.webable-df-opendyslexic body,\nhtml.webable-df-opendyslexic body p,\nhtml.webable-df-opendyslexic body li,\nhtml.webable-df-opendyslexic body h1,\nhtml.webable-df-opendyslexic body h2,\nhtml.webable-df-opendyslexic body h3,\nhtml.webable-df-opendyslexic body span:not(.webable-panel *):not(.webable-toast *) {\n  font-family: 'OpenDyslexic', 'Comic Sans MS', Verdana, sans-serif !important;\n  letter-spacing: 0.02em !important;\n}\nhtml.webable-df-lexend body,\nhtml.webable-df-lexend body p,\nhtml.webable-df-lexend body li,\nhtml.webable-df-lexend body h1,\nhtml.webable-df-lexend body h2,\nhtml.webable-df-lexend body h3,\nhtml.webable-df-lexend body span:not(.webable-panel *):not(.webable-toast *) {\n  font-family: 'Lexend', 'Atkinson Hyperlegible', system-ui, sans-serif !important;\n}\nhtml.webable-df-atkinson body,\nhtml.webable-df-atkinson body p,\nhtml.webable-df-atkinson body li,\nhtml.webable-df-atkinson body h1,\nhtml.webable-df-atkinson body h2,\nhtml.webable-df-atkinson body h3,\nhtml.webable-df-atkinson body span:not(.webable-panel *):not(.webable-toast *) {\n  font-family: 'Atkinson Hyperlegible', system-ui, sans-serif !important;\n}\nhtml[class*=webable-df-] .webable-panel,\nhtml[class*=webable-df-] .webable-panel *,\nhtml[class*=webable-df-] .webable-launcher,\nhtml[class*=webable-df-] .webable-launcher *,\nhtml[class*=webable-df-] .webable-toast,\nhtml[class*=webable-df-] .webable-toast * { font-family: var(--wa-font) !important; }\n\n/* Letter / word spacing — excluded from WebAble UI. */\nhtml.webable-ls-on body p:not(.webable-panel *):not(.webable-toast *):not(.webable-pinned-tooltip *):not(.webable-ocr-modal *),\nhtml.webable-ls-on body li:not(.webable-panel *):not(.webable-toast *),\nhtml.webable-ls-on body h1:not(.webable-panel *):not(.webable-toast *),\nhtml.webable-ls-on body h2:not(.webable-panel *):not(.webable-toast *),\nhtml.webable-ls-on body h3:not(.webable-panel *):not(.webable-toast *) {\n  letter-spacing: var(--webable-letter, 0) !important;\n  word-spacing: var(--webable-word, 0) !important;\n}\n\n/* Stop animations */\nhtml.webable-sa-on *,\nhtml.webable-sa-on *::before,\nhtml.webable-sa-on *::after {\n  animation: none !important;\n  transition: none !important;\n  scroll-behavior: auto !important;\n}\nhtml.webable-sa-on .webable-panel *,\nhtml.webable-sa-on .webable-launcher *,\nhtml.webable-sa-on .webable-toast * { animation: revert !important; transition: revert !important; }\n\n/* Click target enlarger — applied only outside the WebAble UI so the\n   plugin's own buttons keep their compact size. */\nhtml.webable-ct-on a:not(.webable-panel *):not(.webable-toast *):not(.webable-pinned-tooltip *):not(.webable-ocr-modal *),\nhtml.webable-ct-on button:not(.webable-panel *):not(.webable-toast *):not(.webable-pinned-tooltip *):not(.webable-ocr-modal *):not(.webable-launcher),\nhtml.webable-ct-on input[type=button]:not(.webable-panel *),\nhtml.webable-ct-on input[type=submit]:not(.webable-panel *),\nhtml.webable-ct-on [role=button]:not(.webable-panel *):not(.webable-toast *) {\n  min-width: var(--webable-ct-min, 44px) !important;\n  min-height: var(--webable-ct-min, 44px) !important;\n  display: inline-flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n}\n\n/* Sticky kill */\nhtml.webable-sk-headers [data-webable-sticky=headers],\nhtml.webable-sk-footers [data-webable-sticky=footers],\nhtml.webable-sk-chats   [data-webable-sticky=chats],\nhtml.webable-sk-popups  [data-webable-sticky=popups] {\n  position: static !important;\n  top: auto !important; bottom: auto !important;\n  inset: auto !important;\n}\nhtml.webable-sk-chats   [data-webable-sticky=chats],\nhtml.webable-sk-popups  [data-webable-sticky=popups] {\n  display: none !important;\n}\n\n/* Hide distractions */\nhtml.webable-hd-on [data-webable-distract] {\n  opacity: 0.06 !important;\n  filter: grayscale(1) blur(1px) !important;\n  pointer-events: none !important;\n  outline: 1px dashed var(--wa-tint-hi) !important;\n}\n\n/* Cookie banner killed (only \"hidden\" mode) */\n[data-webable-cookie-killed=hidden],\n[data-webable-modal-killed] {\n  display: none !important;\n}\n\n/* ─── READING MODE ─── */\nhtml.webable-rm body > *:not([data-webable-rm-target]):not(.webable-panel):not(.webable-launcher):not(.webable-toast-host):not(#webable-ruler-top):not(#webable-ruler-bot):not(#webable-ruler-bar):not(.webable-pinned-tooltip):not(script):not(style):not(noscript) {\n  display: none !important;\n}\nhtml.webable-rm body {\n  background: var(--webable-rm-bg, #FBF8F1) !important;\n  padding: 40px 0 !important;\n  margin: 0 !important;\n}\nhtml.webable-rm [data-webable-rm-target] {\n  display: block !important;\n  max-width: var(--webable-rm-width, 72ch) !important;\n  margin: 0 auto !important;\n  padding: 32px clamp(20px, 5vw, 48px) !important;\n  background: var(--webable-rm-bg, #FBF8F1) !important;\n  color: var(--webable-rm-fg, #1A2233) !important;\n  font-family: var(--webable-rm-font, system-ui) !important;\n  font-size: var(--webable-rm-size, 18px) !important;\n  line-height: var(--webable-rm-line, 1.7) !important;\n  letter-spacing: var(--webable-rm-letter, 0) !important;\n  position: static !important;\n  width: auto !important;\n  height: auto !important;\n}\nhtml.webable-rm [data-webable-rm-target] * {\n  background: transparent !important;\n  color: inherit !important;\n  font-family: inherit !important;\n  max-width: 100% !important;\n}\nhtml.webable-rm [data-webable-rm-target] p,\nhtml.webable-rm [data-webable-rm-target] li {\n  font-size: inherit !important;\n  line-height: inherit !important;\n  margin: 0 0 var(--webable-rm-paragraph, 1em) !important;\n}\nhtml.webable-rm [data-webable-rm-target] h1,\nhtml.webable-rm [data-webable-rm-target] h2,\nhtml.webable-rm [data-webable-rm-target] h3,\nhtml.webable-rm [data-webable-rm-target] h4 {\n  color: var(--webable-rm-fg, #1A2233) !important;\n  line-height: 1.3 !important;\n  margin: 24px 0 12px !important;\n  font-weight: 600 !important;\n}\nhtml.webable-rm [data-webable-rm-target] h1 { font-size: 1.6em !important; }\nhtml.webable-rm [data-webable-rm-target] h2 { font-size: 1.35em !important; }\nhtml.webable-rm [data-webable-rm-target] h3 { font-size: 1.15em !important; }\n/* Image fix — never let a single image dominate */\nhtml.webable-rm [data-webable-rm-target] img,\nhtml.webable-rm [data-webable-rm-target] picture,\nhtml.webable-rm [data-webable-rm-target] svg,\nhtml.webable-rm [data-webable-rm-target] video,\nhtml.webable-rm [data-webable-rm-target] figure {\n  display: block !important;\n  max-width: 100% !important;\n  width: auto !important;\n  height: auto !important;\n  max-height: 60vh !important;\n  object-fit: contain !important;\n  border-radius: 8px !important;\n  margin: 16px auto !important;\n}\nhtml.webable-rm [data-webable-rm-target] a {\n  color: var(--wa-accent, #2F80FF) !important;\n  text-decoration: underline !important;\n  text-decoration-thickness: 2px !important;\n  text-underline-offset: 3px !important;\n}\nhtml.webable-rm [data-webable-rm-target] blockquote {\n  border-left: 3px solid var(--wa-accent, #2F80FF) !important;\n  padding-left: 16px !important;\n  margin: 16px 0 !important;\n  font-style: italic !important;\n}\nhtml.webable-rm [data-webable-rm-target] code,\nhtml.webable-rm [data-webable-rm-target] pre {\n  background: rgba(0,0,0,0.06) !important;\n  border-radius: 4px !important;\n  padding: 0.1em 0.3em !important;\n  font-family: var(--wa-mono) !important;\n}\n\n/* ────────────────────────────────────────────────────────────────\n   AI tab — gated cards, results, OCR modal, aria-live\n   ──────────────────────────────────────────────────────────────── */\n.webable-aria-live {\n  position: absolute;\n  width: 1px; height: 1px;\n  padding: 0; margin: -1px;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  white-space: nowrap;\n  border: 0;\n}\n\n.webable-tab-mark {\n  display: inline-grid;\n  place-items: center;\n  margin-right: 4px;\n  color: var(--wa-accent);\n}\n\n.webable-ai-tab { display: flex; flex-direction: column; gap: 10px; padding: 4px 0; }\n\n.webable-ai-head {\n  background: linear-gradient(180deg, rgba(47,128,255,0.10), rgba(47,128,255,0.02));\n  border: 1px solid var(--wa-border-active);\n  border-radius: var(--wa-radius-card);\n  padding: 12px;\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n}\n.webable-ai-head-unset {\n  background: linear-gradient(180deg, rgba(242,179,64,0.08), rgba(242,179,64,0.02));\n  border-color: rgba(242,179,64,0.32);\n}\n.webable-ai-head-row {\n  display: flex;\n  align-items: flex-start;\n  gap: 10px;\n}\n.webable-ai-head-mark {\n  width: 26px; height: 26px;\n  display: grid; place-items: center;\n  background: var(--wa-accent-soft);\n  border: 1px solid var(--wa-border-active);\n  border-radius: 7px;\n  color: var(--wa-accent);\n  flex-shrink: 0;\n}\n.webable-ai-head-unset .webable-ai-head-mark {\n  background: rgba(242,179,64,0.12);\n  border-color: rgba(242,179,64,0.32);\n  color: var(--wa-amber);\n}\n.webable-ai-head-text { flex: 1; min-width: 0; }\n.webable-ai-head-title { font-size: 13px; font-weight: 500; letter-spacing: -0.01em; }\n.webable-ai-head-sub { font-size: 11px; color: var(--wa-text-2); margin-top: 2px; line-height: 1.5; }\n.webable-ai-head-sub .mono { font-size: 10px; }\n\n.webable-ai-card { display: flex; flex-direction: column; gap: 8px; }\n\n.webable-ai-body { display: flex; flex-direction: column; gap: 8px; }\n.webable-ai-actions { display: flex; flex-wrap: wrap; gap: 6px; }\n.webable-ai-hint {\n  font-size: 10px;\n  color: var(--wa-text-3);\n  text-transform: uppercase;\n  letter-spacing: 0.06em;\n  padding: 6px 0 0;\n}\n.webable-ai-stat {\n  display: flex;\n  align-items: baseline;\n  gap: 8px;\n  padding: 8px 10px;\n  background: var(--wa-bg-2);\n  border: 1px solid var(--wa-border);\n  border-radius: 7px;\n}\n.webable-ai-stat-num {\n  font-size: 18px;\n  color: var(--wa-text);\n  font-weight: 500;\n}\n.webable-ai-stat-key { font-size: 11px; color: var(--wa-text-2); }\n\n.webable-ai-result {\n  background: var(--wa-bg-2);\n  border: 1px solid var(--wa-border);\n  border-radius: 8px;\n  padding: 10px 12px;\n  font-size: 12px;\n  color: var(--wa-text);\n  line-height: 1.6;\n  max-height: 240px;\n  overflow-y: auto;\n}\n.webable-ai-result p { margin: 0 0 8px; }\n.webable-ai-result p:last-child { margin-bottom: 0; }\n\n.webable-ai-recent {\n  margin-top: 4px;\n  padding-top: 8px;\n  border-top: 1px dashed var(--wa-border);\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n.webable-ai-recent-title {\n  font-size: 10px;\n  color: var(--wa-text-3);\n  text-transform: uppercase;\n  letter-spacing: 0.08em;\n  margin-bottom: 2px;\n}\n.webable-ai-recent-item {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  padding: 6px 8px;\n  background: var(--wa-bg-2);\n  border: 1px solid var(--wa-border);\n  border-radius: 6px;\n  font-family: inherit;\n  text-align: left;\n  width: 100%;\n  cursor: default;\n}\n.webable-ai-recent-clickable { cursor: pointer; transition: border-color 80ms; }\n.webable-ai-recent-clickable:hover { border-color: var(--wa-border-hi); }\n.webable-ai-recent-src {\n  font-size: 9px;\n  color: var(--wa-text-3);\n  text-transform: uppercase;\n  letter-spacing: 0.06em;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.webable-ai-recent-alt {\n  font-size: 11px;\n  color: var(--wa-text);\n  line-height: 1.4;\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n}\n\n/* QA */\n.webable-qa-form {\n  display: flex;\n  gap: 6px;\n}\n.webable-qa-input {\n  flex: 1;\n  font-family: inherit;\n  font-size: 12px;\n  background: var(--wa-bg-2);\n  border: 1px solid var(--wa-border);\n  border-radius: 6px;\n  color: var(--wa-text);\n  padding: 7px 10px;\n  outline: none;\n  transition: border-color 80ms, box-shadow 80ms;\n}\n.webable-qa-input::placeholder { color: var(--wa-text-3); }\n.webable-qa-input:focus {\n  border-color: var(--wa-border-active);\n  box-shadow: 0 0 0 3px rgba(47,128,255,0.16);\n}\n.webable-qa-chips {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n}\n.webable-chip {\n  font-family: inherit;\n  font-size: 10px;\n  background: var(--wa-tint);\n  border: 1px solid var(--wa-border);\n  color: var(--wa-text-2);\n  padding: 4px 9px;\n  border-radius: 999px;\n  cursor: pointer;\n  transition: border-color 80ms, color 80ms, background 80ms;\n}\n.webable-chip:hover { color: var(--wa-text); border-color: var(--wa-border-hi); }\n.webable-qa-result {\n  display: flex;\n  gap: 8px;\n  padding: 10px 12px;\n  background: var(--wa-accent-soft);\n  border: 1px solid var(--wa-border-active);\n  border-radius: 8px;\n}\n.webable-qa-empty { background: var(--wa-tint); border-color: var(--wa-border); }\n.webable-qa-mark {\n  width: 24px; height: 24px;\n  display: grid; place-items: center;\n  background: var(--wa-accent-soft);\n  color: var(--wa-accent);\n  border: 1px solid var(--wa-border-active);\n  border-radius: 6px;\n  flex-shrink: 0;\n}\n.webable-qa-empty .webable-qa-mark { background: var(--wa-tint); color: var(--wa-text-2); border-color: var(--wa-border); }\n.webable-qa-body { flex: 1; min-width: 0; }\n.webable-qa-title { font-size: 12px; font-weight: 500; color: var(--wa-text); }\n.webable-qa-detail { font-size: 11px; color: var(--wa-text-2); line-height: 1.5; margin-top: 2px; }\n.webable-qa-meta { font-size: 9px; color: var(--wa-text-3); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.06em; }\n\n/* Honest coming soon */\n.webable-ai-honest {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  margin-top: 6px;\n  padding-top: 10px;\n  border-top: 1px dashed var(--wa-border);\n}\n.webable-ai-honest-head {\n  font-size: 10px;\n  color: var(--wa-text-3);\n  text-transform: uppercase;\n  letter-spacing: 0.08em;\n  margin-bottom: 4px;\n}\n.webable-coming-card-honest {\n  background: var(--wa-bg-2);\n}\n.webable-coming-honest {\n  font-size: 10px;\n  color: var(--wa-text-2);\n  background: rgba(0,0,0,0.16);\n  padding: 6px 8px;\n  border-radius: 5px;\n  border-left: 2px solid var(--wa-amber);\n  line-height: 1.5;\n  margin-top: 6px;\n}\n.webable-coming-honest strong { color: var(--wa-amber); font-weight: 500; }\n\n/* Shimmer loading state */\n.webable-shimmer-block {\n  height: 28px;\n  background: linear-gradient(90deg, var(--wa-tint), var(--wa-tint-hi), var(--wa-tint));\n  background-size: 400% 100%;\n  border-radius: 6px;\n  border: 1px solid var(--wa-border);\n  animation: webable-shimmer 1.2s linear infinite;\n}\n.webable-shimmer-block + .webable-shimmer-block { margin-top: 6px; }\n@keyframes webable-shimmer {\n  0%   { background-position: 100% 0; }\n  100% { background-position: -100% 0; }\n}\n\n/* Pulse target — used by Q&A and analyzer highlight */\n[data-webable-pulse] {\n  position: relative !important;\n  z-index: 999 !important;\n  outline: 2px solid var(--wa-accent) !important;\n  outline-offset: 4px !important;\n  border-radius: 4px !important;\n  animation: webable-pulse-target 1.6s ease-in-out infinite;\n  box-shadow: 0 0 0 4px rgba(47,128,255,0.20) !important;\n}\n@keyframes webable-pulse-target {\n  0%, 100% { box-shadow: 0 0 0 4px rgba(47,128,255,0.20); }\n  50%      { box-shadow: 0 0 0 12px rgba(47,128,255,0); }\n}\n\n/* OCR modal */\n.webable-ocr-modal {\n  position: fixed;\n  inset: 0;\n  background: rgba(8, 12, 22, 0.55);\n  backdrop-filter: blur(2px);\n  -webkit-backdrop-filter: blur(2px);\n  z-index: var(--wa-z);\n  display: grid;\n  place-items: center;\n  padding: 24px;\n  --wa-bg: #0B1220;\n  --wa-bg-2: #0E1525;\n  --wa-surface: #131C2E;\n  --wa-text: #F4F6FA;\n  --wa-text-2: #9AA4B8;\n  --wa-text-3: #6B768F;\n  --wa-accent: #2F80FF;\n  --wa-accent-soft: rgba(47,128,255,0.16);\n  --wa-border: var(--wa-tint-hi);\n  --wa-border-hi: var(--wa-tint-4);\n  --wa-border-active: rgba(47,128,255,0.40);\n  --wa-mono: ui-monospace, 'SF Mono', Menlo, monospace;\n  --wa-font: 'Inter', system-ui, sans-serif;\n}\n.webable-ocr-modal-inner {\n  width: 100%;\n  max-width: 640px;\n  max-height: 80vh;\n  background: var(--wa-bg);\n  border: 1px solid var(--wa-border-hi);\n  border-radius: 14px;\n  display: flex;\n  flex-direction: column;\n  box-shadow: 0 24px 48px -12px rgba(0,0,0,0.6);\n  overflow: hidden;\n}\n.webable-ocr-modal-head {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 12px 16px;\n  border-bottom: 1px solid var(--wa-border);\n  font-family: var(--wa-font);\n  color: var(--wa-text);\n}\n.webable-ocr-mark {\n  width: 24px; height: 24px;\n  display: grid; place-items: center;\n  background: var(--wa-accent-soft);\n  border: 1px solid var(--wa-border-active);\n  color: var(--wa-accent);\n  border-radius: 6px;\n}\n.webable-ocr-title { font-size: 13px; font-weight: 500; flex: 1; }\n.webable-ocr-src { font-size: 10px; color: var(--wa-text-3); text-transform: uppercase; letter-spacing: 0.06em; }\n.webable-ocr-text {\n  flex: 1;\n  overflow-y: auto;\n  margin: 0;\n  padding: 16px 20px;\n  font-family: var(--wa-mono);\n  font-size: 12px;\n  line-height: 1.6;\n  white-space: pre-wrap;\n  color: var(--wa-text);\n  background: var(--wa-bg-2);\n}\n.webable-ocr-modal-foot {\n  display: flex;\n  gap: 8px;\n  padding: 12px 16px;\n  border-top: 1px solid var(--wa-border);\n  background: var(--wa-bg);\n}\n\n/* ────────────────────────────────────────────────────────────────\n   In-panel Site Analyzer (4th tab)\n   ──────────────────────────────────────────────────────────────── */\n.webable-panel-tabs-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }\n\n.webable-sa { display: flex; flex-direction: column; padding: 4px 0 0; }\n\n.webable-sa-head {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 10px 4px 12px;\n  border-bottom: 1px solid var(--wa-border);\n}\n.webable-sa-head-text { flex: 1; min-width: 0; }\n.webable-sa-head-title {\n  font-size: 14px;\n  font-weight: 500;\n  letter-spacing: -0.01em;\n  color: var(--wa-text);\n}\n.webable-sa-head-sub {\n  font-size: 10px;\n  color: var(--wa-text-3);\n  text-transform: uppercase;\n  letter-spacing: 0.06em;\n  margin-top: 2px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n/* Empty state — first time user lands on the Site tab */\n.webable-sa-empty {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  text-align: center;\n  gap: 8px;\n  padding: 24px 16px;\n}\n.webable-sa-empty-mark {\n  width: 44px; height: 44px;\n  display: grid; place-items: center;\n  background: var(--wa-accent-soft);\n  color: var(--wa-accent);\n  border: 1px solid var(--wa-border-active);\n  border-radius: 50%;\n  margin-bottom: 4px;\n}\n.webable-sa-empty-title { font-size: 14px; font-weight: 500; color: var(--wa-text); letter-spacing: -0.01em; }\n.webable-sa-empty-sub {\n  font-size: 11px;\n  color: var(--wa-text-2);\n  line-height: 1.55;\n  max-width: 36ch;\n  margin-bottom: 10px;\n}\n\n/* Loading shimmer */\n.webable-sa-loading { padding: 14px 0; }\n.webable-sa-load-row {\n  display: flex;\n  gap: 14px;\n  align-items: center;\n  padding-bottom: 14px;\n  border-bottom: 1px dashed var(--wa-border);\n}\n.webable-sa-load-gauge {\n  width: 84px; height: 84px;\n  border-radius: 50%;\n  background: linear-gradient(90deg, var(--wa-tint), var(--wa-tint-hi), var(--wa-tint));\n  background-size: 400% 100%;\n  animation: webable-shimmer 1.4s linear infinite;\n  flex-shrink: 0;\n}\n.webable-sa-load-meta { flex: 1; display: flex; flex-direction: column; gap: 8px; }\n.webable-sa-load-line {\n  height: 12px;\n  border-radius: 4px;\n  background: linear-gradient(90deg, var(--wa-tint), var(--wa-tint-hi), var(--wa-tint));\n  background-size: 400% 100%;\n  animation: webable-shimmer 1.4s linear infinite;\n  width: 60%;\n}\n.webable-sa-load-line.wide   { width: 80%; }\n.webable-sa-load-line.narrow { width: 40%; }\n.webable-sa-load-list { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }\n.webable-sa-load-card {\n  height: 44px;\n  border-radius: 8px;\n  background: linear-gradient(90deg, var(--wa-tint), var(--wa-tint-hi), var(--wa-tint));\n  background-size: 400% 100%;\n  animation: webable-shimmer 1.4s linear infinite;\n}\n\n/* Summary / gauge */\n.webable-sa-summary {\n  display: flex;\n  gap: 14px;\n  align-items: center;\n  padding: 14px 0;\n}\n.webable-sa-gauge {\n  position: relative;\n  width: 92px;\n  height: 92px;\n  flex-shrink: 0;\n}\n/* Single big number, geometrically centered. Lighthouse-style — the arc is\n   the visual scale, no need for \"/ 100\" inside the circle. */\n.webable-sa-gauge-num {\n  position: absolute;\n  inset: 0;\n  display: grid;\n  place-items: center;\n  font-size: 30px;\n  font-weight: 500;\n  letter-spacing: -0.03em;\n  font-variant-numeric: tabular-nums;\n  pointer-events: none;\n  line-height: 1;\n}\n.webable-sa-meta { flex: 1; min-width: 0; }\n.webable-sa-meta-row {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-bottom: 4px;\n}\n.webable-sa-meta-strong {\n  font-size: 12px;\n  font-weight: 500;\n  color: var(--wa-text);\n  letter-spacing: -0.005em;\n  flex: 1;\n  min-width: 0;\n}\n.webable-sa-meta-sub {\n  font-size: 11px;\n  color: var(--wa-text-2);\n  margin: 0 0 10px;\n}\n.webable-sa-meta-sub strong { color: var(--wa-text); font-weight: 500; }\n\n/* Letter-grade pill (A/B/C/D/F) — color-coded, monospace, square-ish */\n.webable-sa-grade-pill {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 24px;\n  height: 22px;\n  padding-bottom: 1px;\n  border-radius: 6px;\n  font-family: var(--wa-mono);\n  font-size: 12px;\n  font-weight: 500;\n  letter-spacing: 0;\n  background: var(--wa-tint-hi);\n  border: 1px solid var(--wa-border);\n  color: var(--wa-text);\n  flex-shrink: 0;\n}\n.webable-sa-grade-pill[data-grade=\"A\"] { background: rgba(31,203,138,0.12); color: var(--wa-success); border-color: rgba(31,203,138,0.32); }\n.webable-sa-grade-pill[data-grade=\"B\"] { background: var(--wa-accent-soft); color: var(--wa-accent); border-color: var(--wa-border-active); }\n.webable-sa-grade-pill[data-grade=\"C\"] { background: rgba(242,179,64,0.12); color: var(--wa-amber); border-color: rgba(242,179,64,0.32); }\n.webable-sa-grade-pill[data-grade=\"D\"] { background: rgba(255,122,126,0.12); color: #FF7A7E; border-color: rgba(255,122,126,0.32); }\n.webable-sa-grade-pill[data-grade=\"F\"] { background: rgba(229,72,77,0.12); color: #F08086; border-color: rgba(229,72,77,0.32); }\n\n/* Element census strip — sits below the summary, above the severity tabs.\n   Gives concrete numbers of what was scanned so the score has context. */\n.webable-sa-census {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 10px;\n  background: var(--wa-bg-2);\n  border: 1px solid var(--wa-border);\n  border-radius: 7px;\n  margin-bottom: 12px;\n  font-size: 10px;\n}\n.webable-sa-census-key {\n  flex-shrink: 0;\n  color: var(--wa-text-3);\n  text-transform: uppercase;\n  letter-spacing: 0.08em;\n  font-size: 9px;\n}\n.webable-sa-census-val {\n  flex: 1;\n  color: var(--wa-text-2);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  letter-spacing: 0.02em;\n  font-size: 10px;\n}\n.webable-sa-census-time {\n  flex-shrink: 0;\n  color: var(--wa-text-3);\n  text-transform: uppercase;\n  letter-spacing: 0.08em;\n  font-size: 9px;\n  padding-left: 8px;\n  border-left: 1px solid var(--wa-border);\n}\n.webable-sa-cats { display: flex; flex-direction: column; gap: 4px; }\n.webable-sa-cat {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 10px;\n  color: var(--wa-text-2);\n  text-transform: uppercase;\n  letter-spacing: 0.06em;\n}\n.webable-sa-cat-label { width: 60px; flex-shrink: 0; white-space: nowrap; }\n.webable-sa-cat-track {\n  flex: 1;\n  height: 4px;\n  border-radius: 999px;\n  background: var(--wa-tint-hi);\n  overflow: hidden;\n}\n.webable-sa-cat-fill {\n  display: block;\n  height: 100%;\n  border-radius: 999px;\n  transition: width 320ms cubic-bezier(0.22, 1, 0.36, 1);\n}\n.webable-sa-cat-val {\n  width: 22px;\n  text-align: right;\n  color: var(--wa-text);\n  font-variant-numeric: tabular-nums;\n}\n\n/* Severity tabs */\n.webable-sa-tabs {\n  display: grid;\n  grid-template-columns: repeat(4, 1fr);\n  border-bottom: 1px solid var(--wa-border);\n}\n.webable-sa-tab {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 5px;\n  padding: 9px 4px 10px;\n  background: transparent;\n  border: none;\n  border-bottom: 2px solid transparent;\n  margin-bottom: -1px;\n  color: var(--wa-text-2);\n  font-family: var(--wa-font);\n  font-size: 11px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: color 80ms, border-color 80ms;\n}\n.webable-sa-tab:hover { color: var(--wa-text); }\n.webable-sa-tab-on {\n  color: var(--wa-text);\n  border-bottom-color: var(--wa-accent);\n}\n.webable-sa-tab-count {\n  font-size: 9px;\n  background: var(--wa-tint);\n  border: 1px solid var(--wa-border);\n  padding: 1px 5px;\n  border-radius: 999px;\n  color: var(--wa-text-3);\n  letter-spacing: 0.04em;\n}\n.webable-sa-tab-on .webable-sa-tab-count {\n  background: var(--wa-accent-soft);\n  border-color: var(--wa-border-active);\n  color: var(--wa-accent);\n}\n\n/* Issue list */\n.webable-sa-issues {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  padding: 10px 0 12px;\n}\n.webable-sa-issue {\n  display: flex;\n  flex-direction: column;\n  padding: 9px 11px;\n  background: var(--wa-surface);\n  border: 1px solid var(--wa-border);\n  border-left: 2px solid var(--wa-text-3);\n  border-radius: 7px;\n  cursor: pointer;\n  font-family: inherit;\n  text-align: left;\n  width: 100%;\n  transition: border-color 80ms, background 80ms;\n}\n.webable-sa-issue:hover { border-color: var(--wa-border-hi); background: var(--wa-surface-hi); }\n.webable-sa-issue:focus-visible { outline: 2px solid rgba(47,128,255,0.5); outline-offset: 2px; }\n.webable-sa-issue[data-sev=critical] { border-left-color: #E5484D; }\n.webable-sa-issue[data-sev=serious]  { border-left-color: #FF7A7E; }\n.webable-sa-issue[data-sev=moderate] { border-left-color: var(--wa-amber); }\n.webable-sa-issue[data-sev=minor]    { border-left-color: var(--wa-text-3); }\n\n.webable-sa-issue-row {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n.webable-sa-issue-title {\n  flex: 1;\n  font-size: 12px;\n  font-weight: 500;\n  color: var(--wa-text);\n  letter-spacing: -0.005em;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.webable-sa-issue-count {\n  font-size: 10px;\n  background: var(--wa-tint);\n  border: 1px solid var(--wa-border);\n  color: var(--wa-text-2);\n  padding: 1px 6px;\n  border-radius: 999px;\n  flex-shrink: 0;\n}\n.webable-sa-issue-sub {\n  font-size: 9px;\n  color: var(--wa-text-3);\n  text-transform: uppercase;\n  letter-spacing: 0.08em;\n  margin-top: 4px;\n}\n.webable-sa-issue-detail {\n  display: none;\n  margin-top: 8px;\n  padding-top: 8px;\n  border-top: 1px dashed var(--wa-border);\n  flex-direction: column;\n  gap: 4px;\n}\n.webable-sa-issue-open .webable-sa-issue-detail { display: flex; }\n.webable-sa-issue-key {\n  font-size: 9px;\n  color: var(--wa-text-3);\n  text-transform: uppercase;\n  letter-spacing: 0.08em;\n}\n.webable-sa-issue-fix {\n  font-size: 11px;\n  color: var(--wa-text-2);\n  line-height: 1.55;\n}\n\n.webable-sa-issues-empty {\n  padding: 22px 16px;\n  text-align: center;\n  color: var(--wa-text-3);\n  font-size: 11px;\n  border: 1px dashed var(--wa-border);\n  border-radius: 8px;\n}\n\n.webable-sa-foot {\n  display: flex;\n  gap: 6px;\n  padding-top: 10px;\n  border-top: 1px solid var(--wa-border);\n}\n.webable-sa-foot .webable-btn { flex: 1; justify-content: center; }\n\n/* Render-error fallback shown by renderPanelBody's safeRender wrapper.\n   If a view's builder throws, the user sees this instead of a half-applied UI. */\n.webable-render-error {\n  margin: 16px 0;\n  padding: 14px 16px;\n  background: rgba(229,72,77,0.06);\n  border: 1px solid rgba(229,72,77,0.32);\n  border-left: 2px solid var(--wa-red);\n  border-radius: 8px;\n  font-size: 12px;\n  color: var(--wa-text);\n  line-height: 1.55;\n}\n.webable-render-error strong { color: #F08086; font-weight: 500; display: inline-block; margin-bottom: 4px; }\n.webable-render-error .mono { font-size: 11px; color: var(--wa-text-2); }\n.webable-render-error small { display: block; margin-top: 6px; color: var(--wa-text-3); font-size: 11px; }\n\n/* Ruler */\n.webable-ruler-mask {\n  position: fixed;\n  left: 0;\n  width: 100%;\n  pointer-events: none;\n  z-index: calc(var(--wa-z) - 4);\n}\n#webable-ruler-top { top: 0; height: 0; }\n#webable-ruler-bot { bottom: 0; }\n#webable-ruler-bar {\n  position: fixed;\n  left: 0;\n  width: 100%;\n  pointer-events: none;\n  z-index: calc(var(--wa-z) - 3);\n  border-top: 1px solid rgba(47,128,255,0.5);\n  border-bottom: 1px solid rgba(47,128,255,0.5);\n  background: linear-gradient(180deg, rgba(47,128,255,0.05), rgba(47,128,255,0.0), rgba(47,128,255,0.05));\n}\n\n\n/* WebAble Embed — additions on top of the shared design system (content.css).\n   Only what the website widget needs beyond the extension styles. Every\n   selector stays in the .webable-* namespace so the host page is untouched. */\n\n/* Two-tab header (extension ships 3- and 4-tab variants; embed uses 2). */\n.webable-panel-tabs-2 { grid-template-columns: 1fr 1fr; }\n\n/* \"Powered by WebAble\" attribution — the open-source flywheel. Subtle,\n   keyboard-focusable, hideable via data-webable-attribution=\"false\". */\n.webable-panel-footer { flex-direction: column; align-items: stretch; gap: 8px; }\n.webable-powered {\n  display: block;\n  text-align: center;\n  font-size: 11px;\n  letter-spacing: 0.02em;\n  color: var(--wa-text-3);\n  text-decoration: none;\n  padding: 2px 0 1px;\n  border-top: 1px solid var(--wa-border);\n  margin-top: 2px;\n  transition: color 120ms ease-out;\n}\n.webable-powered strong { color: var(--wa-text-2); font-weight: 600; }\n.webable-powered:hover { color: var(--wa-text-2); }\n.webable-powered:hover strong { color: var(--wa-accent); }\n.webable-powered:focus-visible { outline: 2px solid var(--wa-border-active); outline-offset: 2px; border-radius: 6px; }\n";
  var style = document.createElement('style');
  style.id = 'webable-embed-styles';
  style.setAttribute('data-webable', 'core');
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
})();

/* ── core/webable-engine.js ──────────────────────────────────────────── */
// WebAble Engine — the shared, framework-free accessibility engine.
//
// This is the canonical implementation of WebAble's 21 page-adaptation tools
// and 7 profiles. It is pure DOM/CSS: no chrome.* APIs, no network, no
// dependencies. It powers BOTH the browser extension (content.js) and the
// embeddable website widget (embed/webable.embed.js).
//
// USER-SIDE by design. Every modification is opt-in, reversible, and never
// overrides ARIA or removes focusable nodes the native a11y stack depends on.
// We do not claim to "make websites compliant." (See FTC v. accessiBe, 2026.)
//
// Public API:
//   WebAble.Engine.createEngine(opts) -> engine instance
//     opts: { document, window, toast(msg,opts), announce(msg),
//             escapeHtml(s), onChange() }
//   plus exported tables: ICONS, ALL_TOOLS, TOOL_DEFAULTS, TOOL_META,
//   PROFILES, CATEGORIES, VERSION.

(function (root, factory) {
  'use strict';
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;     // CommonJS / npm
  root.WebAble = root.WebAble || {};
  root.WebAble.Engine = mod;                                                   // browser global
}(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  var VERSION = '2.0.0';

  // ─── Inline icons (Lucide-style, 1.5px stroke, currentColor) ───────────
  var I = function (path, sz) {
    return '<svg viewBox="0 0 24 24" width="' + (sz || 16) + '" height="' + (sz || 16) +
      '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  };

  var ICONS = {
    accessibility: function (s) { return I('<circle cx="16" cy="4" r="1"/><path d="m18 19 1-7-6 1"/><path d="m5 8 3-3 5.5 3-2.36 3.5"/><path d="M4.24 14.5a5 5 0 0 0 6.88 6"/><path d="M13.76 17.5a5 5 0 0 0-6.88-6"/>', s); },
    bookOpen: function (s) { return I('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>', s); },
    contrast: function (s) { return I('<circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 0 0 20z"/>', s); },
    palette: function (s) { return I('<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125 0-.937.756-1.688 1.688-1.688h1.989c3.105 0 5.65-2.547 5.65-5.65C22 6.5 17.5 2 12 2z"/>', s); },
    type: function (s) { return I('<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>', s); },
    zoomIn: function (s) { return I('<circle cx="11" cy="11" r="7"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', s); },
    cursor: function (s) { return I('<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51z"/><path d="M13 13l6 6"/>', s); },
    scanLine: function (s) { return I('<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>', s); },
    focusRing: function (s) { return I('<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="3"/>', s); },
    spell: function (s) { return I('<path d="m6 16 6-12 6 12"/><path d="M8 12h8"/><path d="M19 19h-2.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 1 0 0-3H15"/>', s); },
    space: function (s) { return I('<path d="M3 8v8"/><path d="M21 8v8"/><line x1="3" y1="12" x2="21" y2="12"/>', s); },
    volume: function (s) { return I('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>', s); },
    image: function (s) { return I('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>', s); },
    eyeOff: function (s) { return I('<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>', s); },
    target: function (s) { return I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', s); },
    pin: function (s) { return I('<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/>', s); },
    trash: function (s) { return I('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', s); },
    arrowDown: function (s) { return I('<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>', s); },
    layout: function (s) { return I('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>', s); },
    pause: function (s) { return I('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>', s); },
    moon: function (s) { return I('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>', s); },
    cookie: function (s) { return I('<path d="M12 2a10 10 0 1 0 10 10c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.6-6.14 9 9 0 0 0-1.08-.06 5 5 0 0 1-4.22-2.44z"/><circle cx="9" cy="13" r="1"/><circle cx="14" cy="9" r="1"/><circle cx="15" cy="14" r="1"/>', s); },
    modal: function (s) { return I('<rect x="3" y="3" width="18" height="14" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="6" y1="21" x2="18" y2="21"/>', s); },
    mic: function (s) { return I('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>', s); },
    sparkles: function (s) { return I('<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 13l.7 1.7L21.5 15.5l-1.8.8L19 18l-.7-1.7L16.5 15.5l1.8-.8z"/>', s); },
    eyeTracker: function (s) { return I('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>', s); },
    settings: function (s) { return I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', s); },
    x: function (s) { return I('<line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>', s); },
    search: function (s) { return I('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', s); },
    arrowLeft: function (s) { return I('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>', s); },
    arrowRight: function (s) { return I('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>', s); },
    rotate: function (s) { return I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/>', s); },
    play: function (s) { return I('<polygon points="5 3 19 12 5 21 5 3"/>', s); },
    grip: function (s) { return I('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>', s); },
    shield: function (s) { return I('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', s); },
    check: function (s) { return I('<polyline points="20 6 9 17 4 12"/>', s); },
    chevDown: function (s) { return I('<polyline points="6 9 12 15 18 9"/>', s); },
    chevRight: function (s) { return I('<polyline points="9 6 15 12 9 18"/>', s); },
    sliders: function (s) { return I('<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>', s); },
    sun: function (s) { return I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>', s); },
    heart: function (s) { return I('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z"/>', s); }
  };

  // ─── Tool registry ─────────────────────────────────────────────────────
  var ALL_TOOLS = [
    'readingMode', 'highContrast', 'colorFilter', 'textSize', 'forceZoom',
    'bigCursor', 'readingRuler', 'focusRing',
    'dyslexiaFont', 'letterSpacing', 'tts', 'hideImages',
    'clickTarget', 'tooltipPin', 'stickyKill', 'autoScroll',
    'hideDistract', 'stopAnim', 'focusMode',
    'cookieKill', 'modalKill'
  ];

  var TOOL_DEFAULTS = {
    readingMode:  { active: false, font: 'system', size: 18, lineHeight: 1.7, maxWidth: 72, letter: 0, paragraph: 1.0, bg: 'cream', fg: 'auto' },
    highContrast: { active: false, mode: 'invert' },
    colorFilter:  { active: false, type: 'deuter', purpose: 'correct' },
    textSize:     { active: false, value: 100 },
    forceZoom:    { active: false },
    bigCursor:    { active: false, scale: 2 },
    readingRuler: { active: false, height: 2, dim: 0.6 },
    focusRing:    { active: false, color: 'electric', width: 3 },
    dyslexiaFont: { active: false, font: 'opendyslexic' },
    letterSpacing:{ active: false, letter: 0.06, word: 0.16 },
    tts:          { active: false, playing: false, rate: 1.0, pitch: 1.0, voice: '' },
    hideImages:   { active: false },
    clickTarget:  { active: false, size: 44 },
    tooltipPin:   { active: false },
    stickyKill:   { active: false, headers: true, footers: true, chats: true, popups: true },
    autoScroll:   { active: false, speed: 1.0, paused: false },
    hideDistract: { active: false, sidebars: true, recommends: true, ads: true, comments: false },
    stopAnim:     { active: false },
    focusMode:    { active: false },
    cookieKill:   { active: false },
    modalKill:    { active: false }
  };

  var TOOL_META = {
    readingMode:  { cat: 'vision',    label: 'Reading Mode',    desc: 'Strip the page. Read in a clean column.', icon: ICONS.bookOpen, hasSettings: true },
    highContrast: { cat: 'vision',    label: 'High Contrast',   desc: 'Force readable contrast across the page.', icon: ICONS.contrast, hasSettings: true },
    colorFilter:  { cat: 'vision',    label: 'Color Filter',    desc: 'Simulate or correct color vision deficiency.', icon: ICONS.palette, hasSettings: true },
    textSize:     { cat: 'vision',    label: 'Text Size',       desc: 'Scale text only — layout stays put.', icon: ICONS.type, hasSettings: true },
    forceZoom:    { cat: 'vision',    label: 'Force Pinch Zoom', desc: 'Re-enable zoom on sites that block it.', icon: ICONS.zoomIn, hasSettings: false },
    bigCursor:    { cat: 'vision',    label: 'Big Cursor',      desc: 'High-contrast pointer with crosshair.', icon: ICONS.cursor, hasSettings: true },
    readingRuler: { cat: 'vision',    label: 'Reading Ruler',   desc: 'Bar follows the cursor, dims the rest.', icon: ICONS.scanLine, hasSettings: true },
    focusRing:    { cat: 'vision',    label: 'Visible Focus',   desc: 'Force a visible 3px ring on every focused control.', icon: ICONS.focusRing, hasSettings: true },
    dyslexiaFont: { cat: 'reading',   label: 'Dyslexia Font',   desc: 'OpenDyslexic / Lexend / Atkinson Hyperlegible.', icon: ICONS.spell, hasSettings: true },
    letterSpacing:{ cat: 'reading',   label: 'Letter & Word',   desc: 'Independently loosen letter and word spacing.', icon: ICONS.space, hasSettings: true },
    tts:          { cat: 'reading',   label: 'Read Aloud',      desc: 'Reads selection. Or the whole article.', icon: ICONS.volume, hasSettings: true, special: 'tts' },
    hideImages:   { cat: 'reading',   label: 'Hide Images',     desc: 'Replace images with reveal placeholders.', icon: ICONS.image, hasSettings: false },
    clickTarget:  { cat: 'motor',     label: 'Click Targets',   desc: 'Pad every click target to ≥44×44.', icon: ICONS.target, hasSettings: true },
    tooltipPin:   { cat: 'motor',     label: 'Tooltip Pin',     desc: 'Press Ctrl+Shift+P to pin the hovered tooltip.', icon: ICONS.pin, hasSettings: false },
    stickyKill:   { cat: 'motor',     label: 'Kill Stickies',   desc: 'Strip sticky headers, chat bubbles, footers.', icon: ICONS.trash, hasSettings: true },
    autoScroll:   { cat: 'motor',     label: 'Auto-Scroll',     desc: 'Slow continuous scroll. No keys to press.', icon: ICONS.arrowDown, hasSettings: true, special: 'autoScroll' },
    hideDistract: { cat: 'cognitive', label: 'Hide Distractions', desc: 'Mute sidebars, ads, comments, recommends.', icon: ICONS.layout, hasSettings: true },
    stopAnim:     { cat: 'cognitive', label: 'Stop Animations', desc: 'Pause motion, transitions, autoplay video.', icon: ICONS.pause, hasSettings: false },
    focusMode:    { cat: 'cognitive', label: 'Focus Mode',      desc: 'Reading Mode + stop motion + hide distractions.', icon: ICONS.moon, hasSettings: false },
    cookieKill:   { cat: 'privacy',   label: 'Cookie Killer',   desc: 'Auto-reject non-essential cookie banners.', icon: ICONS.cookie, hasSettings: false },
    modalKill:    { cat: 'privacy',   label: 'Popup Killer',    desc: 'Dismiss newsletter and overlay popups.', icon: ICONS.modal, hasSettings: false }
  };

  var PROFILES = {
    lowVision:    { label: 'Low Vision', desc: 'Large text + smart contrast + big cursor + visible focus.',
                    apply: { textSize: { active: true, value: 160 }, focusRing: { active: true }, bigCursor: { active: true, scale: 2 }, highContrast: { active: true, mode: 'darkSafe' } } },
    dyslexia:     { label: 'Dyslexia', desc: 'Lexend font, looser spacing, reading ruler.',
                    apply: { dyslexiaFont: { active: true, font: 'lexend' }, letterSpacing: { active: true, letter: 0.08, word: 0.20 }, readingRuler: { active: true, height: 2, dim: 0.5 } } },
    adhd:         { label: 'ADHD Focus', desc: 'Hide distractions, stop motion, ruler.',
                    apply: { hideDistract: { active: true, sidebars: true, ads: true, recommends: true, comments: true }, stopAnim: { active: true }, readingRuler: { active: true, height: 3, dim: 0.4 } } },
    motor:        { label: 'Motor Impaired', desc: 'Bigger click targets, kill stickies, auto-scroll.',
                    apply: { clickTarget: { active: true, size: 48 }, stickyKill: { active: true, headers: true, footers: true, chats: true, popups: true }, focusRing: { active: true } } },
    seizure:      { label: 'Seizure Safe', desc: 'Stop animations + saturated content damped.',
                    apply: { stopAnim: { active: true }, colorFilter: { active: true, type: 'achroma', purpose: 'correct' } } },
    senior:       { label: 'Senior Friendly', desc: 'Larger text + click targets + visible focus.',
                    apply: { textSize: { active: true, value: 130 }, clickTarget: { active: true, size: 48 }, focusRing: { active: true } } },
    privacyFirst: { label: 'Privacy First', desc: 'Auto-reject cookies, kill popups.',
                    apply: { cookieKill: { active: true }, modalKill: { active: true }, stickyKill: { active: true, popups: true, chats: true, headers: false, footers: false } } }
  };

  var CATEGORIES = [
    { id: 'all',       label: 'All',       icon: ICONS.sliders },
    { id: 'vision',    label: 'Vision',    icon: ICONS.eyeTracker },
    { id: 'reading',   label: 'Reading',   icon: ICONS.bookOpen },
    { id: 'motor',     label: 'Motor',     icon: ICONS.cursor },
    { id: 'cognitive', label: 'Cognitive', icon: ICONS.moon },
    { id: 'privacy',   label: 'Privacy',   icon: ICONS.shield }
  ];

  var GROUP_LABELS = { vision: 'Vision', reading: 'Reading', motor: 'Motor', cognitive: 'Cognitive', hearing: 'Hearing', privacy: 'Privacy' };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function defaultEscape(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // ─── Engine factory ────────────────────────────────────────────────────
  function createEngine(opts) {
    opts = opts || {};
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var win = opts.window || (typeof window !== 'undefined' ? window : null);
    if (!doc) throw new Error('WebAble.Engine.createEngine needs a document.');
    var toast = opts.toast || function () {};
    var announce = opts.announce || function () {};
    var escapeHtml = opts.escapeHtml || defaultEscape;
    var onChange = opts.onChange || function () {};

    var ROOT = doc.documentElement;
    var tools = clone(TOOL_DEFAULTS);
    var activeProfile = null;

    var $ = function (sel, r) { return (r || doc).querySelector(sel); };
    var $$ = function (sel, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(sel)); };
    var setRootClass = function (cls, on) { ROOT.classList.toggle(cls, !!on); };
    var setRootVar = function (k, v) { ROOT.style.setProperty(k, v); };
    var removeRootVar = function (k) { ROOT.style.removeProperty(k); };

    // Per-instance mutable handles (observers / timers / nodes).
    var scrollRAF = null;
    var cookieObs = null;
    var modalObs = null;
    var rulerMove = null;
    var pinnedTooltip = null;
    var ttsUtter = null;
    var cookieAnnounced = false;

    // ─── Tool implementations ──────────────────────────────────────────
    var Tools = {};

    Tools.readingMode = { apply: function (s) {
      $$('[data-webable-rm-target]').forEach(function (el) { el.removeAttribute('data-webable-rm-target'); });
      setRootClass('webable-rm', !!s.active);
      if (!s.active) return;
      var target = pickReadingTarget();
      if (!target) {
        setRootClass('webable-rm', false);
        s.active = false;
        toast('Reading Mode could not find a primary article on this page. Nothing was changed.', { kind: 'error' });
        return;
      }
      target.setAttribute('data-webable-rm-target', '1');
      setRootVar('--webable-rm-font', ({
        system: '-apple-system, system-ui, "Segoe UI", Roboto, sans-serif',
        inter: 'Inter, system-ui, sans-serif',
        lexend: 'Lexend, "Atkinson Hyperlegible", sans-serif',
        opendyslexic: '"OpenDyslexic", "Comic Sans MS", Verdana, sans-serif',
        atkinson: '"Atkinson Hyperlegible", system-ui, sans-serif',
        georgia: 'Georgia, "Times New Roman", serif'
      })[s.font] || 'system-ui, sans-serif');
      setRootVar('--webable-rm-size', s.size + 'px');
      setRootVar('--webable-rm-line', s.lineHeight);
      setRootVar('--webable-rm-width', s.maxWidth + 'ch');
      setRootVar('--webable-rm-letter', s.letter + 'em');
      setRootVar('--webable-rm-paragraph', s.paragraph + 'em');
      setRootVar('--webable-rm-bg', ({ cream: '#FBF8F1', white: '#FFFFFF', sepia: '#F4ECD8', dark: '#1A1F2A', black: '#000000' })[s.bg] || '#FBF8F1');
      setRootVar('--webable-rm-fg', s.fg === 'auto' ? (['dark', 'black'].indexOf(s.bg) >= 0 ? '#F4F6FA' : '#1A2233') : s.fg);
    } };

    Tools.highContrast = { apply: function (s) {
      ['invert', 'darkSafe', 'lightSafe', 'yellowBlack', 'blackYellow'].forEach(function (m) {
        setRootClass('webable-hc-' + m, s.active && s.mode === m);
      });
    } };

    Tools.colorFilter = { apply: function (s) {
      ['deuter', 'protan', 'tritan', 'achroma'].forEach(function (t) {
        ['correct', 'simulate'].forEach(function (p) {
          setRootClass('webable-cf-' + t + '-' + p, s.active && s.type === t && s.purpose === p);
        });
      });
    } };

    Tools.textSize = { apply: function (s) {
      setRootClass('webable-ts', !!s.active);
      if (s.active) setRootVar('--webable-ts', s.value / 100); else removeRootVar('--webable-ts');
    } };

    Tools.forceZoom = { apply: function (s) {
      var meta = doc.querySelector('meta[name="viewport"]');
      if (s.active) {
        if (meta) {
          if (!meta.hasAttribute('data-webable-orig')) meta.setAttribute('data-webable-orig', meta.getAttribute('content') || '');
          meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=10, minimum-scale=1, user-scalable=yes');
        } else {
          meta = doc.createElement('meta');
          meta.setAttribute('name', 'viewport');
          meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=10, minimum-scale=1, user-scalable=yes');
          meta.setAttribute('data-webable-injected', '1');
          doc.head.appendChild(meta);
        }
      } else {
        var m = doc.querySelector('meta[name="viewport"]');
        if (m) {
          if (m.hasAttribute('data-webable-injected')) m.remove();
          else if (m.hasAttribute('data-webable-orig')) { m.setAttribute('content', m.getAttribute('data-webable-orig')); m.removeAttribute('data-webable-orig'); }
        }
      }
    } };

    Tools.bigCursor = { apply: function (s) {
      ROOT.classList.remove('webable-bc-1', 'webable-bc-2', 'webable-bc-3', 'webable-bc-4');
      if (s.active) ROOT.classList.add('webable-bc-' + Math.min(4, Math.max(1, Math.round(s.scale))));
    } };

    Tools.readingRuler = { apply: function (s) {
      cleanupRuler();
      if (!s.active) return;
      setRootClass('webable-ruler-on', true);
      var top = doc.createElement('div'), bot = doc.createElement('div'), bar = doc.createElement('div');
      top.id = 'webable-ruler-top'; top.className = 'webable-ruler-mask';
      bot.id = 'webable-ruler-bot'; bot.className = 'webable-ruler-mask';
      bar.id = 'webable-ruler-bar';
      doc.body.appendChild(top); doc.body.appendChild(bot); doc.body.appendChild(bar);
      var lineH = parseFloat(win.getComputedStyle(doc.body).fontSize) * (s.height || 2);
      bar.style.height = lineH + 'px';
      [top, bot].forEach(function (m) { m.style.background = 'rgba(8,12,22,' + s.dim + ')'; });
      rulerMove = function (e) {
        var y = e.clientY, half = lineH / 2;
        top.style.height = Math.max(0, y - half) + 'px';
        bot.style.top = (y + half) + 'px';
        bar.style.top = (y - half) + 'px';
      };
      doc.addEventListener('mousemove', rulerMove, { passive: true });
      rulerMove({ clientY: win.innerHeight / 2 });
    } };
    function cleanupRuler() {
      setRootClass('webable-ruler-on', false);
      ['webable-ruler-top', 'webable-ruler-bot', 'webable-ruler-bar'].forEach(function (id) { var el = doc.getElementById(id); if (el) el.remove(); });
      if (rulerMove) { doc.removeEventListener('mousemove', rulerMove); rulerMove = null; }
    }

    Tools.focusRing = { apply: function (s) {
      setRootClass('webable-fr-on', !!s.active);
      if (s.active) {
        setRootVar('--webable-fr-color', ({ electric: '#2F80FF', amber: '#F2B340', green: '#1FCB8A', white: '#FFFFFF' })[s.color] || '#2F80FF');
        setRootVar('--webable-fr-width', (s.width || 3) + 'px');
      } else { removeRootVar('--webable-fr-color'); removeRootVar('--webable-fr-width'); }
    } };

    Tools.dyslexiaFont = { apply: function (s) {
      ['opendyslexic', 'lexend', 'atkinson'].forEach(function (f) { setRootClass('webable-df-' + f, s.active && s.font === f); });
    } };

    Tools.letterSpacing = { apply: function (s) {
      setRootClass('webable-ls-on', !!s.active);
      if (s.active) { setRootVar('--webable-letter', (s.letter || 0) + 'em'); setRootVar('--webable-word', (s.word || 0) + 'em'); }
      else { removeRootVar('--webable-letter'); removeRootVar('--webable-word'); }
    } };

    Tools.tts = { apply: function (s) {
      setRootClass('webable-tts-on', !!s.active);
      if (!s.active && tools.tts.playing) ttsStop();
    } };

    Tools.hideImages = { apply: function (s) {
      if (s.active) {
        $$('img').forEach(function (img) {
          if (img.closest('.webable-panel') || img.closest('.webable-launcher')) return;
          if (img.dataset.webableHidden === '1') return;
          img.dataset.webableHidden = '1';
          var ph = doc.createElement('button');
          ph.type = 'button';
          ph.className = 'webable-img-placeholder';
          var r = img.getBoundingClientRect();
          ph.style.minWidth = Math.min(Math.max(r.width || img.width || 200, 120), 720) + 'px';
          ph.style.minHeight = Math.min(Math.max(r.height || img.height || 120, 80), 480) + 'px';
          ph.innerHTML = ICONS.eyeOff(14) + '<span>Image hidden — click to reveal</span>';
          ph.addEventListener('click', function () { ph.replaceWith(img); delete img.dataset.webableHidden; });
          ph._webableImg = img;
          img.replaceWith(ph);
        });
      } else {
        $$('.webable-img-placeholder').forEach(function (ph) {
          if (ph._webableImg) { ph.replaceWith(ph._webableImg); delete ph._webableImg.dataset.webableHidden; }
        });
      }
    } };

    Tools.clickTarget = { apply: function (s) {
      setRootClass('webable-ct-on', !!s.active);
      if (s.active) setRootVar('--webable-ct-min', (s.size || 44) + 'px'); else removeRootVar('--webable-ct-min');
    } };

    Tools.tooltipPin = { apply: function () { /* keyboard-driven; stateless */ } };
    function pinHoveredTooltip() {
      var hovered = $$('[title]:hover, [aria-describedby]:hover, [data-tooltip]:hover, [data-bs-toggle="tooltip"]:hover')[0];
      if (!hovered) return toast('Hover a control with a tooltip first, then press Ctrl+Shift+P.', { kind: 'error' });
      if (pinnedTooltip) pinnedTooltip.remove();
      var text = hovered.getAttribute('title') || hovered.getAttribute('aria-label') || hovered.getAttribute('data-tooltip') || '(no tooltip text found)';
      pinnedTooltip = doc.createElement('div');
      pinnedTooltip.className = 'webable-pinned-tooltip';
      pinnedTooltip.innerHTML = '<span>' + escapeHtml(text) + '</span><button class="webable-pinned-close" aria-label="Unpin">' + ICONS.x(12) + '</button>';
      pinnedTooltip.querySelector('.webable-pinned-close').addEventListener('click', function () { if (pinnedTooltip) pinnedTooltip.remove(); pinnedTooltip = null; });
      doc.body.appendChild(pinnedTooltip);
      var r = hovered.getBoundingClientRect();
      pinnedTooltip.style.top = (r.bottom + win.scrollY + 8) + 'px';
      pinnedTooltip.style.left = Math.min(win.innerWidth - 240, r.left + win.scrollX) + 'px';
      toast('Tooltip pinned. Click ✕ to unpin.');
    }

    Tools.stickyKill = { apply: function (s) {
      setRootClass('webable-sk-on', !!s.active);
      setRootClass('webable-sk-headers', s.active && s.headers);
      setRootClass('webable-sk-footers', s.active && s.footers);
      setRootClass('webable-sk-chats', s.active && s.chats);
      setRootClass('webable-sk-popups', s.active && s.popups);
      if (s.active) tagSticky();
      else $$('[data-webable-sticky]').forEach(function (el) { el.removeAttribute('data-webable-sticky'); });
    } };
    function tagSticky() {
      var seen = (typeof WeakSet !== 'undefined') ? new WeakSet() : null;
      $$('header, footer, [class*=sticky], [class*=fixed], [class*=banner], [class*=cookie], [class*=chat], [class*=intercom], [class*=drift], [id*=banner], [id*=cookie], [id*=chat]').forEach(function (el) {
        if (seen && seen.has(el)) return;
        if (el.closest('.webable-panel') || el.closest('.webable-launcher')) return;
        var cs = win.getComputedStyle(el);
        if (cs.position === 'sticky' || cs.position === 'fixed') {
          var key = el.className + ' ' + el.id;
          var tag = (el.tagName === 'HEADER') ? 'headers'
            : (el.tagName === 'FOOTER') ? 'footers'
            : /chat|intercom|drift|messenger|crisp/i.test(key) ? 'chats'
            : /cookie|consent|gdpr|newsletter|sub|popup|modal/i.test(key) ? 'popups'
            : 'headers';
          el.setAttribute('data-webable-sticky', tag);
          if (seen) seen.add(el);
        }
      });
    }

    Tools.autoScroll = { apply: function (s) {
      if (scrollRAF) { win.cancelAnimationFrame(scrollRAF); scrollRAF = null; }
      if (!s.active || s.paused) return;
      var last = win.performance.now();
      var tick = function (now) {
        if (!tools.autoScroll.active || tools.autoScroll.paused) return;
        var dt = now - last; last = now;
        var px = (tools.autoScroll.speed || 1) * (dt / 1000) * 32;
        win.scrollBy({ top: px, behavior: 'auto' });
        scrollRAF = win.requestAnimationFrame(tick);
      };
      scrollRAF = win.requestAnimationFrame(tick);
    } };

    Tools.hideDistract = { apply: function (s) {
      $$('[data-webable-distract]').forEach(function (el) { el.removeAttribute('data-webable-distract'); });
      setRootClass('webable-hd-on', !!s.active);
      if (!s.active) return;
      var sels = [];
      if (s.sidebars) sels.push('aside', '[class*=sidebar]', '[id*=sidebar]', '[role=complementary]');
      if (s.recommends) sels.push('[class*=recommend]', '[class*=related]', '[class*=suggested]', '[class*=more-stories]', '[class*=trending]');
      if (s.ads) sels.push('[class*=ad-]', '[class*=advert]', '[class*=promo]', '[id*=ad-]', '[class*=sponsor]', '.ad-block');
      if (s.comments) sels.push('[class*=comment]', '[id*=comments]', '#comments', '#disqus_thread');
      var set = [];
      sels.forEach(function (sel) {
        try {
          $$(sel).forEach(function (el) {
            if (el.closest('.webable-panel')) return;
            if (el.closest('form')) return;
            if (el.tagName === 'NAV') return;
            if (set.indexOf(el) < 0) set.push(el);
          });
        } catch (_) {}
      });
      set.forEach(function (el) { el.setAttribute('data-webable-distract', '1'); });
    } };

    Tools.stopAnim = { apply: function (s) {
      setRootClass('webable-sa-on', !!s.active);
      if (s.active) $$('video, audio').forEach(function (m) { try { m.pause(); m.removeAttribute('autoplay'); } catch (_) {} });
    } };

    Tools.focusMode = { apply: function (s) {
      var target = function (key, partial) { Object.assign(tools[key], partial); Tools[key].apply(tools[key]); };
      if (s.active) {
        target('readingMode', { active: true });
        target('stopAnim', { active: true });
        target('hideDistract', { active: true, sidebars: true, recommends: true, ads: true, comments: true });
      }
    } };

    Tools.cookieKill = { apply: function (s) {
      if (s.active) {
        runCookieKill();
        if (cookieObs) cookieObs.disconnect();
        cookieObs = new win.MutationObserver(function () { runCookieKill(); });
        cookieObs.observe(doc.body, { childList: true, subtree: true });
      } else {
        if (cookieObs) { cookieObs.disconnect(); cookieObs = null; }
        $$('[data-webable-cookie-killed]').forEach(function (el) { el.removeAttribute('data-webable-cookie-killed'); });
      }
    } };
    function runCookieKill() {
      var REJECT_RE = /reject all|deny all|reject non[- ]essential|only necessary|only essential|necessary only|decline all|disagree|opt out|nur notwendige|alles ablehnen|tout refuser|rifiuta tutto|rechazar todo/i;
      var BANNER_SEL = '[id*=cookie], [class*=cookie], [id*=consent], [class*=consent], [id*=gdpr], [class*=gdpr], [aria-label*=cookie i], [data-testid*=cookie i], #onetrust-banner-sdk, #onetrust-consent-sdk, .ot-sdk-container, [class*=cmp], [id*=cmp], [class*=privacy-banner]';
      var killed = 0;
      $$(BANNER_SEL).forEach(function (banner) {
        if (banner.closest('.webable-panel')) return;
        if (banner.dataset.webableCookieKilled === '1') return;
        var rejectBtn = $$('button, a, [role=button], input[type=button], input[type=submit]', banner).filter(function (b) {
          return REJECT_RE.test((b.innerText || b.value || '').trim());
        })[0];
        if (rejectBtn) { try { rejectBtn.click(); banner.setAttribute('data-webable-cookie-killed', 'rejected'); killed++; return; } catch (_) {} }
        banner.setAttribute('data-webable-cookie-killed', 'hidden');
        killed++;
      });
      if (killed && !cookieAnnounced) {
        cookieAnnounced = true;
        toast('Cookie banner' + (killed === 1 ? '' : 's') + ' dismissed. Manage anytime in the WebAble panel.');
      }
    }

    Tools.modalKill = { apply: function (s) {
      if (s.active) {
        runModalKill();
        if (modalObs) modalObs.disconnect();
        modalObs = new win.MutationObserver(function () { runModalKill(); });
        modalObs.observe(doc.body, { childList: true, subtree: true });
      } else {
        if (modalObs) { modalObs.disconnect(); modalObs = null; }
        $$('[data-webable-modal-killed]').forEach(function (el) { el.removeAttribute('data-webable-modal-killed'); });
        ROOT.style.overflow = '';
        doc.body.style.overflow = '';
      }
    } };
    function runModalKill() {
      var SEL = '[class*=newsletter-popup], [class*=signup-modal], [class*=overlay], [class*=lightbox], [aria-modal=true], [role=dialog], [class*=paywall], [class*=upsell], dialog[open]';
      var killed = 0;
      $$(SEL).forEach(function (el) {
        if (el.closest('.webable-panel')) return;
        if (el.dataset.webableModalKilled === '1') return;
        var text = (el.innerText || '').toLowerCase();
        if (/age (verification|gate)/.test(text)) return;
        if (/cookie|consent|gdpr/.test(text)) return;
        el.setAttribute('data-webable-modal-killed', '1');
        killed++;
      });
      if (killed) {
        if (doc.body.style.overflow === 'hidden') doc.body.style.overflow = '';
        if (ROOT.style.overflow === 'hidden') ROOT.style.overflow = '';
      }
    }

    // ─── Reading-target heuristic ──────────────────────────────────────
    function pickReadingTarget() {
      var candidates = ['article', '[role=main]', 'main', '.article', '.post', '.story', '.entry', '#article', '#main', '#content', '.content'];
      for (var i = 0; i < candidates.length; i++) {
        var el = doc.querySelector(candidates[i]);
        if (el && (el.innerText || '').trim().length > 200) return el;
      }
      var best = null, bestLen = 0;
      $$('div, section').forEach(function (el) {
        if (el.closest('.webable-panel') || el.closest('.webable-launcher')) return;
        if (el === doc.body || (el.parentElement === doc.body && el.children.length > 10)) return;
        var len = (el.innerText || '').trim().length;
        if (len > bestLen && len > 500) { bestLen = len; best = el; }
      });
      return best;
    }

    // ─── TTS ───────────────────────────────────────────────────────────
    function ttsStart(textOverride) {
      if (!('speechSynthesis' in win)) return toast('Read Aloud needs the Web Speech API. Not available here.', { kind: 'error' });
      var sel = win.getSelection && win.getSelection() ? win.getSelection().toString() : '';
      var text = textOverride || sel;
      if (!text || !text.trim()) {
        var target = $('[data-webable-rm-target]') || pickReadingTarget() || doc.body;
        text = (target.innerText || '').slice(0, 6000);
      }
      if (!text) return;
      try { win.speechSynthesis.cancel(); } catch (_) {}
      ttsUtter = new win.SpeechSynthesisUtterance(text);
      ttsUtter.rate = tools.tts.rate || 1;
      ttsUtter.pitch = tools.tts.pitch || 1;
      if (tools.tts.voice) {
        var v = win.speechSynthesis.getVoices().filter(function (vv) { return vv.name === tools.tts.voice; })[0];
        if (v) ttsUtter.voice = v;
      }
      ttsUtter.onend = function () { tools.tts.playing = false; onChange(); };
      win.speechSynthesis.speak(ttsUtter);
      tools.tts.active = true;
      tools.tts.playing = true;
      onChange();
    }
    function ttsPause() { try { win.speechSynthesis.pause(); } catch (_) {} tools.tts.playing = false; onChange(); }
    function ttsResume() { try { win.speechSynthesis.resume(); } catch (_) {} tools.tts.playing = true; onChange(); }
    function ttsStop() { try { win.speechSynthesis.cancel(); } catch (_) {} tools.tts.playing = false; tools.tts.active = false; onChange(); }

    // ─── State transitions ─────────────────────────────────────────────
    function applyState() {
      Object.keys(Tools).forEach(function (k) { try { Tools[k].apply(tools[k]); } catch (_) {} });
    }

    function resetSilent() {
      cleanupRuler();
      if (scrollRAF) { win.cancelAnimationFrame(scrollRAF); scrollRAF = null; }
      if (cookieObs) { cookieObs.disconnect(); cookieObs = null; }
      if (modalObs) { modalObs.disconnect(); modalObs = null; }
      cookieAnnounced = false;
      ttsStop();
      Object.keys(TOOL_DEFAULTS).forEach(function (k) { tools[k] = clone(TOOL_DEFAULTS[k]); });
      applyState();
      activeProfile = null;
    }

    function toggle(id) {
      var s = tools[id];
      s.active = !s.active;
      if (id === 'tts') { if (s.active) ttsStart(); else ttsStop(); }
      else {
        try { Tools[id].apply(s); }
        catch (e) {
          if (win.console) win.console.warn('[WebAble] tool error', id, e);
          toast(TOOL_META[id].label + ' hit an error and was reverted.', { kind: 'error' });
          s.active = false; onChange(); return false;
        }
      }
      activeProfile = null;
      onChange();
      return s.active;
    }

    function set(id, partial) {
      Object.assign(tools[id], partial);
      tools[id].active = true;
      try { Tools[id].apply(tools[id]); } catch (_) {}
    }

    function resetTool(id) {
      tools[id] = clone(TOOL_DEFAULTS[id]);
      try { Tools[id].apply(tools[id]); } catch (_) {}
      onChange();
    }

    function reset() { resetSilent(); onChange(); }

    function applyProfile(key) {
      var p = PROFILES[key];
      if (!p) return;
      resetSilent();
      Object.keys(p.apply).forEach(function (id) {
        Object.assign(tools[id], p.apply[id]);
        try { Tools[id].apply(tools[id]); } catch (_) {}
      });
      activeProfile = key;
      onChange();
    }

    function countActive() {
      return Object.keys(tools).filter(function (k) { return tools[k].active; }).length;
    }

    function snapshotActive() {
      var snap = {};
      Object.keys(tools).forEach(function (k) { if (tools[k].active) snap[k] = clone(tools[k]); });
      return snap;
    }

    function restore(snapshot) {
      if (!snapshot) return;
      Object.keys(snapshot).forEach(function (id) {
        if (!tools[id]) return;
        Object.assign(tools[id], snapshot[id]);
      });
      applyState();
    }

    function teardown() {
      cleanupRuler();
      if (scrollRAF) { win.cancelAnimationFrame(scrollRAF); scrollRAF = null; }
      if (cookieObs) { cookieObs.disconnect(); cookieObs = null; }
      if (modalObs) { modalObs.disconnect(); modalObs = null; }
      if (pinnedTooltip) { pinnedTooltip.remove(); pinnedTooltip = null; }
      try { win.speechSynthesis.cancel(); } catch (_) {}
    }

    return {
      version: VERSION,
      tools: tools,
      icons: ICONS,
      meta: TOOL_META,
      all: ALL_TOOLS,
      profiles: PROFILES,
      categories: CATEGORIES,
      groupLabels: GROUP_LABELS,
      get activeProfile() { return activeProfile; },
      toggle: toggle,
      set: set,
      resetTool: resetTool,
      reset: reset,
      applyState: applyState,
      applyProfile: applyProfile,
      countActive: countActive,
      snapshotActive: snapshotActive,
      restore: restore,
      pinHoveredTooltip: pinHoveredTooltip,
      pickReadingTarget: pickReadingTarget,
      teardown: teardown,
      tts: { play: ttsStart, pause: ttsPause, resume: ttsResume, stop: ttsStop, get playing() { return tools.tts.playing; } }
    };
  }

  return {
    VERSION: VERSION,
    ICONS: ICONS,
    ALL_TOOLS: ALL_TOOLS,
    TOOL_DEFAULTS: TOOL_DEFAULTS,
    TOOL_META: TOOL_META,
    PROFILES: PROFILES,
    CATEGORIES: CATEGORIES,
    GROUP_LABELS: GROUP_LABELS,
    createEngine: createEngine
  };
}));

/* ── embed/webable.embed.js ──────────────────────────────────────────── */
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


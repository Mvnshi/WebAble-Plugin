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

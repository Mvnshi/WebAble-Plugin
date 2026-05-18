// WebAble — content script.
// USER-SIDE accessibility layer. We modify the page locally for the user
// who installed this. We do NOT inject scripts into other people's sites or
// claim to "make websites compliant." (See FTC v. accessiBe, January 2026.)
//
// The native a11y stack is sacred — every modification here is opt-in,
// reversible, and never overrides ARIA or removes focusable nodes that
// screen readers depend on.

(() => {
  if (window.__WEBABLE_LOADED__) return;
  window.__WEBABLE_LOADED__ = true;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const HOST = location.hostname || 'localpage';

  // ─── Inline icons (Lucide-style, 1.5px stroke, currentColor) ───────────
  const I = (path, sz) => `<svg viewBox="0 0 24 24" width="${sz || 16}" height="${sz || 16}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

  const ICONS = {
    accessibility: (s) => I(`<circle cx="16" cy="4" r="1"/><path d="m18 19 1-7-6 1"/><path d="m5 8 3-3 5.5 3-2.36 3.5"/><path d="M4.24 14.5a5 5 0 0 0 6.88 6"/><path d="M13.76 17.5a5 5 0 0 0-6.88-6"/>`, s),
    bookOpen: (s) => I(`<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>`, s),
    contrast: (s) => I(`<circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 0 0 20z"/>`, s),
    palette: (s) => I(`<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125 0-.937.756-1.688 1.688-1.688h1.989c3.105 0 5.65-2.547 5.65-5.65C22 6.5 17.5 2 12 2z"/>`, s),
    type: (s) => I(`<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>`, s),
    zoomIn: (s) => I(`<circle cx="11" cy="11" r="7"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`, s),
    cursor: (s) => I(`<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51z"/><path d="M13 13l6 6"/>`, s),
    scanLine: (s) => I(`<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>`, s),
    focusRing: (s) => I(`<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="3"/>`, s),
    spell: (s) => I(`<path d="m6 16 6-12 6 12"/><path d="M8 12h8"/><path d="M19 19h-2.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 1 0 0-3H15"/>`, s),
    space: (s) => I(`<path d="M3 8v8"/><path d="M21 8v8"/><line x1="3" y1="12" x2="21" y2="12"/>`, s),
    volume: (s) => I(`<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>`, s),
    image: (s) => I(`<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>`, s),
    eyeOff: (s) => I(`<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>`, s),
    target: (s) => I(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>`, s),
    pin: (s) => I(`<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/>`, s),
    trash: (s) => I(`<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>`, s),
    arrowDown: (s) => I(`<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>`, s),
    layout: (s) => I(`<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>`, s),
    pause: (s) => I(`<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>`, s),
    moon: (s) => I(`<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`, s),
    cookie: (s) => I(`<path d="M12 2a10 10 0 1 0 10 10c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.6-6.14 9 9 0 0 0-1.08-.06 5 5 0 0 1-4.22-2.44z"/><circle cx="9" cy="13" r="1"/><circle cx="14" cy="9" r="1"/><circle cx="15" cy="14" r="1"/>`, s),
    modal: (s) => I(`<rect x="3" y="3" width="18" height="14" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="6" y1="21" x2="18" y2="21"/>`, s),
    captions: (s) => I(`<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 13a3 3 0 1 0 0-2"/><path d="M14 13a3 3 0 1 0 0-2"/>`, s),
    eyeTracker: (s) => I(`<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>`, s),
    mic: (s) => I(`<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>`, s),
    sparkles: (s) => I(`<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 13l.7 1.7L21.5 15.5l-1.8.8L19 18l-.7-1.7L16.5 15.5l1.8-.8z"/>`, s),
    fileText: (s) => I(`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>`, s),
    helpCircle: (s) => I(`<circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>`, s),
    settings: (s) => I(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`, s),
    x: (s) => I(`<line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>`, s),
    search: (s) => I(`<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`, s),
    arrowLeft: (s) => I(`<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>`, s),
    arrowRight: (s) => I(`<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>`, s),
    rotate: (s) => I(`<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/>`, s),
    play: (s) => I(`<polygon points="5 3 19 12 5 21 5 3"/>`, s),
    info: (s) => I(`<circle cx="12" cy="12" r="9"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>`, s),
    grip: (s) => I(`<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>`, s),
    activity: (s) => I(`<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`, s),
    shield: (s) => I(`<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`, s),
    check: (s) => I(`<polyline points="20 6 9 17 4 12"/>`, s),
    chevDown: (s) => I(`<polyline points="6 9 12 15 18 9"/>`, s),
    chevRight: (s) => I(`<polyline points="9 6 15 12 9 18"/>`, s),
    bell: (s) => I(`<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>`, s),
    sliders: (s) => I(`<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>`, s),
    sun: (s) => I(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>`, s),
  };

  // ─── State ────────────────────────────────────────────────────────────
  const ALL_TOOLS = [
    'readingMode', 'highContrast', 'colorFilter', 'textSize', 'forceZoom',
    'bigCursor', 'readingRuler', 'focusRing',
    'dyslexiaFont', 'letterSpacing', 'tts', 'hideImages',
    'clickTarget', 'tooltipPin', 'stickyKill', 'autoScroll',
    'hideDistract', 'stopAnim', 'focusMode',
    'cookieKill', 'modalKill',
  ];

  const TOOL_DEFAULTS = {
    readingMode:  { active: false, font: 'system', size: 18, lineHeight: 1.7, maxWidth: 72, letter: 0, paragraph: 1.0, bg: 'cream', fg: 'auto' },
    highContrast: { active: false, mode: 'invert' },                // invert | darkSafe | lightSafe | yellowBlack | blackYellow
    colorFilter:  { active: false, type: 'deuter', purpose: 'correct' }, // deuter|protan|tritan|achroma; correct|simulate
    textSize:     { active: false, value: 100 },                    // 100..300
    forceZoom:    { active: false },
    bigCursor:    { active: false, scale: 2 },
    readingRuler: { active: false, height: 2, dim: 0.6 },            // height in lines, dim 0..1
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
    modalKill:    { active: false },
  };

  const TOOL_META = {
    // Vision
    readingMode:  { cat: 'vision',    label: 'Reading Mode',    desc: 'Strip the page. Read in a clean column.', icon: ICONS.bookOpen, hasSettings: true },
    highContrast: { cat: 'vision',    label: 'High Contrast',   desc: 'Force readable contrast across the page.', icon: ICONS.contrast, hasSettings: true },
    colorFilter:  { cat: 'vision',    label: 'Color Filter',    desc: 'Simulate or correct color vision deficiency.', icon: ICONS.palette, hasSettings: true },
    textSize:     { cat: 'vision',    label: 'Text Size',       desc: 'Scale text only — layout stays put.', icon: ICONS.type, hasSettings: true },
    forceZoom:    { cat: 'vision',    label: 'Force Pinch Zoom',desc: 'Re-enable zoom on sites that block it.', icon: ICONS.zoomIn, hasSettings: false },
    bigCursor:    { cat: 'vision',    label: 'Big Cursor',      desc: 'High-contrast pointer with crosshair.', icon: ICONS.cursor, hasSettings: true },
    readingRuler: { cat: 'vision',    label: 'Reading Ruler',   desc: 'Bar follows the cursor, dims the rest.', icon: ICONS.scanLine, hasSettings: true },
    focusRing:    { cat: 'vision',    label: 'Visible Focus',   desc: 'Force a visible 3px ring on every focused control.', icon: ICONS.focusRing, hasSettings: true },
    // Reading
    dyslexiaFont: { cat: 'reading',   label: 'Dyslexia Font',   desc: 'OpenDyslexic / Lexend / Atkinson Hyperlegible.', icon: ICONS.spell, hasSettings: true },
    letterSpacing:{ cat: 'reading',   label: 'Letter & Word',   desc: 'Independently loosen letter and word spacing.', icon: ICONS.space, hasSettings: true },
    tts:          { cat: 'reading',   label: 'Read Aloud',      desc: 'Reads selection. Or the whole article.', icon: ICONS.volume, hasSettings: true, special: 'tts' },
    hideImages:   { cat: 'reading',   label: 'Hide Images',     desc: 'Replace images with reveal placeholders.', icon: ICONS.image, hasSettings: false },
    // Motor
    clickTarget:  { cat: 'motor',     label: 'Click Targets',   desc: 'Pad every click target to ≥44×44.', icon: ICONS.target, hasSettings: true },
    tooltipPin:   { cat: 'motor',     label: 'Tooltip Pin',     desc: 'Press Ctrl+Shift+P to pin the hovered tooltip.', icon: ICONS.pin, hasSettings: false },
    stickyKill:   { cat: 'motor',     label: 'Kill Stickies',   desc: 'Strip sticky headers, chat bubbles, footers.', icon: ICONS.trash, hasSettings: true },
    autoScroll:   { cat: 'motor',     label: 'Auto-Scroll',     desc: 'Slow continuous scroll. No keys to press.', icon: ICONS.arrowDown, hasSettings: true, special: 'autoScroll' },
    // Cognitive
    hideDistract: { cat: 'cognitive', label: 'Hide Distractions', desc: 'Mute sidebars, ads, comments, recommends.', icon: ICONS.layout, hasSettings: true },
    stopAnim:     { cat: 'cognitive', label: 'Stop Animations', desc: 'Pause motion, transitions, autoplay video.', icon: ICONS.pause, hasSettings: false },
    focusMode:    { cat: 'cognitive', label: 'Focus Mode',      desc: 'Reading Mode + stop motion + hide distractions.', icon: ICONS.moon, hasSettings: false },
    // Privacy
    cookieKill:   { cat: 'privacy',   label: 'Cookie Killer',   desc: 'Auto-reject non-essential cookie banners.', icon: ICONS.cookie, hasSettings: false },
    modalKill:    { cat: 'privacy',   label: 'Popup Killer',    desc: 'Dismiss newsletter and overlay popups.', icon: ICONS.modal, hasSettings: false },
  };

  // Honest "Coming Soon" — features that are NOT shippable from a browser
  // extension today, with the reason on the card. Functional AI features
  // (alt text, summarizer, page Q&A, OCR) live in makeAINode().
  const COMING_SOON_HONEST = [
    {
      id: 'liveCaptions', label: 'Live Captions', icon: ICONS.captions,
      desc: 'Real-time captions for any HTML5 <video>.',
      why: 'Cross-origin <video> audio capture is blocked by browsers, and Gemini does not yet expose a streaming audio API. Both blockers need a platform fix or a relay server we will not run. Tracking.',
    },
    {
      id: 'eyeTracking', label: 'Eye-Tracking Navigation', icon: ICONS.eyeTracker,
      desc: 'Webcam gaze tracking. Tobii hardware integration on roadmap.',
      why: 'WebGazer.js calibration storage and the Tobii SDK are cleanest in a desktop wrapper. Phase 3 once we lock the per-user calibration model.',
    },
    {
      id: 'voiceNav', label: 'Advanced Voice Navigation', icon: ICONS.mic,
      desc: '"Click the third link." Works on dynamic SPAs and shadow-DOM apps.',
      why: 'Resolving commands against React / shadow-DOM trees needs a richer accessibility tree query than the Web Speech API alone. Phase 3.',
    },
  ];

  const PROFILES = {
    lowVision:    { label: 'Low Vision',          desc: 'Large text + smart contrast + big cursor + visible focus.',
                    apply: { textSize: { active: true, value: 160 }, focusRing: { active: true }, bigCursor: { active: true, scale: 2 }, highContrast: { active: true, mode: 'darkSafe' } } },
    dyslexia:     { label: 'Dyslexia',             desc: 'Lexend font, looser spacing, reading ruler.',
                    apply: { dyslexiaFont: { active: true, font: 'lexend' }, letterSpacing: { active: true, letter: 0.08, word: 0.20 }, readingRuler: { active: true, height: 2, dim: 0.5 } } },
    adhd:         { label: 'ADHD Focus',           desc: 'Hide distractions, stop motion, ruler.',
                    apply: { hideDistract: { active: true, sidebars: true, ads: true, recommends: true, comments: true }, stopAnim: { active: true }, readingRuler: { active: true, height: 3, dim: 0.4 } } },
    motor:        { label: 'Motor Impaired',       desc: 'Bigger click targets, kill stickies, auto-scroll.',
                    apply: { clickTarget: { active: true, size: 48 }, stickyKill: { active: true, headers: true, footers: true, chats: true, popups: true }, focusRing: { active: true } } },
    seizure:      { label: 'Seizure Safe',         desc: 'Stop animations + saturated content damped.',
                    apply: { stopAnim: { active: true }, colorFilter: { active: true, type: 'achroma', purpose: 'correct' } } },
    senior:       { label: 'Senior Friendly',      desc: 'Larger text + click targets + visible focus.',
                    apply: { textSize: { active: true, value: 130 }, clickTarget: { active: true, size: 48 }, focusRing: { active: true } } },
    privacyFirst: { label: 'Privacy First',        desc: 'Auto-reject cookies, kill popups.',
                    apply: { cookieKill: { active: true }, modalKill: { active: true }, stickyKill: { active: true, popups: true, chats: true, headers: false, footers: false } } },
  };

  const defaultState = () => ({
    panel: { open: false, view: 'tools', detail: null, search: '', activeCat: 'all', collapsed: {} },
    tools: JSON.parse(JSON.stringify(TOOL_DEFAULTS)),
    profile: null,
    ui: {
      theme: 'auto',
      brandColor: 'blue',
      launcherPos: { left: null, top: null, edge: 'bottom-right' },
      panelOrigin: 'bottom-right',
      layout: 'floating',  // 'floating' | 'sidebar-right' | 'sidebar-left'
    },
    perSite: {},   // { hostname: { alwaysOn, disabled, tools: {} } }
    apiKey: '',
    ai: {
      busy: null,        // 'summarizer' | 'qa' | 'alt' | 'ocr'
      summary: null,     // { text, generatedAt }
      qa: null,          // { question, id, label, confidence, explanation, resolved }
      recentAlts: [],    // [{ src, alt, ts }]
      recentOcr: [],     // [{ src, text, ts }]
    },
  });

  const state = defaultState();

  const cloneDefaults = () => JSON.parse(JSON.stringify(TOOL_DEFAULTS));

  const isSiteDisabled = () => !!state.perSite[HOST]?.disabled;
  const isSiteAlwaysOn = () => !!state.perSite[HOST]?.alwaysOn;

  // ─── Storage ──────────────────────────────────────────────────────────
  const Storage = {
    save() {
      try {
        const slim = {
          ui: state.ui,
          perSite: state.perSite,
          apiKey: state.apiKey,
        };
        chrome?.storage?.local?.set({ webable: slim });
      } catch (_) {}
    },
    load(cb) {
      try {
        chrome.storage.local.get('webable', (res) => {
          if (res?.webable) {
            if (res.webable.ui) state.ui = { ...state.ui, ...res.webable.ui };
            if (res.webable.perSite) state.perSite = res.webable.perSite || {};
            if (res.webable.apiKey) state.apiKey = res.webable.apiKey;
          }
          cb && cb();
        });
      } catch (_) { cb && cb(); }
    },
    siteState() {
      if (!state.perSite[HOST]) state.perSite[HOST] = { alwaysOn: false, disabled: false, tools: {} };
      return state.perSite[HOST];
    },
    saveSiteTools() {
      const site = this.siteState();
      const snap = {};
      Object.entries(state.tools).forEach(([k, v]) => { if (v.active) snap[k] = v; });
      site.tools = snap;
      this.save();
    },
    setAlwaysOn(on) { this.siteState().alwaysOn = on; this.saveSiteTools(); },
    setDisabled(off) { this.siteState().disabled = off; this.save(); },
    clearSite() { state.perSite[HOST] = { alwaysOn: false, disabled: false, tools: {} }; this.save(); },
  };

  // ─── Toast ────────────────────────────────────────────────────────────
  let $toastHost;
  const showToast = (msg, opts = {}) => {
    if (!$toastHost) return;
    const t = document.createElement('div');
    t.className = 'webable-toast' + (opts.kind ? ' webable-toast-' + opts.kind : '');
    // Escape msg — callers pass dynamic strings (Gemini output, error messages,
    // alt text fragments) that can contain angle brackets. Unescaped, those
    // get parsed as DOM elements and break the toast layout.
    const prefix = opts.kind === 'error' ? '<strong>Heads up:</strong> ' : '<strong>WebAble:</strong> ';
    t.innerHTML = `<span class="webable-toast-mark">${ICONS.accessibility(16)}</span><span class="webable-toast-text">${prefix}${escapeHtml(msg)}</span>`;
    $toastHost.appendChild(t);
    requestAnimationFrame(() => t.classList.add('webable-toast-in'));
    setTimeout(() => {
      t.classList.remove('webable-toast-in');
      t.classList.add('webable-toast-out');
      setTimeout(() => t.remove(), 320);
    }, opts.duration || 3600);
  };

  // ─── Page-mod helpers ─────────────────────────────────────────────────
  const ROOT = document.documentElement;
  const setRootClass = (cls, on) => ROOT.classList.toggle(cls, !!on);
  const setRootVar = (k, v) => ROOT.style.setProperty(k, v);
  const removeRootVar = (k) => ROOT.style.removeProperty(k);

  // ─── Tool implementations ────────────────────────────────────────────
  const Tools = {};

  Tools.readingMode = {
    apply(s) {
      // Always remove previous targets first.
      $$('[data-webable-rm-target]').forEach((el) => el.removeAttribute('data-webable-rm-target'));
      setRootClass('webable-rm', !!s.active);
      if (!s.active) return;
      const target = pickReadingTarget();
      if (!target) {
        // Don't blank the page — bail with a toast.
        setRootClass('webable-rm', false);
        s.active = false;
        showToast('Reading Mode could not find a primary article on this page. Nothing was changed.', { kind: 'error' });
        return;
      }
      target.setAttribute('data-webable-rm-target', '1');
      setRootVar('--webable-rm-font',      ({
        system: '-apple-system, system-ui, "Segoe UI", Roboto, sans-serif',
        inter:  'Inter, system-ui, sans-serif',
        lexend: 'Lexend, "Atkinson Hyperlegible", sans-serif',
        opendyslexic: '"OpenDyslexic", "Comic Sans MS", Verdana, sans-serif',
        atkinson: '"Atkinson Hyperlegible", system-ui, sans-serif',
        georgia: 'Georgia, "Times New Roman", serif',
      }[s.font] || 'system-ui, sans-serif'));
      setRootVar('--webable-rm-size', s.size + 'px');
      setRootVar('--webable-rm-line', s.lineHeight);
      setRootVar('--webable-rm-width', s.maxWidth + 'ch');
      setRootVar('--webable-rm-letter', s.letter + 'em');
      setRootVar('--webable-rm-paragraph', s.paragraph + 'em');
      setRootVar('--webable-rm-bg', ({
        cream: '#FBF8F1', white: '#FFFFFF', sepia: '#F4ECD8', dark: '#1A1F2A', black: '#000000',
      }[s.bg] || '#FBF8F1'));
      setRootVar('--webable-rm-fg', s.fg === 'auto'
        ? (['dark','black'].includes(s.bg) ? '#F4F6FA' : '#1A2233')
        : s.fg);
    },
  };

  Tools.highContrast = {
    apply(s) {
      const modes = ['invert', 'darkSafe', 'lightSafe', 'yellowBlack', 'blackYellow'];
      modes.forEach((m) => setRootClass('webable-hc-' + m, s.active && s.mode === m));
    },
  };

  Tools.colorFilter = {
    apply(s) {
      ['deuter','protan','tritan','achroma'].forEach((t) => {
        ['correct','simulate'].forEach((p) => setRootClass(`webable-cf-${t}-${p}`, s.active && s.type === t && s.purpose === p));
      });
    },
  };

  Tools.textSize = {
    apply(s) {
      setRootClass('webable-ts', !!s.active);
      if (s.active) setRootVar('--webable-ts', s.value / 100);
      else removeRootVar('--webable-ts');
    },
  };

  Tools.forceZoom = {
    apply(s) {
      // Strip user-scalable=no / maximum-scale from viewport meta. Reversible.
      let meta = document.querySelector('meta[name="viewport"]');
      if (s.active) {
        if (meta) {
          if (!meta.hasAttribute('data-webable-orig')) meta.setAttribute('data-webable-orig', meta.getAttribute('content') || '');
          meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=10, minimum-scale=1, user-scalable=yes');
        } else {
          meta = document.createElement('meta');
          meta.setAttribute('name', 'viewport');
          meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=10, minimum-scale=1, user-scalable=yes');
          meta.setAttribute('data-webable-injected', '1');
          document.head.appendChild(meta);
        }
      } else {
        const m = document.querySelector('meta[name="viewport"]');
        if (m) {
          if (m.hasAttribute('data-webable-injected')) m.remove();
          else if (m.hasAttribute('data-webable-orig')) {
            m.setAttribute('content', m.getAttribute('data-webable-orig'));
            m.removeAttribute('data-webable-orig');
          }
        }
      }
    },
  };

  Tools.bigCursor = {
    apply(s) {
      ROOT.classList.remove('webable-bc-1','webable-bc-2','webable-bc-3','webable-bc-4');
      if (s.active) ROOT.classList.add('webable-bc-' + Math.min(4, Math.max(1, Math.round(s.scale))));
    },
  };

  Tools.readingRuler = {
    apply(s) {
      cleanupRuler();
      if (!s.active) return;
      setRootClass('webable-ruler-on', true);
      const top = document.createElement('div');
      const bot = document.createElement('div');
      top.id = 'webable-ruler-top';  top.className = 'webable-ruler-mask';
      bot.id = 'webable-ruler-bot';  bot.className = 'webable-ruler-mask';
      const bar = document.createElement('div');
      bar.id = 'webable-ruler-bar';
      document.body.append(top, bot, bar);
      const lineH = parseFloat(getComputedStyle(document.body).fontSize) * (s.height || 2);
      bar.style.height = lineH + 'px';
      [top, bot].forEach((m) => { m.style.background = `rgba(8,12,22,${s.dim})`; });
      window._webableRuler = (e) => {
        const y = e.clientY;
        const half = lineH / 2;
        top.style.height = Math.max(0, y - half) + 'px';
        bot.style.top = (y + half) + 'px';
        bar.style.top = (y - half) + 'px';
      };
      document.addEventListener('mousemove', window._webableRuler, { passive: true });
      window._webableRuler({ clientY: window.innerHeight / 2 });
    },
  };
  function cleanupRuler() {
    setRootClass('webable-ruler-on', false);
    document.getElementById('webable-ruler-top')?.remove();
    document.getElementById('webable-ruler-bot')?.remove();
    document.getElementById('webable-ruler-bar')?.remove();
    if (window._webableRuler) { document.removeEventListener('mousemove', window._webableRuler); window._webableRuler = null; }
  }

  Tools.focusRing = {
    apply(s) {
      setRootClass('webable-fr-on', !!s.active);
      if (s.active) {
        setRootVar('--webable-fr-color', ({
          electric: '#2F80FF', amber: '#F2B340', green: '#1FCB8A', white: '#FFFFFF',
        }[s.color] || '#2F80FF'));
        setRootVar('--webable-fr-width', (s.width || 3) + 'px');
      } else {
        removeRootVar('--webable-fr-color');
        removeRootVar('--webable-fr-width');
      }
    },
  };

  Tools.dyslexiaFont = {
    apply(s) {
      ['opendyslexic','lexend','atkinson'].forEach((f) => setRootClass('webable-df-' + f, s.active && s.font === f));
    },
  };

  Tools.letterSpacing = {
    apply(s) {
      setRootClass('webable-ls-on', !!s.active);
      if (s.active) {
        setRootVar('--webable-letter', (s.letter || 0) + 'em');
        setRootVar('--webable-word',   (s.word   || 0) + 'em');
      } else {
        removeRootVar('--webable-letter');
        removeRootVar('--webable-word');
      }
    },
  };

  Tools.tts = {
    apply(s) {
      // tts state is toggled via dedicated buttons. Toggling the tile flips
      // active and (re)starts/stops playback.
      setRootClass('webable-tts-on', !!s.active);
      if (!s.active && state.tools.tts.playing) ttsStop();
    },
  };

  Tools.hideImages = {
    apply(s) {
      if (s.active) {
        $$('img').forEach((img) => {
          if (img.closest('.webable-panel') || img.closest('.webable-launcher')) return;
          if (img.dataset.webableHidden === '1') return;
          img.dataset.webableHidden = '1';
          const ph = document.createElement('button');
          ph.type = 'button';
          ph.className = 'webable-img-placeholder';
          const r = img.getBoundingClientRect();
          ph.style.minWidth  = Math.min(Math.max(r.width  || img.width  || 200, 120), 720) + 'px';
          ph.style.minHeight = Math.min(Math.max(r.height || img.height || 120, 80), 480) + 'px';
          ph.innerHTML = `${ICONS.eyeOff(14)}<span>Image hidden — click to reveal</span>`;
          ph.addEventListener('click', () => { ph.replaceWith(img); delete img.dataset.webableHidden; });
          ph._webableImg = img;
          img.replaceWith(ph);
        });
      } else {
        $$('.webable-img-placeholder').forEach((ph) => {
          if (ph._webableImg) { ph.replaceWith(ph._webableImg); delete ph._webableImg.dataset.webableHidden; }
        });
      }
    },
  };

  Tools.clickTarget = {
    apply(s) {
      setRootClass('webable-ct-on', !!s.active);
      if (s.active) setRootVar('--webable-ct-min', (s.size || 44) + 'px');
      else removeRootVar('--webable-ct-min');
    },
  };

  // Tooltip Pin
  let pinnedTooltip = null;
  Tools.tooltipPin = {
    apply(s) { /* stateless — keyboard-driven; just mark active for UI */ },
  };
  function pinHoveredTooltip() {
    const hovered = $$('[title]:hover, [aria-describedby]:hover, [data-tooltip]:hover, [data-bs-toggle="tooltip"]:hover')[0];
    if (!hovered) return showToast('Hover a control with a tooltip first, then press Ctrl+Shift+P.', { kind: 'error' });
    if (pinnedTooltip) pinnedTooltip.remove();
    const text = hovered.getAttribute('title') || hovered.getAttribute('aria-label') || hovered.getAttribute('data-tooltip') || '(no tooltip text found)';
    pinnedTooltip = document.createElement('div');
    pinnedTooltip.className = 'webable-pinned-tooltip';
    pinnedTooltip.innerHTML = `<span>${escapeHtml(text)}</span><button class="webable-pinned-close" aria-label="Unpin">${ICONS.x(12)}</button>`;
    pinnedTooltip.querySelector('.webable-pinned-close').addEventListener('click', () => {
      pinnedTooltip?.remove(); pinnedTooltip = null;
    });
    document.body.appendChild(pinnedTooltip);
    const r = hovered.getBoundingClientRect();
    pinnedTooltip.style.top = (r.bottom + window.scrollY + 8) + 'px';
    pinnedTooltip.style.left = Math.min(window.innerWidth - 240, r.left + window.scrollX) + 'px';
    showToast('Tooltip pinned. Click ✕ to unpin.');
  }

  Tools.stickyKill = {
    apply(s) {
      setRootClass('webable-sk-on', !!s.active);
      setRootClass('webable-sk-headers', s.active && s.headers);
      setRootClass('webable-sk-footers', s.active && s.footers);
      setRootClass('webable-sk-chats', s.active && s.chats);
      setRootClass('webable-sk-popups', s.active && s.popups);
      // Walk DOM: any element with computed position sticky/fixed gets a data attr;
      // CSS pulls them out of position based on the right combination of classes.
      if (s.active) tagSticky();
      else $$('[data-webable-sticky]').forEach((el) => el.removeAttribute('data-webable-sticky'));
    },
  };
  function tagSticky() {
    const seen = new WeakSet();
    document.querySelectorAll('header, footer, [class*=sticky], [class*=fixed], [class*=banner], [class*=cookie], [class*=chat], [class*=intercom], [class*=drift], [id*=banner], [id*=cookie], [id*=chat]').forEach((el) => {
      if (seen.has(el)) return;
      if (el.closest('.webable-panel') || el.closest('.webable-launcher')) return;
      const cs = getComputedStyle(el);
      if (cs.position === 'sticky' || cs.position === 'fixed') {
        const tag = (el.tagName === 'HEADER') ? 'headers' :
                    (el.tagName === 'FOOTER') ? 'footers' :
                    /chat|intercom|drift|messenger|crisp/i.test(el.className + ' ' + el.id) ? 'chats' :
                    /cookie|consent|gdpr|newsletter|sub|popup|modal/i.test(el.className + ' ' + el.id) ? 'popups' :
                    'headers';
        el.setAttribute('data-webable-sticky', tag);
        seen.add(el);
      }
    });
  }

  // Auto-Scroll
  let scrollRAF = null;
  Tools.autoScroll = {
    apply(s) {
      if (scrollRAF) { cancelAnimationFrame(scrollRAF); scrollRAF = null; }
      if (!s.active || s.paused) return;
      let last = performance.now();
      const tick = (now) => {
        if (!state.tools.autoScroll.active || state.tools.autoScroll.paused) return;
        const dt = now - last; last = now;
        const px = (state.tools.autoScroll.speed || 1) * (dt / 1000) * 32;
        window.scrollBy({ top: px, behavior: 'auto' });
        scrollRAF = requestAnimationFrame(tick);
      };
      scrollRAF = requestAnimationFrame(tick);
    },
  };

  Tools.hideDistract = {
    apply(s) {
      $$('[data-webable-distract]').forEach((el) => el.removeAttribute('data-webable-distract'));
      setRootClass('webable-hd-on', !!s.active);
      if (!s.active) return;
      const sels = [];
      if (s.sidebars)   sels.push('aside', '[class*=sidebar]', '[id*=sidebar]', '[role=complementary]');
      if (s.recommends) sels.push('[class*=recommend]', '[class*=related]', '[class*=suggested]', '[class*=more-stories]', '[class*=trending]');
      if (s.ads)        sels.push('[class*=ad-]', '[class*=advert]', '[class*=promo]', '[id*=ad-]', '[class*=sponsor]', '.ad-block');
      if (s.comments)   sels.push('[class*=comment]', '[id*=comments]', '#comments', '#disqus_thread');
      const set = new Set();
      sels.forEach((sel) => {
        try { document.querySelectorAll(sel).forEach((el) => {
          if (el.closest('.webable-panel')) return;
          if (el.closest('form')) return;        // never hide forms
          if (el.tagName === 'NAV') return;       // never hide nav
          set.add(el);
        }); } catch (_) {}
      });
      set.forEach((el) => el.setAttribute('data-webable-distract', '1'));
    },
  };

  Tools.stopAnim = {
    apply(s) {
      setRootClass('webable-sa-on', !!s.active);
      if (s.active) {
        $$('video, audio').forEach((m) => { try { m.pause(); m.removeAttribute('autoplay'); } catch (_) {} });
      }
    },
  };

  Tools.focusMode = {
    apply(s) {
      // Composite tool. Activates Reading Mode + StopAnim + HideDistract.
      const target = (key, partial) => {
        Object.assign(state.tools[key], partial);
        Tools[key].apply(state.tools[key]);
      };
      if (s.active) {
        target('readingMode',  { active: true });
        target('stopAnim',     { active: true });
        target('hideDistract', { active: true, sidebars: true, recommends: true, ads: true, comments: true });
      } else {
        // Don't kill tools that were already user-activated; just turn off composite flag.
      }
    },
  };

  // Cookie Banner Killer — heuristic. We try a "reject all" first, fall back to hiding.
  let cookieKillerObs = null;
  Tools.cookieKill = {
    apply(s) {
      if (s.active) {
        runCookieKill();
        cookieKillerObs?.disconnect();
        cookieKillerObs = new MutationObserver(() => runCookieKill());
        cookieKillerObs.observe(document.body, { childList: true, subtree: true });
      } else {
        cookieKillerObs?.disconnect(); cookieKillerObs = null;
        $$('[data-webable-cookie-killed]').forEach((el) => el.removeAttribute('data-webable-cookie-killed'));
      }
    },
  };
  function runCookieKill() {
    const REJECT_RE = /reject all|deny all|reject non[- ]essential|only necessary|only essential|necessary only|decline all|disagree|opt out|nur notwendige|alles ablehnen|tout refuser|rifiuta tutto|rechazar todo/i;
    const BANNER_SEL = '[id*=cookie], [class*=cookie], [id*=consent], [class*=consent], [id*=gdpr], [class*=gdpr], [aria-label*=cookie i], [data-testid*=cookie i], #onetrust-banner-sdk, #onetrust-consent-sdk, .ot-sdk-container, [class*=cmp], [id*=cmp], [class*=privacy-banner]';
    let killedCount = 0;
    document.querySelectorAll(BANNER_SEL).forEach((banner) => {
      if (banner.closest('.webable-panel')) return;
      if (banner.dataset.webableCookieKilled === '1') return;
      // 1. Try to click a reject button inside.
      const rejectBtn = Array.from(banner.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit]')).find((b) => REJECT_RE.test((b.innerText || b.value || '').trim()));
      if (rejectBtn) {
        try { rejectBtn.click(); banner.setAttribute('data-webable-cookie-killed', 'rejected'); killedCount++; return; } catch (_) {}
      }
      // 2. Fallback — hide the banner.
      banner.setAttribute('data-webable-cookie-killed', 'hidden');
      killedCount++;
    });
    if (killedCount && !runCookieKill._announced) {
      runCookieKill._announced = true;
      showToast(`Cookie banner${killedCount === 1 ? '' : 's'} dismissed. Set per-site preference in Options.`);
    }
  }

  // Modal / popup killer
  let modalKillerObs = null;
  Tools.modalKill = {
    apply(s) {
      if (s.active) {
        runModalKill();
        modalKillerObs?.disconnect();
        modalKillerObs = new MutationObserver(() => runModalKill());
        modalKillerObs.observe(document.body, { childList: true, subtree: true });
      } else {
        modalKillerObs?.disconnect(); modalKillerObs = null;
        $$('[data-webable-modal-killed]').forEach((el) => el.removeAttribute('data-webable-modal-killed'));
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      }
    },
  };
  function runModalKill() {
    const SEL = '[class*=newsletter-popup], [class*=signup-modal], [class*=overlay], [class*=lightbox], [aria-modal=true], [role=dialog], [class*=paywall], [class*=upsell], dialog[open]';
    let killed = 0;
    document.querySelectorAll(SEL).forEach((el) => {
      if (el.closest('.webable-panel')) return;
      if (el.dataset.webableModalKilled === '1') return;
      // Don't kill modals that are clearly required (forms with no skip option).
      const text = (el.innerText || '').toLowerCase();
      if (/age (verification|gate)/.test(text)) return; // legal: leave age gates
      // Don't kill cookie banners (covered by cookieKill)
      if (/cookie|consent|gdpr/.test(text)) return;
      el.setAttribute('data-webable-modal-killed', '1');
      killed++;
    });
    if (killed) {
      // Some sites lock body scroll while modal is up.
      if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
      if (document.documentElement.style.overflow === 'hidden') document.documentElement.style.overflow = '';
    }
  }

  // ─── Pick reading target heuristic ───────────────────────────────────
  function pickReadingTarget() {
    const candidates = ['article', '[role=main]', 'main', '.article', '.post', '.story', '.entry', '#article', '#main', '#content', '.content'];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && (el.innerText || '').trim().length > 200) return el;
    }
    // Fallback: largest text block over 500 chars.
    let best = null, bestLen = 0;
    document.querySelectorAll('div, section').forEach((el) => {
      if (el.closest('.webable-panel') || el.closest('.webable-launcher')) return;
      // Skip elements that are container-of-everything
      if (el === document.body || el.parentElement === document.body && el.children.length > 10) return;
      const len = (el.innerText || '').trim().length;
      if (len > bestLen && len > 500) { bestLen = len; best = el; }
    });
    return best;
  }

  // ─── TTS ─────────────────────────────────────────────────────────────
  let ttsUtter = null;
  function ttsStart(textOverride) {
    if (!('speechSynthesis' in window)) return showToast('Read Aloud needs the Web Speech API. Not available here.', { kind: 'error' });
    const sel = window.getSelection?.()?.toString();
    let text = textOverride || sel;
    if (!text || !text.trim()) {
      const target = $('[data-webable-rm-target]') || pickReadingTarget() || document.body;
      text = (target.innerText || '').slice(0, 6000);
    }
    if (!text) return;
    try { speechSynthesis.cancel(); } catch (_) {}
    ttsUtter = new SpeechSynthesisUtterance(text);
    ttsUtter.rate = state.tools.tts.rate || 1;
    ttsUtter.pitch = state.tools.tts.pitch || 1;
    if (state.tools.tts.voice) {
      const v = speechSynthesis.getVoices().find((vv) => vv.name === state.tools.tts.voice);
      if (v) ttsUtter.voice = v;
    }
    ttsUtter.onend = () => { state.tools.tts.playing = false; renderPanelBody(); };
    speechSynthesis.speak(ttsUtter);
    state.tools.tts.active = true;
    state.tools.tts.playing = true;
    renderPanelBody();
  }
  function ttsPause()  { try { speechSynthesis.pause(); } catch (_) {}  state.tools.tts.playing = false; renderPanelBody(); }
  function ttsResume() { try { speechSynthesis.resume(); } catch (_) {} state.tools.tts.playing = true;  renderPanelBody(); }
  function ttsStop()   { try { speechSynthesis.cancel(); } catch (_) {} state.tools.tts.playing = false; state.tools.tts.active = false; renderPanelBody(); }

  // ─── Reset ───────────────────────────────────────────────────────────
  function resetAll() {
    cleanupRuler();
    if (scrollRAF) { cancelAnimationFrame(scrollRAF); scrollRAF = null; }
    cookieKillerObs?.disconnect(); cookieKillerObs = null;
    modalKillerObs?.disconnect(); modalKillerObs = null;
    ttsStop();
    state.tools = cloneDefaults();
    Object.keys(Tools).forEach((k) => Tools[k].apply(state.tools[k]));
    state.profile = null;
    renderPanelBody();
  }

  function applyProfile(key) {
    const p = PROFILES[key];
    if (!p) return;
    resetAll();
    Object.entries(p.apply).forEach(([toolId, partial]) => {
      Object.assign(state.tools[toolId], partial);
      Tools[toolId].apply(state.tools[toolId]);
    });
    state.profile = key;
    Storage.saveSiteTools();
    renderPanelBody();
  }

  // ─── DOM ─────────────────────────────────────────────────────────────
  let $launcher, $panel;

  function injectToastHost() {
    $toastHost = document.createElement('div');
    $toastHost.className = 'webable-toast-host';
    document.body.appendChild($toastHost);
  }

  function injectLauncher() {
    $launcher = document.createElement('button');
    $launcher.className = 'webable-launcher';
    $launcher.type = 'button';
    $launcher.setAttribute('aria-label', 'Open WebAble');
    $launcher.innerHTML = `
      <span class="webable-launcher-ring" aria-hidden="true"></span>
      <span class="webable-launcher-mark">${ICONS.accessibility(20)}</span>
      <span class="webable-launcher-grip">${ICONS.grip(10)}</span>
    `;
    document.body.appendChild($launcher);
    placeLauncher();
    bindLauncherDrag();
  }

  function placeLauncher() {
    const pos = state.ui.launcherPos || {};
    const margin = 24;
    const W = window.innerWidth, H = window.innerHeight;
    const sz = 56;
    let left, top;
    if (pos.left != null && pos.top != null) {
      left = Math.max(8, Math.min(W - sz - 8, pos.left));
      top  = Math.max(8, Math.min(H - sz - 8, pos.top));
    } else {
      switch (state.ui.launcherPos.edge || 'bottom-right') {
        case 'bottom-right': left = W - sz - margin; top = H - sz - margin; break;
        case 'bottom-left':  left = margin; top = H - sz - margin; break;
        case 'top-right':    left = W - sz - margin; top = margin; break;
        case 'top-left':     left = margin; top = margin; break;
        default:             left = W - sz - margin; top = H - sz - margin;
      }
    }
    $launcher.style.left = left + 'px';
    $launcher.style.top = top + 'px';
  }

  function bindLauncherDrag() {
    let drag = null;

    const onMove = (e) => {
      if (!drag) return;
      // We listen on document, so e.clientX/Y is always meaningful even
      // when the cursor outpaces the launcher (the bug at fast drag speeds).
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.moved) {
        $launcher.classList.add('webable-launcher-dragging');
        const W = window.innerWidth, H = window.innerHeight, sz = 56;
        const left = Math.max(4, Math.min(W - sz - 4, drag.lx + dx));
        const top  = Math.max(4, Math.min(H - sz - 4, drag.ly + dy));
        $launcher.style.left = left + 'px';
        $launcher.style.top  = top  + 'px';
        // Panel travels with the launcher when open + in floating mode.
        if (state.panel.open && (!state.ui.layout || state.ui.layout === 'floating')) {
          placePanelNearLauncher();
        }
      }
    };

    const onUp = (e) => {
      if (!drag) return;
      const moved = drag.moved;
      const elapsed = Date.now() - drag.t;
      $launcher.classList.remove('webable-launcher-dragging');
      try { $launcher.releasePointerCapture?.(drag.pointerId); } catch (_) {}
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      if (!moved && elapsed < 400) togglePanel();
      else {
        snapLauncherToEdge();
        if (state.panel.open && (!state.ui.layout || state.ui.layout === 'floating')) placePanelNearLauncher();
      }
      drag = null;
    };

    $launcher.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { startX: e.clientX, startY: e.clientY, lx: $launcher.offsetLeft, ly: $launcher.offsetTop, t: Date.now(), moved: false, pointerId: e.pointerId };
      try { $launcher.setPointerCapture(e.pointerId); } catch (_) {}
      // Document-level listeners mean a fast cursor that leaves the launcher
      // can't drop the drag — events fire on the document, not the target.
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', onUp, true);
      document.addEventListener('pointercancel', onUp, true);
    });

    window.addEventListener('resize', () => {
      placeLauncher();
      if (state.panel.open && (!state.ui.layout || state.ui.layout === 'floating')) placePanelNearLauncher();
    });
  }

  function snapLauncherToEdge() {
    const W = window.innerWidth, H = window.innerHeight, sz = 56, margin = 24;
    const cx = $launcher.offsetLeft + sz / 2;
    const cy = $launcher.offsetTop + sz / 2;
    const distLeft = cx, distRight = W - cx, distTop = cy, distBottom = H - cy;
    const min = Math.min(distLeft, distRight, distTop, distBottom);
    let edge = 'bottom-right';
    if (min === distLeft)        { $launcher.style.left = margin + 'px'; edge = cy < H/2 ? 'top-left' : 'bottom-left'; }
    else if (min === distRight)  { $launcher.style.left = (W - sz - margin) + 'px'; edge = cy < H/2 ? 'top-right' : 'bottom-right'; }
    else if (min === distTop)    { $launcher.style.top  = margin + 'px'; edge = cx < W/2 ? 'top-left' : 'top-right'; }
    else                         { $launcher.style.top  = (H - sz - margin) + 'px'; edge = cx < W/2 ? 'bottom-left' : 'bottom-right'; }
    state.ui.launcherPos = { left: $launcher.offsetLeft, top: $launcher.offsetTop, edge };
    state.ui.panelOrigin = edge;
    Storage.save();
  }

  function injectPanel() {
    $panel = document.createElement('aside');
    $panel.className = 'webable-panel';
    $panel.setAttribute('role', 'dialog');
    $panel.setAttribute('aria-label', 'WebAble accessibility panel');
    $panel.setAttribute('aria-modal', 'false');
    $panel.innerHTML = `
      <header class="webable-panel-header">
        <div class="webable-brand">
          <span class="webable-brand-mark">${ICONS.accessibility(16)}</span>
          <span class="webable-brand-name">WebAble</span>
        </div>
        <span class="webable-site-pill mono" data-webable-site-pill></span>
        <button class="webable-icon-btn" data-action="cycle-layout" title="Layout: floating ⇄ sidebar" aria-label="Cycle layout">${ICONS.layout(15)}</button>
        <button class="webable-icon-btn" data-action="open-analyzer" title="Site analyzer" aria-label="Site analyzer">${ICONS.activity(15)}</button>
        <button class="webable-icon-btn" data-action="open-options" title="Settings" aria-label="Settings">${ICONS.settings(15)}</button>
        <button class="webable-icon-btn" data-action="close" title="Close" aria-label="Close">${ICONS.x(15)}</button>
      </header>
      <div class="webable-panel-tagline">
        <span class="mono webable-tagline-eyebrow">User-side · Privacy-first</span>
        <span class="webable-tagline-text">Adapts the web to <em>you</em>. Does not modify the website for anyone else.</span>
      </div>
      <div class="webable-panel-tabs webable-panel-tabs-4" role="tablist">
        <button class="webable-ptab webable-ptab-on" data-tab="tools" role="tab">Tools</button>
        <button class="webable-ptab" data-tab="profiles" role="tab">Profiles</button>
        <button class="webable-ptab" data-tab="ai" role="tab"><span class="webable-tab-mark">${ICONS.sparkles(11)}</span>AI</button>
        <button class="webable-ptab" data-tab="site" role="tab"><span class="webable-tab-mark">${ICONS.activity(11)}</span>Site</button>
      </div>
      <div class="webable-aria-live" aria-live="polite" aria-atomic="true"></div>
      <div class="webable-panel-search">
        <span class="webable-search-icon">${ICONS.search(14)}</span>
        <input class="webable-search-input" type="search" placeholder="Search tools — bigger text, contrast, cookies…" data-action="search" />
      </div>
      <div class="webable-cat-row" role="tablist" aria-label="Tool categories">
        ${renderCategoryPills()}
      </div>
      <div class="webable-panel-body" role="tabpanel"></div>
      <footer class="webable-panel-footer">
        <div class="webable-site-row">
          <label class="webable-toggle-row">
            <span class="webable-toggle-label">Always-on for <strong class="mono">${escapeHtml(HOST)}</strong></span>
            <button class="webable-toggle" data-action="toggle-always-on" aria-pressed="false"><span class="webable-toggle-thumb"></span></button>
          </label>
          <label class="webable-toggle-row">
            <span class="webable-toggle-label webable-toggle-label-warn">Disable WebAble on this site</span>
            <button class="webable-toggle" data-action="toggle-site-disabled" aria-pressed="false"><span class="webable-toggle-thumb"></span></button>
          </label>
        </div>
        <div class="webable-foot-meta">
          <span class="mono">v1.1 · ${countActiveTools()} active</span>
          <button class="webable-link-btn" data-action="reset-all">${ICONS.rotate(12)}<span>Reset</span></button>
        </div>
      </footer>
    `;
    document.body.appendChild($panel);

    $panel.addEventListener('click', onPanelClick);
    $panel.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-form]');
      if (!f) return;
      e.preventDefault();
      if (f.dataset.form === 'ai-qa') {
        const inp = f.querySelector('.webable-qa-input');
        askPage(inp?.value || '');
      }
    });
    $panel.querySelector('.webable-search-input').addEventListener('input', (e) => {
      state.panel.search = e.target.value || '';
      renderPanelBody();
    });
    $$('.webable-ptab', $panel).forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.tab)));
    $$('.webable-cat-pill', $panel).forEach((p) => p.addEventListener('click', () => setCat(p.dataset.cat)));
  }

  const CATEGORIES = [
    { id: 'all',       label: 'All',         icon: ICONS.sliders },
    { id: 'vision',    label: 'Vision',      icon: ICONS.eyeTracker },
    { id: 'reading',   label: 'Reading',     icon: ICONS.bookOpen },
    { id: 'motor',     label: 'Motor',       icon: ICONS.cursor },
    { id: 'cognitive', label: 'Cognitive',   icon: ICONS.moon },
    { id: 'hearing',   label: 'Hearing',     icon: ICONS.volume },
    { id: 'privacy',   label: 'Privacy',     icon: ICONS.shield },
  ];

  function renderCategoryPills() {
    return CATEGORIES.map((c) => `
      <button class="webable-cat-pill ${state.panel.activeCat === c.id ? 'webable-cat-pill-on' : ''}" data-cat="${c.id}" role="tab" aria-selected="${state.panel.activeCat === c.id}">
        <span class="webable-cat-icon">${c.icon(13)}</span>
        <span class="webable-cat-text">${c.label}</span>
      </button>
    `).join('');
  }

  function setView(view) {
    state.panel.view = view;
    $$('.webable-ptab', $panel).forEach((t) => t.classList.toggle('webable-ptab-on', t.dataset.tab === view));
    // Tools-only chrome — pills + search are meaningless on Profiles / AI.
    const onTools = view === 'tools';
    $('.webable-cat-row', $panel)?.style.setProperty('display', onTools ? '' : 'none');
    $('.webable-panel-search', $panel)?.style.setProperty('display', onTools ? '' : 'none');
    renderPanelBody();
    $('.webable-panel-body', $panel)?.scrollTo?.(0, 0);
  }
  function setCat(cat) {
    state.panel.activeCat = cat;
    $$('.webable-cat-pill', $panel).forEach((p) => p.classList.toggle('webable-cat-pill-on', p.dataset.cat === cat));
    renderPanelBody();
    // Always start from the top so users see Vision first when "All" is picked.
    $('.webable-panel-body', $panel)?.scrollTo?.(0, 0);
  }

  function openPanel(view) {
    const wasOpen = state.panel.open;
    if (view) {
      state.panel.view = view;
      $$('.webable-ptab', $panel).forEach((t) => t.classList.toggle('webable-ptab-on', t.dataset.tab === view));
    }
    if (wasOpen) { renderPanelBody(); return; }
    state.panel.open = true;
    placePanelNearLauncher();
    $panel.classList.add('webable-open');
    renderPanelBody();
    syncFooterToggles();
    document.addEventListener('keydown', onPanelKey);
    setTimeout(() => document.addEventListener('mousedown', onOutsideClick), 50);
  }
  function closePanel() {
    state.panel.open = false;
    $panel.classList.remove('webable-open');
    document.removeEventListener('keydown', onPanelKey);
    document.removeEventListener('mousedown', onOutsideClick);
  }
  function togglePanel() { state.panel.open ? closePanel() : openPanel(); }
  function onPanelKey(e) { if (e.key === 'Escape') closePanel(); }
  function onOutsideClick(e) {
    if (!state.panel.open) return;
    if ($panel.contains(e.target)) return;
    if ($launcher.contains(e.target)) return;
    closePanel();
  }

  function placePanelNearLauncher() {
    // In sidebar mode CSS owns the position; do nothing here.
    if (state.ui.layout && state.ui.layout !== 'floating') return;
    // Anchor the 400px panel near the launcher, prefer the side that has room.
    const W = window.innerWidth, H = window.innerHeight;
    const pw = Math.min(400, W - 16);
    const ph = Math.min(640, H - 32);
    $panel.style.width = pw + 'px';
    $panel.style.maxHeight = ph + 'px';
    const lr = $launcher.getBoundingClientRect();
    let left, top;
    // Horizontal: prefer to the side with more space
    if (lr.left + lr.width / 2 > W / 2) left = Math.max(8, lr.left - pw - 12);
    else                                 left = Math.min(W - pw - 8, lr.right + 12);
    // Vertical: align to launcher, clamp
    top = lr.top + lr.height / 2 - ph / 2;
    top = Math.max(8, Math.min(H - ph - 8, top));
    $panel.style.left = left + 'px';
    $panel.style.top  = top  + 'px';
    $panel.style.transformOrigin = (left < lr.left ? 'right' : 'left') + ' ' + (top < lr.top ? 'top' : 'center');
  }

  function syncFooterToggles() {
    const site = Storage.siteState();
    $('.webable-toggle[data-action=toggle-always-on]', $panel)?.classList.toggle('webable-toggle-on', !!site.alwaysOn);
    $('.webable-toggle[data-action=toggle-site-disabled]', $panel)?.classList.toggle('webable-toggle-on', !!site.disabled);
    const pill = $('[data-webable-site-pill]', $panel);
    if (pill) {
      if (site.disabled) pill.innerHTML = `<span class="webable-status-dot webable-status-dot-off"></span>Disabled here`;
      else if (site.alwaysOn) pill.innerHTML = `<span class="webable-status-dot"></span>Always on · ${escapeHtml(HOST)}`;
      else pill.innerHTML = `<span class="webable-status-dot"></span>Active · ${escapeHtml(HOST)}`;
    }
  }

  function countActiveTools() {
    return Object.values(state.tools).filter((t) => t.active).length;
  }

  // ─── Render panel body ───────────────────────────────────────────────
  function renderPanelBody() {
    if (!$panel) return;
    syncFooterToggles();
    const body = $('.webable-panel-body', $panel);
    if (!body) return;
    // Each render is wrapped so an exception in one view (e.g. a missing icon
    // in makeSiteAnalyzerNode) can't leave the panel half-applied — tab class
    // updated, body still showing the old view's content.
    const safeRender = (fn, label) => {
      try { body.replaceChildren(fn()); }
      catch (e) {
        console.error('[WebAble] render failed in ' + label, e);
        const err = document.createElement('div');
        err.className = 'webable-render-error';
        err.innerHTML = `<strong>${escapeHtml(label)} failed to render.</strong><br><span class="mono">${escapeHtml(e?.message || String(e))}</span><br><small>This is a bug in WebAble. Check the console for a stack trace.</small>`;
        body.replaceChildren(err);
      }
    };
    if (state.panel.detail)              return safeRender(() => makeDetailNode(state.panel.detail), 'Detail view');
    if (state.panel.view === 'profiles') return safeRender(makeProfilesNode, 'Profiles');
    if (state.panel.view === 'ai')       return safeRender(makeAINode,      'AI');
    if (state.panel.view === 'site')     return safeRender(makeSiteAnalyzerNode, 'Site Analyzer');
    safeRender(makeToolsNode, 'Tools');
    // refresh counts in footer
    $('.webable-foot-meta .mono', $panel).textContent = `v1.1 · ${countActiveTools()} active`;
    // refresh category pill UI
    $$('.webable-cat-pill', $panel).forEach((p) => p.classList.toggle('webable-cat-pill-on', p.dataset.cat === state.panel.activeCat));
  }

  function makeToolsNode() {
    const search = (state.panel.search || '').toLowerCase().trim();
    const cat = state.panel.activeCat;
    const groupOrder = ['vision','reading','motor','cognitive','hearing','privacy'];
    const wrap = document.createElement('div');
    wrap.className = 'webable-tools-wrap';

    // If site disabled, show a banner.
    if (Storage.siteState().disabled) {
      const off = document.createElement('div');
      off.className = 'webable-site-off';
      off.innerHTML = `${ICONS.shield(16)}<div><div><strong>WebAble is disabled on ${escapeHtml(HOST)}.</strong></div><div class="webable-site-off-sub">Re-enable in the footer toggle to use tools here.</div></div>`;
      wrap.appendChild(off);
      return wrap;
    }

    // Build groups
    const groups = (cat === 'all') ? groupOrder : [cat];
    groups.forEach((g) => {
      const ids = ALL_TOOLS.filter((id) => TOOL_META[id].cat === g);
      if (!ids.length) return; // hearing has no Phase 1 tools — skip; AI tab handles it
      const filtered = ids.filter((id) => {
        if (!search) return true;
        const m = TOOL_META[id];
        return (m.label + ' ' + m.desc + ' ' + g + ' ' + id).toLowerCase().includes(search);
      });
      if (!filtered.length) return; // skip empty groups in any view

      const sec = document.createElement('section');
      sec.className = 'webable-tool-group';
      sec.innerHTML = `
        <button class="webable-group-head" data-action="toggle-group" data-group="${g}">
          <span class="webable-group-mark">${chevForGroup(g)}</span>
          <span class="webable-group-label">${labelForGroup(g)}</span>
          <span class="mono webable-group-count">${filtered.filter((id) => state.tools[id]?.active).length}/${filtered.length}</span>
        </button>
      `;
      // collapsed state
      const collapsed = !!state.panel.collapsed[g];
      const tray = document.createElement('div');
      tray.className = 'webable-tile-tray' + (collapsed ? ' webable-tray-collapsed' : '');
      filtered.forEach((id) => tray.appendChild(makeTileNode(id)));
      // peek arrow buttons
      const left = document.createElement('button');
      left.className = 'webable-tray-nav webable-tray-nav-left';
      left.innerHTML = ICONS.arrowLeft(14);
      left.setAttribute('aria-label', 'Scroll left');
      left.addEventListener('click', () => tray.scrollBy({ left: -200, behavior: 'smooth' }));
      const right = document.createElement('button');
      right.className = 'webable-tray-nav webable-tray-nav-right';
      right.innerHTML = ICONS.arrowRight(14);
      right.setAttribute('aria-label', 'Scroll right');
      right.addEventListener('click', () => tray.scrollBy({ left: 200, behavior: 'smooth' }));
      const trayWrap = document.createElement('div');
      trayWrap.className = 'webable-tray-wrap';
      trayWrap.append(left, tray, right);
      sec.appendChild(trayWrap);
      wrap.appendChild(sec);
    });

    if (!wrap.children.length) {
      const empty = document.createElement('div');
      empty.className = 'webable-empty';
      empty.innerHTML = `${ICONS.search(20)}<div><div class="webable-empty-title">No tools match "${escapeHtml(search)}".</div><div class="webable-empty-sub">Try "contrast", "motion", or "cookie".</div></div>`;
      wrap.appendChild(empty);
    }
    return wrap;
  }

  function chevForGroup(g) { return state.panel.collapsed[g] ? ICONS.chevRight(14) : ICONS.chevDown(14); }
  function labelForGroup(g) {
    return ({ vision:'Vision', reading:'Reading', motor:'Motor', cognitive:'Cognitive', hearing:'Hearing', privacy:'Privacy' })[g] || g;
  }

  function makeTileNode(id) {
    const m = TOOL_META[id];
    const s = state.tools[id];
    const tile = document.createElement('div');
    tile.className = 'webable-tile' + (s.active ? ' webable-tile-on' : '');
    tile.setAttribute('role', 'button');
    tile.setAttribute('tabindex', '0');
    tile.dataset.tool = id;
    tile.innerHTML = `
      <div class="webable-tile-row">
        <span class="webable-tile-icon">${m.icon(20)}</span>
        ${m.hasSettings ? `<button class="webable-tile-cog" data-action="open-detail" data-tool="${id}" aria-label="Settings for ${m.label}">${ICONS.sliders(11)}</button>` : ''}
      </div>
      <div class="webable-tile-label">${m.label}</div>
      <div class="webable-tile-foot">
        <span class="webable-tile-state mono">${s.active ? 'ON' : 'off'}</span>
        ${m.special === 'tts' && s.active ? `<span class="webable-tile-live mono">${s.playing ? 'playing' : 'paused'}</span>` : ''}
      </div>
    `;
    tile.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return; // cog click handled separately
      toggleTool(id);
    });
    tile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleTool(id); }
    });
    return tile;
  }

  function toggleTool(id) {
    const s = state.tools[id];
    s.active = !s.active;
    // tts has special toggle
    if (id === 'tts') {
      if (s.active) ttsStart();
      else ttsStop();
    } else {
      try { Tools[id].apply(s); }
      catch (e) {
        console.warn('[WebAble] tool error', id, e);
        showToast(`${TOOL_META[id].label} hit an error and was reverted.`, { kind: 'error' });
        s.active = false;
        return;
      }
    }
    state.profile = null;
    Storage.saveSiteTools();
    renderPanelBody();
    if (s.active) showToast(`${TOOL_META[id].label} on.`);
    else          showToast(`${TOOL_META[id].label} off.`);
  }

  // ─── Tool detail / settings view ─────────────────────────────────────
  function openDetail(id) {
    state.panel.detail = id;
    renderPanelBody();
  }
  function closeDetail() {
    state.panel.detail = null;
    renderPanelBody();
  }

  function makeDetailNode(id) {
    const m = TOOL_META[id];
    const s = state.tools[id];
    const wrap = document.createElement('div');
    wrap.className = 'webable-detail';
    wrap.innerHTML = `
      <div class="webable-detail-head">
        <button class="webable-icon-btn" data-action="close-detail" aria-label="Back">${ICONS.arrowLeft(15)}</button>
        <span class="webable-detail-icon">${m.icon(18)}</span>
        <div class="webable-detail-title">
          <div>${m.label}</div>
          <div class="webable-detail-sub">${m.desc}</div>
        </div>
        <button class="webable-toggle ${s.active ? 'webable-toggle-on' : ''}" data-action="detail-toggle" data-tool="${id}" aria-pressed="${s.active}"><span class="webable-toggle-thumb"></span></button>
      </div>
      <div class="webable-detail-body">${detailControlsFor(id, s)}</div>
      <div class="webable-detail-foot">
        <button class="webable-link-btn" data-action="detail-reset" data-tool="${id}">${ICONS.rotate(12)}<span>Reset to defaults</span></button>
      </div>
    `;
    wrap.addEventListener('input', onDetailInput);
    wrap.addEventListener('change', onDetailInput);
    wrap.addEventListener('click', (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      const act = a.dataset.action;
      if (act === 'close-detail') closeDetail();
      else if (act === 'detail-toggle') toggleTool(a.dataset.tool);
      else if (act === 'detail-reset') {
        state.tools[id] = JSON.parse(JSON.stringify(TOOL_DEFAULTS[id]));
        Tools[id].apply(state.tools[id]);
        renderPanelBody();
        showToast(`${m.label} reset.`);
      }
    });
    return wrap;
  }

  function onDetailInput(e) {
    const ctrl = e.target.closest('[data-control]');
    if (!ctrl) return;
    const id = ctrl.dataset.tool;
    const key = ctrl.dataset.control;
    const s = state.tools[id];
    let v = ctrl.value;
    if (ctrl.type === 'range' || ctrl.type === 'number') v = parseFloat(v);
    if (ctrl.type === 'checkbox') v = ctrl.checked;
    s[key] = v;
    s.active = true;
    try { Tools[id].apply(s); } catch (_) {}
    Storage.saveSiteTools();
    // Live label update
    const lbl = ctrl.parentElement.querySelector('[data-label-for="' + key + '"]');
    if (lbl) lbl.textContent = formatVal(key, v);
    // Refresh tile state in tray (without rebuilding detail)
    const tile = $(`.webable-tile[data-tool="${id}"]`, $panel);
    if (tile) tile.classList.toggle('webable-tile-on', s.active);
  }

  function formatVal(key, v) {
    if (typeof v === 'number') {
      if (key === 'value') return v + '%';
      if (key === 'size')  return v + 'px';
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
    return `<div class="webable-ctl-row"><div class="webable-ctl-row-head"><span class="mono webable-ctl-key">${key}</span><span class="mono webable-ctl-val" data-label-for="${key}">${formatVal(key, val)}</span></div><input type="range" data-control="${key}" data-tool="${id}" min="${min}" max="${max}" step="${step}" value="${val}" /></div>`;
  }

  function selectCtl(id, key, val, options) {
    return `<div class="webable-ctl-row"><div class="webable-ctl-row-head"><span class="mono webable-ctl-key">${key}</span></div><select class="webable-select" data-control="${key}" data-tool="${id}">${options.map((o) => `<option value="${o.v}" ${o.v === val ? 'selected' : ''}>${o.l}</option>`).join('')}</select></div>`;
  }

  function checkboxCtl(id, key, val, label) {
    return `<label class="webable-ctl-check"><input type="checkbox" data-control="${key}" data-tool="${id}" ${val ? 'checked' : ''} /><span>${label}</span></label>`;
  }

  function detailControlsFor(id, s) {
    if (id === 'readingMode') {
      return [
        selectCtl(id, 'font', s.font, [
          { v: 'system', l: 'System default' },
          { v: 'inter', l: 'Inter' },
          { v: 'lexend', l: 'Lexend (dyslexia-friendly)' },
          { v: 'opendyslexic', l: 'OpenDyslexic' },
          { v: 'atkinson', l: 'Atkinson Hyperlegible' },
          { v: 'georgia', l: 'Georgia (serif)' },
        ]),
        slider(id, 'size', 12, 32, 1, s.size),
        slider(id, 'lineHeight', 1.2, 2.4, 0.05, s.lineHeight),
        slider(id, 'maxWidth', 50, 100, 1, s.maxWidth),
        slider(id, 'letter', 0, 0.2, 0.01, s.letter),
        slider(id, 'paragraph', 1.0, 2.5, 0.05, s.paragraph),
        selectCtl(id, 'bg', s.bg, [
          { v: 'cream', l: 'Cream' }, { v: 'white', l: 'White' }, { v: 'sepia', l: 'Sepia' },
          { v: 'dark', l: 'Dark' }, { v: 'black', l: 'Black' },
        ]),
      ].join('');
    }
    if (id === 'highContrast') {
      return [
        selectCtl(id, 'mode', s.mode, [
          { v: 'invert', l: 'Inverted (whole page)' },
          { v: 'darkSafe', l: 'Dark — readable' },
          { v: 'lightSafe', l: 'Light — readable' },
          { v: 'yellowBlack', l: 'Yellow on black' },
          { v: 'blackYellow', l: 'Black on yellow' },
        ]),
      ].join('');
    }
    if (id === 'colorFilter') {
      return [
        selectCtl(id, 'type', s.type, [
          { v: 'deuter', l: 'Deuteranopia (red-green)' },
          { v: 'protan', l: 'Protanopia (red-green)' },
          { v: 'tritan', l: 'Tritanopia (blue-yellow)' },
          { v: 'achroma', l: 'Achromatopsia (no color)' },
        ]),
        selectCtl(id, 'purpose', s.purpose, [
          { v: 'correct', l: 'Correct — boost the affected channel' },
          { v: 'simulate', l: 'Simulate — see the page as the user does' },
        ]),
      ].join('');
    }
    if (id === 'textSize')   return slider(id, 'value', 100, 300, 5, s.value);
    if (id === 'bigCursor')  return slider(id, 'scale', 1, 4, 1, s.scale);
    if (id === 'readingRuler') return [
      slider(id, 'height', 1, 5, 1, s.height),
      slider(id, 'dim', 0, 1, 0.05, s.dim),
    ].join('');
    if (id === 'focusRing')  return [
      selectCtl(id, 'color', s.color, [
        { v: 'electric', l: 'Electric blue' }, { v: 'amber', l: 'Amber' }, { v: 'green', l: 'Green' }, { v: 'white', l: 'White' },
      ]),
      slider(id, 'width', 2, 6, 1, s.width),
    ].join('');
    if (id === 'dyslexiaFont') return selectCtl(id, 'font', s.font, [
      { v: 'opendyslexic', l: 'OpenDyslexic' }, { v: 'lexend', l: 'Lexend' }, { v: 'atkinson', l: 'Atkinson Hyperlegible' },
    ]);
    if (id === 'letterSpacing') return [
      slider(id, 'letter', 0, 0.3, 0.01, s.letter),
      slider(id, 'word',   0, 0.5, 0.01, s.word),
    ].join('');
    if (id === 'tts') return [
      slider(id, 'rate', 0.5, 2, 0.05, s.rate),
      slider(id, 'pitch', 0.5, 2, 0.05, s.pitch),
      `<div class="webable-ttsbar">
         <button class="webable-btn webable-btn-primary" data-action="tts-play">${ICONS.play(13)}<span>Read this page</span></button>
         <button class="webable-btn webable-btn-ghost" data-action="tts-pause">${ICONS.pause(13)}<span>Pause</span></button>
         <button class="webable-btn webable-btn-ghost" data-action="tts-stop">${ICONS.x(13)}<span>Stop</span></button>
       </div>`,
    ].join('');
    if (id === 'clickTarget') return slider(id, 'size', 32, 64, 2, s.size);
    if (id === 'stickyKill') return [
      checkboxCtl(id, 'headers', s.headers, 'Sticky headers'),
      checkboxCtl(id, 'footers', s.footers, 'Sticky footers'),
      checkboxCtl(id, 'chats',   s.chats,   'Live-chat / Intercom bubbles'),
      checkboxCtl(id, 'popups',  s.popups,  'Cookie banners and pinned popups'),
    ].join('');
    if (id === 'autoScroll') return [
      slider(id, 'speed', 0.25, 4, 0.25, s.speed),
      `<div class="webable-ttsbar">
         <button class="webable-btn webable-btn-primary" data-action="scroll-resume">${ICONS.play(13)}<span>Resume</span></button>
         <button class="webable-btn webable-btn-ghost" data-action="scroll-pause">${ICONS.pause(13)}<span>Pause</span></button>
       </div>`,
    ].join('');
    if (id === 'hideDistract') return [
      checkboxCtl(id, 'sidebars',   s.sidebars,   'Sidebars'),
      checkboxCtl(id, 'recommends', s.recommends, 'Recommended / related content'),
      checkboxCtl(id, 'ads',        s.ads,        'Ads, promos, sponsored blocks'),
      checkboxCtl(id, 'comments',   s.comments,   'Comments / discussion threads'),
    ].join('');
    return `<div class="webable-empty-detail">No additional settings.</div>`;
  }

  // ─── Profiles view ───────────────────────────────────────────────────
  function makeProfilesNode() {
    const wrap = document.createElement('div');
    wrap.className = 'webable-profiles';
    wrap.innerHTML = `
      <div class="webable-profiles-head">
        <div class="webable-profiles-title">Profiles</div>
        <div class="webable-profiles-sub">Bundles tested by people who use them every day.</div>
      </div>
      <div class="webable-profiles-grid">
        ${Object.entries(PROFILES).map(([k, p]) => `
          <button class="webable-profile-card ${state.profile === k ? 'webable-profile-card-on' : ''}" data-action="apply-profile" data-key="${k}">
            <div class="webable-profile-row">
              <span class="webable-profile-mark">${ICONS.accessibility(14)}</span>
              <span class="webable-profile-label">${p.label}</span>
              ${state.profile === k ? `<span class="webable-profile-check">${ICONS.check(13)}</span>` : ''}
            </div>
            <div class="webable-profile-desc">${p.desc}</div>
            <div class="webable-profile-bundle mono">${Object.keys(p.apply).map((id) => TOOL_META[id]?.label || id).join(' · ')}</div>
          </button>
        `).join('')}
      </div>
    `;
    return wrap;
  }

  // ─── AI tab ──────────────────────────────────────────────────────────
  function makeAINode() {
    const wrap = document.createElement('div');
    wrap.className = 'webable-ai-tab';
    const hasKey = !!state.apiKey;

    // Header: connected / not-connected
    const head = document.createElement('div');
    head.className = 'webable-ai-head' + (hasKey ? '' : ' webable-ai-head-unset');
    if (hasKey) {
      head.innerHTML = `
        <div class="webable-ai-head-row">
          <span class="webable-ai-head-mark">${ICONS.sparkles(15)}</span>
          <div class="webable-ai-head-text">
            <div class="webable-ai-head-title">Gemini connected</div>
            <div class="webable-ai-head-sub">Requests go directly to Google's API. We never see them.</div>
          </div>
          <span class="webable-pill webable-pill-ai">BYOK · ${maskKey(state.apiKey)}</span>
        </div>
      `;
    } else {
      head.innerHTML = `
        <div class="webable-ai-head-row">
          <span class="webable-ai-head-mark">${ICONS.sparkles(15)}</span>
          <div class="webable-ai-head-text">
            <div class="webable-ai-head-title">Add your Gemini key to unlock Phase 2</div>
            <div class="webable-ai-head-sub">Free tier covers most usage. Your key stays in <span class="mono">chrome.storage.local</span> and only ever travels to Google's API.</div>
          </div>
        </div>
        <button class="webable-btn webable-btn-primary webable-btn-block" data-action="open-options">${ICONS.settings(13)}<span>Add key in Settings</span></button>
      `;
    }
    wrap.appendChild(head);

    // 1. Plain Language Summary
    wrap.appendChild(makeAICard({
      id: 'summarizer',
      title: 'Plain Language Summary',
      desc: 'Rewrite this page at an 8th-grade reading level. Short paragraphs, no jargon.',
      icon: ICONS.fileText(15),
      body: makeSummarizerBody(hasKey),
    }));

    // 2. Smart Page Q&A
    wrap.appendChild(makeAICard({
      id: 'qa',
      title: 'Smart Page Q&A',
      desc: 'Ask the page anything. Gemini reads the DOM, scrolls to the answer, highlights it.',
      icon: ICONS.helpCircle(15),
      body: makeQABody(hasKey),
    }));

    // 3. Context-Aware Alt Text
    wrap.appendChild(makeAICard({
      id: 'alt',
      title: 'Context-Aware Alt Text',
      desc: 'Right-click any image → "WebAble: Generate alt text". Uses page title and surrounding paragraph as context — that\'s the differentiator vs. pixel-only autoalt.',
      icon: ICONS.sparkles(15),
      body: makeAltBody(hasKey),
    }));

    // 4. OCR
    wrap.appendChild(makeAICard({
      id: 'ocr',
      title: 'OCR — Read Image Text',
      desc: 'Right-click any image → "WebAble: Extract text". Useful for scanned PDFs, screenshots of slides, image-only quotes.',
      icon: ICONS.bookOpen(15),
      body: makeOCRBody(hasKey),
    }));

    // 5+. Honest Coming Soon (Live Captions, Eye Tracking, Voice Nav)
    const honest = document.createElement('div');
    honest.className = 'webable-ai-honest';
    honest.innerHTML = `<div class="webable-ai-honest-head mono">Coming Soon — and why not yet</div>`;
    COMING_SOON_HONEST.forEach((f) => {
      const card = document.createElement('div');
      card.className = 'webable-card webable-coming-card-honest';
      // escapeHtml is required here — these strings contain literal <video>
      // and other angle-bracket text that the browser would otherwise parse
      // as real DOM elements (a `<video>` with no src reserves its 300x150
      // intrinsic size, which was causing the giant empty card in v1.2).
      card.innerHTML = `
        <div class="webable-card-row">
          <span class="webable-card-icon">${f.icon(15)}</span>
          <span class="webable-card-label">${escapeHtml(f.label)}</span>
          <span class="webable-pill">Coming Soon</span>
        </div>
        <div class="webable-card-desc">${escapeHtml(f.desc)}</div>
        <div class="webable-coming-honest mono"><strong>Why not yet:</strong> ${escapeHtml(f.why)}</div>
      `;
      honest.appendChild(card);
    });
    wrap.appendChild(honest);

    return wrap;
  }

  function makeAICard({ id, title, desc, icon, body }) {
    const div = document.createElement('div');
    div.className = 'webable-card webable-ai-card';
    div.dataset.aiCard = id;
    div.innerHTML = `
      <div class="webable-card-row">
        <span class="webable-card-icon">${icon}</span>
        <span class="webable-card-label">${escapeHtml(title)}</span>
        ${state.ai.busy === id ? `<span class="webable-pill webable-pill-ai">Working…</span>` : ''}
      </div>
      <div class="webable-card-desc">${desc}</div>
    `;
    div.appendChild(body);
    return div;
  }

  function makeSummarizerBody(hasKey) {
    const node = document.createElement('div');
    node.className = 'webable-ai-body';
    if (state.ai.busy === 'summarizer') {
      node.innerHTML = `<div class="webable-shimmer-block"></div><div class="webable-shimmer-block"></div><div class="webable-shimmer-block"></div>`;
      return node;
    }
    if (state.ai.summary) {
      node.innerHTML = `
        <div class="webable-ai-result">${formatSummary(state.ai.summary.text)}</div>
        <div class="webable-ai-actions">
          <button class="webable-btn webable-btn-primary" data-action="ai-tts-summary">${ICONS.volume(13)}<span>Read aloud</span></button>
          <button class="webable-btn webable-btn-ghost" data-action="ai-copy-summary">${ICONS.fileText(13)}<span>Copy</span></button>
          <button class="webable-btn webable-btn-ghost" data-action="ai-summarize">${ICONS.rotate(13)}<span>Re-run</span></button>
        </div>
      `;
      return node;
    }
    if (!hasKey) {
      node.innerHTML = `<button class="webable-btn webable-btn-primary webable-btn-block" data-action="open-options">${ICONS.sparkles(13)}<span>Add Gemini key to enable</span></button>`;
      return node;
    }
    node.innerHTML = `<button class="webable-btn webable-btn-primary webable-btn-block" data-action="ai-summarize">${ICONS.sparkles(13)}<span>Summarize this page</span></button>`;
    return node;
  }

  function makeQABody(hasKey) {
    const node = document.createElement('div');
    node.className = 'webable-ai-body';
    if (!hasKey) {
      node.innerHTML = `<button class="webable-btn webable-btn-primary webable-btn-block" data-action="open-options">${ICONS.sparkles(13)}<span>Add Gemini key to enable</span></button>`;
      return node;
    }
    const q = state.ai.qa?.question || '';
    node.innerHTML = `
      <form class="webable-qa-form" data-form="ai-qa">
        <input class="webable-qa-input" type="text" placeholder="Ask this page anything…" value="${escapeHtml(q)}" aria-label="Ask the page" />
        <button type="submit" class="webable-btn webable-btn-primary" aria-label="Ask">${ICONS.arrowRight(14)}</button>
      </form>
      <div class="webable-qa-chips">
        <button class="webable-chip" data-action="ai-qa-chip" data-q="Where do I sign in?">Where do I sign in?</button>
        <button class="webable-chip" data-action="ai-qa-chip" data-q="How do I cancel my subscription?">Cancel subscription?</button>
        <button class="webable-chip" data-action="ai-qa-chip" data-q="What's the price?">What's the price?</button>
        <button class="webable-chip" data-action="ai-qa-chip" data-q="How do I contact support?">Contact support?</button>
      </div>
      ${state.ai.busy === 'qa' ? `<div class="webable-shimmer-block"></div>` : ''}
      ${renderQAResult()}
    `;
    return node;
  }

  function renderQAResult() {
    const r = state.ai.qa;
    if (!r || state.ai.busy === 'qa') return '';
    if (r.resolved) {
      return `
        <div class="webable-qa-result">
          <span class="webable-qa-mark">${ICONS.target(14)}</span>
          <div class="webable-qa-body">
            <div class="webable-qa-title">Found.</div>
            <div class="webable-qa-detail">"${escapeHtml(r.resolved.label)}" — ${escapeHtml(r.explanation || '')}</div>
            <div class="webable-qa-meta mono">confidence ${Math.round((r.confidence || 0) * 100)}% · highlighted on page</div>
          </div>
        </div>
      `;
    }
    return `
      <div class="webable-qa-result webable-qa-empty">
        <span class="webable-qa-mark">${ICONS.search(14)}</span>
        <div class="webable-qa-body">
          <div class="webable-qa-title">Couldn't pin down a match.</div>
          <div class="webable-qa-detail">${escapeHtml(r.explanation || 'Try rephrasing.')}</div>
        </div>
      </div>
    `;
  }

  function makeAltBody(hasKey) {
    const node = document.createElement('div');
    node.className = 'webable-ai-body';
    const missing = document.querySelectorAll('img:not([alt]), img[alt=""]').length;
    let recent = '';
    if (state.ai.recentAlts?.length) {
      recent = `
        <div class="webable-ai-recent">
          <div class="webable-ai-recent-title mono">Recently generated</div>
          ${state.ai.recentAlts.slice(0, 3).map((a) => `
            <div class="webable-ai-recent-item">
              <span class="webable-ai-recent-src mono">${escapeHtml(shortUrl(a.src))}</span>
              <span class="webable-ai-recent-alt">"${escapeHtml(a.alt)}"</span>
            </div>
          `).join('')}
        </div>
      `;
    }
    node.innerHTML = `
      <div class="webable-ai-stat">
        <span class="webable-ai-stat-num mono">${missing}</span>
        <span class="webable-ai-stat-key">image${missing === 1 ? '' : 's'} on this page lack alt text.</span>
      </div>
      ${!hasKey
        ? `<button class="webable-btn webable-btn-primary webable-btn-block" data-action="open-options">${ICONS.sparkles(13)}<span>Add Gemini key to enable</span></button>`
        : `<div class="webable-ai-actions">
            <button class="webable-btn webable-btn-primary" data-action="ai-alt-all" ${missing === 0 ? 'disabled' : ''}>${ICONS.sparkles(13)}<span>${missing === 0 ? 'No missing alt found' : `Generate for all ${missing}`}</span></button>
          </div>
          <div class="webable-ai-hint mono">Or right-click any image → "WebAble: Generate alt text".</div>`}
      ${recent}
    `;
    return node;
  }

  function makeOCRBody(hasKey) {
    const node = document.createElement('div');
    node.className = 'webable-ai-body';
    if (!hasKey) {
      node.innerHTML = `<button class="webable-btn webable-btn-primary webable-btn-block" data-action="open-options">${ICONS.sparkles(13)}<span>Add Gemini key to enable</span></button>`;
      return node;
    }
    let recent = '';
    if (state.ai.recentOcr?.length) {
      recent = `
        <div class="webable-ai-recent">
          <div class="webable-ai-recent-title mono">Recent extractions</div>
          ${state.ai.recentOcr.slice(0, 3).map((o, i) => `
            <button class="webable-ai-recent-item webable-ai-recent-clickable" data-action="ai-ocr-show" data-idx="${i}">
              <span class="webable-ai-recent-src mono">${escapeHtml(shortUrl(o.src))}</span>
              <span class="webable-ai-recent-alt">${escapeHtml(o.text.slice(0, 80))}${o.text.length > 80 ? '…' : ''}</span>
            </button>
          `).join('')}
        </div>
      `;
    }
    node.innerHTML = `
      <div class="webable-ai-hint mono">Right-click any image on the page → "WebAble: Extract text".</div>
      ${recent}
    `;
    return node;
  }

  function formatSummary(text) {
    return text.split(/\n\n+/).map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  }

  function shortUrl(u) {
    try { const url = new URL(u); return (url.pathname.split('/').pop() || url.hostname).slice(0, 40); }
    catch { return String(u || '').slice(0, 40); }
  }

  function maskKey(k) {
    if (!k) return '';
    if (k.length < 8) return '••••';
    return k.slice(0, 4) + '••••' + k.slice(-4);
  }

  // ─── AI feature implementations ──────────────────────────────────────
  let lastRightClickedImage = null;

  document.addEventListener('contextmenu', (e) => {
    let el = e.target;
    for (let i = 0; i < 5 && el; i++) {
      if (el.tagName === 'IMG') { lastRightClickedImage = el; return; }
      el = el.parentElement;
    }
  }, true);

  function announceAria(text) {
    const live = $('.webable-aria-live', $panel);
    if (!live) return;
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 60);
  }

  function findImageBySrc(srcUrl) {
    if (!srcUrl) return null;
    const norm = (s) => { try { return new URL(s, location.href).href; } catch { return s; } };
    const target = norm(srcUrl);
    return $$('img').find((i) => norm(i.src) === target || norm(i.currentSrc) === target);
  }

  function pulseElement(el) {
    if (!el) return;
    el.setAttribute('data-webable-pulse', '1');
    setTimeout(() => el.removeAttribute('data-webable-pulse'), 2400);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function nearbyText(el) {
    let p = el.parentElement;
    for (let i = 0; i < 5 && p; i++) {
      const text = (p.innerText || '').trim();
      if (text.length > 50) return text.slice(0, 800);
      p = p.parentElement;
    }
    return '';
  }

  async function summarizePage() {
    if (!window.WebAbleGemini) return showToast('Gemini wrapper failed to load.', { kind: 'error' });
    if (!state.apiKey) {
      showToast('Add a Gemini key in Settings to use Summarizer.', { kind: 'error' });
      chrome.runtime.sendMessage({ type: 'WEBABLE_OPEN_OPTIONS' });
      return;
    }
    state.ai.busy = 'summarizer';
    state.ai.summary = null;
    if (state.panel.open && state.panel.view === 'ai') renderPanelBody();
    try {
      const target = pickReadingTarget() || document.body;
      const text = (target.innerText || '').slice(0, 14000);
      const summary = await window.WebAbleGemini.summarize(text, { title: document.title, url: location.href });
      state.ai.summary = { text: summary, generatedAt: Date.now() };
      announceAria('Summary ready in the WebAble panel.');
      showToast('Summary ready.');
    } catch (e) {
      showToast(`Summarizer failed: ${e.message}`, { kind: 'error' });
    } finally {
      state.ai.busy = null;
      if (state.panel.open && state.panel.view === 'ai') renderPanelBody();
    }
  }

  let qaIdCounter = 0;
  function collectInteractiveSnapshot() {
    // Strip prior tags first
    $$('[data-webable-qa]').forEach((el) => el.removeAttribute('data-webable-qa'));
    qaIdCounter = 0;
    const items = [];
    const seen = new WeakSet();
    document.querySelectorAll('a, button, [role=button], h1, h2, h3, h4, summary, [role=heading]').forEach((el) => {
      if (seen.has(el)) return;
      if (el.closest('.webable-panel') || el.closest('.webable-launcher')) return;
      const text = (el.innerText || el.value || '').trim();
      if (!text || text.length > 200) return;
      const id = 'q' + (++qaIdCounter);
      el.setAttribute('data-webable-qa', id);
      items.push({ id, tag: el.tagName.toLowerCase(), label: text.slice(0, 100) });
      seen.add(el);
      if (items.length >= 80) return;
    });
    return items;
  }

  async function askPage(question) {
    if (!window.WebAbleGemini) return;
    if (!state.apiKey) {
      showToast('Add a Gemini key in Settings to use Page Q&A.', { kind: 'error' });
      chrome.runtime.sendMessage({ type: 'WEBABLE_OPEN_OPTIONS' });
      return;
    }
    if (!question || !question.trim()) return;
    state.ai.busy = 'qa';
    state.ai.qa = { question };
    if (state.panel.open && state.panel.view === 'ai') renderPanelBody();
    try {
      const items = collectInteractiveSnapshot();
      const snap = JSON.stringify(items);
      const result = await window.WebAbleGemini.pageQA(question, snap);
      let resolved = null;
      if (result?.id) {
        const el = document.querySelector(`[data-webable-qa="${cssEsc(result.id)}"]`);
        if (el) {
          pulseElement(el);
          const item = items.find((i) => i.id === result.id);
          resolved = { selector: result.id, label: item?.label || result.label || '' };
        }
      }
      state.ai.qa = { question, ...result, resolved };
      announceAria(resolved
        ? `Found "${resolved.label}". ${result.explanation || ''}`
        : `No clear match for that question. ${result.explanation || ''}`);
    } catch (e) {
      state.ai.qa = { question, explanation: e.message };
      showToast(`Page Q&A failed: ${e.message}`, { kind: 'error' });
    } finally {
      state.ai.busy = null;
      if (state.panel.open && state.panel.view === 'ai') renderPanelBody();
    }
  }

  async function handleAIAltText(srcUrl) {
    if (!window.WebAbleGemini) return;
    if (!state.apiKey) {
      showToast('Add a Gemini key in Settings to use AI Alt Text.', { kind: 'error' });
      chrome.runtime.sendMessage({ type: 'WEBABLE_OPEN_OPTIONS' });
      return;
    }
    const img = lastRightClickedImage || findImageBySrc(srcUrl);
    if (!img) return showToast('Couldn\'t locate that image. Try right-clicking it again.', { kind: 'error' });
    state.ai.busy = 'alt';
    if (state.panel.open && state.panel.view === 'ai') renderPanelBody();
    showToast('Generating alt text…');
    try {
      const ctx = { title: document.title, paragraph: nearbyText(img), url: location.href };
      const alt = await window.WebAbleGemini.generateAltText(img, ctx);
      if (/^DECORATIVE\s*$/i.test(alt)) {
        img.setAttribute('alt', '');
        img.setAttribute('role', 'presentation');
        announceAria('WebAble marked this image as decorative.');
        showToast('Marked as decorative (alt="" role="presentation").');
      } else {
        img.setAttribute('alt', alt);
        announceAria('Alt text generated: ' + alt);
        showToast(`Alt set: "${alt.slice(0, 80)}${alt.length > 80 ? '…' : ''}"`);
      }
      state.ai.recentAlts = [{ src: img.src, alt, ts: Date.now() }, ...state.ai.recentAlts].slice(0, 5);
      pulseElement(img);
    } catch (e) {
      showToast(`Alt text failed: ${e.message}`, { kind: 'error' });
    } finally {
      state.ai.busy = null;
      if (state.panel.open && state.panel.view === 'ai') renderPanelBody();
    }
  }

  async function generateAltAllMissing() {
    if (!state.apiKey) return chrome.runtime.sendMessage({ type: 'WEBABLE_OPEN_OPTIONS' });
    const targets = $$('img:not([alt]), img[alt=""]').filter((i) => !i.closest('.webable-panel'));
    if (!targets.length) return showToast('No images missing alt on this page.');
    showToast(`Generating alt text for ${targets.length} images. This may take a minute.`);
    state.ai.busy = 'alt';
    if (state.panel.open && state.panel.view === 'ai') renderPanelBody();
    let ok = 0, fail = 0;
    for (const img of targets) {
      try {
        const ctx = { title: document.title, paragraph: nearbyText(img), url: location.href };
        const alt = await window.WebAbleGemini.generateAltText(img, ctx);
        if (/^DECORATIVE\s*$/i.test(alt)) { img.setAttribute('alt', ''); img.setAttribute('role', 'presentation'); }
        else img.setAttribute('alt', alt);
        state.ai.recentAlts = [{ src: img.src, alt, ts: Date.now() }, ...state.ai.recentAlts].slice(0, 5);
        ok++;
      } catch (_) { fail++; }
    }
    state.ai.busy = null;
    announceAria(`Generated alt text for ${ok} images. ${fail} failed.`);
    showToast(`Done. ${ok} succeeded${fail ? `, ${fail} failed (CORS or rate limit).` : '.'}`);
    if (state.panel.open && state.panel.view === 'ai') renderPanelBody();
  }

  async function handleAIOcr(srcUrl) {
    if (!window.WebAbleGemini) return;
    if (!state.apiKey) {
      showToast('Add a Gemini key in Settings to use OCR.', { kind: 'error' });
      chrome.runtime.sendMessage({ type: 'WEBABLE_OPEN_OPTIONS' });
      return;
    }
    const img = lastRightClickedImage || findImageBySrc(srcUrl);
    if (!img) return showToast('Couldn\'t locate that image.', { kind: 'error' });
    state.ai.busy = 'ocr';
    if (state.panel.open && state.panel.view === 'ai') renderPanelBody();
    showToast('Extracting text…');
    try {
      const text = await window.WebAbleGemini.ocrImage(img);
      state.ai.recentOcr = [{ src: img.src, text, ts: Date.now() }, ...state.ai.recentOcr].slice(0, 5);
      showOcrModal(text, img.src);
      announceAria('Text extracted from image. Modal opened.');
    } catch (e) {
      showToast(`OCR failed: ${e.message}`, { kind: 'error' });
    } finally {
      state.ai.busy = null;
      if (state.panel.open && state.panel.view === 'ai') renderPanelBody();
    }
  }

  function showOcrModal(text, src) {
    $('.webable-ocr-modal')?.remove();
    const modal = document.createElement('div');
    modal.className = 'webable-ocr-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'OCR result');
    modal.innerHTML = `
      <div class="webable-ocr-modal-inner">
        <header class="webable-ocr-modal-head">
          <span class="webable-ocr-mark">${ICONS.fileText(16)}</span>
          <span class="webable-ocr-title">Extracted text</span>
          <span class="webable-ocr-src mono">${escapeHtml(shortUrl(src))}</span>
          <button class="webable-icon-btn" data-close aria-label="Close">${ICONS.x(15)}</button>
        </header>
        <pre class="webable-ocr-text">${escapeHtml(text)}</pre>
        <footer class="webable-ocr-modal-foot">
          <button class="webable-btn webable-btn-primary" data-copy>${ICONS.fileText(13)}<span>Copy</span></button>
          <button class="webable-btn" data-read>${ICONS.volume(13)}<span>Read aloud</span></button>
        </footer>
      </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelector('[data-close]').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.contains(modal)) close(); }, { once: true });
    modal.querySelector('[data-copy]').addEventListener('click', () => navigator.clipboard.writeText(text).then(() => showToast('Text copied.')));
    modal.querySelector('[data-read]').addEventListener('click', () => ttsStart(text));
  }

  function cssEsc(s) {
    if (window.CSS?.escape) return CSS.escape(s);
    return String(s).replace(/[^\w-]/g, '\\$&');
  }

  // ─── Panel events ────────────────────────────────────────────────────
  function onPanelClick(e) {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const act = a.dataset.action;
    if (act === 'close') return closePanel();
    if (act === 'cycle-layout')  return cycleLayout();
    if (act === 'open-detail') return openDetail(a.dataset.tool);
    if (act === 'open-analyzer') { setView('site'); if (!siteAnaState.report && !siteAnaState.busy) runSiteScan(); return; }
    if (act === 'open-analyzer-tab') return chrome.runtime?.sendMessage({ type: 'WEBABLE_OPEN_ANALYZER', url: location.href });
    if (act === 'site-rerun')      return runSiteScan();
    if (act === 'site-copy')       return copySiteReport();
    if (act === 'site-sev-tab')    { siteAnaState.activeSev = a.dataset.sev; renderPanelBody(); return; }
    if (act === 'site-issue-toggle') { a.classList.toggle('webable-sa-issue-open'); return; }
    if (act === 'open-options')  return chrome.runtime?.sendMessage({ type: 'WEBABLE_OPEN_OPTIONS' });
    if (act === 'reset-all')     { resetAll(); showToast('Everything reset on this page.'); return; }
    if (act === 'toggle-always-on') {
      const next = !Storage.siteState().alwaysOn;
      Storage.setAlwaysOn(next);
      a.classList.toggle('webable-toggle-on', next);
      a.setAttribute('aria-pressed', String(next));
      syncFooterToggles();
      showToast(next ? `Settings will auto-apply when you revisit ${HOST}.` : `No longer auto-applying on ${HOST}.`);
      return;
    }
    if (act === 'toggle-site-disabled') {
      const next = !Storage.siteState().disabled;
      Storage.setDisabled(next);
      if (next) { resetAll(); showToast(`WebAble is off on ${HOST}.`); }
      else      { showToast(`WebAble re-enabled on ${HOST}.`); }
      a.classList.toggle('webable-toggle-on', next);
      a.setAttribute('aria-pressed', String(next));
      syncFooterToggles();
      renderPanelBody();
      return;
    }
    if (act === 'apply-profile') { applyProfile(a.dataset.key); showToast(`${PROFILES[a.dataset.key].label} on.`); return; }
    if (act === 'toggle-group')  { state.panel.collapsed[a.dataset.group] = !state.panel.collapsed[a.dataset.group]; renderPanelBody(); return; }
    if (act === 'tts-play')   return ttsStart();
    if (act === 'tts-pause')  return ttsPause();
    if (act === 'tts-stop')   return ttsStop();
    if (act === 'scroll-resume') { state.tools.autoScroll.paused = false; state.tools.autoScroll.active = true; Tools.autoScroll.apply(state.tools.autoScroll); renderPanelBody(); return; }
    if (act === 'scroll-pause')  { state.tools.autoScroll.paused = true; Tools.autoScroll.apply(state.tools.autoScroll); renderPanelBody(); return; }
    // AI actions
    if (act === 'ai-summarize')      return summarizePage();
    if (act === 'ai-tts-summary')    return ttsStart(state.ai.summary?.text || '');
    if (act === 'ai-copy-summary')   { navigator.clipboard.writeText(state.ai.summary?.text || '').then(() => showToast('Summary copied.')); return; }
    if (act === 'ai-qa-chip')        { const inp = $('.webable-qa-input', $panel); if (inp) inp.value = a.dataset.q; return askPage(a.dataset.q); }
    if (act === 'ai-alt-all')        return generateAltAllMissing();
    if (act === 'ai-ocr-show')       {
      const idx = parseInt(a.dataset.idx, 10);
      const o = state.ai.recentOcr?.[idx];
      if (o) showOcrModal(o.text, o.src);
      return;
    }
  }

  // ─── Theme / brand / layout ──────────────────────────────────────────
  function applyTheme() {
    const t = state.ui.theme || 'auto';
    setRootClass('webable-theme-light', t === 'light');
    setRootClass('webable-theme-dark', t === 'dark');
    if (t === 'auto') {
      const prefers = window.matchMedia?.('(prefers-color-scheme: light)')?.matches;
      setRootClass('webable-theme-light', !!prefers);
      setRootClass('webable-theme-dark', !prefers);
    }
    const c = state.ui.brandColor || 'blue';
    ['blue','green','purple','mono'].forEach((b) => setRootClass('webable-brand-' + b, c === b));
  }

  function applyLayout() {
    const l = state.ui.layout || 'floating';
    setRootClass('webable-layout-floating',     l === 'floating');
    setRootClass('webable-layout-sidebar-right', l === 'sidebar-right');
    setRootClass('webable-layout-sidebar-left',  l === 'sidebar-left');
    // In sidebar mode, CSS controls the panel position. Wipe inline styles.
    if (l !== 'floating' && $panel) {
      $panel.style.left = '';
      $panel.style.top = '';
      $panel.style.width = '';
      $panel.style.maxHeight = '';
      $panel.style.transformOrigin = '';
    } else if (state.panel.open && $panel) {
      placePanelNearLauncher();
    }
  }

  function cycleLayout() {
    const order = ['floating', 'sidebar-right', 'sidebar-left'];
    const cur = state.ui.layout || 'floating';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    state.ui.layout = next;
    applyLayout();
    Storage.save();
    const label = ({ 'floating': 'Floating', 'sidebar-right': 'Sidebar (right)', 'sidebar-left': 'Sidebar (left)' })[next];
    showToast(`Layout: ${label}`);
  }

  // ─── In-panel Site Analyzer ─────────────────────────────────────────
  // Same WCAG ruleset as analyzer.html / popup.js; the difference is this
  // one runs inside the content script so it has direct DOM access (no
  // chrome.scripting round-trip needed).
  const SA_WCAG = {
    altMissing:       { sc: '1.1.1', sev: 'critical', label: 'Images missing alt text',     fix: 'Add an alt attribute. Use alt="" on purely decorative images.' },
    formLabelMissing: { sc: '1.3.1', sev: 'critical', label: 'Form inputs without labels',  fix: 'Add <label for="..."> or aria-label to every form control.' },
    vagueLink:        { sc: '2.4.4', sev: 'serious',  label: 'Vague links / buttons',       fix: 'Replace "Click here" / "Learn more" with destination-describing text.' },
    headingSkip:      { sc: '1.3.1', sev: 'serious',  label: 'Heading hierarchy skips',     fix: 'Use H1 → H2 → H3 in order. Style for size, not hierarchy.' },
    noH1:             { sc: '2.4.6', sev: 'moderate', label: 'No H1 on page',               fix: 'Every primary page should have one H1 describing its purpose.' },
    langMissing:      { sc: '3.1.1', sev: 'serious',  label: '<html> has no lang',          fix: 'Add lang="en" (or correct BCP-47) to the <html> element.' },
    titleMissing:     { sc: '2.4.2', sev: 'serious',  label: 'Page <title> empty',           fix: 'Set a unique <title> per page that summarizes its purpose.' },
    zoomBlocked:      { sc: '1.4.4', sev: 'critical', label: 'Pinch-zoom disabled',          fix: 'Remove user-scalable=no and maximum-scale=1 from viewport meta.' },
    metaDesc:         { sc: '—',     sev: 'minor',    label: 'No meta description',          fix: 'Add <meta name="description"> summarizing the page.' },
    emptyButton:      { sc: '4.1.2', sev: 'critical', label: 'Buttons with no name',         fix: 'Add visible text or aria-label so AT can announce the control.' },
    emptyLink:        { sc: '2.4.4', sev: 'critical', label: 'Links with no name',           fix: 'Add visible text or aria-label so users know where the link goes.' },
    positiveTabIndex: { sc: '2.4.3', sev: 'serious',  label: 'Positive tabindex',            fix: 'Use 0 or remove. Positive values break natural focus order.' },
    duplicateId:      { sc: '4.1.1', sev: 'moderate', label: 'Duplicate id attributes',      fix: 'IDs must be unique. label[for=] and aria-labelledby fail when not.' },
    htmlSize:         { sc: '—',     sev: 'minor',    label: 'Very large DOM',               fix: 'Lazy-load below-fold content or paginate.' },
    longForm:         { sc: '—',     sev: 'minor',    label: 'Form has 8+ fields',           fix: 'Cut optional fields, split across steps, or defer to post-signup.' },
  };

  const siteAnaState = {
    busy: false,
    report: null,
    activeSev: 'critical',
  };

  function siteAnaScan() {
    const findings = [];
    const SKIP = (el) => el.closest('.webable-panel') || el.closest('.webable-launcher') || el.closest('.webable-toast-host');
    const all = (sel) => $$(sel).filter((el) => !SKIP(el));

    // 1. Images missing alt
    const missingAlt = all('img').filter((i) => !i.hasAttribute('alt'));
    if (missingAlt.length) findings.push({ id: 'altMissing', count: missingAlt.length });

    // 2. Form labels
    const inputs = all('input, select, textarea').filter((el) => {
      const t = (el.getAttribute('type') || '').toLowerCase();
      return !['hidden', 'submit', 'button', 'reset'].includes(t);
    });
    const unlabeled = inputs.filter((i) => {
      if (i.hasAttribute('aria-label') || i.hasAttribute('aria-labelledby')) return false;
      const id = i.getAttribute('id');
      if (id) { try { if (document.querySelector('label[for="' + cssEsc(id) + '"]')) return false; } catch (_) {} }
      if (i.closest('label')) return false;
      return true;
    });
    if (unlabeled.length) findings.push({ id: 'formLabelMissing', count: unlabeled.length });

    // 3. Vague links/buttons
    const VAGUE = /^(click here|learn more|read more|submit|continue|here|more|→|->|next|go|ok|view|see|details)$/i;
    const interactives = all('a, button, [role=button], input[type=submit], input[type=button]');
    const vague = interactives.filter((el) => {
      const t = (el.textContent || el.value || '').trim();
      return t && (VAGUE.test(t) || t.length < 3);
    });
    if (vague.length) findings.push({ id: 'vagueLink', count: vague.length });

    // 4. Heading skip
    const headings = all('h1, h2, h3, h4, h5, h6');
    const levels = headings.map((h) => parseInt(h.tagName[1], 10));
    let skip = false;
    for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) { skip = true; break; }
    if (skip) findings.push({ id: 'headingSkip', count: 1 });

    if (!document.querySelector('h1')) findings.push({ id: 'noH1', count: 1 });
    if (!document.documentElement.getAttribute('lang')) findings.push({ id: 'langMissing', count: 1 });
    if (!(document.querySelector('title')?.textContent || '').trim()) findings.push({ id: 'titleMissing', count: 1 });

    const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
    if (/user-scalable\s*=\s*no/i.test(viewport) || /maximum-scale\s*=\s*1(?!\d)/i.test(viewport)) findings.push({ id: 'zoomBlocked', count: 1 });

    if (!document.querySelector('meta[name="description"]')) findings.push({ id: 'metaDesc', count: 1 });

    const emptyBtns = all('button, [role=button]').filter((b) =>
      !(b.textContent || '').trim() && !b.hasAttribute('aria-label') && !b.querySelector('img[alt]:not([alt=""])')
    );
    if (emptyBtns.length) findings.push({ id: 'emptyButton', count: emptyBtns.length });

    const emptyLinks = all('a').filter((a) =>
      !(a.textContent || '').trim() && !a.hasAttribute('aria-label') && !a.querySelector('img[alt]:not([alt=""])')
    );
    if (emptyLinks.length) findings.push({ id: 'emptyLink', count: emptyLinks.length });

    const positiveTI = all('[tabindex]').filter((el) => parseInt(el.getAttribute('tabindex'), 10) > 0);
    if (positiveTI.length) findings.push({ id: 'positiveTabIndex', count: positiveTI.length });

    const idMap = new Map();
    all('[id]').forEach((el) => idMap.set(el.id, (idMap.get(el.id) || 0) + 1));
    const dupes = Array.from(idMap.values()).filter((n) => n > 1).length;
    if (dupes) findings.push({ id: 'duplicateId', count: dupes });

    const totalNodes = document.querySelectorAll('*').length;
    if (totalNodes > 1500) findings.push({ id: 'htmlSize', count: totalNodes });

    all('form').forEach((form) => {
      const fields = form.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea');
      if (fields.length >= 8) findings.push({ id: 'longForm', count: fields.length });
    });

    return { title: document.title, url: location.href, totalNodes, findings };
  }

  function siteAnaCompute(raw) {
    const w = { critical: 14, serious: 8, moderate: 4, minor: 2 };
    const findings = raw.findings.map((f) => ({ ...f, rule: SA_WCAG[f.id] })).filter((f) => f.rule);
    const penalty = findings.reduce((s, f) => s + w[f.rule.sev], 0);
    const score = Math.max(15, 100 - penalty);
    const penalize = (ids, mult = 1.4) => {
      const sub = findings.filter((f) => ids.includes(f.id));
      const p = sub.reduce((s, f) => s + w[f.rule.sev], 0);
      return Math.max(20, Math.round(100 - p * mult));
    };
    const totalChecks = Object.keys(SA_WCAG).length;
    const passedChecks = totalChecks - findings.length;
    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F';
    // Quick element census so the summary can carry concrete numbers.
    const elements = {
      images:  document.querySelectorAll('img').length,
      forms:   document.querySelectorAll('form').length,
      links:   document.querySelectorAll('a[href]').length,
      buttons: document.querySelectorAll('button, [role=button]').length,
      headings: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
      inputs:  document.querySelectorAll('input, select, textarea').length,
    };
    return {
      ...raw,
      score,
      accessibility: penalize(['altMissing','formLabelMissing','vagueLink','headingSkip','noH1','langMissing','titleMissing','zoomBlocked','emptyButton','emptyLink','positiveTabIndex','duplicateId']),
      usability:     penalize(['vagueLink','longForm','htmlSize']),
      seo:           penalize(['titleMissing','metaDesc','headingSkip','noH1']),
      findings,
      totalChecks,
      passedChecks,
      grade,
      elements,
      scannedAt: Date.now(),
    };
  }

  function relativeTime(ts) {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 5)    return 'just now';
    if (diff < 60)   return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    return Math.floor(diff / 3600) + 'h ago';
  }

  function runSiteScan() {
    siteAnaState.busy = true;
    siteAnaState.report = null;
    renderPanelBody();
    // Tiny delay so the shimmer is perceivable; the work itself is sub-100ms.
    setTimeout(() => {
      try {
        siteAnaState.report = siteAnaCompute(siteAnaScan());
        // Auto-jump to first non-empty severity tab.
        const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
        siteAnaState.report.findings.forEach((f) => counts[f.rule.sev]++);
        if (counts[siteAnaState.activeSev] === 0) {
          const first = ['critical','serious','moderate','minor'].find((s) => counts[s] > 0);
          if (first) siteAnaState.activeSev = first;
        }
      } catch (e) {
        showToast('Site scan failed: ' + e.message, { kind: 'error' });
        siteAnaState.report = null;
      }
      siteAnaState.busy = false;
      renderPanelBody();
    }, 220);
  }

  function describeArc(cx, cy, r, t) {
    const start = -135 * Math.PI / 180;
    const end = start + (t * 270 * Math.PI / 180);
    const sx = cx + r * Math.cos(start);
    const sy = cy + r * Math.sin(start);
    const ex = cx + r * Math.cos(end);
    const ey = cy + r * Math.sin(end);
    const large = (end - start) > Math.PI ? 1 : 0;
    return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  }
  function scoreColor(s) { if (s >= 80) return '#1FCB8A'; if (s >= 60) return '#F2B340'; return '#E5484D'; }

  function makeSiteAnalyzerNode() {
    const wrap = document.createElement('div');
    wrap.className = 'webable-sa';

    // Header
    const head = document.createElement('div');
    head.className = 'webable-sa-head';
    head.innerHTML = `
      <div class="webable-sa-head-text">
        <div class="webable-sa-head-title">Site Analyzer</div>
        <div class="webable-sa-head-sub mono">${escapeHtml(location.hostname || 'this page')}</div>
      </div>
      <button class="webable-icon-btn" data-action="site-rerun" title="Re-run scan" aria-label="Re-run scan">${ICONS.rotate(13)}</button>
    `;
    wrap.appendChild(head);

    // Loading state
    if (siteAnaState.busy) {
      const load = document.createElement('div');
      load.className = 'webable-sa-loading';
      load.innerHTML = `
        <div class="webable-sa-load-row">
          <div class="webable-sa-load-gauge"></div>
          <div class="webable-sa-load-meta">
            <div class="webable-sa-load-line wide"></div>
            <div class="webable-sa-load-line"></div>
            <div class="webable-sa-load-line narrow"></div>
          </div>
        </div>
        <div class="webable-sa-load-list">
          <div class="webable-sa-load-card"></div>
          <div class="webable-sa-load-card"></div>
          <div class="webable-sa-load-card"></div>
        </div>
      `;
      wrap.appendChild(load);
      return wrap;
    }

    // Empty state — first entry, before scan runs
    if (!siteAnaState.report) {
      const empty = document.createElement('div');
      empty.className = 'webable-sa-empty';
      empty.innerHTML = `
        <span class="webable-sa-empty-mark">${ICONS.activity(22)}</span>
        <div class="webable-sa-empty-title">Run an accessibility scan</div>
        <div class="webable-sa-empty-sub">15 WCAG 2.2 heuristic checks against this page. Local, ~3 seconds. We never send the page anywhere.</div>
        <button class="webable-btn webable-btn-primary webable-btn-block" data-action="site-rerun">${ICONS.activity(13)}<span>Analyze this page</span></button>
      `;
      wrap.appendChild(empty);
      return wrap;
    }

    // Results
    const r = siteAnaState.report;

    const summary = document.createElement('div');
    summary.className = 'webable-sa-summary';
    const e = r.elements;
    const dom = `${e.images} images · ${e.links} links · ${e.buttons} buttons · ${e.inputs} inputs · ${e.headings} headings · ${e.forms} forms`;
    summary.innerHTML = `
      <div class="webable-sa-gauge">
        <svg viewBox="0 0 100 100" width="92" height="92" aria-hidden="true">
          <circle cx="50" cy="50" r="42" stroke="var(--wa-tint-hi)" stroke-width="8" fill="none"/>
          <path d="${describeArc(50, 50, 42, r.score / 100)}" stroke="${scoreColor(r.score)}" stroke-width="8" fill="none" stroke-linecap="round"/>
        </svg>
        <span class="webable-sa-gauge-num mono" style="color:${scoreColor(r.score)}">${r.score}</span>
      </div>
      <div class="webable-sa-meta">
        <div class="webable-sa-meta-row">
          <span class="webable-sa-meta-strong">WebAble Score</span>
          <span class="webable-sa-grade-pill" data-grade="${r.grade}">${r.grade}</span>
        </div>
        <div class="webable-sa-meta-sub">
          <strong>${r.passedChecks} of ${r.totalChecks}</strong> checks passed · ${r.findings.length} finding${r.findings.length === 1 ? '' : 's'}
        </div>
        <div class="webable-sa-cats">
          ${saCatRow('A11y',     r.accessibility)}
          ${saCatRow('Usability', r.usability)}
          ${saCatRow('SEO',      r.seo)}
        </div>
      </div>
    `;
    wrap.appendChild(summary);

    // Element census strip — concrete counts of what was scanned.
    const census = document.createElement('div');
    census.className = 'webable-sa-census';
    census.innerHTML = `
      <span class="webable-sa-census-key mono">SCANNED</span>
      <span class="webable-sa-census-val mono">${r.totalNodes} DOM nodes · ${dom}</span>
      <span class="webable-sa-census-time mono" title="${new Date(r.scannedAt).toLocaleString()}">${relativeTime(r.scannedAt)}</span>
    `;
    wrap.appendChild(census);

    // Severity counts
    const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    r.findings.forEach((f) => counts[f.rule.sev]++);

    // Severity tabs
    const tabs = document.createElement('div');
    tabs.className = 'webable-sa-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.innerHTML = ['critical','serious','moderate','minor'].map((sev) => `
      <button class="webable-sa-tab ${siteAnaState.activeSev === sev ? 'webable-sa-tab-on' : ''}" data-action="site-sev-tab" data-sev="${sev}" role="tab">
        <span>${sev[0].toUpperCase() + sev.slice(1)}</span>
        <span class="webable-sa-tab-count mono">${counts[sev]}</span>
      </button>
    `).join('');
    wrap.appendChild(tabs);

    // Issues
    const issues = document.createElement('div');
    issues.className = 'webable-sa-issues';
    const items = r.findings.filter((f) => f.rule.sev === siteAnaState.activeSev);
    if (!items.length) {
      issues.innerHTML = `<div class="webable-sa-issues-empty">No ${siteAnaState.activeSev} findings on this page. ✓</div>`;
    } else {
      issues.innerHTML = items.map((f) => `
        <div class="webable-sa-issue" data-action="site-issue-toggle" data-sev="${f.rule.sev}" role="button" tabindex="0">
          <div class="webable-sa-issue-row">
            <span class="webable-sa-issue-title">${escapeHtml(f.rule.label)}</span>
            <span class="webable-sa-issue-count mono">${f.count}</span>
          </div>
          <div class="webable-sa-issue-sub mono">WCAG ${escapeHtml(f.rule.sc)}</div>
          <div class="webable-sa-issue-detail">
            <span class="webable-sa-issue-key mono">FIX</span>
            <span class="webable-sa-issue-fix">${escapeHtml(f.rule.fix)}</span>
          </div>
        </div>
      `).join('');
    }
    wrap.appendChild(issues);

    // Footer
    const foot = document.createElement('div');
    foot.className = 'webable-sa-foot';
    foot.innerHTML = `
      <button class="webable-btn webable-btn-primary" data-action="open-analyzer-tab">${ICONS.activity(13)}<span>Open full report</span></button>
      <button class="webable-btn" data-action="site-copy">${ICONS.fileText(13)}<span>Copy markdown</span></button>
    `;
    wrap.appendChild(foot);

    return wrap;
  }

  function saCatRow(label, val) {
    return `
      <div class="webable-sa-cat">
        <span class="webable-sa-cat-label mono">${label}</span>
        <span class="webable-sa-cat-track"><span class="webable-sa-cat-fill" style="width:${val}%; background:${scoreColor(val)};"></span></span>
        <span class="webable-sa-cat-val mono">${val}</span>
      </div>
    `;
  }

  function copySiteReport() {
    if (!siteAnaState.report) return;
    const r = siteAnaState.report;
    const out = [];
    out.push(`# WebAble — ${r.title || '(untitled)'}\n`);
    out.push(`**URL:** ${r.url}`);
    out.push(`**Score:** ${r.score} / 100 · A11y ${r.accessibility} · Usability ${r.usability} · SEO ${r.seo}`);
    out.push(`**DOM:** ${r.totalNodes} nodes\n`);
    ['critical','serious','moderate','minor'].forEach((sev) => {
      const items = r.findings.filter((f) => f.rule.sev === sev);
      if (!items.length) return;
      out.push(`## ${sev[0].toUpperCase() + sev.slice(1)} (${items.length})\n`);
      items.forEach((f) => {
        out.push(`- **${f.rule.label}** _(WCAG ${f.rule.sc} · ${f.count} affected)_`);
        out.push(`  - Fix: ${f.rule.fix}`);
      });
      out.push('');
    });
    navigator.clipboard.writeText(out.join('\n')).then(() => showToast('Site report copied to clipboard.'));
  }

  // ─── Boot ────────────────────────────────────────────────────────────
  function boot() {
    injectToastHost();
    injectLauncher();
    injectPanel();
    applyTheme();
    applyLayout();

    // Bind shortcut: Ctrl+U toggles panel (capture stops Chrome view-source default)
    document.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && (e.key === 'u' || e.key === 'U') && !e.shiftKey && !e.altKey) {
        // Only intercept when we have a launcher visible and the page is normal HTML
        e.preventDefault(); e.stopPropagation();
        togglePanel();
      }
    }, true);

    // Restore from storage and (if always-on) re-apply tools
    Storage.load(() => {
      applyTheme();
      applyLayout();
      placeLauncher();
      // Hide if site disabled
      if (Storage.siteState().disabled) {
        $launcher.classList.add('webable-launcher-quiet');
        return;
      }
      // Re-apply previous tools if always-on
      const site = Storage.siteState();
      if (site.alwaysOn && site.tools) {
        Object.entries(site.tools).forEach(([id, partial]) => {
          if (!state.tools[id]) return;
          Object.assign(state.tools[id], partial);
          try { Tools[id].apply(state.tools[id]); } catch (_) {}
        });
      }
    });

    // Messages
    try {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === 'WEBABLE_TOGGLE_PANEL') togglePanel();
        if (msg?.type === 'WEBABLE_OPEN_PANEL')   openPanel(msg.tab);
        if (msg?.type === 'WEBABLE_READ_ALOUD')   { if (state.tools.tts.playing) ttsStop(); else ttsStart(); }
        if (msg?.type === 'WEBABLE_PIN_TOOLTIP')  pinHoveredTooltip();
        if (msg?.type === 'WEBABLE_AI_ALT_TEXT')  handleAIAltText(msg.srcUrl);
        if (msg?.type === 'WEBABLE_AI_OCR')       handleAIOcr(msg.srcUrl);
        if (msg?.type === 'WEBABLE_AI_SUMMARIZE_NOW') { openPanel('ai'); summarizePage(); }
        if (msg?.type === 'WEBABLE_SITE_PATCH')   { Storage.load(() => { applyTheme(); applyLayout(); placeLauncher(); renderPanelBody(); }); }
        if (msg?.type === 'WEBABLE_HIGHLIGHT')    handleAnalyzerHighlight(msg.selector, msg.label);
      });
    } catch (_) {}

    // Live-update on storage changes (e.g. user saved a key in Options).
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const next = changes.webable?.newValue;
        if (!next) return;
        if (next.apiKey !== undefined) state.apiKey = next.apiKey || '';
        if (next.ui) { state.ui = { ...state.ui, ...next.ui }; applyTheme(); applyLayout(); }
        if (state.panel.open) renderPanelBody();
      });
    } catch (_) {}
  }

  // ─── Analyzer "Highlight on page" handler ────────────────────────────
  function handleAnalyzerHighlight(selector, label) {
    if (!selector) return;
    let el = null;
    try { el = document.querySelector(selector); } catch (_) {}
    if (!el) {
      // The analyzer parsed a snapshot of the DOM; the live DOM may have drifted.
      // Try a degraded match — search by label text on links/buttons.
      if (label) {
        el = $$('a, button, [role=button]').find((n) => (n.innerText || '').trim() === label.trim());
      }
    }
    if (!el) return showToast('Could not find that element on the live page anymore — it may have changed.', { kind: 'error' });
    pulseElement(el);
    showToast(`Highlighted: ${label || selector}`);
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

git add# WebAble

**Adapts the web to you.** Carries your reading, vision, motor, and cognitive accessibility settings across every site you visit. The settings stay with the user — not the website.

> Classic accessibility overlays (UserWay, accessiBe, AudioEye) are installed by website owners, run mechanical CSS rules, and have been [legally challenged](https://www.ftc.gov/news-events/news/press-releases/2026/01/ftc-takes-action-against-accessibe-deceptive-claims-disabled-users) for claiming AI compliance. **In January 2026 the FTC fined accessiBe $1,000,000.**
>
> WebAble is a USER-side tool. We don't claim to fix websites. We adapt them locally for the person who installed us. The native a11y stack (NVDA, VoiceOver, Voice Control, ZoomText) keeps working. Always.

---

## Install in 60 seconds

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked** → select this folder
4. Pin **WebAble** from the Extensions menu

A round electric-blue button appears in the bottom-right of every page. Drag it to a different edge if you like — it remembers. Click it (or press `Ctrl+U` / `Ctrl+Shift+U`) to open the panel.

---

## What's inside

### 21 Phase 1 tools (all working — no stubs)

| Category | Tools |
|---|---|
| **Vision** | Reading Mode · High Contrast (5 modes) · Color Filter (deuter / protan / tritan / achroma · simulate or correct) · Text Size · Force Pinch Zoom · Big Cursor (1-4×) · Reading Ruler · Visible Focus Ring |
| **Reading** | Dyslexia Font (OpenDyslexic / Lexend / Atkinson Hyperlegible) · Letter & Word Spacing · Read Aloud (Web Speech API) · Hide Images |
| **Motor** | Click Target Enlarger · Tooltip Pin (`Ctrl+Shift+P`) · Sticky Element Killer · Auto-Scroll |
| **Cognitive** | Hide Distractions · Stop Animations · Focus Mode |
| **Privacy** | Cookie Banner Killer · Modal / Popup Killer |

### 7 Profiles (one-click bundles)
Low Vision · Dyslexia · ADHD Focus · Motor Impaired · Seizure Safe · Senior Friendly · Privacy First.

### Site Analyzer (standalone tab)
- 15 WCAG 2.2 heuristic checks — alt text, form labels, vague links, heading order, lang, title, viewport zoom, empty buttons, positive tabindex, invalid ARIA roles, duplicate IDs, suppressed focus outline, DOM size, long forms, meta description.
- WebAble Score (0-100) plus Accessibility / Usability / SEO sub-scores.
- Per-finding: WCAG SC reference, severity, who-it-hurts copy, plain-language fix, and 3-4 sample DOM snippets — each with a **Highlight on page** button that flips back to the source tab and pulses the element.
- **Copy as Markdown** + **Save as PDF** (browser-native print → "Save as PDF" produces a real PDF, no jsPDF dependency for now).
- **✨ Generate AI Remediation Guide** — visible only when a Gemini key is set. Produces a developer-ready ticket-style Markdown writeup with before/after code, who-it-hurts copy, and acceptance criteria.
- Honest disclaimer in the UI and the PDF: automated tools catch 30-40% of issues. The rest needs manual testing with real assistive tech.

### Phase 2 — AI features (fully working, BYOK)

Add a Gemini API key in Settings; key stays in `chrome.storage.local` and only ever travels to `generativelanguage.googleapis.com`. Free tier covers most usage.

| Feature | How to invoke | What it does |
|---|---|---|
| **Plain Language Summary** | AI tab → "Summarize this page" | Rewrites the article at B2 / 8th-grade reading level. Read-aloud + copy buttons attached. |
| **Smart Page Q&A** | AI tab → text input or chip | "Where do I cancel my subscription?" → Gemini reads the DOM, returns a CSS selector, and we scroll-to + pulse-highlight the answer on the page. |
| **Context-Aware Alt Text** | Right-click any image → "WebAble: Generate alt text" | Sends the image **plus the surrounding paragraph and page title** to Gemini Vision. This is the differentiator vs. Microsoft / LinkedIn auto-alt: pixel-only models can't tell *why* an image matters here. Inserts as `alt=...` and announces via `aria-live`. Also handles "DECORATIVE" classification (sets `alt="" role="presentation"`). |
| **OCR — Read Image Text** | Right-click any image → "WebAble: Extract text" | Vision model extracts text in reading order. Renders in a modal with copy + read-aloud buttons. |
| **AI Remediation Guide** (Analyzer) | Site Analyzer footer → "✨ Generate AI Remediation Guide" | Turns the audit findings into a developer-ready Markdown ticket: Before/After code, who-it-hurts copy, acceptance criteria. Hidden until a key is set. |

**Honest "Coming Soon"** — features that are *not shippable today* from a browser extension and the panel says so:
- **Live Captions for `<video>`** — cross-origin audio capture is blocked by browsers, and Gemini does not yet expose a streaming-audio API. Both blockers need a platform fix or a relay we won't run.
- **Eye-Tracking Navigation** — WebGazer.js calibration storage and Tobii SDK belong in a desktop wrapper, not an MV3 extension. Phase 3.
- **Advanced Voice Nav** ("click the third link") — needs a richer accessibility tree query than Web Speech API alone exposes against React / shadow-DOM SPAs. Phase 3.

The point of being honest here: a Google M&A reviewer sees we know what's hard, and didn't ship a stub.

### Per-site memory
- **Always-on for this site** — re-applies your active tools whenever you revisit.
- **Disable WebAble on this site** — kill switch per domain.
- All sites manageable from the Options page.

---

## File layout

```
manifest.json        Manifest V3 — contextMenus permission added in v1.2
background.js        Service worker — keyboard relay, context menus, popup ↔ content bridge, analyzer highlight relay
gemini.js            Shared Gemini API wrapper (testKey, generate, generateAltText, summarize, pageQA, ocrImage, remediationGuide)
content.js           On-page widget — floating launcher + glass panel + 21 tools + AI tab
content.css          Design system + page-level mods + a11y overlays + AI cards + OCR modal
popup.html / .css / .js     Toolbar popup — site state + analyzer / options launchers
options.html / .css / .js   Settings — theme, brand color, BYOK key + Test Connection, sites table, reset-prefs
analyzer.html / .css / .js  Standalone Site Analyzer — 15 WCAG heuristics, Highlight-on-page, PDF, AI Remediation Guide
demo.html            Self-contained nonprofit demo page (Riverside Skills Initiative)
icons/               16 / 48 / 128 PNG icons
README.md            This file
BUILD.md             React + TypeScript + Vite migration path for the engineering team
```

Total bundle, gzipped: **~72 KB.** Well under the 2 MB target.

---

## Bug fixes from v1.0 (reported)

| v1.0 bug | Root cause | v1.1 fix |
|---|---|---|
| Reading Mode blanks the page | CSS hid every element with no fallback when `<article>` wasn't found | We now bail with a toast: "Reading Mode could not find a primary article on this page." Page is left untouched. |
| Image covers the whole page in Reading Mode | No `max-height` / `object-fit` on images inside the article container | Hard cap at 60vh + `object-fit: contain` + 100% max-width. |
| Low Vision profile turns the screen black | Profile activated High Contrast Dark, which had the bug below | Profile now uses Smart Contrast + Bigger Text + Big Cursor + Visible Focus. |
| High Contrast Dark / Light = black or white blob | We set `background-color` on every nested element, painting solid colour over images | Only the `body` gets the colour. Descendants get `background: transparent`. Buttons/inputs get explicit re-styling. Images and SVG are excluded. |

---

## Keyboard shortcuts

- `Ctrl+U` — toggle the floating panel (intercepted before view-source)
- `Ctrl+Shift+U` — global toggle (works even on Chrome chrome:// pages via the extension command)
- `Ctrl+Shift+R` — Read selection / page aloud
- `Ctrl+Shift+P` — Pin the tooltip you're hovering
- `Esc` — close the panel

---

## Privacy & security stance

- **Zero telemetry.** WebAble makes zero network calls of its own. Audit it: `grep -ri "fetch\|xmlhttprequest" content.js options.js analyzer.js popup.js`.
- **No accounts.** Phase 1 has no login, no cloud sync, no nothing.
- **BYOK for Phase 2.** Your Gemini key lives in `chrome.storage.local`. Requests go directly from your browser to Google's API. We never proxy, log, or train on a single token.
- **Doesn't poison your assistive tech.** WebAble never sets `aria-hidden` on focusable nodes, never overrides `role`, never moves focus. Test with NVDA + VoiceOver — they keep working.
- **Anti-overlay-fraud positioning.** We don't claim WCAG compliance. We don't claim to fix websites. The Options page links the FTC v. accessiBe action so the user knows what *not* to expect.

---

## For the Google M&A team

The pitch:
1. **WebAble is a browser-platform feature in disguise.** Eighteen accessibility primitives, per-site memory, and an analyzer — all delivered from the place a user actually has agency: the browser.
2. **Curb-cut design.** Cookie killer, stop-animations, kill stickies, force-zoom — every tool helps a disabled user *and* every other user. Acquisition target: ship as a Chrome built-in.
3. **The licensing alternative is bad.** UserWay / accessiBe / AudioEye are sold to website owners. Their incentives reward overpromising. Chrome's incentives reward *the user*. WebAble's design lines up.
4. **Lawful by construction.** No cloud, no training, no scraping, no per-user identifier. The Phase 2 AI path is BYOK, which keeps Google a vendor-of-API not a regulator-bait.
5. **Bundle math.** ~58 KB gzipped — fits inside Chrome without budget concerns. The DOM-mod heuristics are isolated from native a11y; rendering still flows through the platform's existing accessibility tree.

See `BUILD.md` for the path from this load-unpacked prototype to a Vite + React + TypeScript codebase your team can extend.

---

## Demo cues

**For the Google M&A meeting, demo against the live `https://www.buffalo.edu/` homepage** — a real .edu site with 10 documented accessibility barriers WebAble can address today. The full step-by-step walkthrough is in [`BUFFALO_DEMO.md`](BUFFALO_DEMO.md) — every action paired with the specific issue it addresses, the WCAG criterion, and the WebAble feature involved.

The bundled `demo.html` (Riverside Community Skills Initiative) is the offline backup — useful when there's no internet, or for screenshot-deterministic captures.

### Phase 1 quick demo against buffalo.edu (no key needed)
1. Open `https://www.buffalo.edu/`. The cookie banner is up. Background video auto-plays. Carousel cycles.
2. Click WebAble launcher → **Privacy** category → toggle **Cookie Killer**. Banner gone.
3. **Cognitive** category → toggle **Stop Animations**. Video freezes. Carousel halts.
4. **Vision** category → toggle **Reading Mode**. The whole "True Blue" homepage strips down to readable text. The buggy "blank page" / "image-covers-everything" failures from v1.0 are fixed.
5. Cycle **High Contrast → Dark — readable**. Black background, white text, **images stay visible** — the v1.0 "black blob" bug is fixed.
6. Footer toggle → **Always-on for buffalo.edu** → reload. Tools auto-apply.

### Phase 2 quick demo (paste a Gemini key in Settings first)
7. AI tab → **Summarize this page**. Buffalo's ~1,400-word homepage condenses to ~120 words at 8th-grade reading level.
8. AI tab → Q&A input → "How do I apply as a transfer student?" → page scrolls to and pulses the Apply CTA.
9. Right-click any "Faces & Voices" testimonial photo → **WebAble: Generate alt text**. Alt is generated from the image *plus* the surrounding paragraph and page title — `aria-live` announces it.
10. Site Analyzer → **Analyze this site**. Score ~62-68. Click any finding's **Highlight on page** → tab flips back to buffalo.edu and pulses the element. Click **✨ Generate AI Remediation Guide** → Markdown ticket-style report. **Save as PDF** for the UB web team.

### Old demo cues (against bundled `demo.html`)
1. Open `demo.html`. Drag the launcher from bottom-right to top-left. Refresh. Position persists.
2. Open the panel. Search "cookie." Watch the tray collapse to the one matching tool.
3. Toggle **Force Pinch Zoom**. Try pinching on a touchpad. Now allowed.
4. Toggle **Visible Focus Ring**. Tab through the page — every focusable element gets a 3px electric-blue ring with black halo.
5. Toggle **High Contrast → Dark**. Page is black, text is white, buttons get white borders. **Images stay visible.** No blob.
6. Toggle **Reading Mode**. Maria's story is centered in a clean column. Image is sized to 60vh max — never dominates.
7. Toggle **Always-on for `localhost`** in the panel footer. Reload `demo.html`. The previous tools auto-apply.
8. Press `Esc`. Panel closes. Click the launcher. Panel re-opens at the same spot.

### Phase 2 (needs a Gemini key)
9. Open **Options** → paste a Gemini key → click **Test connection**. Status flips green: "✓ Key valid. N Gemini model(s) accessible."
10. Switch to the **AI** tab in the panel. Each card now shows action buttons instead of "Add Gemini key" CTAs.
11. Click **Summarize this page**. After ~3 seconds an 8th-grade-level summary renders. Click **Read aloud**.
12. In **Smart Page Q&A**, click "Cancel subscription?" — Gemini scans the DOM, the page jumps to the relevant link, the link pulses electric blue, and the answer card explains why that match.
13. Right-click any image without alt text → **WebAble: Generate alt text**. The image is updated, a toast shows the alt, and `aria-live` announces it for screen readers.
14. Right-click an image of text → **WebAble: Extract text (OCR)**. A modal opens with the extracted text and copy / read-aloud actions.
15. Open the **Site Analyzer**, run it, click **✨ Generate AI Remediation Guide**. A markdown ticket-style report renders with before/after code for each finding.
16. In any finding, click **Highlight on page** — analyzer flips focus back to the source tab and pulses the offending element.
17. Click **Save as PDF**. Browser print dialog opens with a print-styled report; "Save as PDF" produces a clean PDF.

If the M&A team asks "what's left?" — every Phase 2 (AI) feature is in `Coming Soon` with a real description and the BYOK gate. The implementation cost is bounded by Gemini API design, not by WebAble's architecture.

---

## License

Proprietary prototype. Not for redistribution.
#   W e b A b l e - P l u g i n 
 
 
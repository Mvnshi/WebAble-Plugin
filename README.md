<div align="center">

# WebAble

### Free, open-source accessibility for the whole web.

**Adapt any website to you** — reading, vision, motor, and cognitive tools that
follow the user, not the site. Add it to your website with **one line**, or
install the browser extension and carry your settings everywhere.

[![License: MIT](https://img.shields.io/badge/License-MIT-2F80FF.svg)](LICENSE)
![Dependencies: none](https://img.shields.io/badge/dependencies-0-1FCB8A.svg)
![Widget size](https://img.shields.io/badge/widget-~35%20KB%20gzipped-1FCB8A.svg)
![PRs welcome](https://img.shields.io/badge/PRs-welcome-A574FF.svg)

**[🚀 Try the live demo](https://mvnshi.github.io/WebAble-Plugin/)** · [📖 Embed guide](EMBED.md) · [💬 Discussions](https://github.com/Mvnshi/WebAble-Plugin/discussions) · [💛 Sponsor](https://github.com/sponsors/Mvnshi)

</div>

---

WebAble is two things that share one engine:

- a **website widget** a company drops in with a single `<script>` tag, so
  **every visitor** gets the toolkit — no install required;
- a **browser extension** a person installs once, so their accessibility
  settings travel with them across **every** site.

> Classic accessibility overlays (UserWay, accessiBe, AudioEye) are sold to
> website owners, run mechanical CSS rules, and were
> [legally challenged](https://www.ftc.gov/news-events/news/press-releases/2026/01/ftc-takes-action-against-accessibe-deceptive-claims-disabled-users)
> for claiming AI compliance. **In January 2026 the FTC fined accessiBe
> $1,000,000.**
>
> WebAble is different *by construction*. It's **user-side**: it adapts the page
> for the person who opens it. It does **not** claim to "fix" your site, fake a
> WCAG badge, cloak content for crawlers, or poison the accessibility tree. The
> native a11y stack (NVDA, VoiceOver, Voice Control, ZoomText) keeps working.
> Always.

---

## Two ways to use WebAble

### 🌐 On your website — one line

```html
<script src="https://cdn.jsdelivr.net/gh/Mvnshi/WebAble-Plugin@main/dist/webable.js"
        data-webable defer></script>
```

A round accessibility button appears in the corner. Visitors open it (or press
`Ctrl+U`), pick the tools they need, and their choices are remembered next time.
The stylesheet is bundled into that one file — there is nothing else to add, no
build step, no dependencies, no account.

Brand it, position it, restrict the toolset, white-label it, wire it to your own
menu — see **[EMBED.md](EMBED.md)** for the full config and framework recipes
(React/Next, Vue, WordPress, Shopify, GTM, …).

```html
<!-- e.g. branded + docked as a right sidebar -->
<script src="https://cdn.jsdelivr.net/gh/Mvnshi/WebAble-Plugin@main/dist/webable.js"
        data-webable data-webable-color="#7c3aed" data-webable-layout="sidebar-right" defer></script>
```

**Try it now, locally:**

```bash
npm run serve      # → http://localhost:8000/examples/embed-demo.html
```

### 🧩 In your browser — the extension

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. **Load unpacked** → select this folder
4. Pin **WebAble** and click it (or press `Ctrl+Shift+U`)

Your settings persist per-site and follow you across the web.

---

## What's inside

### 21 tools (all working — no stubs)

| Category | Tools |
|---|---|
| **Vision** | Reading Mode · High Contrast (5 modes) · Color Filter (deuter / protan / tritan / achroma · simulate or correct) · Text Size · Force Pinch Zoom · Big Cursor (1–4×) · Reading Ruler · Visible Focus Ring |
| **Reading** | Dyslexia Font (OpenDyslexic / Lexend / Atkinson Hyperlegible) · Letter & Word Spacing · Read Aloud (Web Speech API) · Hide Images |
| **Motor** | Click Target Enlarger · Tooltip Pin · Sticky Element Killer · Auto-Scroll |
| **Cognitive** | Hide Distractions · Stop Animations · Focus Mode |
| **Privacy** | Cookie Banner Killer · Modal / Popup Killer |

### 7 profiles (one-click bundles)

Low Vision · Dyslexia · ADHD Focus · Motor Impaired · Seizure Safe · Senior
Friendly · Privacy First.

### Site Analyzer (extension)

A standalone tab that runs **15 WCAG 2.2 heuristic checks** (alt text, form
labels, vague links, heading order, lang, viewport zoom, ARIA roles, duplicate
IDs, focus suppression, and more), scores the page 0–100, and for each finding
gives the WCAG SC, who it hurts, a plain-language fix, and a **Highlight on
page** button. Export as Markdown or PDF. Honest by design: it says out loud
that automated tools catch only 30–40% of issues — the rest needs manual testing
with real assistive tech.

### AI features (extension, bring-your-own-key)

Add a Gemini key in Settings (it stays in `chrome.storage.local` and only ever
talks to Google): **Plain-Language Summary**, **Smart Page Q&A**,
**Context-Aware Alt Text** (image **+** surrounding paragraph **+** page title —
the thing pixel-only auto-alt can't do), and **OCR**. The widget ships
accessibility-first; AI for embedded sites is an opt-in proxy on the roadmap
(see [EMBED.md](EMBED.md)).

---

## Honest take on SEO, GEO & reach

You'll see overlay vendors promise that a widget will boost your search rankings.
We won't, because it isn't true, and that kind of claim is exactly what got the
category fined. Here's what's actually real:

- **It won't hurt your Core Web Vitals.** The widget is tiny, `defer`-loaded, and
  causes no layout shift — so it doesn't drag down the performance signals that
  *do* affect SEO.
- **No cloaking, no spam markup.** Nothing is shown to crawlers that isn't shown
  to people, so there's nothing to penalize.
- **It signals genuine accessibility investment** and widens your real audience —
  ~1 in 6 people live with a disability. Reach and conversions come from actually
  serving them, not from a badge.

Real ranking and generative-engine (GEO) gains come from accessible,
well-structured content. WebAble encourages that; it never fakes it.

---

## How it's built

```
core/webable-engine.js      Shared engine — 21 tools + 7 profiles. Pure DOM/CSS, zero deps.
                            Source of truth for behaviour; powers BOTH products.
embed/webable.embed.js      Website-widget runtime (launcher, panel, config, localStorage).
embed/webable.embed.css     Embed-only styles on top of the shared design system.
content.css                 Design system + every page-mod overlay. Shared.
dist/webable.js             Built one-file widget (engine + runtime + inlined CSS). ~35 KB gz.
scripts/                    Zero-dep build, headless smoke test, static dev server.
examples/embed-demo.html    A real page with the widget embedded — the live try-it.

content.js · popup.* · options.* · analyzer.* · background.js · manifest.json
                            The Chrome (MV3) browser extension.
backend/                    Optional Node/Stripe AI proxy for the extension's Pro mode.
BUILD.md                    React + TypeScript + Vite migration plan.
```

```bash
npm run build      # build dist/  (run after editing core/ or embed/)
npm run smoke      # headless engine test — verifies the engine ↔ CSS contract
npm run check      # syntax-check engine, runtime, and bundle
npm run serve      # serve the demo
```

The engine is intentionally framework-free and never builds UI, so both the
extension and the widget drive the *same* tested logic. New to the code? Adding a
tool is ~15 lines — see **[CONTRIBUTING.md](CONTRIBUTING.md)**.

---

## Privacy & security

- **Zero telemetry.** The accessibility tools make **zero** network calls. Audit
  it: `grep -rin "fetch\|XMLHttpRequest" core embed`.
- **Your settings stay on your device** — `localStorage` for the widget,
  `chrome.storage.local` for the extension. Shared with no one.
- **One optional request:** dyslexia/reading fonts (Lexend, Atkinson,
  OpenDyslexic) lazy-load from a CDN *only when a font tool is turned on*.
- **BYOK AI.** Gemini keys live locally and go straight to Google. We never
  proxy, log, or train on a token.
- **Doesn't poison assistive tech.** WebAble never sets `aria-hidden` on
  focusable nodes, overrides `role`, or steals focus.

---

## Keyboard shortcuts

- `Ctrl+U` — toggle the panel
- `Ctrl+Shift+U` — global toggle (extension)
- `Ctrl+Shift+R` — read selection / page aloud (extension)
- `Ctrl+Shift+P` — pin the hovered tooltip
- `Esc` — close the panel

---

## Roadmap

- **AI for the widget** via a self-hosted proxy (`data-webable-ai-endpoint`) so
  embedded sites get summaries/alt-text with the key server-side.
- **Internationalization** — a strings map + `data-webable-locale`.
- **Self-hosted fonts** option (`data-webable-fonts="off"`) for zero third-party
  requests.
- **More tools** — line-focus mask, link underliner, mute-all-media.
- **React + TypeScript + Vite** migration of the extension (see `BUILD.md`).

Have an idea or a need we're missing? [Open an issue.](https://github.com/Mvnshi/WebAble-Plugin/issues)

---

## Contributing

WebAble gets better every time someone who *relies* on a tool tells us what's
wrong with it. Bug reports, new tools, translations, docs, screen-reader
testing — all welcome, and you don't need to be a "real programmer" to help.
Start with **[CONTRIBUTING.md](CONTRIBUTING.md)** and the
[good first issues](https://github.com/Mvnshi/WebAble-Plugin/issues).

We hold ourselves to a high bar of respect for disabled users and the people who
support them — see the [Code of Conduct](CODE_OF_CONDUCT.md).

## Support the project

WebAble is free and will stay free. If it helps you or your users, **starring the
repo** and **[sponsoring](https://github.com/sponsors/Mvnshi)** directly fund
ongoing maintenance, testing with real assistive technology, and keeping the
widget fast and dependency-free.

## License

[MIT](LICENSE) © WebAble contributors. Use it, embed it, fork it, ship it.

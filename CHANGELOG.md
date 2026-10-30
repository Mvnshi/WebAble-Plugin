# Changelog

All notable changes to WebAble are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) and the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## [Unreleased]

## [3.0.0] - 2026-10-30

The extension catches up with the platform it was split from, then goes past
it: WebAble is now built to be fast for everyone, not only adjustable.

### Added

- **Command bar** (Ctrl/Cmd+Shift+K). Type what you need in plain words: "too
  bright", "text 150%", "I have dyslexia", "read this to me", "2x", "go to
  pricing", "search for boots", "? who wrote this". An on-device phrasebook
  turns sentences into changes with no AI and no network; fuzzy search covers
  every tool, profile, heading and link; every change offers Undo.
- **Click hints** (Alt+Shift+H). Labels on everything clickable, type one to
  click it, Shift for a new tab. Number mode with word filtering for voice
  control users.
- **Suggestions for the current page** in the toolbar popup: cookie banners,
  sign-up walls, bright pages under a dark system theme, small or low-contrast
  text, long reads, autoplay, blocked zoom, endless feeds.
- **Site Check**: a report built from the rendered page, covering
  accessibility (measured contrast, names, labels, WCAG 2.2 target size),
  search, AI visibility (robots.txt rules for AI crawlers, llms.txt, JSON-LD)
  and speed (LCP, CLS, TTFB from the visit's own timeline). Show-on-page,
  Markdown and PDF export, and an honest statement of what automated checks
  cannot find.
- **Welcome page** on install that asks what gets in your way and previews the
  answer live before saving it as your default.
- **Redesigned popup**: type-what-you-need search, four big actions, quick
  switches with their real state, compact profiles, feed guard only where it
  applies.
- Keyboard settings: hint label style, in-page shortcut fallback, rebinding.
- Everything from the platform's v2.6 extension: 43 tools on a TypeScript and
  Preact engine shared with the widget, per-site and default settings, frames
  treated with their page, feed guard for YouTube, TikTok, Instagram and X, the
  on-page AI guide, read aloud, settings export and import, per-site off switch.
- 431 unit tests and 48 checks in a real Chromium, an axe audit of the panel,
  and a CI check that the committed `extension/` and `dist/` match the source.

### Changed

- The repository is a TypeScript monorepo. The built extension lives in
  `extension/` (load it unpacked); the built widget lives in `dist/`.
- `dist/webable.js` is now the v3 widget loader, so existing embeds upgrade in
  place. `dist/widget.js` is the new canonical name.

### Removed

- The v1 vanilla-JS extension, its analyzer page (replaced by Site Check), and
  the Stripe backend, which now lives with the hosted platform.

## [2.0.0]: 2026-06-02

### Added: the embed era

- **Embeddable website widget** (`dist/webable.js`, ~35 KB gzipped). One
  `<script>` tag gives every visitor to a site the full WebAble accessibility
  toolkit: no extension install required.
- **Shared accessibility engine** at `core/webable-engine.js`: framework-free,
  dependency-free, zero `chrome.*` coupling. Powers both the browser extension
  and the new website widget so behavior never drifts.
- **Embed runtime** at `embed/webable.embed.js`: launcher, glass panel,
  per-visitor `localStorage` memory, `data-*` and `window.WebAbleConfig`
  configuration, custom theming, white-labeling, and a public `WebAble.*` API
  for host pages and Tag Manager.
- **Zero-dependency build** (`scripts/build-embed.mjs`) that stitches engine +
  runtime + inlined CSS into a single self-contained file.
- **Headless engine smoke test** (`scripts/smoke.mjs`): no browser/jsdom: that
  verifies the engine's class/variable contract with the stylesheet.
- **Tiny static dev server** (`scripts/serve.mjs`).
- **`examples/embed-demo.html`**: a realistic page with the widget embedded for local testing.
- **`EMBED.md`**: full integration guide (config reference, framework recipes,
  privacy notes, honest positioning vs. overlay vendors, AI roadmap).
- **Open-source scaffolding**: MIT `LICENSE`, README rewrite, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, GitHub CI workflow (syntax + smoke +
  dist-in-sync), issue forms, PR template, and `FUNDING.yml`.
- **`package.json`**: the project is npm-publishable as `webable`.

### Changed

- **Re-licensed from "Proprietary prototype" to MIT.** Anyone can use, embed,
  fork, modify, or ship WebAble.

### Fixed

- README rendering on GitHub: removed UTF-16/NUL-byte garbage that was making
  GitHub treat `README.md` as binary.

## [1.3.0]: earlier

The pre-embed era of the browser extension. 21 vision/reading/motor/cognitive
tools, 7 profiles, the in-panel Site Analyzer, and BYOK Gemini AI (alt-text,
summarization, page Q&A, OCR).

[Unreleased]: https://github.com/Mvnshi/WebAble-Plugin/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/Mvnshi/WebAble-Plugin/releases/tag/v2.0.0

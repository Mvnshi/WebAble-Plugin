# Changelog

All notable changes to WebAble are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) and the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## [Unreleased]

## [2.0.0] — 2026-06-02

### Added — the embed era

- **Embeddable website widget** (`dist/webable.js`, ~35 KB gzipped). One
  `<script>` tag gives every visitor to a site the full WebAble accessibility
  toolkit — no extension install required.
- **Shared accessibility engine** at `core/webable-engine.js`: framework-free,
  dependency-free, zero `chrome.*` coupling. Powers both the browser extension
  and the new website widget so behavior never drifts.
- **Embed runtime** at `embed/webable.embed.js`: launcher, glass panel,
  per-visitor `localStorage` memory, `data-*` and `window.WebAbleConfig`
  configuration, custom theming, white-labeling, and a public `WebAble.*` API
  for host pages and Tag Manager.
- **Zero-dependency build** (`scripts/build-embed.mjs`) that stitches engine +
  runtime + inlined CSS into a single self-contained file.
- **Headless engine smoke test** (`scripts/smoke.mjs`) — no browser/jsdom — that
  verifies the engine's class/variable contract with the stylesheet.
- **Tiny static dev server** (`scripts/serve.mjs`).
- **`examples/embed-demo.html`** — a realistic page with the widget embedded for local testing.
- **`EMBED.md`** — full integration guide (config reference, framework recipes,
  privacy notes, honest positioning vs. overlay vendors, AI roadmap).
- **Open-source scaffolding** — MIT `LICENSE`, README rewrite, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, GitHub CI workflow (syntax + smoke +
  dist-in-sync), issue forms, PR template, and `FUNDING.yml`.
- **`package.json`** — the project is npm-publishable as `webable`.

### Changed

- **Re-licensed from "Proprietary prototype" to MIT.** Anyone can use, embed,
  fork, modify, or ship WebAble.

### Fixed

- README rendering on GitHub — removed UTF-16/NUL-byte garbage that was making
  GitHub treat `README.md` as binary.

## [1.3.0] — earlier

The pre-embed era of the browser extension. 21 vision/reading/motor/cognitive
tools, 7 profiles, the in-panel Site Analyzer, and BYOK Gemini AI (alt-text,
summarization, page Q&A, OCR).

[Unreleased]: https://github.com/Mvnshi/WebAble-Plugin/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/Mvnshi/WebAble-Plugin/releases/tag/v2.0.0

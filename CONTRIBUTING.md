# Contributing to WebAble

Thanks for being here. WebAble is a free, open-source accessibility toolkit, and
it gets better every time someone who actually relies on a tool tells us what's
wrong with it. Contributions of every size are welcome — typo fixes, new tools,
bug reports, translations, docs, a kind word in an issue.

**You do not need to be a "real programmer" to help.** Filing a clear bug,
testing with a screen reader, or improving a description is genuinely valuable.

## Ground rules

- Be kind. See the [Code of Conduct](CODE_OF_CONDUCT.md).
- Accessibility is the product. A change that looks nicer but is worse for
  assistive tech is a regression.
- **We never claim to "make sites compliant."** WebAble is a *user-side* tool. We
  don't fake WCAG badges, cloak content, or poison the accessibility tree. Keep
  contributions honest. (See FTC v. accessiBe, 2026.)

## Project layout

```
core/webable-engine.js      The shared engine — 21 tools + 7 profiles, pure DOM/CSS,
                            no dependencies. The single source of truth for behaviour.
embed/webable.embed.js      The website-widget runtime (launcher + panel + config + storage).
embed/webable.embed.css     Embed-only style additions on top of content.css.
content.css                 The design system + all page-mod overlays. Shared by both.
dist/webable.js             Built single-file widget (engine + runtime + inlined CSS).
scripts/build-embed.mjs     Zero-dep build → dist/.
scripts/smoke.mjs           Headless engine test (no browser needed).
scripts/serve.mjs           Tiny static server for the demo.
examples/embed-demo.html    A real page with the widget embedded — your manual test bed.

content.js / popup.* / options.* / analyzer.* / background.js / manifest.json
                            The Chrome (MV3) browser extension.
backend/                    Optional Node/Stripe AI proxy for the extension's Pro mode.
```

The **engine** is intentionally framework-free and DOM-injection-free (it never
builds the panel) so the extension and the widget can both drive it. If you're
changing *what a tool does*, change the engine. If you're changing *how the
panel looks/works in the widget*, change the embed runtime.

## Develop

No dependencies to install for the widget — it's vanilla JS.

```bash
npm run build     # build dist/webable.js + dist/webable.css
npm run smoke     # headless engine test (must pass)
npm run check     # syntax-check engine, runtime, and bundle
npm run serve     # http://localhost:8000/examples/embed-demo.html
```

Always run `npm run build` after editing `core/` or `embed/` so `dist/` stays in
sync, and `npm run smoke` before you push.

## Add a new tool (worked example)

A tool is a tiny `apply(state)` function plus its metadata and CSS. To add one:

1. **`core/webable-engine.js`**
   - add an id to `ALL_TOOLS`
   - add defaults to `TOOL_DEFAULTS`
   - add a `TOOL_META` entry (`cat`, `label`, `desc`, `icon`, `hasSettings`)
   - add `Tools.yourTool = { apply(s) { … toggle a `webable-…` root class or CSS var … } }`
   - if it has settings, add a case in the embed runtime's `detailControlsFor`
2. **`content.css`** — add the `html.webable-…` rule(s) your `apply` toggles.
   Keep every selector in the `.webable-*` / `html.webable-*` namespace.
3. **`scripts/smoke.mjs`** — add an assertion that toggling it produces the
   expected class/var.
4. `npm run build && npm run smoke`, then try it in `examples/embed-demo.html`.

Keep tools **reversible** (turning them off must fully restore the page) and
**non-destructive** to the native a11y stack.

## Pull requests

- Branch from `main`, keep PRs focused, describe the user-facing change.
- Run `npm run build && npm run smoke` and commit the rebuilt `dist/`.
- Test manually in `examples/embed-demo.html`, and with a screen reader if you
  can (NVDA/VoiceOver are free).
- By submitting a PR you agree to license your contribution under the project's
  [MIT License](LICENSE).

## Good first issues

- New tools (e.g. line-focus mask, link underliner, mute-all-media).
- Internationalization: the widget strings are English-only today; a strings map
  + `data-webable-locale` is a great first feature.
- Self-hosted fonts option (`data-webable-fonts="off"`).
- More cookie/consent and modal patterns for the killers.

Open an issue to claim one, or just start — we'll help in review.

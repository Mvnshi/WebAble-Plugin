# Architecture

WebAble is one engine with two front doors: a browser extension and a website
widget. The engine and the panel are shared; the extension adds a power layer
that the widget does not carry.

```
            packages/core                    packages/ui
   engine, 43 tools, profiles,      Preact panel in a shadow root,
   storage adapters, read aloud,    launcher, controls, extension-only
   AI providers, feed guard         blocks (stubbed out of the widget)
              │                                 │
              ├──────────────┬──────────────────┤
              │              │                  │
              │      packages/power             │
              │   command bar, phrasebook,      │
              │   click hints, page map,        │
              │   insights, Site Check          │
              │   (extension only)              │
              ▼              ▼                  ▼
      apps/extension (MV3)                 apps/widget
      content, background, popup,          loader + boot, 65 KB gzip
      report, welcome, options             budget, enforced in CI
              │                                 │
              ▼                                 ▼
         extension/                           dist/
   (committed, load unpacked)          (committed, served by jsDelivr)
```

## The engine

`createEngine()` owns a small store of feature settings. Every change runs
`reconcile()`, which calls each tool's idempotent `apply(setting, ctx)` or its
`disable(ctx)`. A tool touches the page only through its context: scoped
`<style>` tags, `data-webable-*` flags on `<html>`, `--wa-*` custom properties,
and nodes it registers so they can be removed. That is why every tool can be
switched off and leave the page exactly as it was.

A mutation observer with a max-wait deadline re-applies dynamic tools on pages
that never stop changing, and a route watcher re-applies everything on
single-page-app navigation.

Settings persist per site (`webable@<site>` in `chrome.storage.local`), with an
optional cross-site default and synced UI preferences in `chrome.storage.sync`.
The AI key lives in a device-local secret layer and never syncs.

## The extension

`content.js` runs at `document_start` in every frame, so saved settings land
before first paint and embedded players and comment threads get the same
treatment as the page around them. Frames apply settings but never render UI
or write storage. The top frame mounts the panel and the power layer.

Extension pages talk to the top frame of a tab with `chrome.tabs.sendMessage`
and `frameId: 0`:

| Message | From | Does |
| --- | --- | --- |
| `WEBABLE_GET_STATE` | popup | site, on/off, active tools, profile |
| `WEBABLE_TOGGLE`, `WEBABLE_OPEN`, `WEBABLE_CLOSE` | popup, shortcut | the panel |
| `WEBABLE_APPLY_PROFILE`, `WEBABLE_RESET`, `WEBABLE_SET_ENABLED` | popup | settings |
| `WEBABLE_COMMAND_BAR`, `WEBABLE_HINTS` | popup, shortcut | the power layer |
| `WEBABLE_RUN_INTENT` | popup | run any command bar intent in the page |
| `WEBABLE_INSIGHTS` | popup | suggestions for this page |
| `WEBABLE_SITE_CHECK`, `WEBABLE_HIGHLIGHT` | report | run the audit, point at a finding |

The background worker routes keyboard commands, opens the welcome page on
install, and opens the report and options pages when a tab asks.

## The power layer (`packages/power`)

- `intents.ts` turns a sentence into an `Intent`: toggle, set, adjust, profile,
  or action. Pure and unit tested; no model, no network.
- `fuzzy.ts` ranks the catalogue (tools, profiles, actions) and the page map
  (headings, landmarks, links) for whatever the phrasebook does not catch.
- `commands.ts` describes intents as rows and runs them, always returning an
  undo for anything it changed.
- `commandBar.tsx` is the UI: an ARIA 1.2 combobox in its own shadow root.
- `hints.ts` finds visible, unobscured clickables (including in open shadow
  roots) and labels them.
- `insights.ts` reads the page for problems it has and pairs each with a fix.
- `sitecheck.ts` audits the rendered page and keeps the elements behind each
  finding so the report can point at them.

None of it is imported by the widget, so none of it counts against the widget's
budget.

## Tests

- `scripts/test-core.mjs` bundles every `*.test.ts` with esbuild and runs it in
  Node's test runner under jsdom.
- `scripts/test-extension.mjs` loads the built extension into Chromium with
  Playwright and drives it against `examples/test-site`.
- `scripts/a11y-audit.mjs` runs axe over the mounted panel.
- `scripts/bundle-gate.mjs` fails the build if the widget exceeds 65 KB gzipped.
- CI rebuilds `extension/` and `dist/` and fails on any difference from what is
  committed.

## Upstream

`packages/core`, `packages/ui`, `packages/companion`, `apps/widget` and most of
`apps/extension` come from the WebAble platform repository at commit `f162a1f`.
New work in this repository lives in new files where it can (`packages/power`,
`apps/extension/src/power.ts`, the report and welcome pages) so changes can flow
back without conflicts.

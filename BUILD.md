# BUILD — Migration path to React + TypeScript + Vite

This v1.2 prototype is shippable as load-unpacked vanilla JS so you can demo to the Google M&A team without waiting on a build pipeline. The next milestone is migrating the codebase to **React 18 + TypeScript + Tailwind + shadcn/ui + Vite**.

This document is the work plan for that migration. It assumes one engineer-week.

## Target stack (locked)

- **Build:** Vite + `@crxjs/vite-plugin` (zero-config MV3 builds, HMR for content scripts)
- **UI:** React 18, TypeScript 5, Tailwind CSS 3.4, shadcn/ui (Radix primitives)
- **State:** Zustand for global, `chrome.storage.local` mirror via a `usePersisted()` hook
- **Tests:** Vitest for unit, Playwright for end-to-end against `demo.html`
- **A11y CI:** axe-core + Playwright + `@axe-core/playwright`. Every PR runs the suite.
- **Bundle ceiling:** 2 MB total. We're at ~58 KB today, so we have runway.

## Day 1 — Scaffold

```bash
npm create vite@latest webable -- --template react-ts
cd webable
npm i @crxjs/vite-plugin @types/chrome
npm i tailwindcss @tailwindcss/typography postcss autoprefixer
npm i zustand
npx tailwindcss init -p
npx shadcn-ui@latest init
```

Add `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
});
```

Move `manifest.json` to `manifest.config.ts` so the build can compute paths from imports.

## Day 2 — Move the design system to Tailwind

The CSS variables in `content.css` are the source of truth. Port them into `tailwind.config.ts` under `theme.extend.colors`:

```ts
colors: {
  wa: {
    bg: '#0B1220',
    'bg-2': '#0E1525',
    surface: '#131C2E',
    'surface-hi': '#182238',
    accent: '#2F80FF',
    'accent-soft': 'rgba(47,128,255,0.16)',
    success: '#1FCB8A',
    amber: '#F2B340',
    red: '#E5484D',
    text: '#F4F6FA',
    'text-2': '#9AA4B8',
    'text-3': '#6B768F',
  },
}
```

Re-implement the brand color picker and theme via Tailwind's `data-theme` strategy. The `webable-theme-light`, `webable-brand-green`, etc. classes today translate directly to `data-theme="light"` and `data-brand="green"` attributes on `<html>`.

## Day 3 — Tool registry to TypeScript modules

Each tool in `content.js` lives under `Tools.<id>` with `apply(state)`. Port to `src/tools/<id>.ts`:

```ts
// src/tools/types.ts
export type ToolCategory = 'vision' | 'reading' | 'motor' | 'cognitive' | 'hearing' | 'privacy';

export interface Tool<S> {
  id: string;
  category: ToolCategory;
  label: string;
  desc: string;
  defaults: S;
  apply(state: S): void;
  Settings?: React.FC<{ state: S; onChange(p: Partial<S>): void }>;
}
```

```ts
// src/tools/readingMode.ts
import type { Tool } from './types';
import { pickReadingTarget } from '../utils/dom';

interface S { active: boolean; font: string; size: number; /* ... */ }

export const readingMode: Tool<S> = {
  id: 'readingMode',
  category: 'vision',
  label: 'Reading Mode',
  desc: 'Strip the page. Read in a clean column.',
  defaults: { active: false, font: 'system', size: 18, /* ... */ },
  apply(s) { /* port from content.js */ },
};
```

Each module exports both the runtime logic (DOM mutator) and the React Settings component. The widget renders Settings via a registry lookup — no central switch statement.

## Day 4 — Floating widget as React

The current `content.js` mounts the panel as a single `<aside>` and re-renders innerHTML. Replace with a React root mounted inside a Shadow DOM (so host page CSS can't leak in):

```ts
// src/content/mount.tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';

const host = document.createElement('div');
host.id = 'webable-host';
document.body.appendChild(host);
const shadow = host.attachShadow({ mode: 'open' });
const styleEl = document.createElement('style');
styleEl.textContent = TAILWIND_INLINE_CSS; // Vite plugin inlines Tailwind into the bundle
shadow.appendChild(styleEl);

const mount = document.createElement('div');
shadow.appendChild(mount);
createRoot(mount).render(<App />);
```

Shadow DOM solves the host-page CSS pollution problem cleanly. Note: page-level mods (Reading Mode, High Contrast, etc.) still live in document `<head>` injected styles because they need to override the host page.

## Day 5 — Per-site memory hook

```ts
// src/lib/usePersisted.ts
import { useEffect, useState } from 'react';
export function usePersisted<T>(key: string, def: T) {
  const [val, setVal] = useState<T>(def);
  useEffect(() => {
    chrome.storage.local.get(key, (r) => r[key] !== undefined && setVal(r[key]));
    const listener = (changes: any) => { if (changes[key]) setVal(changes[key].newValue); };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [key]);
  const set = (next: T) => { setVal(next); chrome.storage.local.set({ [key]: next }); };
  return [val, set] as const;
}
```

Per-site state: `usePersisted('webable.perSite', {})`. On every navigation, content script reads `webable.perSite[location.hostname]` and applies stored tools if `alwaysOn`.

## Day 6 — Site Analyzer ↦ axe-core

Drop our custom heuristics in favor of axe-core's published rule set:

```bash
npm i axe-core
```

```ts
// src/analyzer/runAxe.ts
import * as axe from 'axe-core';

export async function runAudit(doc: Document) {
  return axe.run(doc, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa', 'best-practice'] },
  });
}
```

Render the result with the same UI we built. axe-core ships ~750 KB unminified; tree-shaking + rule-pruning brings it under 200 KB.

## Day 7 — CI + tests

`.github/workflows/ci.yml`:
- `npm run build` — Vite + crxjs.
- `npm run test` — Vitest unit (one per tool: assert `apply()` mutates the DOM as expected).
- `npm run e2e` — Playwright launches Chrome with the unpacked extension, opens `demo.html`, opens the panel, toggles each tool, runs `@axe-core/playwright` on the result. Asserts no new violations introduced by WebAble.
- `npm run a11y` — runs axe against the panel itself. WebAble's UI must pass WCAG 2.2 AA.

## Done

By end of week:

- One `npm run build` produces `dist/` ready for `chrome://extensions → Load unpacked` (or Web Store ZIP).
- The 21 Phase 1 tools are now individual TS modules with type signatures.
- The Site Analyzer is backed by axe-core's full rule set.
- Tailwind theme tokens are the source of truth for brand colour and theme.
- HMR works for the panel — edit a Settings component, panel updates without reload.
- Bundle size budget enforced in CI.

## Things we explicitly do NOT do in v1.2

- **No telemetry.** Even "anonymous usage stats." Privacy posture is the moat.
- **No cloud sync.** Phase 3 maybe, with end-to-end encryption. For now, `chrome.storage.local` is the storage spec.
- **No marketing page that says "AI accessibility."** See FTC v. accessiBe (Jan 2026). Our claims are bounded: "adapts the web to you, locally."
- **No Manifest V2 fallback.** Chrome dropped MV2 in 2024. We commit to MV3.
- **No silent PDF download (yet).** v1.2 ships PDF export via `window.print()` → "Save as PDF". jsPDF can be added in v1.3 — see the deferred bullet below.

## Phase 2 follow-ups (small, next sprint)

- **jsPDF for silent PDF download.** ~150 KB un-vendored. Wire `jspdf.umd.min.js` from `node_modules/jspdf/dist/` via Vite's `?url` import. The current `exportPdf()` in `analyzer.js` is shaped to be replaced one-for-one — the markdown→HTML pipeline already exists; just swap the print call for `doc.html()`.
- **Files API path for cross-origin images.** When `imageToInlineData()` hits `CORS_BLOCKED`, fall back to uploading the image bytes via Gemini's Files API and referencing by `file_uri`. Lets us caption images on sites with strict CORS like Pinterest / Instagram.
- **Live Captions (the honest one).** Two parallel tracks: (a) when Chrome ships built-in Live Captions for any tab audio (Chrome 115+ on desktop), wrap the existing API; (b) for older Chrome and cross-origin video, build a relay-server-on-localhost-only path that the user opts into. Don't ship a relay we run.
- **Plain Language: per-paragraph rewrite.** Right now we summarize the whole page. Add a context-menu action: select a paragraph → "WebAble: Simplify this paragraph" → in-place rewrite. Single Gemini call, no DOM-walk.

## Open questions for the Google team

1. **Distribution.** Web Store first, or skip directly to Chrome built-in? If built-in, what's the contribution model — patch series against `chromium/src/chrome/browser/ui/` or a separate component extension?
2. **Telemetry.** Chrome already collects UMA. Do we participate? If so, what's the privacy review path for a11y-tool usage?
3. **Brand.** "WebAble" is a placeholder. If acquired, does this become "Chrome Accessibility" / "Chrome Adapt" / a feature inside `chrome://settings/accessibility`?
4. **Phase 2 AI provider.** We default to Gemini today. If Chrome team wants to swap to on-device (Gemini Nano via WebGPU), the API key flow is the right abstraction — we just add a "device model" provider option.

— end of BUILD.md

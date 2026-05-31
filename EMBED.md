# WebAble Embed — add accessibility to your site in one line

The WebAble **widget** gives every visitor to your site the same accessibility
toolkit as the WebAble browser extension — **without anyone installing
anything.** You add one `<script>` tag; your visitors get 21 vision, reading,
motor, and cognitive tools plus 7 one-click profiles, and their choices are
remembered on their next visit.

It's the same engine as the extension (`core/webable-engine.js`), so behaviour
is identical whether a tool comes from the extension a user installed or from
the widget a site embedded.

---

## Install

### 1. One line (CDN — recommended)

Paste this right before `</body>` (or anywhere in `<head>` with `defer`):

```html
<script src="https://cdn.jsdelivr.net/gh/Mvnshi/WebAble-Plugin@main/dist/webable.js"
        data-webable defer></script>
```

That's it. A round accessibility button appears in the bottom-right corner.
The CSS is bundled into that one file — there is nothing else to add.

> **Pin a version for production.** `@main` always serves the latest commit.
> For a stable site, pin a tag or commit, e.g.
> `…/WebAble-Plugin@v2.0.0/dist/webable.js`.

### 2. Self-host

Copy `dist/webable.js` to your own server or asset pipeline and point the
`src` at it. No build step, no dependencies. (If you prefer the CSS separate,
`dist/webable.css` is the standalone stylesheet; the JS will skip injecting its
own copy if a `<style id="webable-embed-styles">` is already present.)

### 3. npm / bundlers

```bash
npm install webable
```

```js
import 'webable';                 // side-effect: boots the widget
// configure first (see below) via window.WebAbleConfig before import, or use the API after.
```

The framework-free engine is also importable on its own:

```js
import Engine from 'webable/engine';
const engine = Engine.createEngine({ document, window, toast, onChange });
```

---

## Configuration

Configure with `data-webable-*` attributes on the script tag, **or** by setting
`window.WebAbleConfig = { … }` before the script runs. Attributes are the easy
path; the JS object wins if both are present.

| Option | Attribute | Values | Default | What it does |
|---|---|---|---|---|
| Brand | `data-webable-brand` | `blue` `green` `purple` `mono` | `blue` | Named accent palette for the panel. |
| Custom color | `data-webable-color` | any `#hex` | — | Custom accent; overrides `brand`. |
| Theme | `data-webable-theme` | `auto` `light` `dark` | `auto` | Panel chrome theme (host page untouched). |
| Position | `data-webable-position` | `bottom-right` `bottom-left` `top-right` `top-left` | `bottom-right` | Where the launcher starts. Visitors can drag it. |
| Layout | `data-webable-layout` | `floating` `sidebar-right` `sidebar-left` | `floating` | Panel docking. |
| Name | `data-webable-name` | any string | `WebAble` | White-label the panel title. |
| Tools | `data-webable-tools` | comma list of [tool ids](#tool-ids) | all | Show only these tools. |
| Profiles | `data-webable-profiles` | `true` `false` | `true` | Show the Profiles tab. |
| Remember | `data-webable-remember` | `true` `false` | `true` | Persist + re-apply the visitor's tools on return. |
| Auto-open | `data-webable-auto-open` | `true` `false` | `false` | Open the panel automatically on load. |
| Hide launcher | `data-webable-hide-launcher` | `true` `false` | `false` | Hide the button; you open it via the [API](#javascript-api). |
| Attribution | `data-webable-attribution` | `true` `false` | `true` | Show the "Powered by WebAble" footer link. |
| Z-index | `data-webable-z` | integer | `2147483600` | Base stacking context for the widget. |

### Example: branded, sidebar, vision tools only

```html
<script src="https://cdn.jsdelivr.net/gh/Mvnshi/WebAble-Plugin@main/dist/webable.js"
        data-webable
        data-webable-color="#7c3aed"
        data-webable-layout="sidebar-right"
        data-webable-tools="readingMode,highContrast,textSize,colorFilter,bigCursor,focusRing"
        defer></script>
```

### Example: programmatic config

```html
<script>
  window.WebAbleConfig = {
    name: 'Acme Access',
    brand: 'green',
    remember: true,
    attribution: false      // hide the credit (please keep it if you can — it funds the project)
  };
</script>
<script src="https://cdn.jsdelivr.net/gh/Mvnshi/WebAble-Plugin@main/dist/webable.js" data-webable defer></script>
```

### Tool ids

`readingMode` `highContrast` `colorFilter` `textSize` `forceZoom` `bigCursor`
`readingRuler` `focusRing` `dyslexiaFont` `letterSpacing` `tts` `hideImages`
`clickTarget` `tooltipPin` `stickyKill` `autoScroll` `hideDistract` `stopAnim`
`focusMode` `cookieKill` `modalKill`

---

## JavaScript API

The script exposes a global `window.WebAble` for host pages, tag managers, or
your own "Accessibility" menu item:

```js
WebAble.open();                 // open the panel (optionally 'tools' | 'profiles')
WebAble.close();
WebAble.toggle();
WebAble.applyProfile('dyslexia');
WebAble.apply('highContrast');               // toggle a tool
WebAble.apply('textSize', { value: 150 });   // set a tool's options
WebAble.reset();                             // clear everything on the page
WebAble.showLauncher(false);                 // hide/show the floating button
WebAble.destroy();                           // remove the widget entirely
WebAble.version;                             // engine version string
WebAble.engine;                              // the live engine instance (advanced)
```

Wire it to your own button (great with `data-webable-hide-launcher="true"`):

```html
<button onclick="WebAble.open()">Accessibility</button>
```

---

## Framework recipes

**Plain HTML** — paste the one-liner before `</body>`.

**React / Next.js** — add it once in your root layout:

```jsx
// app/layout.jsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <script
          src="https://cdn.jsdelivr.net/gh/Mvnshi/WebAble-Plugin@main/dist/webable.js"
          data-webable
          defer
        />
      </body>
    </html>
  );
}
```

**Vue / Nuxt** — add to `nuxt.config.ts` `app.head.script`, or drop the tag in
`index.html`.

**WordPress** — paste the one-liner into your theme's footer (Appearance →
Theme File Editor → `footer.php`, before `</body>`), or use a "header & footer
scripts" plugin. No PHP required.

**Shopify** — Online Store → Themes → Edit code → `theme.liquid`, before
`</body>`.

**Webflow / Squarespace / Wix** — paste into the site-wide custom-code "Footer"
embed.

**Google Tag Manager** — new **Custom HTML** tag containing the one-liner,
trigger on *All Pages*.

---

## Privacy & data

- **No accounts, no tracking, no analytics.** The widget makes **zero** network
  calls of its own for the accessibility tools.
- **Settings live in the visitor's `localStorage`** under the key
  `webable.embed.v1`, scoped to your origin. Nothing is sent anywhere.
- **The one optional network request:** when a visitor turns on a dyslexia font
  or Reading Mode, the widget lazy-loads *Lexend* and *Atkinson Hyperlegible*
  from Google Fonts and *OpenDyslexic* from jsDelivr, so those typefaces render
  for people who don't have them installed. Want zero third-party requests?
  Self-host those fonts and we'll add a `data-webable-fonts="off"` switch — open
  an issue. (No fonts load unless a font tool is actually used.)
- **GDPR/CCPA:** because the widget stores only the visitor's own UI preferences
  on their own device and shares nothing, it is not a tracking technology and
  needs no consent banner of its own.

---

## How this is different from accessiBe / UserWay / AudioEye

WebAble is deliberately **not** an "AI overlay that makes your site compliant."
That category was [fined by the FTC](https://www.ftc.gov/news-events/news/press-releases/2026/01/ftc-takes-action-against-accessibe-deceptive-claims-disabled-users)
in January 2026 for deceptive claims.

- **We don't claim WCAG compliance.** The widget adapts the page for the
  individual visitor who opens it. It does not "fix" your site for crawlers or
  auditors, and it never injects a fake compliance badge.
- **It never poisons your accessibility tree.** WebAble does not set
  `aria-hidden` on focusable nodes, override `role`, or move focus away from the
  user. NVDA, VoiceOver, and Voice Control keep working.
- **No cloaking.** Nothing is shown to search engines that isn't shown to
  people. That honesty is the point.

**About SEO / GEO, honestly:** an accessibility widget does not magically raise
your rankings, and we won't pretend otherwise. What WebAble *does* do is
legitimate and helpful: it's tiny and `defer`-loaded so it doesn't hurt Core
Web Vitals, it doesn't cloak or inject markup that trips spam filters, and it
signals genuine accessibility investment. Real ranking and "generative engine"
(GEO) gains come from accessible, well-structured content — which WebAble
encourages but does not fake.

---

## AI features (roadmap)

The browser extension has BYOK AI features (alt-text generation, plain-language
summaries, page Q&A, OCR) using the visitor's own Gemini key. That model doesn't
fit a public site where visitors have no key, so the **widget ships
accessibility-first** and AI is opt-in:

- **Planned:** a `data-webable-ai-endpoint` that points at a proxy you host (the
  included [`backend/`](backend/) is a ready-made one) so the key stays
  server-side and AI works for every visitor securely.
- **Not** client-side keys — pasting a Gemini key into public HTML is an abuse
  risk, so we don't support it in the widget.

Track it in the issues, or help build it.

---

## Browser support

Evergreen Chrome, Edge, Firefox, Safari, and their mobile versions. The widget
degrades gracefully: if `localStorage` is unavailable (private mode quirks),
tools still work for the session; they just aren't remembered.

---

## Troubleshooting

- **Button doesn't appear:** check the console for CSP errors. If you have a
  strict `Content-Security-Policy`, allow the script source (your host or
  `cdn.jsdelivr.net`) and `style-src 'unsafe-inline'` (or self-host the CSS).
- **It's behind my header:** raise `data-webable-z`.
- **Two widgets:** the script guards against double-init, but make sure you only
  include it once.
- **Want it gone for a visitor segment:** don't render the tag for them, or call
  `WebAble.destroy()`.

Questions or requests? Open an issue — this is an open-source project and we
want it to work everywhere.

# Content-Security-Policy, caching, and browser support for the widget

Everything a site owner needs to know before the widget silently fails to
appear. These requirements were previously undocumented, which meant a strict
CSP produced no widget and no error.

## What the widget needs from your CSP

Assuming you serve it from `https://webable.cc`:

```
script-src  'self' https://webable.cc;
style-src   'self' 'unsafe-inline';
img-src     'self' data:;
font-src    'self' https://webable.cc;
connect-src 'self' https://generativelanguage.googleapis.com https://api.dictionaryapi.dev;
```

Line by line:

- **`script-src`** must allow the origin you load `widget.js` from. The loader
  injects `<script type="module" src=".../webable/boot.js">` from the same
  origin it was served from, so one entry covers both.
- **`style-src 'unsafe-inline'` is required.** The panel and every page-effect
  feature work by injecting `<style>` elements: that is the whole mechanism.
  There is no build-time stylesheet to allow instead. If your policy cannot
  carry `'unsafe-inline'`, the widget will load and do nothing visible.
- **`img-src data:`** is needed for the big-cursor feature, which is an inline
  SVG data URI, and for the AI alt-text tool, which reads an image into a data
  URL before describing it.
- **`font-src`** covers OpenDyslexic, served next to `boot.js`. Omit it and the
  dyslexia font falls back to a system face; nothing else breaks.
- **`connect-src`** is only needed if you leave the AI tools on. Gemini is the
  model provider; `api.dictionaryapi.dev` is the keyless dictionary behind the
  double-click definition and the Define button. Set
  `data-webable-ai="off"` and neither is contacted.

### Nonces

If your policy uses `script-src 'nonce-...'` rather than an origin allow-list,
put the nonce on the `widget.js` tag as usual. The loader reads its own nonce
and copies it onto the module it injects, so no second entry is needed.

```html
<script src="https://webable.cc/widget.js" nonce="{{ csp_nonce }}" async></script>
```

### When it does not load

The loader writes to `console.error` with a `[WebAble]` prefix when `boot.js`
fails to load, including the URL it tried. If you see nothing in the console and
no launcher, check that `widget.js` itself was allowed.

## Caching and versions

`widget.js` is served with `Cache-Control: must-revalidate`, so a deploy is
picked up on the next revalidation without a hard refresh.

You can add a query to force a refresh:

```html
<script src="https://webable.cc/widget.js?v=2026-08-15" async></script>
```

The loader forwards its own query to `boot.js`, so the bytes that matter are
busted too. Before this it did not, which made the query worse than useless: it
refreshed the 1.8 KB loader while the 50 KB of code behind it kept coming from
cache, and the site owner believed they had updated.

**This is a cache-bust, not immutable pinning.** The query does not pin a
version; there are no versioned paths, and the value is not checked against
anything. If you need a build that cannot change under you, self-host: copy
`widget.js` and the `webable/` directory to your own origin and update them on
your own schedule. Documentation that promised pinning here was describing
something that did not exist.

## Browser support

The widget is an ES module. It needs Chrome/Edge 61+, Firefox 60+, or Safari
11+. There is no `nomodule` fallback bundle: a second transpiled copy would
roughly double the payload for every visitor to serve a browser share this
small, and the widget has a hard 65 KB gzip budget.

Older browsers get a `[WebAble]` console error saying exactly this, rather than
the silence they used to get. If that trade is wrong for your audience, the
honest option today is to keep a server-rendered accessibility statement page
and link to it; do not assume the widget is quietly working.

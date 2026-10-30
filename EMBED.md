# The WebAble widget

The widget gives every visitor to your site the WebAble toolkit with nothing to
install: reader mode, text size, dyslexia fonts, contrast and colour tools,
motion controls, reading aids, read aloud and the one-click profiles. Visitors'
choices are remembered on their next visit.

It is the same engine as the browser extension, built from `packages/core` and
`packages/ui` in this repository. The extension-only parts (the command bar,
click hints, Site Check, the feed guard and "fix this site") are not in the
widget, which keeps it inside a hard 65 KB gzip budget that CI enforces.

## Add it

Paste this before `</body>`:

```html
<script src="https://cdn.jsdelivr.net/gh/Mvnshi/WebAble-Plugin@main/dist/widget.js" async></script>
```

A round accessibility button appears in the corner. That is the whole install.

- **Pin a version in production.** `@main` follows this repository. Pin a
  release tag instead, for example `@v3.0.0/dist/widget.js`.
- **Already using `dist/webable.js`?** That address keeps working and serves the
  same loader, so sites that pasted the v2 snippet get this version.
- **Self-host:** copy `dist/widget.js` and the `dist/webable/` folder next to
  each other on your server. The loader finds the rest relative to itself.

## Configure

Add `data-webable-*` attributes to the script tag, or set
`window.WebAbleConfig = { ... }` before it. Attributes win.

| Attribute | Values | Default |
| --- | --- | --- |
| `data-webable-color` | Any CSS colour, for the launcher and panel accent | WebAble blue |
| `data-webable-position` | `bottom-right`, `bottom-left`, `top-right`, `top-left` | `bottom-right` |
| `data-webable-theme` | `auto`, `light`, `dark`, `glass` | `auto` |
| `data-webable-name` | Panel title, to white-label it | `WebAble` |
| `data-webable-tools` | Comma-separated tool ids to show, for example `fontSize,darkMode,readerMode` | all |
| `data-webable-profiles` | `true`, `false` | `true` |
| `data-webable-remember` | Remember each visitor's choices: `true`, `false` | `true` |
| `data-webable-auto-open` | `true`, `false` | `false` |
| `data-webable-hide-launcher` | Hide the button and open the panel from your own control: `true`, `false` | `false` |
| `data-webable-statement` | URL of your accessibility statement, linked from the panel | none |
| `data-webable-attribution` | `true`, `false` | `true` |
| `data-webable-ai` | `on`, `off` | `on` |

```html
<script src="https://cdn.jsdelivr.net/gh/Mvnshi/WebAble-Plugin@main/dist/widget.js"
        data-webable-color="#7c3aed"
        data-webable-position="bottom-left"
        data-webable-statement="/accessibility"
        async></script>
```

## JavaScript API

`window.WebAble` exists as soon as the loader has run. Calls made before the
rest has loaded are queued and replayed, so a button wired to `WebAble.open()`
works from the first click. `webable:ready` fires on `document` when it is live.

```js
WebAble.open();                    // open the panel
WebAble.close();
WebAble.toggle();
WebAble.isOpen();                  // false until loaded
WebAble.set('darkMode', true);     // switch a tool on or off
WebAble.apply('fontSize', { active: true, value: 140 });
WebAble.applyProfile('dyslexia');
WebAble.reset();
WebAble.destroy();                 // remove it and put the page back
```

```html
<button type="button" onclick="WebAble.open()">Accessibility options</button>
```

## Content-Security-Policy

A strict CSP needs to allow the script origin and inline styles (every page
adjustment is a `<style>` element). The details, line by line, are in
[apps/widget/CSP.md](apps/widget/CSP.md).

## What it is, and is not

The widget adapts your pages for each visitor who wants it. It does not fix
your site's code, it does not make the site WCAG or ADA compliant, and it does
not hide anything from search engines. If you want the underlying problems
fixed, run Site Check from the extension and see
[webable.cc](https://webable.cc/business).

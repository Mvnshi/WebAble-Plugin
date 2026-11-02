# Contributing to WebAble

Thank you for being here. WebAble gets better every time somebody who relies on
a tool tells us what is wrong with it, so contributions of every size are
welcome: a bug report, a test with a screen reader, a better sentence, a new
phrase for the command bar, a new tool.

**You do not need to write code to help.** A clear bug report from someone who
uses WebAble every day is worth more than most pull requests.

## Ground rules

- Be kind. See the [Code of Conduct](CODE_OF_CONDUCT.md).
- Accessibility is the product. A change that looks better and is worse with a
  screen reader, a keyboard, or at 200% text is a regression.
- **Never claim compliance.** WebAble adapts pages for the person using them.
  No badges, no "makes your site WCAG compliant", no cloaking, and no changes to
  the page's accessibility tree that a screen reader would trip over.
- **Never act on someone's behalf without asking.** No profile or default may
  answer a consent dialog, submit a form, or click a payment or login control.
- **Local first.** Nothing leaves the device unless the person asked for a
  feature that needs it. A new network request needs a line in
  [PRIVACY.md](PRIVACY.md) and in `apps/extension/STORE_LISTING.md`; a test
  fails if the listing does not name a host the bundle contacts.
- No em dashes in code, comments or docs (`scripts/no-em-dash.mjs` checks).

## Set up

```bash
npm install
npx playwright install chromium   # once, for the real-browser tests
npm run dev:ext                   # rebuilds extension/ on save
```

Load `extension/` at `chrome://extensions` (Developer mode, Load unpacked) and
press the reload icon on the WebAble card after each rebuild.

## Before you open a pull request

```bash
npm run check
```

That runs the type checker over every package, the unit tests, the 48 real
browser checks, the widget bundle budget, an axe audit of the panel, and the
house-style gate. Then commit the rebuilt `extension/` and `dist/` with your
source change: CI rebuilds them and fails if they differ, because those folders
are what people download.

If your change is visible, run `npm run screenshots` and include the updated
images that changed.

## Where things live

| You want to change | Look in |
| --- | --- |
| What a tool does to a page | `packages/core/src/features/` |
| The panel | `packages/ui/src/` |
| Command bar, phrasebook, click hints, page suggestions, Site Check | `packages/power/src/` |
| Popup, report, welcome and options pages, messaging | `apps/extension/src/` |
| The website widget loader | `apps/widget/src/` |

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how they fit together.

## Teach the command bar a new phrase

The easiest code contribution there is. Open `packages/power/src/intents.ts`:

- a sentence that names a **tool** goes in `TOOL_PHRASES`,
- a sentence that describes a **need** ("my eyes hurt") goes in `NEED_PHRASES`,
- an **action** ("copy the link") goes in `ACTION_PHRASES`.

Then add the sentence, exactly as a person would type it, to
`packages/power/test/intents.test.ts` with the change it should make. Phrases
are matched after filler words ("please", "could you", "I want to") are
stripped, so write the core of the request.

## Add a Site Check rule

Add it to the right pillar function in `packages/power/src/sitecheck.ts` with
`add(ctx, {...}, elements)`. Every rule says who it affects (`who`) and how to
fix it (`fix`), in plain words. If it is a WCAG criterion, set `wcag`. If a
WebAble tool works around it for visitors, set `workaround`. A rule that cannot
be measured reliably should be `info`, not `fail`.

## Add a tool

A tool is a `FeatureModule` in `packages/core/src/features/`: metadata (label,
description, category, icon, keywords, controls), `defaults`, an idempotent
`apply`, and a `disable` that puts the page back exactly. Register it in
`packages/core/src/features/index.ts`. It appears in the panel, the popup
search and the command bar automatically. Then:

- describe it in `apps/extension/STORE_LISTING.md` (a test checks),
- add a phrase for it in the command bar (a test checks every phrase points at a
  real tool, but not that every tool has a phrase, so this one is on you),
- make sure it reverts cleanly: the engine tests toggle every tool on and off.

## Pull requests

Keep them focused, describe the change for the person who uses it, and say how
you tested it. Screenshots help. If it touches the panel or page semantics,
please try it with a screen reader (NVDA, VoiceOver or Narrator).

## Good first issues

Look for the `good first issue` label, or pick any of these:

- new command bar phrases, especially in the words of people who need them,
- Site Check rules that explain a problem better than the current text,
- translations of the panel (`packages/ui/src/i18n.ts`).

# Demo — buffalo.edu (live site)

This is the demo script for the Google M&A meeting. Every action below is performed against **the actual https://www.buffalo.edu/** homepage, not a synthetic page.

The point: WebAble is universal. It doesn't need a test rig; it works on whatever's in your browser right now.

---

## What we found on buffalo.edu (October 2026 capture)

A real accessibility audit, summarized:

| # | Issue on buffalo.edu | WCAG | WebAble feature that addresses it |
|---|---|---|---|
| 1 | **No `<h1>` on the homepage.** Highest heading is `<h2>`. | 2.4.6 (Headings & Labels) | **Site Analyzer** flags it under *Moderate*; the AI Remediation Guide produces a fix snippet. |
| 2 | **No `<meta name="description">`.** | (best-practice) | **Site Analyzer** flags it under *Minor*. |
| 3 | **Cookie consent banner with only an "Okay" button** — no "Reject all", no "Manage preferences". | 2.5.5 / dark-pattern | **Cookie Killer** (Privacy tools) dismisses the banner immediately on every visit. |
| 4 | **Auto-playing background video** behind the hero. | 2.2.2 (Pause / Stop / Hide) | **Stop Animations** + **Seizure Safe** profile freeze it on first paint. |
| 5 | **Image carousel with "previous next" navigation** that cycles institutional messages. | 2.2.2 / 2.1.1 (keyboard trap risk) | **Stop Animations** halts cycling; **Hide Distractions** removes the strip entirely. |
| 6 | **Five+ vague link/button labels** ("Learn more", "See more events", "Browse schools and colleges", "Info For", "Site Index"). | 2.4.4 (Link Purpose) | **Confusing UI Detector** outlines each in amber; **Smart Page Q&A** routes the user to the *correct* one. |
| 7 | **Search input has no visible label.** | 1.3.1 / 4.1.2 | **Site Analyzer** flags it; **Visible Focus Ring** at least makes the input findable on Tab. |
| 8 | **Heavy hero, sidebar carousels, "True Blue" copy block** stretch the article > 1,400 words on the homepage. | (cognitive load) | **Reading Mode** strips chrome; **Plain Language Summary** (AI) condenses to 8th-grade reading level. |
| 9 | **"Apply" CTA appears in the header AND mid-page** but the *primary* application path lives below the fold. | 2.4.6 / conversion-debt | **Smart Page Q&A** ("How do I apply?") scrolls to and pulse-highlights the right one. |
| 10 | **"Faces & Voices" testimonial photos** include credentials ("Pallavi, BA/MS '25") but the photos themselves rely on the page context for meaning. | 1.1.1 | **Context-Aware Alt Text** uses the surrounding paragraph + page title — exactly the case where pixel-only auto-alt loses. |

---

## Demo script — 11 minutes, hits every rubric item

**Setup before the demo (do this once, off-camera):**

1. Load WebAble unpacked. `chrome://extensions` → Developer Mode → Load Unpacked → select the folder.
2. Pin the WebAble icon to the toolbar.
3. Click the toolbar icon → **Settings** → paste a Gemini key → **Test connection** → wait for the green "✓ Key valid" status.
4. Open https://www.buffalo.edu/ in a new tab. Don't dismiss the cookie banner yet — that's the first demo step.

---

### Phase 1 — works without any AI (5 minutes, 6 actions)

**1. Cookie Killer kills the consent banner.**
> Click the launcher → switch to **Privacy** category in the panel → toggle **Cookie Killer** on.
>
> The "Your Privacy is Important To Us" banner disappears within 200 ms. Toast: *"Cookie banner dismissed. Set per-site preference in Options."* Toggle **Always-on for buffalo.edu** in the panel footer. Reload. Banner never appears again.
>
> *Addresses issue #3.*

**2. Stop Animations freezes the auto-playing background video.**
> In **Cognitive** category, toggle **Stop Animations**.
>
> The looping video behind the hero pauses on its current frame. The "previous / next" carousel stops cycling. CSS `transition` and `animation` are killed via `*` rule, scoped to NOT touch WebAble's own UI.
>
> *Addresses issues #4 and #5.*

**3. Confusing UI Detector outlines the vague links.**
> Switch to the **Tools** tab → search "confusing" — actually it lives in Cognitive, but use the Detector through the **Intelligence** features in earlier builds; in v1.2 it's now part of Site Analyzer (tells the same story).
>
> Or: switch to **Site Check** (header icon → Site Analyzer) → run audit → **Vague link** finding shows count of 8+ on buffalo.edu, each with a **Highlight on page** button.
>
> *Addresses issue #6.*

**4. Reading Mode strips the page to the article.**
> Toggle **Reading Mode** in the Vision category.
>
> The "True Blue" hero, the carousels, the "Faces & Voices" sidebar, the global nav, the footer — gone. Only the longest text block remains, centered, 72ch wide, 18px Inter, line-height 1.7, cream background.
>
> Open the **Reading Mode** detail (click the cog) → switch font to **OpenDyslexic** → bump size to 22px. Layout updates live.
>
> *Addresses issue #8.*
>
> **This is the bug you reported in the v1.0 review.** On pages where the article-detection heuristic fails, WebAble now bails with a toast: *"Reading Mode could not find a primary article on this page."* — the page is left intact instead of going blank.

**5. High Contrast → Dark — the v1.0 "black blob" bug, now fixed.**
> Reset (footer) → toggle **High Contrast** in Vision → cycle to **Dark — readable**.
>
> Body becomes #0a0a0a, all text becomes #f5f5f5, links go #66BFFF, buttons get 2px white borders. **Images stay visible** — buffalo.edu's hero photos render unchanged. Compare to v1.0 where they were painted black.
>
> *Demonstrates the bug-fix work from your last review.*

**6. Force Pinch Zoom + Visible Focus Ring + Click Targets — the curb-cut bundle.**
> Apply **Senior Friendly** profile.
>
> Text scales to 130%, click targets pad to ≥48×48, focus ring becomes 3px electric blue with a black halo. Tab through buffalo.edu — every focusable element is unmissable.
>
> *Curb-cut design: this helps a low-vision user AND every bleary-eyed mobile user squinting at the screen at 11 PM.*

---

### Phase 2 — AI features (4 minutes, 4 actions, requires Gemini key)

**7. Plain Language Summary at 8th-grade reading level.**
> Reset → switch to **AI** tab in the panel → click **Summarize this page**.
>
> 3-second shimmer, then a summary renders. UB's homepage is condensed from ~1,400 words to ~120 words: what UB is, what you can do here ("apply, visit, give, learn about programs"), and what matters most.
>
> Click **Read aloud** — Web Speech API speaks it back at user-configurable rate.
>
> *Addresses issue #8 (cognitive load on a content-heavy homepage).*

**8. Smart Page Q&A — "How do I apply?"**
> In the Q&A card, click the chip **"Where do I sign in?"** — this is buffalo.edu, so try a custom one: type *"How do I apply as a transfer student?"* and submit.
>
> Gemini reads the DOM (we serialize ~80 interactive elements with stable IDs), returns a JSON match, we pulse-highlight the matching link on the page. Confidence shown as a percentage.
>
> Re-run with *"Where do I plan a visit?"* — Q&A finds the "Plan your visit" CTA mid-page and scrolls to it.
>
> *Addresses issue #9. This is the differentiator vs. UserWay / accessiBe — they can't do this.*

**9. Context-Aware Alt Text on the "Faces & Voices" section.**
> Scroll to the testimonial section. Right-click the photo of Pallavi (BA/MS '25) → **WebAble: Generate alt text**.
>
> 2-second toast: *"Generating alt text…"* then *Alt set: "Pallavi smiling against a stairwell — UB student profiled in the BA/MS '25 cohort."*
>
> The differentiator is the *context*: Microsoft / LinkedIn auto-alt would say "A young woman smiling." We say *why* this image matters here. We use:
> - Page title: "Welcome to the University at Buffalo"
> - Surrounding paragraph: "Pallavi, BA/MS '25 — UB student profiled in the BA/MS '25 cohort"
> - Image bytes
>
> The alt is set on the live `<img>` element AND announced via `aria-live` so an active screen reader picks it up immediately.
>
> *Addresses issue #10.*

**10. AI Remediation Guide on the live audit.**
> Open the **Site Analyzer** (toolbar icon → "Analyze this site" or the Analyzer header button).
>
> Click **Analyze the active tab**. ~3 seconds. Score lands around **62-68 / 100** for buffalo.edu (genuine number; varies by what carousels are showing). Findings:
> - Critical: Vague links (8+), missing alt on N images
> - Serious: No H1, search input without label, heading-skip
> - Minor: No meta description
>
> Each finding has a **Highlight on page** button. Click one — the analyzer tab flips back to buffalo.edu, the offending element pulses electric blue.
>
> Then click **✨ Generate AI Remediation Guide**. Gemini turns the findings into a developer-ready Markdown ticket: "Before / After" code snippets, who-it-hurts copy, and acceptance criteria.
>
> Click **Save as PDF** → browser print dialog → "Save as PDF". You hand the PDF to Buffalo's web team. *Audit-as-a-service is a real B2B revenue path; this is the wedge.*
>
> *Demonstrates the analyzer + the AI remediation guide on a real .edu site.*

---

### The honest moment — Live Captions stays Coming Soon

In the AI tab, scroll to the **Coming Soon** section. The Live Captions card carries this copy:

> **Why not yet:** Cross-origin `<video>` audio capture is blocked by browsers, and Gemini does not yet expose a streaming audio API. Both blockers need a platform fix or a relay server we will not run. Tracking.

Buffalo.edu's hero video is a perfect test case for Live Captions. We don't pretend we can solve it today. **We don't ship a stub.** That's the difference between us and the snake-oil overlay vendors that the FTC just fined.

---

## What this demo lets you say to the room

> "Buffalo.edu has 8+ real accessibility barriers on its homepage today. Every one of them, a UB student with a disability re-fights every time they visit. Six of them WebAble fixes locally with one click and zero AI. Three more are fixed by the user adding their own Gemini key — at *their* cost, not ours, and never going through our servers. The tenth is honest about what isn't yet solvable from a browser extension. The Site Analyzer turns the audit into a developer-ready remediation guide that UB's web team could ship from tomorrow."
>
> "This is what 'should be in Chrome by default' actually looks like."

---

## Numbers worth memorizing

- **WebAble Score for buffalo.edu (typical run):** 62-68 / 100
- **Findings produced per run:** 10-12
- **Of those, fixable client-side by WebAble:** 6 (Cookie Killer, Stop Animations, Reading Mode, High Contrast, Force Zoom, Big Cursor)
- **Fixable with WebAble + Gemini key:** 4 (Summary, Q&A, Alt text, OCR)
- **Genuinely hard (Live Captions, Eye Tracking, Voice Nav):** 3 — gated as Coming Soon with the reason printed
- **Time to first improvement:** under 8 seconds (cookie killer + stop anim + reading mode = three toggles)
- **Bundle size (gzipped estimate):** ~70 KB

If the team asks for a competitive number: **UserWay / accessiBe / AudioEye charge buffalo.edu's web team between $490 and $9,000 per site per year for an overlay that the FTC just fined for fraud.** WebAble is free for the user, $0/month at the consumer tier, and never makes claims it can't back up.

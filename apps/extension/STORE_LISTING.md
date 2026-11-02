# WebAble: Chrome Web Store submission kit

Version 3.0.0 (MV3). Everything to paste into the Chrome Web Store developer
dashboard. Copy stays in the WebAble voice (no em dashes). Accurate to the
shipped `apps/extension` build (output in `extension/`).

---

## Basics

- **Name:** WebAble: Accessibility Tools
- **Summary (132 char max):**
  Adapt any website to you. Type what you need, click anything by keyboard, read aloud, and check any site in one click.
- **Category:** Accessibility
- **Language:** English (United States)
- **Privacy policy URL:** https://webable.cc/privacy

## Detailed description (store listing)

WebAble puts an accessibility menu on every website you visit, so you can adapt
any page to how you read, focus, click, and understand. And it makes everybody
faster: one shortcut and plain words do what used to take a menu, a mouse, and
knowing what everything is called.

New in 3.0

- The command bar (Ctrl+Shift+K, Cmd+Shift+K on Mac). Type what you need in your
  own words: "too bright", "text 150%", "I have dyslexia", "read this to me",
  "2x speed", "go to pricing", "search for gift cards". It understands the
  sentence on your device, with no AI and no network, and every change it makes
  comes with an Undo. Type "#" to jump to any heading, section or link on the
  page, or "?" to ask a question about the page (AI, optional).
- Click anything by keyboard (Alt+Shift+H). Every link, button and field you can
  see gets a short label; type it to click. Hold Shift to open a link in a new
  tab. Number mode, with words to filter ("type 14", or "checkout"), is built
  for voice control users.
- Suggestions for the page you are on. The toolbar button reads the page for the
  problems it actually has (a cookie banner over the article, a bright page
  while your system is in dark mode, text under 14px, a long read, video playing
  on its own) and offers the one fix for each. Nothing changes until you press it.
- Site Check: a report on any page in one click, from your own browser.
  Accessibility (measured colour contrast, button and link names, form labels,
  WCAG 2.2 target size and more), search basics, whether AI answer engines are
  allowed to read the site, and how fast this visit actually was. Every finding
  says who it affects and how to fix it, can be shown on the page, and exports
  as Markdown or PDF. It says plainly that automated checks catch only part of
  what matters.
- A welcome page that asks what gets in your way, in plain words, and shows the
  change on the spot before saving it as your default.

Three ways in: a small floating button WebAble adds to the corner of every page,
the toolbar button (which opens a quick menu of profiles, with "Open menu" for
the full panel), or the keyboard. Ctrl+Shift+U (Cmd+Shift+U on Mac) opens and
closes the panel from anywhere, and Alt+Shift+A does the same from inside the
page. The floating button can be moved to any corner, or dragged anywhere, or
turned off.

It works instantly, with no account and no setup. Your adjustments are remembered
per website and re-applied automatically the next time you visit, and you can
save a set as the default for every site you have not adjusted.

What you can do:

Reading and content
- Reader mode: reformat any article into a clean, centered reading column
- Scale text, switch to a readable or dyslexia-friendly font (OpenDyslexic ships with the extension; Lexend and Atkinson Hyperlegible are used if you already have them installed)
- Adjust line, letter, and word spacing, and text alignment
- Bionic reading: bold the first part of each word to pull the eye along
- Highlight links and headings
- Reading guide, reading mask, and a magnifier that follows your cursor
- Focus mode: dim everything except the paragraph you are reading, and follow you down the page

Color and contrast
- Dark mode for any light site, invert, high contrast, grayscale or adjustable saturation
- Color blindness filter: deuteranopia, protanopia, tritanopia, and achromatopsia, in assist or simulate mode
- Pick your own text, heading, and background colors

Motion and focus
- Stop animations and autoplay, hide images, hide distractions
- Mute every video and audio on the page, and stop autoplay un-muting them
- A strong focus ring, a big cursor, and bigger click targets
- Pin tooltips open, so a title you need to read does not vanish when you move

Power tools (for everyone, not just access needs)
- Expand every "show more / read more / FAQ", or collapse a page to its main content
- Clean copy: copy a selection as plain text, Markdown, or table CSV, plus a tracking-free URL
- Fix this site: hide, collapse, widen, or restyle an annoying element, remembered for that site (CSS only, fully reversible)
- Flag friction and scan for dark patterns: pre-checked boxes, auto-renew language next to a price, buried cancel paths, and "accept all" with no equal "reject all" (advisory only, and it never clicks anything)
- Hide cookie banners and give you the page back. It hides by default and submits nothing; clicking "reject" for you is a separate setting you have to turn on
- Break through sign-up walls and un-blur gated article text
- Dismiss newsletter and promo popups, and restore scrolling
- Turn off infinite feeds, and mute "enable notifications" nags
- Unpin sticky headers and hide chat bubbles so they stop following you
- Set the playback speed for every video and audio, faster or slower
- Boost volume above 100% on quiet videos
- Picture-in-picture: pop the page video into a floating window
- Hands-free auto-scroll for long reads
- Unlock text selection, copy, and right-click on sites that block them (editors and form fields keep their own behaviour)
- Force pinch-to-zoom on sites that disable it

Feed guard (YouTube, TikTok, Instagram, X)
- Sorts the cards in a social feed into 37 categories from their title and channel or account name, and hides the ones you did not pick. Pick the categories you want to see, block the ones you never want, or add your own topic.
- Hide short-form video (Shorts, Reels, the TikTok feed), clickbait titles, sponsored and promoted posts, comments, the left nav and up-next rail, live streams, and the DM inbox. Hidden cards can be taken out of the page or blurred in place; nothing is ever deleted, and a chip at the corner of the page says how many were hidden and gives them back in one press.
- Deep work mode narrows the whole feed to learning, work and finance. A focus session does the same for a set number of minutes.
- Set a daily limit per platform. It counts only while the tab is visible and focused, and shows a full-page reminder when the time is spent, with the option to give yourself ten more minutes.
- Optional: a category badge on each card, a traffic-light dot, and check and cross buttons to correct a wrong category. Corrections train the sort on this machine and are never uploaded or shared.
- The sort runs entirely in your browser against a word list packaged in the extension. AI assist, which sends only the title and channel name of cards the local sort could not place, is a separate switch and is off until you turn it on.

One-click profiles
- Seizure safe, Vision impaired, ADHD friendly, Cognitive / dyslexia, Keyboard / motor, Senior friendly, Privacy first, and Screen-reader assist

Read aloud
- Reads your selection or the whole article, with speed, pitch, and voice controls, using your browser's built-in speech (no key, no account)

Dictionary (no key, no account)
- Double-click any word, or press Define on a selection, for an instant definition with a button to hear it. The single word goes to the free api.dictionaryapi.dev, with no key and nothing else attached.

Guide (optional, AI)
- Ask how to do something on the page, and WebAble answers in plain words while pointing at the exact button or field to use next. Great for learning an unfamiliar site or helping someone who gets lost. Needs a Gemini key; never runs on its own. To answer, it sends Google the page title, the page address, and a list of the page's buttons, links and fields by their labels.
- You can also ask by voice. The microphone button uses your browser's built-in speech recognition, which in Chrome sends the recorded audio to Google's speech service for transcription and asks for microphone permission on the site you are on.

Optional AI assist (bring your own key)
- Add a free Google Gemini key to ask questions about a page, translate or explain a selection, simplify dense text, summarize an article, generate image alt text, or read the text out of an image. These features never run on their own, and content is sent directly from your browser to Google using your own key.
- What each one sends: the page's text for a question or a summary (with the page title), your selection for translate, explain and simplify, up to six images for alt text (each with the page title), and up to four images for reading text out of an image. Reading an image means downloading it from wherever the site serves it first.

WebAble is an adaptive overlay: it gives you personal, runtime control over how a
site looks and behaves. It does not modify the site for anyone else, and it does
not claim to make a site fully WCAG or ADA compliant.

## Single purpose (required field)

WebAble is an accessibility tool. Its single purpose is to let a user adapt any
website at runtime to their needs: text and contrast adjustments, reading aids,
motion controls, keyboard and focus enhancements, read-aloud, and optional
AI-assisted understanding. Reducing distraction is part of that same purpose and
always has been, which is where the Feed guard sits: it is the same runtime
adaptation the Hide distractions and Turn off infinite feeds tools already make,
carried far enough to be useful on the four sites where the distraction is the
product.

## Permission justifications (paste into the matching fields)

Reviewer note: every permission maps to a shipped feature. There is no remotely
hosted code; the entire extension is bundled at build time (esbuild) and ships
in the upload. Minimal set: `storage` + host access + a keyboard command.

- **storage**: Saves the user's accessibility preferences. Per-site tool
  settings, the site-specific "fix this site" rules, and the local friction log
  are stored on the device (chrome.storage.local). The panel theme and the
  read-aloud voice sync across the user's signed-in Chrome devices
  (chrome.storage.sync). The optional Google Gemini API key does NOT sync: it is
  a credential the user typed in, so it stays in chrome.storage.local on the
  device where it was entered. None of these preferences is sent to a WebAble
  server. (A subscriber's AI requests do reach WebAble's relay, which is a
  separate path described under Remote code below. No setting, rule or log
  travels with them.)

- **Host permission `<all_urls>`**: The accessibility tools must work on every
  website the user visits, so the content script renders the menu and applies
  the user's chosen adjustments to the current page. It runs in every frame of
  the page, so that an embedded video player, comment thread or cookie banner
  gets the same adjustments as the page around it rather than being left
  untreated; a frame renders no menu of its own. This host access is also
  what allows the opt-in "attach a screenshot to a friction note" feature to
  call chrome.tabs.captureVisibleTab, and only after the user explicitly chooses
  to attach one. WebAble collects no page content and does not track browsing.
  Two qualifications a reviewer should have rather than discover, because the
  unqualified sentence that used to stand here stopped being true when the
  features below shipped:
  - The optional AI features send only the specific content the user explicitly
    acts on. Without a subscription it goes to the user's own Google account and
    never to WebAble; with one it goes to WebAble's relay, which forwards it to
    the same Google API. See Remote code below.
  - The Feed guard does read page content, on four hosts only, to do its job: on
    youtube.com, tiktok.com, instagram.com and x.com it reads the title and the
    channel or account name shown on each feed card, matches them against a word
    list packaged in the extension, and hides the cards the user asked to hide.
    That reading happens in the page and stays there. It also keeps, in
    chrome.storage on the device: how many minutes a day the user spent on each
    of those four sites, how many cards it hid, a rolling log of the last fifty
    with their titles, and any category the user corrected. None of that is
    transmitted anywhere. The one exception is the AI assist switch, off by
    default, which is listed as its own network request below.

- **web_accessible_resources (`assets/*`)**: One file, the OpenDyslexic webfont,
  exposed so the dyslexia-font tool can apply it to the page being read.

- **Keyboard commands**: Ctrl/Cmd+Shift+K opens the command bar, Alt+Shift+H
  shows click hints, Ctrl/Cmd+Shift+U opens and closes the accessibility menu.
  (These are manifest `commands` entries, not permissions, so the store form has
  no field for them.) The same keys are also listened for inside the page, so
  they work where the browser could not bind them; that can be switched off in
  Settings.

- Permissions deliberately NOT requested: `activeTab` (redundant: the content
  script already runs via host access), `tabs`, `scripting`, `cookies`,
  `webRequest`, `history`, `bookmarks`. No analytics, no tracking. The code does
  call `chrome.tabs.query`, `chrome.tabs.sendMessage`, `chrome.tabs.create`,
  `chrome.tabs.update` and `chrome.tabs.captureVisibleTab`; none of those need
  the `tabs` permission, and captureVisibleTab is satisfied by the `<all_urls>`
  host access above. `chrome.tabs.create` opens the welcome page once on
  install, the Site Check report, and the browser's own shortcut settings page.

- **Remote code:** None. All extension code is packaged in the upload, and the
  one bundled font ships in the upload too. Network requests, all of them
  user-initiated:
  1. Optional AI calls to Google's Generative Language API
     (`generativelanguage.googleapis.com`) with the user's own key. The options
     page also calls it once, with no content, when the user presses "Test" on
     their key.
  1a. The same optional AI calls go instead to WebAble's own relay
     (`api.webable.cc`) when, and only when, the user has signed in to a paid
     subscription. The relay holds the operator's Google key and forwards the
     request to the same Google API, so the destination content reaches is
     unchanged; what changes is whose key pays for it. A user who has not signed
     in never contacts this host for AI. Sign-in itself (an emailed one-time
     link) and checkout also use this host.
  2. Word lookups to the free `api.dictionaryapi.dev`, one word at a time, with
     no key and no identifier. Two triggers: double-clicking a word, and the
     "Define" button on a selection.
  3. Reading an image (alt text, or reading the text out of an image) downloads
     that image from whatever host the site serves it from, so it can be sent on
     to Google. That is a request to a third-party host the page already chose.
  4. Voice input for the Guide uses the browser's built-in speech recognition.
     In Chrome that sends the recorded audio to Google's speech service.
  5. The Feed guard's optional AI assist, off by default. When on, and only for
     feed cards the on-device word list could not place, it sends up to twelve
     titles and their channel or account names, plus the list of category names
     it is choosing between, to the same destination as (1) and (1a): Google on
     the user's own key, or api.webable.cc for a subscriber. It sends no page
     address, nothing about what was watched, and nothing about the cards the
     local sort did place. With the switch off, no such request is ever made.
  6. Site Check, only when the user runs it, fetches `/robots.txt` and
     `/llms.txt` from the site being checked (the same origin as the page, with
     no cookies), to report whether AI crawlers are allowed in. Everything else
     it reports is read from the page already open. The report is built on the
     device and sent nowhere.
  7. Links, never requests: the Site Check report links to the W3C's WCAG
     explanations (`www.w3.org`) and, for site owners, to WebAble's services on
     `webable.cc`. Nothing is fetched from either host. Those links open only
     when clicked, carry `utm_` campaign parameters, and only the "Run the deep
     scan" link includes the address of the page that was checked, so the scan
     on webable.cc knows what to check. The welcome page links to the source code
     on GitHub.
  8. The command bar's "search this site" types into the site's own search box
     and submits it, exactly as if the user had typed it there. WebAble makes no
     request of its own.

## Data usage disclosures (Privacy practices tab)

Certify the following:

- **Personally identifiable information:** Not collected.
- **Health information:** Not collected.
- **Financial / payment information:** Not collected.
- **Authentication information:** Two optional credentials, both stored in
  chrome.storage.local on the device where they were obtained, never in
  chrome.storage.sync, and never logged.
  - The user's optional Gemini API key. It never leaves the machine except in
    the x-goog-api-key request header to Google when the user invokes an AI
    feature, and is never transmitted to WebAble.
  - For subscribers only, a session token issued by WebAble after the user
    proves control of their email address through a one-time link. There is no
    password: none is collected, stored or transmitted. The token is sent to
    api.webable.cc as a bearer credential on AI requests, and nowhere else.
- **Personal communications, location, web history, user activity:** Not
  collected by WebAble, and never transmitted to WebAble. Two qualifications a
  reviewer should have:
  - The dictionary tools send one word at a time to api.dictionaryapi.dev with
    no URL, page title, account, or identifier attached, so that request carries
    no browsing history.
  - The Feed guard records user activity, on the device and only for four hosts.
    Stating it plainly rather than leaning on "not transmitted": on
    youtube.com, tiktok.com, instagram.com and x.com it writes to
    chrome.storage.local a per-day count of active minutes on each of those
    sites, a count of hidden cards, a rolling log of the last fifty hidden cards
    including their titles, and any category the user corrected. Nothing is sent
    to WebAble and nothing leaves the machine, but a reviewer asking "does this
    keep a record of what I watched" deserves a yes with the shape of the record,
    not a no. The rules the user sets do ride chrome.storage.sync, so they roam
    with the signed-in profile; those name the four platforms and nothing else.
    Clearing it is one press: the panel offers Clear the log and Forget them.
  - The optional Guide feature does send the address of the page the user is
    asking about, along with its title and a list of its buttons, links and
    fields by their labels, to Google, on that user's own key, or by way of
    api.webable.cc when the user is signed in to a subscription. It runs only
    when the user types or speaks a question, and never on its own. Asking for
    help with a page necessarily means describing that page.
  - What the relay retains, stated per party because it is only checkable for
    one of them: WebAble's database stores a daily request count and the
    category of the last request, and no request body, page text or URL is
    written to any table. WebAble's logs record errors rather than content,
    though an error message returned by Google and logged by us could quote a
    fragment of what was sent. What Google retains is governed by the terms
    applying to the key in use and is not something WebAble asserts.
- **Website content:** Processed locally to apply the user's adjustments. For the
  optional AI features only, and only on an explicit user click, the specific
  content acted on is sent directly to the user's chosen AI provider (Google):
  the page's text for a question or summary, the user's selection for translate,
  explain and simplify, up to six images for alt text, and up to four for reading
  the text out of an image. The page title accompanies the summary and alt-text
  calls. It is not collected by WebAble. On the bring-your-own-key path it does
  not touch a WebAble server at all; for a signed-in subscriber it passes
  through the relay on its way to Google, which writes no request body to any
  table (see Remote code above for what the relay does retain).
- **Audio:** Only when the user presses the Guide's microphone button. That uses
  the browser's built-in speech recognition, which in Chrome sends the recorded
  audio to Google's speech service and prompts for microphone permission on the
  current site. WebAble neither receives nor stores audio.
- **Command bar usage counts:** how many times each command was used, kept in
  chrome.storage.local so frequent commands rank first. Never transmitted.
  Cleared with everything else by "Clear all WebAble data".
- **Stored on the device, never transmitted:** the friction log the user creates
  by flagging something (the page address with tracking parameters stripped, a
  short reason, a description of the element, and an optional screenshot the
  user opts into per capture) and the "fix this site" rules, both in
  chrome.storage.local.

Also certify:
- I do not sell or transfer user data to third parties outside the approved use cases.
- I do not use or transfer user data for purposes unrelated to the item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending.

## Assets checklist

- [x] Store icon 128×128 (`icons/icon128.png`, generated from the WebAble mark)
- [x] Small promo tile 440×280 (`apps/extension/store/promo-440x280.png`)
- [x] Optional marquee promo 1400×560 (`apps/extension/store/promo-marquee-1400x560.png`)
- [ ] At least 1 screenshot, 1280×800 or 640×400 (capture the open panel on a real
      site and the popup; see "Screenshots" below)

## Screenshots (you capture these)

Load the unpacked extension (`extension/`), open a content-rich page, then:
1. Open the command bar (Ctrl+Shift+K), type "too bright", and screenshot it.
2. Press Alt+Shift+H and screenshot the click hints.
3. Screenshot the toolbar popup on a page with suggestions.
4. Run Site Check and screenshot the report.
5. Open the panel (toolbar button, All tools) and screenshot it over the page.
The README's screenshots in `docs/screenshots/` are generated by
`npm run screenshots` and are a good starting point.
Crop/scale each to 1280×800 (or 640×400) PNG.

## Submission steps

1. `npm run build:extension`
2. `npm run package:extension` (produces `apps/extension/store/webable-extension-vX.Y.Z.zip`).
   A tagged release on GitHub (`v3.0.0`) builds the same zip in CI and attaches it.
3. Chrome Web Store dashboard (developer account, one-time 5 USD fee) → New item →
   upload the zip.
4. Fill listing (above), upload icon + promo tile + screenshots, set privacy
   policy URL, complete the Privacy practices tab, submit for review.

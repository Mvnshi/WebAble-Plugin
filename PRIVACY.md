# Privacy

WebAble is a browser extension and website widget that changes how pages look
and behave for the person using them. This page says what it stores, what it
sends, and to whom. It covers the code in this repository; the hosted services
on webable.cc have their own policy at <https://webable.cc/privacy>.

## The short version

- No account is needed, and none is created.
- No analytics, no telemetry, no tracking, no advertising.
- Everything WebAble does to a page happens in your browser.
- Something leaves your browser only when you ask for a feature that needs it,
  and only the thing that feature needs.

## What is stored, and where

| What | Where | Leaves the device? |
| --- | --- | --- |
| Tool settings for each site, "fix this site" rules, the friction log | `chrome.storage.local` | No |
| Your default settings for every site, panel theme, read-aloud voice, feed guard rules, keyboard preferences, sites you switched WebAble off on | `chrome.storage.sync` | Synced by your browser to your other signed-in browsers, as Chrome sync does for any extension. Not sent to WebAble. |
| Your Google Gemini API key (optional) | `chrome.storage.local` | Only to Google, in the request header of an AI call you make. Never synced. |
| A WebAble Pro session token (subscribers only) | `chrome.storage.local` | Only to `api.webable.cc`, with AI requests. Never synced. |
| Command bar usage counts, so frequent commands rank first | `chrome.storage.local` | No |
| Feed guard minutes per day, hidden-card counts and a log of the last fifty hidden titles (YouTube, TikTok, Instagram and X only) | `chrome.storage.local` | No |

**Settings → Clear all WebAble data** removes all of it, on this device and from sync.

## What is sent, and when

| When you | What is sent | To |
| --- | --- | --- |
| Use an AI feature with your own key | The page text, selection or image you acted on, and the page title for summaries and alt text | Google's Generative Language API, directly from your browser |
| Use an AI feature as a WebAble Pro subscriber | The same | `api.webable.cc`, which forwards it to the same Google API. No request content is written to WebAble's database. |
| Ask the on-page Guide a question | Your question, the page address and title, and the labels of the page's buttons, links and fields | As above |
| Use voice input in the Guide | Your recorded audio | Your browser's speech service (Google, in Chrome) |
| Double-click a word or press Define | That one word | `api.dictionaryapi.dev` |
| Run Site Check | A request for `/robots.txt` and `/llms.txt` on the site you are checking, without cookies | That same site |
| Click a link in a Site Check report | The link you chose. Only "Run the deep scan" includes the address of the page you checked. | `webable.cc` or `www.w3.org` |
| Type "search for ..." in the command bar | Your words go into the site's own search box, as if you typed them there | The site you are on |

Nothing else. WebAble does not read, collect or send your browsing history, and
it never sends anything on its own schedule.

## Permissions

- **storage**: to remember your settings.
- **Access to all sites**: the tools have to work on whatever page you open, so
  the content script runs there and in the frames inside it. It changes how the
  page looks for you; it does not collect what is on it.

WebAble does not request `tabs`, `history`, `cookies`, `webRequest`,
`scripting` or `bookmarks`.

## Contact

Questions or concerns: open an issue at
<https://github.com/Mvnshi/WebAble-Plugin/issues>, or report a security problem
privately as described in [SECURITY.md](SECURITY.md).

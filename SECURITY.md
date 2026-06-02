# Security policy

WebAble runs in browsers on other people's sites and in the user's own browser
as an extension, so we take security seriously. Thank you for helping keep the
project and its users safe.

## Supported versions

| Version | Supported |
|---|---|
| 2.x (current) | ✅ |
| 1.x (extension only, pre-embed) | security fixes only |

## Reporting a vulnerability

**Please do not open a public GitHub issue for a security problem.** Instead:

- Use GitHub's [private vulnerability reporting](https://github.com/Mvnshi/WebAble-Plugin/security/advisories/new) — the easiest and preferred path.
- Or email the maintainer directly (see GitHub profile).

Include:

- What the problem is and the impact you think it has
- Steps to reproduce or a minimal proof-of-concept
- The affected version (commit SHA or tag)
- Whether you'd like to be credited in the fix

You can expect a first response within **72 hours** and, for valid reports, a
public fix as quickly as we can responsibly ship one. We'll keep you in the loop
either way.

## Scope

In scope:

- The embeddable widget (`dist/webable.js`, `core/`, `embed/`)
- The browser extension (`content.js`, `background.js`, `popup.*`, `options.*`, `analyzer.*`, `manifest.json`)
- The build (`scripts/build-embed.mjs`) and CI workflow
- The optional backend AI proxy under `backend/`

Out of scope:

- Vulnerabilities in third-party CDNs we recommend (jsDelivr, Google Fonts) — please
  report those to the respective providers
- Self-XSS that requires the user to paste attacker-controlled code into devtools
- Issues that require a compromised browser or operating system

## Hardening notes for embedders

If you embed WebAble on your site:

- The widget runs in the same JS context as your page; it does not need any
  special CSP exemptions beyond allowing the script source you load it from
  (your origin or `cdn.jsdelivr.net`) and `style-src 'unsafe-inline'` for its
  injected stylesheet. If you self-host both the JS and the standalone CSS file,
  you can drop the inline-style requirement.
- Settings are stored only in the visitor's `localStorage` under
  `webable.embed.v1`, scoped to your origin. No cross-origin data is shared.
- The widget does **not** make network calls of its own for the accessibility
  tools. The only optional outbound request is to load reading fonts (Lexend,
  Atkinson Hyperlegible, OpenDyslexic) when a font-related tool is turned on.

/**
 * Eager launcher stylesheet: injected when the widget first mounts. Tiny: just
 * the shadow-root reset, the brand design tokens (shared by the lazy panel), and
 * the launcher button itself. The panel's own (larger) stylesheet ships in the
 * lazy chunk and is injected on first open. Because both live in the same shadow
 * root, the panel inherits these tokens.
 */
export const LAUNCHER_CSS = /* css */ `
:host {
  all: initial;
  --wa-accent: #1e40af;
  --wa-accent-2: #38bdf8;
  --wa-accent-text: #1e40af;
}

.wa-root {
  /* Neutralize inherited host typography. */
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  font-weight: 400;
  letter-spacing: normal;
  text-align: left;
  font-style: normal;
  text-transform: none;
  -webkit-font-smoothing: antialiased;

  --ink: #0a1b2e;
  --text: #283549;
  --mute: #5b6b80;
  --surface: #ffffff;
  --surface-2: #f6f7f9;
  --surface-3: #eef1f5;
  --hairline: rgba(15, 23, 42, 0.10);
  --hairline-strong: rgba(15, 23, 42, 0.16);
  --accent: var(--wa-accent);
  --accent-soft: color-mix(in srgb, var(--accent) 12%, transparent);
  --accent-ring: color-mix(in srgb, var(--wa-accent-2) 55%, transparent);
  /* Fallback only: root.tsx sets --on-accent from the resolved accent so a
     light brand colour gets dark text instead of unreadable white. */
  --on-accent: #ffffff;
  /* Accent as text/icon/focus on a surface. root.tsx supplies
     --wa-accent-text, the accent darkened until it clears 4.5:1 on white;
     this used to alias the raw accent, so a pale brand colour made every
     focus ring in the panel invisible in the default theme. Dark and glass
     lighten it themselves below. */
  --accent-text: var(--wa-accent-text, var(--accent));
  --danger: #dc2626;
  --warn: #92400e;
  --warn-edge: #b45309;
  --shadow: 0 24px 60px -24px rgba(10, 27, 46, 0.40), 0 2px 8px -3px rgba(10, 27, 46, 0.16);
  --radius: 12px;
  color: var(--text);
}

.wa-root[data-theme='dark'] {
  --ink: #f3f7fc;
  --text: #d9e2ee;
  --mute: #94a3b8;
  --surface: #0f1722;
  --surface-2: #16202e;
  --surface-3: #1f2a3a;
  --hairline: rgba(255, 255, 255, 0.10);
  --hairline-strong: rgba(255, 255, 255, 0.18);
  --accent-soft: color-mix(in srgb, var(--accent) 26%, transparent);
  --accent-text: color-mix(in srgb, var(--accent) 42%, #fff);
  --danger: #f87171;
  --warn: #fbbf24;
  --warn-edge: #f59e0b;
  --shadow: 0 24px 70px -20px rgba(0, 0, 0, 0.6);
}

/* Glass: frosted dark. 0.86 alpha keeps even --mute AA over the worst case
   (glass composited over a white host); backdrop blur does the rest. Falls back
   to a near solid where backdrop-filter is unsupported / transparency reduced. */
.wa-root[data-theme='glass'] {
  --ink: #f4f8fd;
  --text: #e4ecf6;
  --mute: #aab8cc;
  --surface: rgba(16, 23, 34, 0.86);
  --surface-2: rgba(255, 255, 255, 0.07);
  --surface-3: rgba(255, 255, 255, 0.13);
  --hairline: rgba(255, 255, 255, 0.14);
  --hairline-strong: rgba(255, 255, 255, 0.24);
  --accent-soft: color-mix(in srgb, var(--accent) 30%, transparent);
  --accent-text: color-mix(in srgb, var(--accent) 34%, #fff);
  --danger: #fca5a5;
  --warn: #fcd34d;
  --warn-edge: #f59e0b;
  --shadow: 0 30px 80px -24px rgba(0, 0, 0, 0.65);
  --on-accent: #ffffff;
}
@supports not ((backdrop-filter: blur(2px)) or (-webkit-backdrop-filter: blur(2px))) {
  .wa-root[data-theme='glass'] { --surface: rgba(16, 23, 34, 0.97); }
}
@media (prefers-reduced-transparency: reduce) {
  .wa-root[data-theme='glass'] { --surface: rgba(16, 23, 34, 0.98); }
}

.wa-root *, .wa-root *::before, .wa-root *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so component rules like
   .wa-launcher's background (same class-level specificity) always win. Before
   this, a bare \`.wa-root button\` outranked them and blanked the launcher. */
.wa-root :where(button) { font: inherit; color: inherit; cursor: pointer; background: none; border: 0; padding: 0; }

.wa-launcher {
  position: fixed;
  z-index: 2147483640;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  width: 54px;
  height: 54px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  color: var(--on-accent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 88%, white), var(--accent));
  box-shadow: 0 10px 24px -8px color-mix(in srgb, var(--accent) 60%, transparent), 0 2px 6px rgba(10,27,46,.2);
  transition: transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s;
}
.wa-launcher:hover { transform: translateY(-2px) scale(1.03); }
.wa-launcher:active { transform: translateY(0) scale(.98); }
/* Opaque, and paired with a white halo so it clears 3:1 on a light or a dark
   host page. It used to be a 55% alpha wash of the sky accent: measured 1.53:1
   on white, 1.47:1 on #f5f5f5, 1.38:1 on mid grey. The 3px offset means the
   ring never touches the button, so its contrast against the accent fill never
   applied. This is the focus indicator on the only control that exists before
   the panel opens. */
.wa-launcher:focus-visible {
  outline: 3px solid #0a1b2e;
  outline-offset: 3px;
  box-shadow: 0 0 0 3px #fff, 0 10px 24px -8px color-mix(in srgb, var(--accent) 60%, transparent);
}
.wa-launcher-badge {
  position: absolute; top: -3px; right: -3px;
  min-width: 20px; height: 20px; padding: 0 5px;
  border-radius: 999px; background: var(--ink); color: #fff;
  font-size: 11px; font-weight: 600; line-height: 20px; text-align: center;
  box-shadow: 0 0 0 2px var(--surface);
}
.wa-pos-bottom-right { right: 20px; bottom: 20px; }
.wa-pos-bottom-left  { left: 20px;  bottom: 20px; }
.wa-pos-top-right    { right: 20px; top: 20px; }
.wa-pos-top-left     { left: 20px;  top: 20px; }

@media (prefers-reduced-motion: reduce) {
  .wa-root *, .wa-root *::before, .wa-root *::after { animation: none !important; transition: none !important; }
}
`;

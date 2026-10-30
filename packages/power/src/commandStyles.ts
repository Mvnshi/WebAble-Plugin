/**
 * Command bar styles. Lives in the bar's own shadow root, so nothing the page
 * does can reach it and nothing here can leak onto the page.
 *
 * Sizes are px on purpose. Text size works by scaling the page's rem, and a
 * bar sized in rem would grow with it until it no longer fit the screen of the
 * person who needed the bigger text.
 */
export const COMMAND_CSS = /* css */ `
:host { all: initial; }
.wa-cmd-root {
  --bg: #ffffff;
  --bg-2: #f5f7fb;
  --ink: #0a1324;
  --text: #2a364b;
  --mute: #66748a;
  --line: rgba(10, 19, 36, 0.09);
  --line-2: rgba(10, 19, 36, 0.16);
  --accent: #1e40af;
  --accent-2: #2f80ff;
  --accent-soft: rgba(47, 128, 255, 0.10);
  --on: #0f8a5f;
  --mark: #fff1a8;
  --shadow: 0 40px 100px -30px rgba(8, 15, 35, 0.55), 0 8px 24px -10px rgba(8, 15, 35, 0.25);
  font: 400 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}
.wa-cmd-root[data-theme='dark'] {
  --bg: #0e1522;
  --bg-2: #151e2e;
  --ink: #f2f6fc;
  --text: #d5deea;
  --mute: #8c9ab0;
  --line: rgba(255, 255, 255, 0.08);
  --line-2: rgba(255, 255, 255, 0.16);
  --accent: #8fb4ff;
  --accent-2: #5b9bff;
  --accent-soft: rgba(91, 155, 255, 0.16);
  --on: #43d19e;
  --mark: rgba(255, 216, 77, 0.28);
  --shadow: 0 40px 120px -20px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.06);
}
*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
kbd {
  font: 600 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  padding: 3px 5px; min-width: 18px; text-align: center; display: inline-block;
  border-radius: 5px; color: var(--mute);
  background: var(--bg-2); border: 1px solid var(--line-2); border-bottom-width: 2px;
}
.wa-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.wa-cmd-scrim {
  position: fixed; inset: 0; z-index: 2147483645;
  background: rgba(6, 11, 24, 0.38);
  -webkit-backdrop-filter: blur(3px) saturate(120%);
  backdrop-filter: blur(3px) saturate(120%);
  display: flex; justify-content: center; align-items: flex-start;
  padding: max(10vh, 24px) 16px 16px;
  animation: wa-fade .14s ease-out;
}
.wa-cmd {
  width: min(680px, 100%);
  max-height: calc(100vh - 12vh - 32px);
  display: flex; flex-direction: column;
  background: var(--bg); color: var(--text);
  border: 1px solid var(--line-2);
  border-radius: 18px;
  box-shadow: var(--shadow);
  overflow: hidden;
  animation: wa-rise .18s cubic-bezier(.2, .9, .3, 1.15);
}
.wa-cmd-field {
  display: flex; align-items: center; gap: 12px;
  padding: 0 16px; min-height: 64px;
  border-bottom: 1px solid var(--line);
}
.wa-cmd-mark { display: grid; place-items: center; flex: none; }
.wa-cmd-input {
  flex: 1; min-width: 0; height: 62px;
  border: 0; outline: none; background: transparent;
  font-family: inherit; font-size: 19px; font-weight: 450; line-height: 1.2; color: var(--ink);
  letter-spacing: -0.01em;
}
.wa-cmd-input::placeholder { color: var(--mute); opacity: .85; }
.wa-cmd-chip {
  display: inline-flex; align-items: center; gap: 6px; flex: none;
  font-family: inherit; font-size: 12px; font-weight: 600; line-height: 1; color: var(--accent);
  padding: 6px 9px; border-radius: 999px; background: var(--accent-soft);
}
.wa-cmd-esc { flex: none; }

.wa-cmd-list {
  list-style: none; margin: 0; padding: 6px 8px 8px;
  overflow-y: auto; max-height: min(460px, 58vh);
  scrollbar-width: thin;
}
.wa-cmd-group {
  font-family: inherit; font-size: 10.5px; font-weight: 650; line-height: 1;
  letter-spacing: .1em; text-transform: uppercase; color: var(--mute);
  padding: 14px 10px 6px;
}
.wa-cmd-group:first-child { padding-top: 8px; }
.wa-cmd-row {
  position: relative;
  display: flex; align-items: center; gap: 12px;
  min-height: 44px; padding: 8px 10px; border-radius: 11px;
  color: var(--text); cursor: pointer;
}
.wa-cmd-row.is-active { background: var(--accent-soft); color: var(--ink); }
.wa-cmd-row.is-active::before {
  content: ''; position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px; border-radius: 3px;
  background: linear-gradient(var(--accent-2), var(--accent));
}
.wa-cmd-icon {
  width: 30px; height: 30px; flex: none; display: grid; place-items: center;
  border-radius: 8px; background: var(--bg-2); color: var(--mute);
  border: 1px solid var(--line);
}
.wa-cmd-row.is-active .wa-cmd-icon, .wa-cmd-row.is-best .wa-cmd-icon {
  color: var(--accent); border-color: transparent;
  background: color-mix(in srgb, var(--accent-2) 16%, var(--bg));
}
.wa-cmd-title { flex: 1; min-width: 0; font-size: 14.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wa-cmd-row.is-best .wa-cmd-title { font-weight: 620; color: var(--ink); }
.wa-cmd-title mark { background: var(--mark); color: inherit; border-radius: 3px; padding: 0 1px; }
.wa-cmd-meta {
  flex: none; max-width: 42%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 12px; color: var(--mute);
}
.wa-cmd-meta.is-on { color: var(--on); font-weight: 650; }
.wa-cmd-meta.is-on::before { content: ''; display: inline-block; width: 7px; height: 7px; margin-right: 6px; border-radius: 50%; background: currentColor; vertical-align: 1px; }
.wa-cmd-enter { color: var(--accent); flex: none; display: grid; }

.wa-cmd-empty { padding: 22px 14px; color: var(--mute); line-height: 1.6; }
.wa-cmd-examples { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.wa-cmd-example {
  font-size: 12.5px; padding: 6px 10px; border-radius: 999px;
  background: var(--bg-2); border: 1px solid var(--line-2); color: var(--text);
}
.wa-cmd-example:hover, .wa-cmd-example:focus-visible { border-color: var(--accent-2); color: var(--ink); }

.wa-cmd-answer { padding: 18px 20px 16px; overflow-y: auto; max-height: min(480px, 60vh); }
.wa-cmd-answer-title { display: flex; align-items: center; gap: 8px; font-weight: 650; color: var(--ink); font-size: 15px; margin-bottom: 10px; }
.wa-cmd-answer-title svg { color: var(--accent); }
.wa-cmd-answer-text { white-space: pre-wrap; font-size: 15px; line-height: 1.65; color: var(--text); }
.wa-cmd-answer-text.is-error { color: #d14343; }
.wa-cmd-answer-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.wa-btn {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600; padding: 8px 12px; border-radius: 9px;
  background: var(--bg-2); border: 1px solid var(--line-2); color: var(--ink);
}
.wa-btn:hover { border-color: var(--accent-2); }
.wa-btn.is-primary { background: var(--accent); color: #fff; border-color: transparent; }
[data-theme='dark'] .wa-btn.is-primary { color: #0a1324; }
.wa-btn:focus-visible, .wa-cmd-example:focus-visible, .wa-toast-undo:focus-visible { outline: 2px solid var(--accent-2); outline-offset: 2px; }
.wa-cmd-thinking { display: flex; gap: 6px; padding: 8px 0; }
.wa-cmd-thinking span { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-2); animation: wa-dot 1s infinite ease-in-out; }
.wa-cmd-thinking span:nth-child(2) { animation-delay: .15s; }
.wa-cmd-thinking span:nth-child(3) { animation-delay: .3s; }
.wa-cmd-help { margin: 0; display: grid; gap: 8px; }
.wa-cmd-help div { display: grid; grid-template-columns: 150px 1fr; align-items: center; gap: 12px; }
.wa-cmd-help dt { margin: 0; }
.wa-cmd-help dd { margin: 0; color: var(--text); }
.wa-cmd-tip { margin: 14px 0 0; color: var(--mute); font-size: 13px; line-height: 1.6; }

.wa-cmd-foot {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 10px 16px; border-top: 1px solid var(--line);
  font-size: 12px; color: var(--mute); background: var(--bg-2);
}
.wa-cmd-foot span { display: inline-flex; align-items: center; gap: 4px; }
.wa-cmd-brand { margin-left: auto; font-weight: 650; letter-spacing: .02em; color: var(--mute); }

.wa-toasts {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
  z-index: 2147483646; display: flex; flex-direction: column; gap: 8px; align-items: center;
  pointer-events: none;
}
.wa-toast {
  pointer-events: auto;
  display: flex; align-items: center; gap: 14px;
  padding: 10px 10px 10px 16px; border-radius: 999px;
  background: rgba(10, 16, 32, 0.94); color: #f2f6fc;
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.5);
  font-size: 14px; font-weight: 550;
  animation: wa-rise .2s ease-out;
}
.wa-toast:not(:has(button)) { padding-right: 16px; }
.wa-toast-undo {
  font-size: 13px; font-weight: 700; color: #ffd84d;
  padding: 6px 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.08);
}
.wa-toast-undo:hover { background: rgba(255, 255, 255, 0.16); }

@keyframes wa-fade { from { opacity: 0; } }
@keyframes wa-rise { from { opacity: 0; transform: translateY(8px) scale(.985); } }
@keyframes wa-dot { 0%, 80%, 100% { transform: scale(.5); opacity: .4; } 40% { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .wa-cmd-scrim, .wa-cmd, .wa-toast { animation: none; }
  .wa-cmd-thinking span { animation-duration: 2.4s; }
}
@media (forced-colors: active) {
  .wa-cmd, .wa-toast { border: 2px solid CanvasText; }
  .wa-cmd-row.is-active { outline: 2px solid Highlight; }
}
@media (max-width: 520px) {
  .wa-cmd-scrim { padding-top: 12px; }
  .wa-cmd-input { font-size: 17px; }
  .wa-cmd-foot span:not(.wa-cmd-brand):nth-child(n + 3) { display: none; }
}
`;

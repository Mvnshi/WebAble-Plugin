/**
 * Panel stylesheet: ships in the lazy panel chunk and is injected into the
 * shadow root the first time the panel opens. Relies on the design tokens
 * defined eagerly on `.wa-root` (see LAUNCHER_CSS), so it stays purely panel
 * presentation: header, search, profiles, feature cards, controls, TTS/AI, foot.
 */
export const PANEL_CSS = /* css */ `
@media (prefers-reduced-motion: reduce) {
  .wa-panel, .wa-panel *, .wa-panel *::before, .wa-panel *::after {
    animation: none !important;
    transition: none !important;
  }
}
.wa-panel {
  position: fixed;
  z-index: 2147483641;
  width: 392px;
  max-width: calc(100vw - 28px);
  /* Corner anchors sit 86px from one vertical edge; keep >=14px clear on the
     other so the panel never runs past the top (or bottom) of the screen.
     dvh tracks mobile browser chrome; vh is the fallback. */
  max-height: min(720px, calc(100vh - 100px));
  max-height: min(720px, calc(100dvh - 100px));
  display: flex;
  flex-direction: column;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--hairline);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
  animation: wa-pop .2s cubic-bezier(.22,1,.36,1);
}
.wa-panel.wa-pos-bottom-right { right: 20px; bottom: 86px; }
.wa-panel.wa-pos-bottom-left  { left: 20px;  bottom: 86px; }
.wa-panel.wa-pos-top-right    { right: 20px; top: 86px; }
.wa-panel.wa-pos-top-left     { left: 20px;  top: 86px; }
@keyframes wa-pop { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }

.wa-head {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--hairline);
}
.wa-head-mark {
  width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center;
  color: var(--on-accent); background: var(--accent); flex: none;
}
.wa-head-titles { flex: 1; min-width: 0; }
.wa-head-title { font-weight: 650; font-size: 14px; color: var(--ink); letter-spacing: -.01em; }
.wa-head-sub { font-size: 11.5px; color: var(--mute); }
.wa-iconbtn {
  width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center;
  color: var(--mute); flex: none; transition: background .15s, color .15s;
}
.wa-iconbtn:hover { background: var(--surface-3); color: var(--ink); }
.wa-iconbtn:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }

.wa-search {
  display: flex; align-items: center; gap: 8px;
  margin: 12px 14px 4px; padding: 0 10px;
  height: 38px; border-radius: 9px;
  background: var(--surface-2); border: 1px solid var(--hairline);
  color: var(--mute);
}
.wa-search:focus-within { border-color: var(--accent-text); box-shadow: 0 0 0 3px var(--accent-soft); }
.wa-search input {
  flex: 1; min-width: 0; border: 0; background: none; outline: none;
  font: inherit; color: var(--text); height: 100%;
}
.wa-search input::placeholder { color: var(--mute); }


.wa-eyebrow {
  font-size: 10.5px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase;
  color: var(--mute); margin: 14px 2px 8px;
}
/* Scope block: which sites the current settings apply to. */
.wa-scope { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--hairline); }
.wa-scope .wa-eyebrow { margin-top: 0; }
.wa-scope-state { margin: 0 2px 10px; font-size: 12.5px; color: var(--text); }
.wa-scope-row { display: flex; flex-wrap: wrap; gap: 8px; }
.wa-scope-hint { margin: 10px 2px 0; font-size: 11.5px; line-height: 1.45; color: var(--mute); }

/* First open, while nothing is turned on yet. See Panel.tsx FirstRun. */
.wa-intro {
  margin: 0 0 12px; padding: 12px; border-radius: 10px;
  background: var(--surface-2); border: 1px solid var(--hairline);
}
.wa-intro p { margin: 0 0 9px; font-size: 12.5px; line-height: 1.5; color: var(--text); }

.wa-profiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.wa-profile {
  display: flex; align-items: center; gap: 9px; text-align: left;
  padding: 10px; border-radius: 10px;
  background: var(--surface-2); border: 1px solid var(--hairline);
  transition: border-color .15s, background .15s, transform .12s;
}
.wa-profile:hover { border-color: var(--hairline-strong); transform: translateY(-1px); }
.wa-profile:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }
.wa-profile[aria-pressed='true'] { border-color: var(--accent-text); background: var(--accent-soft); }
.wa-profile-ic { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; flex: none; color: var(--accent-text); background: color-mix(in srgb, var(--accent) 10%, var(--surface)); }
.wa-profile[aria-pressed='true'] .wa-profile-ic { color: var(--on-accent); background: var(--accent); }
.wa-profile-tx { min-width: 0; }
.wa-profile-name { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.wa-profile-desc { font-size: 11px; color: var(--mute); line-height: 1.35; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; }

.wa-cards { display: flex; flex-direction: column; gap: 8px; }
.wa-card {
  border: 1px solid var(--hairline); border-radius: 11px; background: var(--surface);
  transition: border-color .15s, box-shadow .15s;
}
.wa-card[data-on='true'] { border-color: color-mix(in srgb, var(--accent) 40%, var(--hairline)); box-shadow: inset 0 0 0 1px var(--accent-soft); }
.wa-card-main { display: flex; align-items: center; gap: 11px; padding: 11px 12px; }
.wa-card-ic { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; flex: none; color: var(--mute); background: var(--surface-2); }
.wa-card[data-on='true'] .wa-card-ic { color: var(--on-accent); background: var(--accent); }
.wa-card-tx { flex: 1; min-width: 0; }
.wa-card-name { font-size: 13px; font-weight: 600; color: var(--ink); }
.wa-card-desc { font-size: 11.5px; color: var(--mute); line-height: 1.35; }
.wa-card-gear { width: 28px; height: 28px; border-radius: 7px; display: grid; place-items: center; color: var(--mute); flex: none; }
.wa-card-gear:hover { background: var(--surface-3); color: var(--ink); }
.wa-card-gear[aria-expanded='true'] { color: var(--accent-text); }
.wa-card-gear:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }
.wa-card-controls { padding: 2px 12px 13px; display: flex; flex-direction: column; gap: 13px; border-top: 1px dashed var(--hairline); margin-top: 1px; }

/* The off state needs a boundary that is actually visible. In the light theme
   (the default) it was a white knob on a near-white track inside a white card:
   measured track 1.13:1, border 1.58:1, knob-vs-track 1.13:1, against the 3:1
   a control boundary needs (1.4.11). Dark and glass were always fine because
   the white knob sits on a dark track. The border below is the fix, and it is
   only overridden once the switch is on and the accent fill takes over. */
.wa-switch { position: relative; width: 40px; height: 24px; border-radius: 999px; background: var(--surface-3); border: 1px solid rgba(15, 23, 42, 0.45); flex: none; transition: background .18s; }
.wa-root[data-theme='dark'] .wa-switch, .wa-root[data-theme='glass'] .wa-switch { border-color: var(--hairline-strong); }
.wa-switch[aria-checked='true'] { background: var(--accent); border-color: transparent; }
.wa-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 999px; background: #fff; box-shadow: 0 1px 3px rgba(10,27,46,.3); transition: transform .18s cubic-bezier(.22,1,.36,1); }
.wa-switch[aria-checked='true']::after { transform: translateX(16px); }
.wa-switch:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }

.wa-ctl-row { display: flex; flex-direction: column; gap: 7px; }
.wa-ctl-head { display: flex; justify-content: space-between; align-items: baseline; }
.wa-ctl-label { font-size: 11.5px; font-weight: 600; color: var(--text); }
.wa-ctl-val { font-size: 11.5px; font-weight: 600; color: var(--accent-text); font-variant-numeric: tabular-nums; }

/* A real ring on the element, not a wash on the thumb. outline:none killed
   the UA indicator and the replacement was a box-shadow in --accent-soft (a
   12-30% alpha wash), measured 1.22:1 light, 1.15:1 dark, 1.07:1 glass against
   the 3:1 a focus indicator needs, and it REPLACED the thumb's drop shadow so
   the thumb lost definition when focused. Sliders are how text size, spacing,
   cursor size, magnifier zoom and TTS rate are set: most of the panel's fine
   adjustment was landing focus somewhere invisible. */
.wa-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 6px; border-radius: 999px; background: var(--surface-3); }
.wa-slider:focus { outline: none; }
.wa-slider:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 4px; border-radius: 999px; }
.wa-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 999px; background: var(--accent); border: 3px solid var(--surface); box-shadow: 0 1px 4px rgba(10,27,46,.3); cursor: grab; }
.wa-slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 999px; background: var(--accent); border: 3px solid var(--surface); cursor: grab; }
.wa-slider:focus-visible::-webkit-slider-thumb { box-shadow: 0 1px 4px rgba(10,27,46,.3), 0 0 0 3px var(--accent-soft); }
.wa-slider:focus-visible::-moz-range-thumb { box-shadow: 0 1px 4px rgba(10,27,46,.3), 0 0 0 3px var(--accent-soft); }

.wa-seg { display: flex; gap: 4px; padding: 3px; border-radius: 9px; background: var(--surface-2); border: 1px solid var(--hairline); }
.wa-seg button { flex: 1 0 auto; padding: 6px 4px; border-radius: 6px; font-size: 11.5px; font-weight: 600; color: var(--mute); transition: background .12s, color .12s; }
/* The selected chip was surface on surface-2: 1.07:1 against its own track,
   with colour as the only signal (1.4.1, 1.4.11). The border carries the state
   at a contrast that survives every theme. */
.wa-seg button[aria-pressed='true'] { background: var(--surface); color: var(--ink); border: 1px solid var(--accent-text); box-shadow: 0 1px 2px rgba(10,27,46,.12); }
.wa-seg button { border: 1px solid transparent; }
.wa-root[data-theme='dark'] .wa-seg button[aria-pressed='true'] { background: var(--surface-3); }
.wa-seg button:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }

.wa-color-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.wa-color-swatch { display: flex; align-items: center; gap: 8px; }
.wa-color-input { width: 30px; height: 26px; border-radius: 7px; border: 1px solid var(--hairline-strong); padding: 0; background: none; cursor: pointer; overflow: hidden; }
.wa-color-input::-webkit-color-swatch { border: none; border-radius: 6px; }
.wa-color-input:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }
.wa-color-clear { font-size: 11px; font-weight: 600; color: var(--mute); padding: 3px 6px; border-radius: 6px; }
.wa-color-clear:hover { background: var(--surface-3); color: var(--ink); }
.wa-color-clear:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }

.wa-panel-block { border: 1px solid var(--hairline); border-radius: 11px; background: var(--surface-2); padding: 12px; }
.wa-tts-controls { display: flex; gap: 8px; margin-top: 10px; }
.wa-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 9px; font-size: 12.5px; font-weight: 600; transition: background .15s, border-color .15s, transform .1s; }
.wa-btn:active { transform: scale(.98); }
.wa-btn:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }
.wa-btn-primary { background: var(--accent); color: var(--on-accent); flex: 1; }
.wa-btn-primary:hover { background: color-mix(in srgb, var(--accent) 88%, black); }
.wa-btn-ghost { background: var(--surface); color: var(--text); border: 1px solid var(--hairline-strong); }
.wa-btn-ghost:hover { border-color: var(--accent-text); color: var(--ink); }
.wa-btn-block { width: 100%; }
/* aria-disabled looks identical to disabled. It is used wherever a control
   would otherwise disable itself under the user's focus and throw that focus
   out of the dialog; see whileBusy in controls.tsx. */
.wa-btn[disabled], .wa-btn[aria-disabled='true'] { opacity: .5; cursor: not-allowed; }

.wa-ai-key { display: flex; gap: 8px; margin-top: 10px; }
/* min-width: 0, like .wa-search input above. Without it a flex item will
   not shrink below its intrinsic width, so at 320px the button beside the
   input was pushed outside .wa-tabpanel, which is overflow-x:hidden:
   measured 35px of the AI tab, 96px of Power and 49px of Aids clipped away
   with no way to scroll them back. */
.wa-input { flex: 1; min-width: 0; height: 36px; padding: 0 11px; border-radius: 9px; background: var(--surface); border: 1px solid var(--hairline-strong); color: var(--text); font: inherit; outline: none; }
.wa-input:focus { border-color: var(--accent-text); box-shadow: 0 0 0 3px var(--accent-soft); }
.wa-ai-out { margin-top: 10px; padding: 10px 11px; border-radius: 9px; background: var(--surface); border: 1px solid var(--hairline); font-size: 12px; line-height: 1.5; color: var(--text); white-space: pre-wrap; max-height: 180px; overflow: auto; }
.wa-note { font-size: 11px; color: var(--mute); line-height: 1.45; margin-top: 8px; }

.wa-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 14px; border-top: 1px solid var(--hairline); background: var(--surface-2); }
.wa-foot-links { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--mute); }
.wa-foot-links a { color: var(--mute); text-decoration: none; }
.wa-foot-links a:hover { color: var(--accent-text); text-decoration: underline; }
.wa-reset { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text); padding: 7px 11px; border-radius: 8px; border: 1px solid var(--hairline-strong); }
.wa-reset:hover { border-color: var(--danger); color: var(--danger); }
/* The undo offer replaces Reset in place, so it has to read as the live,
   time-limited thing it is rather than as the button that was just here. */
.wa-undo { border-color: var(--accent-text); color: var(--accent-text); background: var(--accent-soft); }
.wa-undo:hover { border-color: var(--accent-text); color: var(--ink); }
.wa-reset:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }

.wa-empty { text-align: center; color: var(--mute); font-size: 12.5px; padding: 28px 12px; }
.wa-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* ---- categorized navigation (rail + tabpanel) -------------------------- */
.wa-tabwrap { display: flex; flex: 1; min-height: 0; overflow: hidden; }
/* The rail scrolls rather than squashing. Its tabs are declared 38px square,
   but as flex children in a column they inherit flex-shrink: 1, so on a short
   viewport the browser compressed all eight to 37x19: below the 24x24 minimum
   (WCAG 2.5.8), on the panel's primary navigation, for the people least able
   to hit a small target. Measured at 400% zoom before this. flex: none keeps
   them square and the rail takes the overflow. */
.wa-rail { display: flex; flex-direction: column; gap: 4px; padding: 10px 8px; border-right: 1px solid var(--hairline); flex: none; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.wa-railtab { width: 38px; height: 38px; flex: none; border-radius: 9px; display: grid; place-items: center; color: var(--mute); transition: background .14s, color .14s; }
.wa-railtab:hover { background: var(--surface-3); color: var(--ink); }
.wa-railtab[aria-selected='true'] { background: var(--accent); color: var(--on-accent); }
.wa-railtab:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }
.wa-tabpanel { flex: 1; min-width: 0; overflow-y: auto; overflow-x: hidden; padding: 8px 14px 16px; overscroll-behavior: contain; }

/* On-theme scrollbar: transparent track, a slim rounded thumb tinted from the
   theme's --mute, inset via a transparent border so it reads the same in light,
   dark, and glass. Firefox uses scrollbar-color. */
.wa-tabpanel, .wa-ai-out {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--mute) 42%, transparent) transparent;
}
.wa-tabpanel::-webkit-scrollbar, .wa-ai-out::-webkit-scrollbar { width: 12px; height: 12px; }
.wa-tabpanel::-webkit-scrollbar-track, .wa-ai-out::-webkit-scrollbar-track { background: transparent; }
.wa-tabpanel::-webkit-scrollbar-thumb, .wa-ai-out::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--mute) 38%, transparent);
  border-radius: 999px;
  border: 3.5px solid transparent;
  background-clip: padding-box;
  min-height: 36px;
}
.wa-tabpanel:hover::-webkit-scrollbar-thumb, .wa-ai-out:hover::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--mute) 60%, transparent);
}
.wa-tabpanel::-webkit-scrollbar-thumb:hover, .wa-ai-out::-webkit-scrollbar-thumb:hover {
  background-color: color-mix(in srgb, var(--mute) 85%, transparent);
}
.wa-tabpanel::-webkit-scrollbar-corner, .wa-ai-out::-webkit-scrollbar-corner { background: transparent; }

/* ---- power tool blocks -------------------------------------------------- */
.wa-pt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.wa-pt-grid .wa-btn { height: 34px; }
.wa-pt-list { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.wa-pt-item { display: flex; align-items: center; gap: 9px; padding: 8px 10px; border: 1px solid var(--hairline); border-radius: 9px; background: var(--surface-2); }
.wa-pt-item .wa-switch { transform: scale(.82); flex: none; }
.wa-pt-item-tx { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.wa-pt-item-name { font-size: 12px; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wa-pt-item-sub { font-size: 10.5px; color: var(--mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wa-pt-stale { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--warn); background: rgba(180,83,9,.14); padding: 1px 5px; border-radius: 4px; }
.wa-pt-check { display: flex; align-items: center; gap: 8px; margin-top: 11px; font-size: 11.5px; color: var(--mute); cursor: pointer; }
.wa-pt-check input { accent-color: var(--accent); }
.wa-pt-clear { background: none; border: 0; text-align: left; cursor: pointer; padding: 4px 2px; border-radius: 6px; color: var(--mute); }
.wa-pt-clear:hover { color: var(--danger); }
.wa-pt-clear:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 1px; }
.wa-trap { border: 1px solid var(--hairline); border-left: 3px solid var(--warn-edge); border-radius: 9px; background: var(--surface-2); padding: 9px 11px; margin-top: 8px; }
.wa-trap-name { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 650; color: var(--ink); }
.wa-trap-detail { font-size: 11.5px; color: var(--mute); line-height: 1.45; margin-top: 3px; }

/* ---- guide -------------------------------------------------------------- */
.wa-guide-mic { flex: none; width: 36px; height: 36px; border: 1px solid var(--hairline-strong); border-radius: 9px; color: var(--mute); }
.wa-guide-mic:not(:disabled):hover { color: var(--ink); border-color: var(--accent-text); }
.wa-guide-mic.wa-on { background: var(--accent); color: var(--on-accent); border-color: transparent; }
.wa-guide-mic:disabled { opacity: .45; cursor: not-allowed; }
.wa-guide-empty { font-size: 12px; color: var(--mute); line-height: 1.5; margin-top: 12px; padding: 10px 11px; border: 1px dashed var(--hairline-strong); border-radius: 10px; background: var(--surface); }
.wa-guide-chat { display: flex; flex-direction: column; gap: 7px; margin-top: 12px; max-height: min(260px, 38vh); overflow-y: auto; overscroll-behavior: contain; padding-right: 2px; scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--mute) 42%, transparent) transparent; }
.wa-guide-chat::-webkit-scrollbar { width: 10px; }
.wa-guide-chat::-webkit-scrollbar-track { background: transparent; }
.wa-guide-chat::-webkit-scrollbar-thumb { background-color: color-mix(in srgb, var(--mute) 40%, transparent); border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; }
.wa-guide-msg { font-size: 12.5px; line-height: 1.5; padding: 8px 11px; border-radius: 10px; max-width: 92%; white-space: pre-wrap; }
.wa-guide-user { align-self: flex-end; background: var(--accent); color: var(--on-accent); border-bottom-right-radius: 3px; }
.wa-guide-assistant { align-self: flex-start; background: var(--surface-2); color: var(--text); border: 1px solid var(--hairline); border-bottom-left-radius: 3px; }
.wa-guide-typing { display: inline-flex; align-items: center; gap: 5px; }
.wa-guide-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--mute); animation: wa-guide-blink 1.2s infinite ease-in-out; }
.wa-guide-dot:nth-child(2) { animation-delay: .18s; }
.wa-guide-dot:nth-child(3) { animation-delay: .36s; }
@keyframes wa-guide-blink { 0%, 80%, 100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
.wa-guide-stepnav { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.wa-guide-stepnav .wa-btn { flex: none; height: 32px; padding: 0 12px; }
.wa-guide-stepc { flex: 1; text-align: center; font-size: 11.5px; font-weight: 600; color: var(--mute); font-variant-numeric: tabular-nums; }

/* ---- glass theme: frosted panel, kept opaque enough for AA over any bg --- */
.wa-root[data-theme='glass'] .wa-panel {
  -webkit-backdrop-filter: blur(22px) saturate(1.5);
  backdrop-filter: blur(22px) saturate(1.5);
}
@media (prefers-reduced-transparency: reduce) {
  .wa-root[data-theme='glass'] .wa-panel { -webkit-backdrop-filter: none; backdrop-filter: none; }
}

@media (max-width: 460px) {
  .wa-panel {
    width: calc(100vw - 20px);
    right: 10px !important;
    left: 10px !important;
    max-height: calc(100vh - 92px);
    max-height: calc(100dvh - 92px);
  }
  /* Pin to one vertical edge only, because forcing bottom while a top-position class
     sets top would stretch the panel past the viewport. Free-drag panels keep
     their inline anchor (and inline max-height) instead. */
  .wa-panel.wa-pos-bottom-right, .wa-panel.wa-pos-bottom-left { bottom: 80px !important; top: auto !important; }
  .wa-panel.wa-pos-top-right, .wa-panel.wa-pos-top-left { top: 80px !important; bottom: auto !important; }
  .wa-profiles { grid-template-columns: 1fr; }
}

/* Short viewports: this is 400% browser zoom, and it was the worst bug in the
   panel.

   A 1280x800 window at 400% zoom is 320x200 CSS pixels. With the corner anchor
   holding the panel 86px clear of the launcher and max-height capped at
   100dvh - 100px, the panel got ~160px, which the header, the search box and
   the footer consumed entirely: measured at 320x256, the tool list was 24px
   tall and the category rail was not on screen at all. A low-vision user at
   400% zoom, which is exactly who this product is for and exactly the zoom they
   use, opened the accessibility panel and found no accessibility tools in it.
   WCAG 1.4.10 Reflow and 1.4.4 Resize Text, and beyond the criteria, the
   product simply missing.

   Below this height the panel stops being a popover anchored to a corner and
   becomes a sheet: the whole viewport less a hairline, chrome trimmed to what
   it needs, and every pixel that is left goes to the tools. It sits above the
   launcher (higher z-index) rather than dodging it, so no vertical space is
   spent on a button the panel's own close control replaces.

   The !important flags are load-bearing: root.tsx writes inline
   top/bottom/left/right and max-height when the launcher has been dragged, and
   a plain declaration here would lose to an inline one. 560px covers 400% zoom on a laptop, 250% on a large
   display, and a phone held in landscape, which has the same problem for a
   different reason. */
@media (max-height: 560px) {
  .wa-panel,
  .wa-panel.wa-pos-bottom-right, .wa-panel.wa-pos-bottom-left,
  .wa-panel.wa-pos-top-right, .wa-panel.wa-pos-top-left {
    top: 8px !important;
    right: 8px !important;
    bottom: 8px !important;
    left: 8px !important;
    width: auto !important;
    max-width: none !important;
    height: auto !important;
    max-height: none !important;
  }
  /* Then claw back every pixel of chrome for the tools. Measured at 320x207:
     header 48 + search 33 + footer 48 left 46px of tool area, which is less
     than one 57px card, so the panel fit the screen and still showed nothing.
     The subtitle goes first (the title above it already says what this is),
     then the profile descriptions (the names carry them), then padding.
     Nothing that is a control is removed, and no target drops below 24px. */
  .wa-head { padding: 6px 10px; gap: 8px; }
  .wa-head-sub { display: none; }
  .wa-head-mark { width: 24px; height: 24px; border-radius: 7px; }
  .wa-iconbtn { width: 28px; height: 28px; }
  .wa-search { margin: 6px 10px 2px; height: 32px; }
  .wa-rail { padding: 6px 5px; gap: 2px; }
  .wa-tabpanel { padding: 4px 10px 8px; }
  /* Kept, not hidden: the rail is icon-only, so this is the only visible name
     for the category on screen. Just tighter. */
  .wa-eyebrow { margin: 2px 2px 4px; }
  /* And the first-open explanation goes entirely. Measured at 320x220 with it
     in: zero profiles were on screen, not even partly. Someone at 400% zoom
     opened this because a page is unreadable, and two paragraphs about how the
     menu works are worth less to them right now than the menu. Every tool still
     carries its own name and description. */
  .wa-intro { display: none; }
  .wa-profile { padding: 6px 8px; gap: 8px; }
  .wa-profile-ic { width: 24px; height: 24px; border-radius: 7px; }
  .wa-profile-desc { display: none; }
  .wa-card-main { padding: 8px 10px; gap: 9px; }
  .wa-card-ic { width: 28px; height: 28px; }
  .wa-foot { padding: 5px 10px; }
  .wa-reset { padding: 5px 9px; }
}
`;

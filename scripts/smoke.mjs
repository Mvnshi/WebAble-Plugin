#!/usr/bin/env node
// Headless smoke test for the WebAble engine.
//
// No jsdom, no browser, no dependencies. We hand a minimal DOM/window stub to
// the engine and assert that toggling tools produces exactly the class names
// and CSS custom properties that content.css relies on. If this passes, the
// engine's contract with the stylesheet is intact.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Engine = require('../core/webable-engine.js');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

// ── Minimal DOM stubs ──────────────────────────────────────────────────────
function makeClassList() {
  const set = new Set();
  return {
    _set: set,
    add(...cs) { cs.forEach((c) => set.add(c)); },
    remove(...cs) { cs.forEach((c) => set.delete(c)); },
    toggle(c, force) {
      if (force === true) { set.add(c); return true; }
      if (force === false) { set.delete(c); return false; }
      if (set.has(c)) { set.delete(c); return false; }
      set.add(c); return true;
    },
    contains(c) { return set.has(c); },
    get length() { return set.size; }
  };
}
function makeStyle() {
  const vars = {};
  return {
    _vars: vars, overflow: '',
    setProperty(k, v) { vars[k] = String(v); },
    removeProperty(k) { delete vars[k]; },
    getPropertyValue(k) { return vars[k] || ''; }
  };
}
const ROOT = { classList: makeClassList(), style: makeStyle() };
const BODY = { style: makeStyle(), innerText: '', children: [], parentElement: null, appendChild() {}, getBoundingClientRect() { return { width: 0, height: 0, left: 0, top: 0, bottom: 0 }; } };
const fakeDoc = {
  documentElement: ROOT, body: BODY, head: { appendChild() {} },
  querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
  createElement() { return { style: makeStyle(), classList: makeClassList(), setAttribute() {}, appendChild() {}, addEventListener() {}, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; } }; },
  addEventListener() {}, removeEventListener() {}
};
const fakeWin = {
  getComputedStyle() { return { fontSize: '16px', position: 'static' }; },
  requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
  speechSynthesis: { cancel() {}, pause() {}, resume() {}, speak() {}, getVoices() { return []; } },
  SpeechSynthesisUtterance: function () { this.rate = 1; this.pitch = 1; },
  MutationObserver: function () { this.observe = function () {}; this.disconnect = function () {}; },
  innerWidth: 1200, innerHeight: 800, performance: { now: () => Date.now() },
  scrollBy() {}, getSelection() { return { toString() { return ''; } }; }, console
};

const cls = () => ROOT.classList._set;
const hasWebableClasses = () => Array.from(cls()).filter((c) => c.indexOf('webable-') === 0);

// ── Build engine ────────────────────────────────────────────────────────────
const engine = Engine.createEngine({ document: fakeDoc, window: fakeWin, toast() {}, announce() {}, onChange() {} });

console.log('WebAble engine smoke test (v' + Engine.VERSION + ')');

// 1. Clean slate
eq(hasWebableClasses().length, 0, 'starts with no webable-* root classes');
eq(engine.countActive(), 0, 'starts with 0 active tools');
eq(Engine.ALL_TOOLS.length, 21, 'exposes 21 tools');
eq(Object.keys(Engine.PROFILES).length, 7, 'exposes 7 profiles');

// 2. Toggle a class-based tool
engine.toggle('highContrast');
ok(ROOT.classList.contains('webable-hc-invert'), 'highContrast adds webable-hc-invert');
eq(engine.countActive(), 1, 'one tool active after toggle');

// 3. set() applies a value-driven tool + CSS var
engine.set('textSize', { value: 150 });
ok(ROOT.classList.contains('webable-ts'), 'textSize adds webable-ts');
eq(ROOT.style.getPropertyValue('--webable-ts'), '1.5', 'textSize sets --webable-ts to 1.5');

// 4. Profiles reset then apply a bundle
engine.applyProfile('lowVision');
eq(engine.activeProfile, 'lowVision', 'activeProfile is lowVision');
ok(ROOT.classList.contains('webable-hc-darkSafe'), 'lowVision -> high contrast darkSafe');
ok(ROOT.classList.contains('webable-fr-on'), 'lowVision -> focus ring');
ok(ROOT.classList.contains('webable-bc-2'), 'lowVision -> big cursor 2x');
ok(ROOT.classList.contains('webable-ts'), 'lowVision -> bigger text');
ok(!ROOT.classList.contains('webable-hc-invert'), 'profile cleared the earlier invert class');
eq(engine.countActive(), 4, 'lowVision activates exactly 4 tools');

// 5. Snapshot / restore round-trips
const snap = engine.snapshotActive();
eq(Object.keys(snap).length, 4, 'snapshot captures 4 active tools');
engine.reset();
eq(hasWebableClasses().length, 0, 'reset clears every webable-* root class');
eq(engine.countActive(), 0, 'reset deactivates all tools');
eq(engine.activeProfile, null, 'reset clears the active profile');
engine.restore(snap);
ok(ROOT.classList.contains('webable-fr-on'), 'restore re-applies focus ring');
eq(engine.countActive(), 4, 'restore brings back 4 tools');

// 6. Individual tool reset
engine.reset();
engine.set('letterSpacing', { letter: 0.1, word: 0.3 });
ok(ROOT.classList.contains('webable-ls-on'), 'letterSpacing on');
eq(ROOT.style.getPropertyValue('--webable-letter'), '0.1em', 'letterSpacing sets --webable-letter');
engine.resetTool('letterSpacing');
ok(!ROOT.classList.contains('webable-ls-on'), 'resetTool turns letterSpacing back off');

console.log('  ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
console.log('  ✓ engine ↔ stylesheet contract verified');

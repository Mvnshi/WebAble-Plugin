/**
 * The engine subscription hook, tested at its contract rather than through the
 * panel.
 *
 * `useEngineState` snapshots the engine during render and subscribes in an
 * effect, and Preact defers effects (which is why mount.test.ts has to point
 * `options.requestAnimationFrame` at a timer to flush them). `store.subscribe`
 * only adds a listener; it does not replay. So a change emitted between the
 * render and the effect reaches nobody, and the component goes on rendering the
 * pre-change snapshot until the next change happens along.
 *
 * That window is small, which is exactly why it is worth a deterministic test
 * rather than an intermittent one: driven directly it is reliable, and inferred
 * from a flaky symptom it is unprovable.
 *
 * Not to be confused with the intermittent pair in mount.test.ts. Those were a
 * poll whose budget was a fixed iteration count, diagnosed and fixed separately;
 * this is a real missed update on its own merits and would not have shown up
 * there.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { options, render, h } from 'preact';
import { createEngine, memoryAdapter } from '@webable/core';
import { useEngineState } from '../src/useEngine';

// Preact captures `typeof requestAnimationFrame` at load, so point its effect
// scheduler at a fast timer. This is also what makes the window below real and
// reachable rather than theoretical.
options.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://example.test/',
  pretendToBeVisual: true,
});
const w = dom.window as unknown as Record<string, unknown>;
const g = globalThis as unknown as Record<string, unknown>;
for (const k of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MutationObserver', 'location']) {
  g[k] = w[k];
}
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0);
g.cancelAnimationFrame = (id: number) => clearTimeout(id);

const tick = () => new Promise((r) => setTimeout(r, 10));

test('a change emitted between render and subscribe still reaches the component', async () => {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const host = document.createElement('div');
  document.body.appendChild(host);

  function Probe() {
    const state = useEngineState(engine);
    return h('span', null, state.settings.invertColors.active ? 'on' : 'off');
  }

  render(h(Probe, null), host);
  // The control. If this were already "on" the assertion below could not fail,
  // and the test would pass against code that drops the update.
  assert.equal(host.textContent, 'off', 'it starts off, so the assertion below means something');

  // Exactly the window: the commit has happened, the effect has not run yet,
  // so at this instant nothing is listening to the engine.
  engine.toggleFeature('invertColors', true);
  assert.equal(engine.getState().settings.invertColors.active, true, 'the engine really did change');

  for (let i = 0; i < 20 && host.textContent !== 'on'; i++) await tick();
  assert.equal(host.textContent, 'on', 'the component caught up with the engine rather than keeping a stale snapshot');

  render(null, host);
  host.remove();
});

test('ordinary changes after mount still arrive', async () => {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const host = document.createElement('div');
  document.body.appendChild(host);

  function Probe() {
    const state = useEngineState(engine);
    return h('span', null, state.settings.invertColors.active ? 'on' : 'off');
  }

  render(h(Probe, null), host);
  // Past the effect, so the subscription is established: the ordinary path,
  // which must keep working whatever the fix above does.
  await tick();
  engine.toggleFeature('invertColors', true);
  for (let i = 0; i < 20 && host.textContent !== 'on'; i++) await tick();
  assert.equal(host.textContent, 'on');

  engine.toggleFeature('invertColors', false);
  for (let i = 0; i < 20 && host.textContent !== 'off'; i++) await tick();
  assert.equal(host.textContent, 'off', 'and it keeps following after the first change');

  render(null, host);
  host.remove();
});

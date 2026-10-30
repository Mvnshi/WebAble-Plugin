/**
 * Audit entry. Renders the real Launcher + Panel into a Shadow DOM root with
 * the shipped stylesheets and a live engine, then hands the host to axe-core.
 * It renders the panel directly (rather than via the lazy open() path) so the
 * audit does not depend on cross-chunk dynamic-import timing, the DOM and ARIA
 * under test are exactly what mountWidget produces once the panel is open.
 */
import { render, options } from 'preact';
import { h, Fragment } from 'preact';
import { createEngine, memoryAdapter } from '@webable/core';
import { createFeedStore } from '@webable/core/feeds';
import { LAUNCHER_CSS } from '../src/styles';
import { PANEL_CSS } from '../src/panelStyles';
import { Launcher } from '../src/launcher';
import { Panel } from '../src/Panel';
import { createController } from '../src/controller';
import type { PanelConfig } from '../src/config';

options.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);

export async function mountForAudit(): Promise<{ host: HTMLElement; panel: HTMLElement }> {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  engine.applyProfile('vision'); // exercise the active-count badge

  const host = document.createElement('div');
  host.id = 'webable-widget-root';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  for (const [id, css] of [
    ['wa-launcher-css', LAUNCHER_CSS],
    ['wa-panel-css', PANEL_CSS],
  ] as const) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    shadow.appendChild(style);
  }
  const appHost = document.createElement('div');
  shadow.appendChild(appHost);

  const controller = createController();
  const config: PanelConfig = {
    brandName: 'WebAble',
    attribution: true,
    accessibilityUrl: 'https://example.test/accessibility',
    showProfiles: true,
    showAI: true,
    hideLauncher: false,
    surface: 'widget',
  };

  render(
    h(Fragment, null, [
      h('div', { class: 'wa-root', 'data-theme': 'light' }, [
        h(Launcher, { engine, controller, position: 'wa-pos-bottom-right', brandName: 'WebAble' }),
        h(Panel, { engine, config, controller, position: 'wa-pos-bottom-right' }),
      ]),
    ]),
    appHost,
  );

  // Let preact commit + run effects.
  let panel: HTMLElement | null = null;
  for (let i = 0; i < 60 && !panel; i++) {
    await new Promise((r) => setTimeout(r, 10));
    panel = shadow.querySelector('.wa-panel') as HTMLElement | null;
  }
  return { host, panel: panel as HTMLElement };
}

/**
 * A second pass, on the extension surface.
 *
 * The pass above mounts with `surface: 'widget'`, so every extension-only block
 * renders null and none of it has ever been near axe. That was fine while those
 * blocks were three small cards; the feed guard is the largest UI in the panel,
 * it is where the chips, the meters, the selects and the live regions are, and
 * shipping it unaudited in an accessibility product is not a defensible gap.
 *
 * The bridge below is the same shape content.ts installs. The store is real,
 * on memory adapters, and it is seeded so the CONDITIONAL branches render:
 * a platform override (the reset row), a daily limit (the meter and its
 * progressbar), a running session (the countdown), a custom topic (the forget
 * button), a correction (the forget-corrections row) and a log entry (the
 * list). An audit that only ever sees the empty state proves the empty state.
 */
export async function mountExtensionForAudit(): Promise<{
  host: HTMLElement;
  panel: HTMLElement;
  unmount(): void;
}> {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;

  const store = createFeedStore({
    settings: memoryAdapter(),
    usage: memoryAdapter(),
    shardId: 'audit',
  });
  await store.ready;
  const now = Date.now();
  store.setRule('global', 'hideShorts', true);
  store.setRule('global', 'showLabel', true);
  store.setRule('global', 'showConfirm', true);
  store.setRule('youtube', 'dailyLimit', 60);
  store.setRule('youtube', 'hideComments', true);
  store.toggleCategory('global', 'focus', 'EDU');
  store.addTopic('crypto');
  store.correct('abc123', 'EDU');
  store.startSession(25, ['EDU'], now);
  store.addSeconds('youtube', 900, false, now);
  store.countHidden('youtube', 4, now);
  store.addLog({ at: now - 120000, platform: 'youtube', kind: 'hidden', category: 'GOSSIP', title: 'A hidden card' });

  (window as unknown as Record<string, unknown>).__WEBABLE_EXT__ = {
    setEnabled: () => undefined,
    account: () => null,
    signIn: () => undefined,
    signOut: () => undefined,
    openSignIn: () => undefined,
    feeds: () => ({ store, here: 'youtube' as const, refresh: () => undefined }),
  };

  const host = document.createElement('div');
  host.id = 'webable-widget-root-ext';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.id = 'wa-panel-css';
  style.textContent = PANEL_CSS;
  shadow.appendChild(style);
  const appHost = document.createElement('div');
  shadow.appendChild(appHost);

  const controller = createController();
  const config: PanelConfig = {
    brandName: 'WebAble',
    attribution: true,
    accessibilityUrl: 'https://example.test/accessibility',
    showProfiles: true,
    showAI: true,
    hideLauncher: true,
    surface: 'extension',
  };

  render(
    h('div', { class: 'wa-root', 'data-theme': 'light' }, [
      h(Panel, { engine, config, controller, position: 'wa-pos-bottom-right' }),
    ]),
    appHost,
  );

  let panel: HTMLElement | null = null;
  for (let i = 0; i < 60 && !panel; i++) {
    await new Promise((r) => setTimeout(r, 10));
    panel = shadow.querySelector('.wa-panel') as HTMLElement | null;
  }

  // The feed block lives on the Power tools tab, so the audit has to get there.
  // Clicking the real rail tab rather than reaching into state, because the
  // thing being audited includes whether that tab is reachable at all.
  const tabs = Array.from(shadow.querySelectorAll('.wa-railtab')) as HTMLElement[];
  const power = tabs.find((el) => (el.getAttribute('aria-label') || el.textContent || '').includes('Power'));
  power?.click();
  for (let i = 0; i < 20 && !shadow.querySelector('.wa-fd-scope'); i++) {
    await new Promise((r) => setTimeout(r, 10));
  }

  return {
    host,
    panel: panel as HTMLElement,
    // The panel runs a one-second interval while a session or a limit is on
    // screen, which is correct in a browser and would hold this process open
    // forever. Unmounting after the scan is what closes it.
    unmount() {
      render(null, appHost);
      store.destroy();
      host.remove();
    },
  };
}

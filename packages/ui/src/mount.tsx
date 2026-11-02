/**
 * Mounts the shared UI into a Shadow DOM root on a host element appended to
 * <html> (a sibling of <body>, so page color filters never tint the panel).
 * The eager launcher CSS is injected up front; the panel's component + CSS load
 * lazily on first open. Idempotent: a second call returns the existing instance.
 */
import { render } from 'preact';
import type { Engine } from '@webable/core';
import { LAUNCHER_CSS } from './styles';
import { Root } from './root';
import { createController } from './controller';
import { applyInert, releaseInert } from './inert';
import type { PanelComponent, PanelConfig } from './config';

export const HOST_ID = 'webable-widget-root';

export interface WidgetApi {
  open(): void;
  close(): void;
  toggle(): void;
  destroy(): void;
  isOpen(): boolean;
  engine: Engine;
}

export interface MountOptions {
  engine: Engine;
  doc?: Document;
  config?: Partial<PanelConfig> & { autoOpen?: boolean };
}

function injectStyle(shadow: ShadowRoot, id: string, css: string): void {
  if (shadow.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  shadow.appendChild(el);
}

export function mountWidget(opts: MountOptions): WidgetApi {
  const doc = opts.doc || document;
  const existing = (doc.getElementById(HOST_ID) as unknown as { __webableApi?: WidgetApi }) || null;
  if (existing && existing.__webableApi) return existing.__webableApi;

  const host = doc.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-webable', 'host');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483640;inset:auto;';
  doc.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  injectStyle(shadow, 'wa-launcher-css', LAUNCHER_CSS);
  const appHost = doc.createElement('div');
  shadow.appendChild(appHost);

  const controller = createController();
  const config: PanelConfig = {
    brandName: opts.config?.brandName || 'WebAble',
    attribution: opts.config?.attribution ?? true,
    accessibilityUrl: opts.config?.accessibilityUrl ?? null,
    showProfiles: opts.config?.showProfiles ?? true,
    showAI: opts.config?.showAI ?? true,
    hideLauncher: opts.config?.hideLauncher ?? false,
    surface: opts.config?.surface ?? 'widget',
    tools: opts.config?.tools,
  };

  // Lazy-load the panel chunk (and inject its stylesheet) the first time it opens.
  const loadPanel = async (): Promise<PanelComponent> => {
    const mod = await import('./Panel');
    injectStyle(shadow, 'wa-panel-css', mod.PANEL_CSS);
    return mod.Panel;
  };

  render(<Root engine={opts.engine} config={config} controller={controller} loadPanel={loadPanel} />, appHost);

  // The panel says aria-modal="true". This is what makes that true: while it is
  // open, everything else on the page is inert and aria-hidden, so a screen
  // reader user cannot keep reading a document the dialog claims to have taken
  // away. See inert.ts.
  const unsubInert = controller.subscribe((isOpen) => {
    if (isOpen) applyInert(doc, host);
    else releaseInert(doc);
  });

  // After the subscription, so an auto-opened panel is modal too.
  if (opts.config?.autoOpen) controller.open();

  const api: WidgetApi = {
    open: () => controller.open(),
    close: () => controller.close(),
    toggle: () => controller.toggle(),
    isOpen: () => controller.isOpen(),
    engine: opts.engine,
    destroy() {
      // Release first: tearing down the widget must never leave the host page
      // inert, which would lock the visitor out of the site entirely.
      releaseInert(doc);
      unsubInert();
      render(null, appHost);
      host.remove();
      opts.engine.destroy();
    },
  };
  (host as unknown as { __webableApi: WidgetApi }).__webableApi = api;
  return api;
}

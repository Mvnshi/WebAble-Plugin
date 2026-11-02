/**
 * Eager root. Renders the launcher immediately and lazy-loads the panel chunk
 * the first time it's opened. Owns the theme/accent wrapper, the open state, and
 * the global keyboard shortcut. The heavy panel UI + its stylesheet ship in the
 * chunk returned by `loadPanel`, so the initial payload stays small.
 */
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Engine } from '@webable/core';
import { useEngineState, useResolvedTheme } from './useEngine';
import { Launcher } from './launcher';
import type { OpenController } from './controller';
import type { PanelComponent, PanelConfig } from './config';
import { resolveAccent } from './accent';

export function Root({
  engine,
  config,
  controller,
  loadPanel,
}: {
  engine: Engine;
  config: PanelConfig;
  controller: OpenController;
  loadPanel: () => Promise<PanelComponent>;
}): JSX.Element {
  const state = useEngineState(engine);
  const theme = useResolvedTheme(state.ui.theme);
  const [open, setOpen] = useState(controller.isOpen());
  const [Panel, setPanel] = useState<PanelComponent | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => controller.subscribe(setOpen), [controller]);

  // Fetch the panel chunk on first open, then keep it.
  useEffect(() => {
    if (!open || Panel || loading) return;
    setLoading(true);
    loadPanel()
      .then((P) => setPanel(() => P))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [open, Panel, loading, loadPanel]);

  // Keyboard shortcut: Alt+Shift+A toggles the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        controller.toggle();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [controller]);

  // Re-render on resize, which is also what a zoom change looks like to the
  // page. The clamp below already keeps a dragged launcher and its panel inside
  // the viewport, but it only runs when something else re-renders, so zooming
  // to 400% after dragging left both stranded off screen with no way back
  // (1.4.4). One state bump per resize, and the existing clamp does the work.
  const [, bumpViewport] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let raf = 0;
    const onResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        bumpViewport((n) => n + 1);
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Free-drag position: place the launcher at its saved offset and anchor the
  // panel to whichever side of the launcher has room. Falls back to the
  // configured corner when the launcher has not been moved.
  let pos = `wa-pos-${state.ui.position}`;
  let launcherStyle: JSX.CSSProperties | undefined;
  let panelStyle: JSX.CSSProperties | undefined;
  const off = state.ui.launcherOffset;
  // Dragging is mouse-only; on narrow screens also ignore any saved offset so
  // the launcher stays pinned to its configured corner.
  if (off && typeof window !== 'undefined' && window.innerWidth > 640) {
    const size = 54;
    const gap = 14;
    const m = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = Math.min(Math.max(off.x, m), Math.max(m, vw - size - m));
    const y = Math.min(Math.max(off.y, m), Math.max(m, vh - size - m));
    launcherStyle = { left: `${x}px`, top: `${y}px`, right: 'auto', bottom: 'auto' };
    const openUp = y > vh / 2;
    const openLeft = x > vw / 2;
    const vAnchor = openUp ? Math.max(m, vh - y + gap) : y + size + gap;
    panelStyle = {
      [openLeft ? 'right' : 'left']: `${openLeft ? Math.max(m, vw - x - size) : x}px`,
      [openUp ? 'bottom' : 'top']: `${vAnchor}px`,
      // Cap the panel to the room between its anchor and the opposite screen
      // edge so a dragged launcher never pushes it out of the viewport.
      maxHeight: `${Math.max(160, vh - vAnchor - m)}px`,
    } as JSX.CSSProperties;
    pos = '';
  }

  const accent = resolveAccent(state.ui.accent);

  return (
    <div
      class="wa-root"
      data-theme={theme}
      style={
        {
          // Both are set together: --on-accent used to be hard-coded white,
          // so a light brand colour produced white-on-light on the launcher.
          // See accent.ts.
          '--wa-accent': accent.color,
          '--on-accent': accent.onColor,
          // Outline and text colour for the light theme, darkened until it
          // clears 4.5:1 on white. The dark and glass themes override
          // --accent-text in CSS, so this only has to be right for light.
          '--wa-accent-text': accent.textColor,
        } as JSX.CSSProperties
      }
    >
      {!config.hideLauncher && (
        <Launcher
          engine={engine}
          controller={controller}
          position={pos}
          brandName={config.brandName}
          branded={config.attribution && config.brandName === 'WebAble'}
          style={launcherStyle}
        />
      )}
      {open && Panel && <Panel engine={engine} config={config} controller={controller} position={pos} style={panelStyle} />}
    </div>
  );
}

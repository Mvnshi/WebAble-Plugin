/**
 * The launcher: part of the eager bundle, so it appears immediately while the
 * heavier panel chunk loads on demand. Shows the WebAble brand mark (or a
 * generic access mark when the embed is white-labeled), inlined rather than
 * imported from the full icon set to keep the eager payload small.
 *
 * Drag to move (mouse only): press and drag repositions the launcher; the
 * position is persisted (engine `launcherOffset`) and the panel anchors to it.
 * On touch the launcher stays pinned to its corner, because a touch drag fights
 * page scrolling (janky, often cancelled by the OS), so taps just open the panel.
 * A plain click (no drag) opens the panel; a drag suppresses that click.
 *
 * There is deliberately no double-click handler. Double-click used to reset the
 * saved position: destructive, unannounced, mouse-only, and bound to a control
 * whose single click already opens the panel, so an accidental double-click
 * destroyed the position AND flashed the panel open and shut (neither click is
 * suppressed; suppressClick is only set from the drag path). Resetting the
 * position now lives in the panel, where it can be reached without a mouse and
 * can say that it happened.
 */
import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import type { Engine } from '@webable/core';
import { useEngineState } from './useEngine';
import { BrandGlyph } from './brandGlyph';
import { t } from './i18n';
import type { OpenController } from './controller';

function AccessMark({ size }: { size: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="4.2" r="1.9" fill="currentColor" />
      <path d="M4.5 8.2c2.4.9 5 1.3 7.5 1.3s5.1-.4 7.5-1.3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
      <path d="M12 9.5v5m0 0-2.6 5.3M12 14.5l2.6 5.3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

export function Launcher({
  engine,
  controller,
  position,
  brandName,
  branded,
  style,
}: {
  engine: Engine;
  controller: OpenController;
  position: string;
  brandName: string;
  /** Show the WebAble mark. False on a renamed or unattributed embed. */
  branded: boolean;
  style?: JSX.CSSProperties;
}): JSX.Element {
  useEngineState(engine); // re-render the badge as features toggle
  const count = engine.activeCount();
  const suppressClick = useRef(false);

  const onPointerDown = (e: JSX.TargetedPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    if (e.pointerType !== 'mouse') return; // touch/pen: no drag, stay pinned

    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const grabX = e.clientX - rect.left;
    const grabY = e.clientY - rect.top;
    let moved = false;
    let pos: { x: number; y: number } | null = null;
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < 5 && Math.abs(ev.clientY - startY) < 5) return;
      moved = true;
      const x = clamp(ev.clientX - grabX, 6, window.innerWidth - rect.width - 6);
      const y = clamp(ev.clientY - grabY, 6, window.innerHeight - rect.height - 6);
      btn.style.left = `${x}px`;
      btn.style.top = `${y}px`;
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
      pos = { x, y };
    };
    const up = () => {
      btn.removeEventListener('pointermove', move);
      btn.removeEventListener('pointerup', up);
      btn.removeEventListener('pointercancel', up);
      try {
        btn.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (moved && pos) {
        suppressClick.current = true;
        engine.setUiPref('launcherOffset', pos);
      }
    };
    btn.addEventListener('pointermove', move);
    btn.addEventListener('pointerup', up);
    // pointercancel (e.g. the OS steals the gesture) must tear down too, or the
    // move/up listeners leak and a later drag double-binds.
    btn.addEventListener('pointercancel', up);
  };

  return (
    <button
      class={`wa-launcher ${position}`}
      style={style}
      aria-label={
        count > 0
          ? t('launcher.openActive', { brand: brandName, count })
          : t('launcher.open', { brand: brandName })
      }
      aria-haspopup="dialog"
      title={t('launcher.title')}
      onPointerDown={onPointerDown}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        controller.toggle();
      }}
      ref={(el) => controller.setLauncher(el)}
    >
      {/* Same rule as the panel header: attributed and unrenamed, or the
          generic access mark. See Panel.tsx. */}
      {branded ? <BrandGlyph size={32} /> : <AccessMark size={26} />}
      {count > 0 && <span class="wa-launcher-badge" aria-hidden="true">{count}</span>}
    </button>
  );
}

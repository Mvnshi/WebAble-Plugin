/**
 * Pointer & reading-aid features. The overlays (guide, mask, magnifier) are
 * fixed elements appended to <html>, never <body>, so the color filters that
 * live on <body> can't tint them. Each is tracked via `ctx.own` and its
 * listeners via `ctx.on`, so disable removes everything automatically.
 */
import type { FeatureContext, FeatureModule, FeatureSetting } from '../types';
import { num } from '../dom';

function cursorDataUri(fill: string, stroke: string, size: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
    `<path d="M5 2 L5 20 L9.5 15.5 L12.5 22.5 L15 21.4 L12 15 L18.5 15 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round"/>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 2, auto`;
}

interface CursorSetting extends FeatureSetting {
  active: boolean;
  color: string; // black | white
  size: number;
}

export const bigCursor: FeatureModule<CursorSetting> = {
  id: 'bigCursor',
  defaults: { active: false, color: 'black', size: 48 },
  meta: {
    id: 'bigCursor',
    label: 'Big cursor',
    description: 'A large, high-contrast pointer that is easy to track.',
    category: 'aids',
    icon: 'cursor',
    keywords: ['cursor', 'pointer', 'mouse', 'big'],
    controls: [
      {
        key: 'color',
        type: 'segmented',
        label: 'Color',
        options: [
          { value: 'black', label: 'Black' },
          { value: 'white', label: 'White' },
        ],
      },
      { key: 'size', type: 'slider', label: 'Size', min: 32, max: 72, step: 8, unit: 'px', format: (v) => `${v}px` },
    ],
  },
  apply(s, ctx) {
    ctx.setFlag('cursor', true);
    const isWhite = s.color === 'white';
    const uri = cursorDataUri(isWhite ? '#ffffff' : '#0a1b2e', isWhite ? '#0a1b2e' : '#ffffff', num(s.size, 48));
    ctx.injectCSS(
      'root',
      `html[data-webable-cursor],html[data-webable-cursor] *{cursor:${uri} !important}`,
    );
  },
  disable() {},
};

/** Shared: append a fixed overlay to <html> with a high z-index. */
function overlay(ctx: FeatureContext, css: Partial<CSSStyleDeclaration>): HTMLElement {
  const el = ctx.doc.createElement('div');
  el.setAttribute('data-webable', 'overlay');
  Object.assign(el.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    pointerEvents: 'none',
    // The page-effect layer. Deliberately below both the widget host
    // (2147483640, packages/ui/src/mount.tsx) and the in-page AI popover
    // (2147483630, features/aiTools.ts). These used to sit at 2147483646,
    // above everything, so the reading mask's 65%-black scrim and the
    // magnifier lens covered the panel while the user was adjusting the very
    // control that draws them.
    zIndex: '2147483620',
    ...css,
  } as CSSStyleDeclaration);
  ctx.html.appendChild(el);
  return ctx.own(el);
}

interface GuideSetting extends FeatureSetting {
  active: boolean;
  thickness: number;
}

export const readingGuide: FeatureModule<GuideSetting> = {
  id: 'readingGuide',
  defaults: { active: false, thickness: 6 },
  meta: {
    id: 'readingGuide',
    label: 'Reading guide',
    description: 'A ruler line that tracks your cursor to keep your place.',
    category: 'aids',
    icon: 'readingGuide',
    keywords: ['ruler', 'guide', 'line', 'track'],
    controls: [
      { key: 'thickness', type: 'slider', label: 'Thickness', min: 2, max: 14, step: 2, unit: 'px', format: (v) => `${v}px` },
    ],
  },
  apply(s, ctx) {
    // apply() runs again on every settings change (and re-apply); create the
    // overlay + listener once, then only update per-setting properties.
    let bar = ctx.store.bar as HTMLElement | undefined;
    if (!bar) {
      bar = overlay(ctx, {
        width: '100%',
        background: 'rgba(30,64,175,0.85)',
        boxShadow: '0 0 0 1px rgba(255,255,255,.6)',
        transform: 'translateY(-50%)',
      });
      ctx.store.bar = bar;
      ctx.on(ctx.win, 'mousemove', (e) => {
        (ctx.store.bar as HTMLElement).style.top = `${(e as MouseEvent).clientY}px`;
      });
    }
    bar.style.height = `${num(s.thickness, 6)}px`;
  },
  disable() {},
};

interface MaskSetting extends FeatureSetting {
  active: boolean;
  band: number;
  dim: number;
}

export const readingMask: FeatureModule<MaskSetting> = {
  id: 'readingMask',
  defaults: { active: false, band: 120, dim: 0.65 },
  meta: {
    id: 'readingMask',
    label: 'Reading mask',
    description: 'Dim the page except a band that follows your cursor.',
    category: 'aids',
    icon: 'readingMask',
    keywords: ['mask', 'spotlight', 'focus', 'adhd', 'band'],
    controls: [
      { key: 'band', type: 'slider', label: 'Band height', min: 60, max: 240, step: 20, unit: 'px', format: (v) => `${v}px` },
      { key: 'dim', type: 'slider', label: 'Dim', min: 0.3, max: 0.9, step: 0.05, format: (v) => `${Math.round((v as number) * 100)}%` },
    ],
  },
  apply(s, ctx) {
    ctx.store.half = num(s.band, 120) / 2;
    const shade = `rgba(8,12,20,${num(s.dim, 0.65)})`;
    let top = ctx.store.top as HTMLElement | undefined;
    let bottom = ctx.store.bottom as HTMLElement | undefined;
    if (!top || !bottom) {
      top = overlay(ctx, { left: '0', width: '100%', height: '0px' });
      bottom = overlay(ctx, { left: '0', width: '100%', bottom: '0', top: 'auto', height: '0px' });
      ctx.store.top = top;
      ctx.store.bottom = bottom;
      const move = (e: Event) => {
        const y = (e as MouseEvent).clientY;
        const half = (ctx.store.half as number) || 60;
        (ctx.store.top as HTMLElement).style.height = `${Math.max(0, y - half)}px`;
        (ctx.store.bottom as HTMLElement).style.height = `${Math.max(0, (ctx.win.innerHeight || 0) - y - half)}px`;
      };
      ctx.on(ctx.win, 'mousemove', move);
    }
    top.style.background = shade;
    bottom.style.background = shade;
  },
  disable() {},
};

interface MagSetting extends FeatureSetting {
  active: boolean;
  zoom: number;
}

export const magnifier: FeatureModule<MagSetting> = {
  id: 'magnifier',
  defaults: { active: false, zoom: 2 },
  meta: {
    id: 'magnifier',
    label: 'Magnifier',
    description: 'A lens that enlarges the text under your pointer as you hover.',
    category: 'aids',
    icon: 'magnifier',
    wcag: ['1.4.4'],
    keywords: ['magnify', 'zoom', 'lens', 'loupe', 'enlarge'],
    controls: [
      { key: 'zoom', type: 'slider', label: 'Zoom', min: 1.5, max: 3.5, step: 0.5, unit: '×', format: (v) => `${v}×` },
    ],
  },
  apply(s, ctx) {
    const zoom = num(s.zoom, 2);
    let lens = ctx.store.lens as HTMLElement | undefined;
    if (!lens) {
      lens = overlay(ctx, {
        maxWidth: '460px',
        padding: '12px 16px',
        borderRadius: '10px',
        background: '#ffffff',
        color: '#0a1b2e',
        boxShadow: '0 16px 40px -12px rgba(10,27,46,.45)',
        border: '1px solid rgba(10,27,46,.12)',
        display: 'none',
        transform: 'translateY(-50%)',
      });
      ctx.store.lens = lens;
      const move = (e: Event) => {
        const ev = e as MouseEvent;
        if (ctx.store.raf) return;
        ctx.store.raf = ctx.win.requestAnimationFrame(() => {
          ctx.store.raf = 0;
          const el = ctx.doc.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
          const lensEl = ctx.store.lens as HTMLElement;
          const text = el && (el.innerText || el.textContent || '').trim();
          if (!text) {
            lensEl.style.display = 'none';
            return;
          }
          lensEl.textContent = text.slice(0, 320);
          lensEl.style.display = 'block';
          const vw = ctx.win.innerWidth || 0;
          lensEl.style.left = `${Math.min(ev.clientX + 24, vw - 480)}px`;
          lensEl.style.top = `${ev.clientY}px`;
        });
      };
      ctx.on(ctx.win, 'mousemove', move);
      ctx.onCleanup(() => {
        if (ctx.store.raf) {
          try {
            ctx.win.cancelAnimationFrame(ctx.store.raf as number);
          } catch {
            /* ignore */
          }
        }
      });
    }
    lens.style.font = `${Math.round(16 * zoom)}px/1.4 -apple-system,system-ui,sans-serif`;
  },
  disable() {},
};

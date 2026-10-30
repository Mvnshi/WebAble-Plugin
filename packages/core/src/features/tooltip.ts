/**
 * Tooltip pin: replaces the browser's native `title` tooltip with one that
 * stays put.
 *
 * The native tooltip is unusable for a lot of people. It waits about a second
 * to appear, vanishes the moment the pointer moves a few pixels, times out on
 * its own after a few seconds, cannot be reached by keyboard at all in most
 * browsers, and cannot be selected or read by a screen magnifier before it is
 * gone. Anyone with a tremor loses it constantly; anyone reading at 400% zoom
 * cannot get to it before it expires.
 *
 * So: take the `title` off the element (which is the only way to suppress the
 * native one), keep it in `data-wa-title`, and render our own that appears on
 * hover OR keyboard focus, stays until dismissed, and can be read at leisure.
 * disable() puts every `title` back exactly as it was.
 *
 * `aria-describedby` is deliberately not touched. A page that already ships a
 * real tooltip element has already solved this, and overriding it would replace
 * something accessible with something ours.
 */
import type { FeatureContext, FeatureModule } from '../types';

const PANEL_CSS = `
html[data-webable-tooltippin] [data-wa-title]{cursor:help}
.wa-tip{
  position:fixed;z-index:2147483625;max-width:320px;
  padding:8px 11px;border-radius:9px;
  font:13px/1.45 -apple-system,system-ui,'Segoe UI',sans-serif;
  color:#F6EEE4;background:#0F1C3F;border:1px solid rgba(246,238,228,.18);
  box-shadow:0 14px 40px -14px rgba(8,14,30,.6);
  white-space:pre-wrap;pointer-events:auto;
}
.wa-tip-close{
  display:block;margin-top:7px;font:600 11px/1 inherit;color:#0F1C3F;
  background:#F6EEE4;border:0;border-radius:6px;padding:5px 8px;cursor:pointer;
}
.wa-tip-close:focus-visible{outline:2px solid #F6EEE4;outline-offset:2px}
`;

/** Every element still carrying a native title, excluding our own UI. */
function withTitles(ctx: FeatureContext): HTMLElement[] {
  return Array.from(ctx.doc.querySelectorAll<HTMLElement>('[title]')).filter(
    (el) => !el.closest('#webable-widget-root') && (el.getAttribute('title') || '').trim().length > 0,
  );
}

export const tooltipPin: FeatureModule = {
  id: 'tooltipPin',
  defaults: { active: false },
  meta: {
    id: 'tooltipPin',
    label: 'Pin tooltips',
    description: 'Hover or tab to anything with a tooltip and it stays open until you dismiss it, instead of vanishing when you move.',
    category: 'aids',
    icon: 'pin',
    wcag: ['1.4.13'],
    keywords: ['tooltip', 'title', 'hover', 'pin', 'stay', 'tremor', 'hint', 'popup'],
    // Late-rendered controls carry titles too, so re-adopt them after mutations.
    dynamic: true,
  },

  apply(_s, ctx) {
    ctx.setFlag('tooltippin', true);
    ctx.injectCSS('root', PANEL_CSS);

    // Adopt any title that has appeared since last time. Idempotent: an element
    // already adopted no longer has a `title` to find.
    for (const el of withTitles(ctx)) {
      el.setAttribute('data-wa-title', el.getAttribute('title') || '');
      el.removeAttribute('title');
    }

    if (ctx.store.bound) return;
    ctx.store.bound = true;

    const tip = ctx.doc.createElement('div');
    tip.className = 'wa-tip';
    tip.setAttribute('role', 'tooltip');
    tip.style.display = 'none';
    ctx.html.appendChild(tip);
    ctx.own(tip);
    ctx.store.tip = tip;

    let anchor: HTMLElement | null = null;

    const hide = () => {
      tip.style.display = 'none';
      tip.textContent = '';
      if (anchor) {
        anchor.removeAttribute('aria-describedby');
        anchor = null;
      }
    };

    const show = (el: HTMLElement) => {
      const text = el.getAttribute('data-wa-title');
      if (!text) return;
      if (anchor === el) return;
      hide();
      anchor = el;

      tip.textContent = text;
      // 1.4.13 Content on Hover or Focus wants the content dismissable without
      // moving the pointer, so it carries its own control as well as Escape.
      const close = ctx.doc.createElement('button');
      close.type = 'button';
      close.className = 'wa-tip-close';
      close.textContent = 'Dismiss';
      close.addEventListener('click', () => {
        hide();
        try {
          el.focus({ preventScroll: true });
        } catch {
          /* not focusable; leaving focus where it is beats moving it nowhere */
        }
      });
      tip.appendChild(close);

      // Named, so a screen reader announces the tooltip with the control it
      // belongs to rather than as a loose region.
      tip.id = tip.id || 'wa-tip';
      el.setAttribute('aria-describedby', tip.id);

      tip.style.display = 'block';
      const r = el.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const vw = ctx.win.innerWidth || 0;
      const vh = ctx.win.innerHeight || 0;
      const left = Math.min(Math.max(8, r.left), Math.max(8, vw - t.width - 8));
      const below = r.bottom + 8;
      tip.style.left = `${left}px`;
      tip.style.top = `${below + t.height > vh - 8 ? Math.max(8, r.top - t.height - 8) : below}px`;
    };

    const target = (e: Event): HTMLElement | null => {
      const node = e.target as Node | null;
      const el = node && node.nodeType === 1 ? (node as Element) : null;
      return (el?.closest?.('[data-wa-title]') as HTMLElement) || null;
    };

    ctx.on(ctx.doc, 'mouseover', (e) => {
      const el = target(e);
      if (el) show(el);
    });
    ctx.on(ctx.doc, 'focusin', (e) => {
      const el = target(e);
      if (el) show(el);
    });
    // Deliberately no mouseout handler: staying put is the entire feature.
    ctx.on(ctx.doc, 'keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') hide();
    });
    ctx.on(ctx.doc, 'click', (e) => {
      if (!tip.contains(e.target as Node) && !target(e)) hide();
    });
    ctx.onCleanup(hide);
  },

  disable(ctx) {
    // Put every native title back exactly as it was.
    ctx.doc.querySelectorAll<HTMLElement>('[data-wa-title]').forEach((el) => {
      el.setAttribute('title', el.getAttribute('data-wa-title') || '');
      el.removeAttribute('data-wa-title');
      if (el.getAttribute('aria-describedby') === 'wa-tip') el.removeAttribute('aria-describedby');
    });
    ctx.store.bound = false;
    ctx.store.tip = undefined;
  },
};

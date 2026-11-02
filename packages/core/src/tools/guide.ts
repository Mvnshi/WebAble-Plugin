/**
 * Guide - an on-page walkthrough assistant. You tell it (type or speak) what you
 * want to do; it answers as an ordered set of steps and, for each step, points a
 * cursor at the exact element to use next and can sketch the explanation with
 * element-anchored annotations (circle, box, underline, label, arrow). Logic
 * lives here; the UI surfaces the conversation and step controls. AI is required.
 *
 * Grounding is DOM-based, not screenshot-based: the model gets a NUMBERED list of
 * the page's elements and returns steps that reference those numbers, so every
 * pointer and annotation lands on a real box and tracks scroll, resize, reflow.
 */
import type { AIProvider, GuideDraw, GuideStep, GuideTurn } from '../types';
import { collectSteps, type CompanionEvent } from '@webable/companion';
import { toGuideStep } from './companion-bridge';

const INTERACTIVE =
  'a[href],button,input:not([type="hidden"]),select,textarea,summary,' +
  '[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="menuitemcheckbox"],' +
  '[role="checkbox"],[role="radio"],[role="switch"],[role="combobox"],[contenteditable="true"],[onclick]';
// Content anchors let the model explain (circle a heading, arrow to an image),
// not just drive clicks. Kept to prominent blocks so the list stays scannable.
const CONTENT = 'h1,h2,h3,h4,h5,h6,img,figure,blockquote,pre';

function accName(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();
  const lb = el.getAttribute('aria-labelledby');
  if (lb) {
    const txt = lb
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent || '')
      .join(' ')
      .trim();
    if (txt) return txt;
  }
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const inp = el as HTMLInputElement;
    if (inp.type === 'submit' || inp.type === 'button') return inp.value || inp.type;
    const lbl = inp.labels && inp.labels[0]?.textContent;
    return (inp.placeholder || (lbl && lbl.trim()) || inp.name || inp.getAttribute('title') || inp.type) as string;
  }
  if (tag === 'img') return (el as HTMLImageElement).alt || '';
  const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (txt) return txt;
  return el.getAttribute('title') || el.getAttribute('name') || el.getAttribute('placeholder') || '';
}

/** "the Save button", for saying out loud what is being pointed at. */
function describeTarget(el: HTMLElement): string {
  const name = accName(el).replace(/\s+/g, ' ').trim().slice(0, 60);
  const kind = kindOf(el);
  if (!name) return kind;
  return kind && !name.toLowerCase().includes(kind.toLowerCase()) ? `${name} ${kind}` : name;
}

function kindOf(el: HTMLElement): string {
  const role = el.getAttribute('role');
  if (role) return role;
  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return 'link';
  if (tag === 'button' || tag === 'summary') return 'button';
  if (tag === 'select') return 'dropdown';
  if (tag === 'textarea') return 'text area';
  if (tag === 'input') {
    const ty = (el as HTMLInputElement).type;
    return ty === 'checkbox' ? 'checkbox' : ty === 'radio' ? 'radio' : ty === 'submit' || ty === 'button' ? 'button' : 'field';
  }
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'img') return 'image';
  if (tag === 'figure') return 'figure';
  if (tag === 'blockquote') return 'quote';
  if (tag === 'pre') return 'text block';
  return 'control';
}

// Exclude WebAble's own chrome and overlays, but NOT the host page: the engine
// puts a bare `data-webable` flag on <html>, so we match specific markers only.
const WA_OWN = '#webable-widget-root,#wa-reader,#wa-guide-layer,[data-webable="host"],[data-webable="overlay"],[data-webable="picker"],[data-webable="guide"]';

function visible(el: HTMLElement): boolean {
  if (el.closest(WA_OWN)) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  if (!el.getClientRects().length) return false;
  return true;
}

/** Numbered, compact list of the page's elements + a page header. Interactive
 *  controls and prominent content blocks, in reading order. */
export function buildGuideElements(doc: Document, max = 100): { elements: HTMLElement[]; text: string } {
  const out: HTMLElement[] = [];
  const lines: string[] = [];
  const all = Array.from(doc.querySelectorAll<HTMLElement>(`${INTERACTIVE},${CONTENT}`));
  for (const el of all) {
    if (out.length >= max) break;
    const ti = el.getAttribute('tabindex');
    if (ti && parseInt(ti, 10) < 0) continue;
    if (!visible(el)) continue;
    const name = accName(el).slice(0, 80);
    if (!name && el.tagName === 'A') continue;
    out.push(el);
    lines.push(`${out.length}: ${kindOf(el)} "${name || '(no label)'}"`);
  }
  let url = '';
  try {
    url = doc.defaultView?.location?.href || '';
  } catch {
    /* ignore */
  }
  const text = `Page title: ${(doc.title || '').slice(0, 120)}\nURL: ${url}\nPage elements:\n${lines.join('\n')}`;
  return { elements: out, text };
}

export interface GuideState {
  status: 'idle' | 'thinking' | 'active' | 'error';
  messages: GuideTurn[];
  /** The active walkthrough (empty when none is showing). */
  steps: GuideStep[];
  /** Index of the step currently on screen. */
  stepIndex: number;
  pointLabel: string | null;
  /** True while the on-page overlay (pointer / spotlight / annotations) is up. */
  pointing: boolean;
  error: string | null;
}

export interface GuideController {
  getState(): GuideState;
  subscribe(fn: (s: GuideState) => void): () => void;
  ask(question: string): Promise<void>;
  /** Advance / go back through the active walkthrough. */
  next(): void;
  prev(): void;
  /** Dismiss only the on-page overlay, keeping the transcript. */
  dismissPoint(): void;
  /**
   * Move keyboard focus to the element the current step is pointing at, and
   * report whether there was one.
   *
   * Without this the Guide was unusable by the people it is most for. It rings
   * a control on the page, but the panel is a Tab-trapped modal and the on-page
   * bubble's own buttons live outside that trap, so a keyboard user could see
   * the answer and never reach it: the only way out was Escape, which dismisses
   * the spotlight first, destroying the guidance on the way. Non-focusable
   * targets get a temporary tabindex, because "go to the heading it circled" is
   * as reasonable a request as "go to the button".
   */
  focusTarget(): boolean;
  clear(): void;
  stop(): void;
}

const STYLE_ID = 'wa-guide-style';
const POINTER_SVG =
  '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
  '<path d="M5 2.5 19 10l-6.2 1.7L9.4 19.5 5 2.5Z" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"/></svg>';

const GUIDE_CSS = `
@keyframes wa-guide-pulse{0%{transform:scale(1);opacity:.85}70%{transform:scale(1.28);opacity:0}100%{opacity:0}}
@keyframes wa-guide-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes wa-guide-bob{0%,100%{transform:translate(0,0)}50%{transform:translate(2px,2px)}}
/* z below the widget host (2147483640) so the scrim never covers the panel */
#wa-guide-layer{position:fixed;inset:0;z-index:2147483639;pointer-events:none;font-family:'Inter',system-ui,-apple-system,sans-serif}
#wa-guide-ring{position:fixed;border:2.5px solid #2563eb;border-radius:9px;box-shadow:0 0 0 2px rgba(255,255,255,.92),0 0 0 4px rgba(37,99,235,.45),0 0 0 9999px rgba(8,12,20,.4);transition:all .25s cubic-bezier(.22,1,.36,1)}
#wa-guide-ring::after{content:'';position:absolute;inset:-6px;border-radius:12px;border:2px solid #38bdf8;animation:wa-guide-pulse 1.7s ease-out infinite}
#wa-guide-pointer{position:fixed;width:30px;height:30px;color:#1e40af;transition:left .3s cubic-bezier(.22,1,.36,1),top .3s cubic-bezier(.22,1,.36,1);filter:drop-shadow(0 2px 5px rgba(10,27,46,.45));animation:wa-guide-bob 1.4s ease-in-out infinite}
#wa-guide-bubble{position:fixed;max-width:320px;pointer-events:auto;background:#0a1b2e;color:#fff;border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.5;box-shadow:0 18px 44px -14px rgba(10,27,46,.65);animation:wa-guide-in .25s ease}
#wa-guide-bubble .wa-guide-label{font-size:10px;text-transform:uppercase;letter-spacing:.11em;color:#7dd3fc;font-weight:700;margin-bottom:4px}
#wa-guide-bubble .wa-guide-nav{display:flex;align-items:center;gap:8px;margin-top:11px}
.wa-guide-step{flex:1;text-align:center;font:600 11px/1 'Inter',sans-serif;color:#9fc6ef}
.wa-guide-back{font:600 12px/1 'Inter',sans-serif;border:0;border-radius:7px;padding:7px 11px;cursor:pointer;background:rgba(255,255,255,.14);color:#fff}
.wa-guide-back:hover{background:rgba(255,255,255,.24)}
.wa-guide-back:disabled{opacity:.4;cursor:default}
#wa-guide-got{font:600 12px/1 'Inter',sans-serif;border:0;border-radius:7px;padding:7px 13px;cursor:pointer;background:#1e40af;color:#fff}
#wa-guide-got:hover{background:#16357f}
.wa-guide-back:focus-visible,#wa-guide-got:focus-visible{outline:3px solid #38bdf8;outline-offset:2px}
.wa-g-anno{position:fixed}
.wa-g-circle,.wa-g-box{border:2.5px solid #2563eb;box-shadow:0 0 0 2px rgba(255,255,255,.85)}
.wa-g-circle{border-radius:999px}
.wa-g-box{border-radius:10px}
.wa-g-underline{height:3px;background:#2563eb;border-radius:2px;box-shadow:0 0 0 1px rgba(255,255,255,.7)}
.wa-g-arrow{height:2.5px;background:#2563eb;box-shadow:0 0 0 1px rgba(255,255,255,.6)}
.wa-g-arrowhead{position:absolute;right:-2px;top:50%;width:0;height:0;border-left:9px solid #2563eb;border-top:5px solid transparent;border-bottom:5px solid transparent;transform:translateY(-50%)}
.wa-g-label{background:#0a1b2e;color:#fff;font:600 11px/1.3 'Inter',sans-serif;padding:4px 8px;border-radius:7px;max-width:200px;box-shadow:0 6px 18px -8px rgba(10,27,46,.6)}
@media (prefers-reduced-motion:reduce){#wa-guide-ring,#wa-guide-pointer,.wa-g-anno{transition:none;animation:none}#wa-guide-ring::after,#wa-guide-bubble{animation:none}}
`;

interface Anno {
  node: HTMLElement;
  spec: GuideDraw;
  a?: HTMLElement;
  b?: HTMLElement;
}

export function createGuide(provider: AIProvider, doc: Document): GuideController {
  const win = (doc.defaultView || (typeof window !== 'undefined' ? window : undefined)) as Window;
  const state: GuideState = {
    status: 'idle',
    messages: [],
    steps: [],
    stepIndex: 0,
    pointLabel: null,
    pointing: false,
    error: null,
  };
  const listeners = new Set<(s: GuideState) => void>();
  const snapshot = (): GuideState => ({ ...state, messages: state.messages.slice(), steps: state.steps.slice() });
  const emit = () => listeners.forEach((fn) => fn(snapshot()));
  const reduceMotion = () => !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);

  let elements: HTMLElement[] = [];
  let layer: HTMLElement | null = null;
  let target: HTMLElement | null = null;
  let annos: Anno[] = [];
  let raf = 0;
  let escHandler: ((e: KeyboardEvent) => void) | null = null;

  /**
   * Resolve one of the model's element numbers.
   *
   * `elements` is a snapshot of live page nodes taken in `ask()` BEFORE the
   * model round trip, and a walkthrough's later steps run after the user has
   * carried out the earlier ones, so by the time a number is used the page has
   * had seconds and a user action to change underneath it. Reusing a stale
   * entry means circling whatever now sits at that index, which is worse than
   * circling nothing: the guide is confidently pointing at the wrong control.
   *
   * Re-numbering is not an option, because the model's answer is written
   * against the numbering it was shown. So a node the page has since replaced
   * resolves to nothing, and the step falls back to its own label.
   */
  const elAt = (n?: number | null): HTMLElement | undefined => {
    if (n == null || n < 1 || n > elements.length) return undefined;
    const el = elements[n - 1];
    return el?.isConnected ? el : undefined;
  };

  const schedule = () => {
    if (!raf && win) raf = win.requestAnimationFrame(position);
  };

  function positionAnno(an: Anno) {
    const ra = an.a ? an.a.getBoundingClientRect() : null;
    if (an.spec.kind === 'arrow') {
      if (!ra || !an.b) return;
      const rb = an.b.getBoundingClientRect();
      const x1 = ra.left + ra.width / 2;
      const y1 = ra.top + ra.height / 2;
      const x2 = rb.left + rb.width / 2;
      const y2 = rb.top + rb.height / 2;
      const len = Math.hypot(x2 - x1, y2 - y1);
      const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      an.node.style.cssText = `position:fixed;left:${x1}px;top:${y1}px;width:${len}px;transform:rotate(${ang}deg);transform-origin:0 50%`;
      return;
    }
    if (!ra) return;
    if (an.spec.kind === 'underline') {
      an.node.style.cssText = `position:fixed;left:${ra.left}px;top:${ra.bottom + 2}px;width:${ra.width}px`;
    } else if (an.spec.kind === 'label') {
      an.node.style.cssText = `position:fixed;left:${ra.left}px;top:${Math.max(2, ra.top - 28)}px`;
    } else {
      const pad = an.spec.kind === 'circle' ? 8 : 5;
      an.node.style.cssText = `position:fixed;left:${ra.left - pad}px;top:${ra.top - pad}px;width:${ra.width + pad * 2}px;height:${ra.height + pad * 2}px`;
    }
  }

  function position() {
    raf = 0;
    if (!layer) return;
    const ring = layer.querySelector('#wa-guide-ring') as HTMLElement;
    const pointer = layer.querySelector('#wa-guide-pointer') as HTMLElement;
    const bubble = layer.querySelector('#wa-guide-bubble') as HTMLElement;
    for (const an of annos) positionAnno(an);
    const vw = win.innerWidth || 0;
    const vh = win.innerHeight || 0;
    const m = 8;
    const gap = 12;
    const bw = Math.min(320, bubble.offsetWidth || 320);
    const bh = bubble.offsetHeight || 80;
    const clampX = (x: number) => Math.min(Math.max(m, x), Math.max(m, vw - bw - m));
    const clampY = (y: number) => Math.min(Math.max(m, y), Math.max(m, vh - bh - m));
    if (!target) {
      ring.style.cssText = 'display:none';
      pointer.style.display = 'none';
      bubble.style.left = `${clampX((vw - bw) / 2)}px`;
      bubble.style.top = `${Math.max(m, vh - bh - 20)}px`;
      return;
    }
    const r = target.getBoundingClientRect();
    const pad = 4;
    // Inline cssText overrides the stylesheet, so the reduced-motion media query
    // in GUIDE_CSS can't reach it: branch the transition on the live preference.
    const t = reduceMotion() ? 'none' : 'all .25s cubic-bezier(.22,1,.36,1)';
    ring.style.cssText = `position:fixed;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border:2.5px solid #2563eb;border-radius:9px;box-shadow:0 0 0 2px rgba(255,255,255,.92),0 0 0 4px rgba(37,99,235,.45),0 0 0 9999px rgba(8,12,20,.4);transition:${t}`;
    pointer.style.display = '';
    pointer.style.left = `${r.left - 26}px`;
    pointer.style.top = `${r.top - 26}px`;
    // Place the bubble in the first side with room so it never lands on the
    // element the user is told to use: below, then above, then beside a tall
    // target, then the roomier vertical side as a clamped fallback.
    let bx: number;
    let by: number;
    if (vh - r.bottom - gap >= bh) {
      by = r.bottom + gap;
      bx = clampX(r.left);
    } else if (r.top - gap >= bh) {
      by = r.top - bh - gap;
      bx = clampX(r.left);
    } else if (vw - r.right - gap >= bw) {
      bx = r.right + gap;
      by = clampY(r.top);
    } else if (r.left - gap >= bw) {
      bx = r.left - bw - gap;
      by = clampY(r.top);
    } else {
      by = vh - r.bottom >= r.top ? clampY(r.bottom + gap) : clampY(r.top - bh - gap);
      bx = clampX(r.left);
    }
    bubble.style.left = `${bx}px`;
    bubble.style.top = `${by}px`;
  }

  function removeOverlay() {
    if (raf && win) {
      try {
        win.cancelAnimationFrame(raf);
      } catch {
        /* ignore */
      }
      raf = 0;
    }
    if (win) {
      win.removeEventListener('scroll', schedule, true);
      win.removeEventListener('resize', schedule);
      if (escHandler) win.removeEventListener('keydown', escHandler);
    }
    escHandler = null;
    layer?.remove();
    layer = null;
    doc.querySelectorAll('[data-wa-guide-tabbed]').forEach((el) => {
      el.removeAttribute('tabindex');
      el.removeAttribute('data-wa-guide-tabbed');
    });
    target = null;
    annos = [];
    state.pointing = false;
  }

  const dismiss = () => {
    removeOverlay();
    state.pointLabel = null;
    emit();
  };

  function ensureLayer() {
    if (!doc.getElementById(STYLE_ID)) {
      const s = doc.createElement('style');
      s.id = STYLE_ID;
      s.textContent = GUIDE_CSS;
      (doc.head || doc.documentElement).appendChild(s);
    }
    if (layer) return;
    layer = doc.createElement('div');
    layer.id = 'wa-guide-layer';
    layer.setAttribute('data-webable', 'guide');
    layer.innerHTML =
      '<div class="wa-guide-annos"></div>' +
      '<div id="wa-guide-ring"></div>' +
      `<div id="wa-guide-pointer">${POINTER_SVG}</div>` +
      '<div id="wa-guide-bubble" role="status">' +
      '<div class="wa-guide-label"></div>' +
      '<div class="wa-guide-say"></div>' +
      '<div class="wa-guide-nav">' +
      '<button class="wa-guide-back" type="button">Back</button>' +
      '<span class="wa-guide-step"></span>' +
      '<button id="wa-guide-got" class="wa-guide-next" type="button">Got it</button>' +
      '</div></div>';
    doc.documentElement.appendChild(layer);
    (layer.querySelector('.wa-guide-back') as HTMLElement).addEventListener('click', () => {
      if (state.stepIndex > 0) {
        showStep(state.stepIndex - 1);
        emit();
      }
    });
    (layer.querySelector('#wa-guide-got') as HTMLElement).addEventListener('click', () => {
      if (state.stepIndex >= state.steps.length - 1) dismiss();
      else {
        showStep(state.stepIndex + 1);
        emit();
      }
    });
    if (win) {
      win.addEventListener('scroll', schedule, true);
      win.addEventListener('resize', schedule);
      // Escape dismisses the overlay. The panel stops Escape from bubbling while
      // focus is inside it, so this only fires from the host page or the bubble.
      escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') dismiss();
      };
      win.addEventListener('keydown', escHandler);
    }
  }

  function makeAnno(spec: GuideDraw): Anno | null {
    const a = elAt(spec.el);
    const b = elAt(spec.to);
    if (spec.kind === 'arrow' ? !(a && b) : !a) return null;
    const node = doc.createElement('div');
    node.className = `wa-g-anno wa-g-${spec.kind}`;
    if (spec.kind === 'label') node.textContent = spec.text || '';
    else if (spec.kind === 'arrow') {
      const head = doc.createElement('i');
      head.className = 'wa-g-arrowhead';
      node.appendChild(head);
    }
    return { node, spec, a, b };
  }

  function buildAnnos(step: GuideStep) {
    if (!layer) return;
    const host = layer.querySelector('.wa-guide-annos') as HTMLElement;
    host.innerHTML = '';
    annos = [];
    for (const spec of (step.draw || []).slice(0, 8)) {
      const an = makeAnno(spec);
      if (an) {
        host.appendChild(an.node);
        annos.push(an);
      }
    }
  }

  function updateBubble(step: GuideStep, i: number) {
    if (!layer) return;
    const n = state.steps.length;
    const labelEl = layer.querySelector('.wa-guide-label') as HTMLElement;
    // Name the thing, do not just ring it. The bubble said "this one" next to a
    // highlight, which is 1.3.3: an instruction that relies entirely on seeing
    // where the ring is. The model supplies a label for most steps; when it
    // does not, the target's own accessible name is better than nothing, and
    // that is exactly what accName already computes for the numbered list the
    // model was given.
    const named = step.label || (target ? describeTarget(target) : '');
    labelEl.textContent = named;
    labelEl.style.display = named ? '' : 'none';
    (layer.querySelector('.wa-guide-say') as HTMLElement).textContent = step.say || '';
    const stepEl = layer.querySelector('.wa-guide-step') as HTMLElement;
    const back = layer.querySelector('.wa-guide-back') as HTMLButtonElement;
    const next = layer.querySelector('#wa-guide-got') as HTMLElement;
    if (n > 1) {
      stepEl.textContent = `Step ${i + 1} of ${n}`;
      stepEl.style.display = '';
      back.style.display = '';
      back.disabled = i === 0;
      next.textContent = i === n - 1 ? 'Done' : 'Next';
    } else {
      stepEl.style.display = 'none';
      back.style.display = 'none';
      next.textContent = 'Got it';
    }
  }

  function showStep(i: number) {
    const step = state.steps[i];
    if (!step) return;
    ensureLayer();
    state.stepIndex = i;
    target = elAt(step.point) || null;
    state.pointLabel = step.label || (target ? describeTarget(target) : null);
    state.pointing = true;
    if (target) {
      try {
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
      } catch {
        /* jsdom / unsupported */
      }
    }
    updateBubble(step, i);
    buildAnnos(step);
    if (win) {
      win.requestAnimationFrame(position);
      setTimeout(position, 380); // re-place after the smooth scroll settles
    } else {
      position();
    }
  }

  return {
    getState: snapshot,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async ask(question) {
      const q = question.trim();
      if (!q) return;
      state.status = 'thinking';
      state.error = null;
      state.messages = [...state.messages, { role: 'user', text: q }];
      emit();
      const history = state.messages.slice(0, -1);
      try {
        const built = buildGuideElements(doc);
        elements = built.elements;
        const input = { question: q, page: built.text, history };

        let steps: GuideStep[];
        if (provider.guideStream) {
          // Live path: render each step the moment its [STEP] closes, so the
          // pointer is already on the first target while the model is still
          // writing the second. The first step showing is what flips the UI
          // out of "thinking", not the end of the stream.
          const events: CompanionEvent[] = [];
          let shown = 0;
          const flush = () => {
            const built = collectSteps(events).map(toGuideStep);
            // Only the steps that are certainly complete: while the stream is
            // open the trailing step is still growing, so hold it back to
            // avoid pointing at a half-parsed target.
            const settled = built.length - 1;
            if (settled <= shown) return;
            state.steps = built;
            if (shown === 0) {
              state.status = 'active';
              showStep(0);
            }
            shown = settled;
            emit();
          };
          // The transcript is rebuilt from the events on every text fragment so
          // the panel fills in as the answer is written. Without this the panel
          // sits blank on "thinking" while the on-page pointer is already
          // moving, which reads as the panel being broken.
          const partialIndex = state.messages.length;
          const pushPartial = () => {
            const parts = collectSteps(events);
            const soFar = parts
              .map((st, i) => (parts.length > 1 ? `${i + 1}. ${st.say}` : st.say))
              .join('\n')
              .trim();
            if (!soFar) return;
            state.messages = [...state.messages.slice(0, partialIndex), { role: 'assistant', text: soFar }];
            emit();
          };
          await provider.guideStream(input, (ev) => {
            events.push(ev);
            if (ev.type === 'step') flush();
            else if (ev.type === 'text') pushPartial();
          });
          steps = collectSteps(events).map(toGuideStep);
          // The final transcript is appended below, so drop the partial rather
          // than leaving a duplicate assistant turn in the conversation.
          state.messages = state.messages.slice(0, partialIndex);
        } else {
          const reply = await provider.guide(input);
          steps =
            reply.steps && reply.steps.length
              ? reply.steps
              : [{ say: reply.say, point: reply.point, label: reply.label }];
        }

        if (!steps.length) steps = [{ say: '(no answer)', point: null }];
        const first = state.steps.length === 0;
        state.steps = steps;
        const transcript =
          steps.length > 1 ? steps.map((s, i) => `${i + 1}. ${s.say}`).join('\n') : steps[0].say || '(no answer)';
        state.messages = [...state.messages, { role: 'assistant', text: transcript }];
        state.status = 'active';
        // Streaming already showed step 0; re-showing would yank the pointer
        // back from wherever the user has advanced to.
        if (first) {
          state.stepIndex = 0;
          showStep(0);
        }
        emit();
      } catch (e) {
        state.status = 'error';
        state.error = (e as Error).message || 'Guide failed.';
        emit();
      }
    },
    next() {
      if (state.stepIndex < state.steps.length - 1) {
        showStep(state.stepIndex + 1);
        emit();
      }
    },
    prev() {
      if (state.stepIndex > 0) {
        showStep(state.stepIndex - 1);
        emit();
      }
    },
    focusTarget() {
      const el = target;
      if (!el || !el.isConnected) return false;
      try {
        if (!el.hasAttribute('tabindex') && !/^(a|button|input|select|textarea|summary)$/i.test(el.tagName)) {
          el.setAttribute('tabindex', '-1');
          el.setAttribute('data-wa-guide-tabbed', '');
        }
        el.focus({ preventScroll: false });
      } catch {
        return false;
      }
      /* Assert the postcondition instead of trusting the call. focus() on a
       * node that is inert, hidden, disabled or detached is a silent no-op
       * that does not throw, so "it did not throw" is not evidence that focus
       * moved. This return value is what the panel uses to decide whether the
       * user has actually been taken to the thing being pointed at, and it
       * reported success for a keyboard user who had not moved at all. */
      const active = el.ownerDocument?.activeElement;
      return active === el || el.contains(active as Node);
    },

    dismissPoint() {
      if (!state.pointing && !layer) return;
      dismiss();
    },
    clear() {
      removeOverlay();
      state.messages = [];
      state.steps = [];
      state.stepIndex = 0;
      state.pointLabel = null;
      state.status = 'idle';
      state.error = null;
      emit();
    },
    stop() {
      removeOverlay();
      doc.getElementById(STYLE_ID)?.remove();
    },
  };
}

/**
 * Bionic-style reading: bold the leading chunk of every word so the eye jumps
 * word to word. Each processed text node is replaced by a single
 * <span data-wa-bionic> holding the bolded HTML, so re-apply (dynamic) skips
 * anything already inside such a span (idempotent) and disable() unwraps every
 * span back to plain text (reversible). Scoped to the article body and capped,
 * so it never walks an entire app shell.
 */
import type { FeatureContext, FeatureModule, FeatureSetting } from '../types';
import { num } from '../dom';

interface BionicSetting extends FeatureSetting {
  active: boolean;
  /** fraction of each word to bold, 0.4–0.7 */
  weight: number;
}

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'KBD', 'SAMP', 'TEXTAREA', 'INPUT', 'SELECT', 'svg', 'SVG',
]);
const MAX_NODES = 6000;

function contentRoot(doc: Document): HTMLElement {
  return (doc.querySelector('article') ||
    doc.querySelector('[role="main"]') ||
    doc.querySelector('main') ||
    doc.body) as HTMLElement;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function bolded(text: string, weight: number): string {
  // Keep whitespace tokens; bold the leading ceil(len*weight) of each word.
  return text
    .split(/(\s+)/)
    .map((tok) => {
      if (!tok || /^\s+$/.test(tok)) return esc(tok);
      const lead = Math.max(1, Math.ceil(tok.length * weight));
      return `<b>${esc(tok.slice(0, lead))}</b>${esc(tok.slice(lead))}`;
    })
    .join('');
}

function apply(s: BionicSetting, ctx: FeatureContext): void {
  const weight = Math.min(0.7, Math.max(0.4, num(s.weight, 0.5)));
  ctx.setFlag('bionic', true);
  // When the dial changes, re-bold everything; on a plain dynamic re-apply
  // (same weight, new DOM), leave existing spans and only wrap fresh text.
  if (ctx.store.bWeight !== undefined && ctx.store.bWeight !== weight) disable(ctx);
  ctx.store.bWeight = weight;
  const root = contentRoot(ctx.doc);
  if (!root) return;
  const doc = ctx.doc;
  const walker = doc.createTreeWalker(root, 0x4 /* SHOW_TEXT */, {
    acceptNode(node: Node): number {
      const t = node.nodeValue;
      if (!t || !/\S/.test(t)) return 2; // FILTER_REJECT-ish (skip blank)
      const p = node.parentElement;
      if (!p) return 2;
      if (SKIP_TAGS.has(p.tagName)) return 2;
      if (p.isContentEditable) return 2;
      if (p.closest('[data-wa-bionic]')) return 2; // already processed
      if (p.closest('#webable-widget-root')) return 2; // never touch our own UI
      return 1; // FILTER_ACCEPT
    },
  });
  const targets: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode()) && targets.length < MAX_NODES) targets.push(n as Text);
  for (const textNode of targets) {
    const span = doc.createElement('span');
    span.setAttribute('data-wa-bionic', '');
    span.innerHTML = bolded(textNode.nodeValue || '', weight);
    textNode.parentNode?.replaceChild(span, textNode);
  }
}

function disable(ctx: FeatureContext): void {
  ctx.doc.querySelectorAll('span[data-wa-bionic]').forEach((span) => {
    const text = ctx.doc.createTextNode(span.textContent || '');
    const parent = span.parentNode;
    if (!parent) return;
    parent.replaceChild(text, span);
    parent.normalize(); // merge adjacent text nodes back
  });
}

export const bionicFlow: FeatureModule<BionicSetting> = {
  id: 'bionicFlow',
  defaults: { active: false, weight: 0.5 },
  meta: {
    id: 'bionicFlow',
    label: 'Bionic reading',
    description: 'Bolds the start of each word so your eyes flow faster through the text.',
    category: 'reading',
    icon: 'bolt',
    wcag: ['1.4.8'],
    keywords: ['bionic', 'speed read', 'faster', 'bold', 'focus', 'adhd', 'dyslexia', 'reading'],
    dynamic: true,
    controls: [
      { key: 'weight', type: 'slider', label: 'Bold amount', min: 0.4, max: 0.7, step: 0.05, format: (v) => `${Math.round((v as number) * 100)}%` },
    ],
  },
  apply,
  disable,
};

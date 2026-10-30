/**
 * The welcome page, shown once on install.
 *
 * It asks one question, "what would make the web easier for you?", in the
 * words people use about themselves rather than the names of tools, and it
 * answers on the spot: this page runs the real engine on itself, so ticking
 * "Bright screens hurt" turns this page dark before anything is saved. The
 * preview is the explanation. Saving makes the choices the default on every
 * site; any one site can still be set differently, and nothing is saved if the
 * person skips.
 *
 * Then it teaches the two shortcuts that make the extension worth having, using
 * the keys the browser actually bound, which may not be the defaults.
 */
import { createEngine, chromeStorageAdapter, memoryAdapter, type FeatureSetting } from '@webable/core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

const $ = (id: string) => document.getElementById(id)!;

interface Need {
  id: string;
  title: string;
  hint: string;
  apply: Record<string, Partial<FeatureSetting>>;
}

/**
 * Deliberately gentle. These become defaults on every site, so each one is the
 * least intrusive tool that addresses the need: no reading mask, no big cursor,
 * nothing that moves the page around. The stronger tools are one search away.
 */
const NEEDS: Need[] = [
  { id: 'bright', title: 'Bright screens hurt', hint: 'Dark mode on every site', apply: { darkMode: { active: true } } },
  { id: 'small', title: 'Text is often too small', hint: 'Text 130% everywhere', apply: { fontSize: { active: true, value: 130 } } },
  { id: 'contrast', title: 'Faint text is hard to read', hint: 'Higher contrast', apply: { highContrast: { active: true, level: 1.25 } } },
  { id: 'dyslexia', title: 'Reading takes effort', hint: 'Lexend font, roomier spacing', apply: { dyslexiaFont: { active: true, font: 'lexend' }, textSpacing: { active: true, line: 1.8, letter: 0.04, word: 0.12 } } },
  { id: 'motion', title: 'Motion bothers me', hint: 'Animations and autoplay stopped', apply: { stopAnimations: { active: true } } },
  { id: 'focus', title: 'I get distracted easily', hint: 'Ads, sidebars and pop-ups hidden', apply: { hideDistractions: { active: true }, popupKill: { active: true } } },
  { id: 'keyboard', title: 'I use the keyboard a lot', hint: 'A focus ring you cannot miss', apply: { highlightFocus: { active: true, width: 3 } } },
  { id: 'annoy', title: 'Banners drive me mad', hint: 'Cookie banners and nag prompts hidden', apply: { cookieKill: { active: true }, nagMute: { active: true } } },
];

const engine = createEngine({
  doc: document,
  // This page's own settings are a preview and never persist. Only the
  // cross-site default is written, and only on Save.
  storage: memoryAdapter(),
  globalStorage: chromeStorageAdapter('webable', 'sync'),
});

const picked = new Set<string>();

function applyPicked(): void {
  const merged: Record<string, Partial<FeatureSetting>> = {};
  for (const n of NEEDS) if (picked.has(n.id)) for (const [id, s] of Object.entries(n.apply)) merged[id] = { ...(merged[id] || {}), ...s };
  for (const n of NEEDS) for (const id of Object.keys(n.apply)) if (!merged[id]) engine.toggleFeature(id, false);
  for (const [id, s] of Object.entries(merged)) engine.setFeature(id, { ...s, active: true });
  $('save').textContent = picked.size ? `Use these on every site (${picked.size})` : 'Continue without changes';
  $('preview-note').hidden = picked.size === 0;
}

function renderNeeds(): void {
  const wrap = $('needs');
  for (const n of NEEDS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'need';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<span class="check" aria-hidden="true"></span><span class="need-text"><span class="need-title"></span><span class="need-hint"></span></span>';
    (b.querySelector('.need-title') as HTMLElement).textContent = n.title;
    (b.querySelector('.need-hint') as HTMLElement).textContent = n.hint;
    b.addEventListener('click', () => {
      if (picked.has(n.id)) picked.delete(n.id);
      else picked.add(n.id);
      b.setAttribute('aria-pressed', String(picked.has(n.id)));
      applyPicked();
    });
    wrap.appendChild(b);
  }
}

function showStep(n: 1 | 2): void {
  $('step-1').hidden = n !== 1;
  $('step-2').hidden = n !== 2;
  const h = $(n === 1 ? 'step-1-h' : 'step-2-h');
  h.setAttribute('tabindex', '-1');
  h.focus();
  window.scrollTo({ top: 0 });
}

void engine.ready.then(() => {
  renderNeeds();
  applyPicked();
});

$('save').addEventListener('click', async () => {
  if (picked.size) {
    engine.saveAsDefaults();
    await engine.flush();
    $('saved-note').textContent = 'Saved. Every site you open now starts with your choices. Change any site on its own from the toolbar button.';
  } else {
    $('saved-note').textContent = 'Nothing changed. Every site stays exactly as it was made until you ask.';
  }
  showStep(2);
});

$('back').addEventListener('click', () => showStep(1));

// The keys the browser bound, which a person may have changed, or which may
// not have been bound at all because something else already held them.
try {
  chrome.commands.getAll((cmds: Array<{ name?: string; shortcut?: string }>) => {
    const key = (name: string, fallback: string) => cmds.find((c) => c.name === name)?.shortcut || fallback;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-shortcut]'))) {
      const name = el.dataset.shortcut!;
      el.textContent = key(name, el.textContent || '');
    }
    const unbound = cmds.filter((c) => c.name && c.name !== '_execute_action' && !c.shortcut);
    $('unbound').hidden = unbound.length === 0;
  });
} catch {
  /* opened outside the extension */
}

$('open-shortcuts').addEventListener('click', () => {
  // chrome:// links cannot be followed from a page; the tabs API can open them.
  const url = /Edg\//.test(navigator.userAgent) ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts';
  chrome.tabs.create({ url });
});
$('open-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

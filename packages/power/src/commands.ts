/**
 * Everything the command bar can do, and the one place that does it.
 *
 * Commands come from three places and are ranked together: the tool registry
 * (every tool, every profile, generated, so a new tool is in the bar the day it
 * ships), a fixed list of page actions, and the page itself (its headings,
 * regions and links). The intent parser sits in front of all three and turns a
 * sentence into one of them.
 *
 * Every change made through here is undoable: `run` returns what it did and how
 * to put it back, and the bar shows both. A command bar that can change the
 * page in two keystrokes has to make the wrong two keystrokes cheap.
 */
import {
  FEATURES,
  FEATURE_MAP,
  PROFILES,
  cleanUrl,
  selectionMarkdown,
  pageQuote,
  copyText,
  extractMainText,
  startPatchPicker,
  buildTarget,
  type Engine,
  type FeatureSetting,
} from '@webable/core';
import { LIMITS, clamp, type ActionId, type Intent } from './intents';
import { collectTargets, findSearchInput, jumpTo, submitSearch, typeInto, type PageTarget } from './pageMap';
import type { HintMode } from './hints';

/** What the content script lends the command bar. */
export interface PowerHost {
  engine: Engine;
  doc: Document;
  win: Window;
  openPanel(): void;
  openSettings(): void;
  openSiteCheck(): void;
  turnOffHere(): void;
  startHints(opts: { mode?: HintMode; newTab?: boolean }): void;
}

export type Group = 'Best match' | 'Suggested' | 'Recent' | 'Actions' | 'Tools' | 'Profiles' | 'On this page' | 'Links';

export interface Command {
  id: string;
  title: string;
  /** Right-hand hint: state, shortcut, or where a link goes. */
  meta?: string;
  group: Group;
  icon: string;
  keywords?: readonly string[];
  intent: Intent;
  /** Page targets carry their element so "find" can jump without a re-scan. */
  target?: PageTarget;
}

/** What running a command did, for the toast and the screen reader. */
export interface Outcome {
  message: string;
  undo?: () => void;
  /** The bar stays open and shows this: an AI answer, or help. */
  answer?: { title: string; text?: string; pending?: Promise<string>; kind?: 'ai' | 'help' };
  /** The bar stays open in find mode with this query. */
  find?: string;
  /** Close the bar before running, because the action needs the page (hints, picker). */
  closeFirst?: boolean;
}

export interface ActionSpec {
  id: ActionId;
  title: string;
  icon: string;
  keywords: string[];
  /** Needs an AI provider to be useful. */
  ai?: boolean;
}

export const ACTIONS: ActionSpec[] = [
  { id: 'hints', title: 'Click anything by keyboard', icon: 'pointer', keywords: ['hints', 'click', 'keyboard', 'link hints', 'vimium', 'no mouse', 'f'] },
  { id: 'hintsNewTab', title: 'Open a link in a new tab by keyboard', icon: 'pointer', keywords: ['hints', 'new tab', 'background tab'] },
  { id: 'readAloud', title: 'Read this page aloud', icon: 'speaker', keywords: ['speak', 'tts', 'listen', 'read to me', 'voice'] },
  { id: 'stopReading', title: 'Stop reading aloud', icon: 'speaker', keywords: ['quiet', 'stop', 'silence'] },
  { id: 'summarize', title: 'Summarize this page', icon: 'sparkle', keywords: ['tldr', 'summary', 'gist', 'key points', 'ai'], ai: true },
  { id: 'explainPage', title: 'Explain this page in plain language', icon: 'sparkle', keywords: ['simplify', 'plain english', 'eli5', 'ai'], ai: true },
  { id: 'find', title: 'Go to a heading, section or link', icon: 'compass', keywords: ['jump', 'navigate', 'headings', 'outline', 'go to', 'find', 'table of contents'] },
  { id: 'siteSearch', title: 'Search this site', icon: 'search', keywords: ['search box', 'find on site', 'look up'] },
  { id: 'scrollTop', title: 'Back to top', icon: 'arrowUp', keywords: ['top', 'start', 'home key'] },
  { id: 'scrollBottom', title: 'Go to the bottom', icon: 'arrowDown', keywords: ['end', 'footer', 'bottom'] },
  { id: 'toggleMedia', title: 'Play or pause video', icon: 'play', keywords: ['pause', 'play', 'video', 'audio', 'media'] },
  { id: 'copyCleanLink', title: 'Copy a clean link to this page', icon: 'link', keywords: ['url', 'share', 'tracking', 'utm', 'copy link'] },
  { id: 'copyMarkdown', title: 'Copy selection as Markdown', icon: 'copy', keywords: ['markdown', 'notes', 'obsidian', 'copy'] },
  { id: 'copyQuote', title: 'Copy a quote with its source', icon: 'copy', keywords: ['cite', 'quote', 'source', 'reference'] },
  { id: 'fixThisSite', title: 'Hide something on this site', icon: 'wand', keywords: ['zap', 'remove element', 'block element', 'fix this site', 'annoying'] },
  { id: 'siteCheck', title: 'Check this site (accessibility, SEO, AI)', icon: 'gauge', keywords: ['audit', 'wcag', 'ada', 'seo', 'score', 'lighthouse', 'report'] },
  { id: 'openPanel', title: 'Open the WebAble panel', icon: 'panel', keywords: ['menu', 'all tools', 'settings panel'] },
  { id: 'resetSite', title: 'Reset everything on this site', icon: 'reset', keywords: ['clear', 'start over', 'default'] },
  { id: 'undo', title: 'Undo the last change', icon: 'reset', keywords: ['revert', 'back'] },
  { id: 'turnOffHere', title: 'Turn WebAble off on this site', icon: 'power', keywords: ['disable', 'pause', 'off here'] },
  { id: 'openSettings', title: 'Settings', icon: 'gear', keywords: ['options', 'preferences', 'api key', 'shortcuts'] },
  { id: 'help', title: 'Keyboard shortcuts and tips', icon: 'help', keywords: ['help', 'shortcuts', 'how to', '?'] },
];

const ACTION_MAP = new Map(ACTIONS.map((a) => [a.id, a]));

function featureOn(engine: Engine, id: string): boolean {
  return !!engine.getState().settings[id]?.active;
}

/** The static catalogue: actions, tools, profiles. Rebuilt per open, so state is fresh. */
export function catalogue(engine: Engine): Command[] {
  const out: Command[] = [];
  for (const a of ACTIONS) {
    if (a.id === 'find' || a.id === 'siteSearch') continue; // reached by typing, not by picking
    out.push({ id: `act:${a.id}`, title: a.title, group: 'Actions', icon: a.icon, keywords: a.keywords, intent: { kind: 'action', id: a.id } });
  }
  for (const f of FEATURES) {
    if (f.meta.surfaces === 'widget') continue;
    const on = featureOn(engine, f.id);
    out.push({
      id: `tool:${f.id}`,
      title: f.meta.label,
      meta: on ? 'On' : undefined,
      group: 'Tools',
      icon: f.meta.icon,
      keywords: [...(f.meta.keywords || []), f.meta.description],
      intent: { kind: 'toggle', feature: f.id },
    });
  }
  const current = engine.getState().activeProfile;
  for (const p of PROFILES) {
    out.push({
      id: `profile:${p.id}`,
      title: `${p.label} profile`,
      meta: current === p.id ? 'Active' : undefined,
      group: 'Profiles',
      icon: p.icon,
      keywords: [p.description, 'profile', 'preset'],
      intent: { kind: 'profile', id: p.id },
    });
  }
  return out;
}

/** Page targets as commands, for "go to". Headings and regions before links. */
export function pageCommands(doc: Document): Command[] {
  return collectTargets(doc).map((t, i) => ({
    id: `page:${t.kind}:${i}`,
    title: t.label,
    meta: t.kind === 'heading' ? `H${t.level}` : t.kind === 'link' ? shortHref(t.href || '') : 'Region',
    group: t.kind === 'link' ? 'Links' : 'On this page',
    icon: t.kind === 'heading' ? 'heading' : t.kind === 'link' ? 'link' : 'compass',
    intent: { kind: 'action', id: 'find', arg: t.label },
    target: t,
  }));
}

function shortHref(href: string): string {
  try {
    const u = new URL(href);
    return u.host === location.host ? u.pathname : u.host;
  } catch {
    return '';
  }
}

/** A sentence-shaped intent as a command row with a title that says what it will do. */
export function describeIntent(engine: Engine, intent: Intent): Command | null {
  const label = (id: string) => FEATURE_MAP.get(id)?.meta.label || id;
  const icon = (id: string) => FEATURE_MAP.get(id)?.meta.icon || 'sparkle';
  switch (intent.kind) {
    case 'toggle': {
      if (!FEATURE_MAP.has(intent.feature)) return null;
      const on = intent.on ?? !featureOn(engine, intent.feature);
      return { id: `intent:toggle:${intent.feature}:${on}`, title: `${on ? 'Turn on' : 'Turn off'} ${label(intent.feature)}`, group: 'Best match', icon: icon(intent.feature), intent: { ...intent, on } };
    }
    case 'set': {
      if (!FEATURE_MAP.has(intent.feature)) return null;
      return { id: `intent:set:${intent.feature}`, title: describeSet(intent.feature, intent.patch), group: 'Best match', icon: icon(intent.feature), intent };
    }
    case 'adjust': {
      const cur = currentValue(engine, intent.feature, intent.key);
      const next = clamp(intent.feature, cur + intent.delta);
      const title = describeSet(intent.feature, { [intent.key]: next }, cur);
      return { id: `intent:adjust:${intent.feature}`, title, group: 'Best match', icon: icon(intent.feature), intent };
    }
    case 'profile': {
      const p = PROFILES.find((x) => x.id === intent.id);
      if (!p) return null;
      return { id: `intent:profile:${p.id}`, title: `Use the ${p.label} profile`, meta: p.description, group: 'Best match', icon: p.icon, intent };
    }
    case 'action': {
      const spec = ACTION_MAP.get(intent.id);
      let title = spec?.title || intent.id;
      if (intent.id === 'siteSearch' && intent.arg) title = `Search this site for "${intent.arg}"`;
      if (intent.id === 'ask' && intent.arg) title = `Ask about this page: "${intent.arg}"`;
      if (intent.id === 'find' && intent.arg) title = `Find "${intent.arg}" on this page`;
      return { id: `intent:action:${intent.id}:${intent.arg || ''}`, title, group: 'Best match', icon: spec?.icon || (intent.id === 'ask' ? 'sparkle' : 'compass'), intent };
    }
  }
}

function currentValue(engine: Engine, feature: string, key: string): number {
  const s = engine.getState().settings[feature];
  const f = FEATURE_MAP.get(feature);
  const fallback = Number((f?.defaults as FeatureSetting | undefined)?.[key]) || 0;
  // Off means "at the neutral point", not "at the stored value": text that is
  // off is 100%, whatever the slider was last left at.
  if (!s?.active) {
    if (feature === 'fontSize') return 100;
    if (feature === 'mediaSpeed') return 1;
    if (feature === 'volumeBoost') return 1;
    return fallback;
  }
  const v = Number(s[key]);
  return Number.isFinite(v) ? v : fallback;
}

function describeSet(feature: string, patch: Record<string, string | number | boolean>, from?: number): string {
  const v = Object.values(patch)[0];
  const arrow = from !== undefined ? `${fmt(feature, from)} to ` : '';
  switch (feature) {
    case 'fontSize':
      return `Text size ${arrow}${v}%`;
    case 'mediaSpeed':
      return `Play media ${arrow ? `${arrow}` : 'at '}${v}x`;
    case 'volumeBoost':
      return `Volume ${arrow}${Math.round(Number(v) * 100)}%`;
    case 'highContrast':
      return `Contrast ${arrow}${v}`;
    default:
      return `${FEATURE_MAP.get(feature)?.meta.label || feature}: ${arrow}${v}`;
  }
}

function fmt(feature: string, n: number): string {
  if (feature === 'fontSize') return `${n}%`;
  if (feature === 'mediaSpeed') return `${n}x`;
  if (feature === 'volumeBoost') return `${Math.round(n * 100)}%`;
  return String(n);
}

/** Snapshot one tool's setting so a change to it can be put back exactly. */
function snapshot(engine: Engine, id: string): FeatureSetting {
  return JSON.parse(JSON.stringify(engine.getState().settings[id] || { active: false }));
}

function restore(engine: Engine, id: string, prev: FeatureSetting): () => void {
  return () => engine.setFeature(id, prev);
}

let lastUndo: (() => void) | null = null;

/** Run an intent against the page. Never throws: a failure is an outcome. */
export async function run(host: PowerHost, intent: Intent, target?: PageTarget): Promise<Outcome> {
  try {
    const outcome = await runInner(host, intent, target);
    if (outcome.undo) lastUndo = outcome.undo;
    return outcome;
  } catch (err) {
    return { message: `That did not work: ${(err as Error)?.message || 'unknown error'}` };
  }
}

async function runInner(host: PowerHost, intent: Intent, target?: PageTarget): Promise<Outcome> {
  const { engine, doc, win } = host;
  const label = (id: string) => FEATURE_MAP.get(id)?.meta.label || id;

  if (intent.kind === 'toggle') {
    if (!FEATURE_MAP.has(intent.feature)) return { message: 'That tool does not exist.' };
    const prev = snapshot(engine, intent.feature);
    const on = intent.on ?? !prev.active;
    engine.toggleFeature(intent.feature, on);
    return { message: `${label(intent.feature)} ${on ? 'on' : 'off'}`, undo: restore(engine, intent.feature, prev) };
  }

  if (intent.kind === 'set') {
    const prev = snapshot(engine, intent.feature);
    engine.setFeature(intent.feature, { ...intent.patch, active: true });
    return { message: describeSet(intent.feature, intent.patch), undo: restore(engine, intent.feature, prev) };
  }

  if (intent.kind === 'adjust') {
    const prev = snapshot(engine, intent.feature);
    const cur = currentValue(engine, intent.feature, intent.key);
    const next = clamp(intent.feature, cur + intent.delta);
    const neutral = intent.feature === 'fontSize' ? 100 : intent.feature === 'mediaSpeed' || intent.feature === 'volumeBoost' ? 1 : null;
    if (neutral !== null && next === neutral) {
      engine.toggleFeature(intent.feature, false);
      return { message: `${label(intent.feature)} back to normal`, undo: restore(engine, intent.feature, prev) };
    }
    const lim = LIMITS[intent.feature];
    engine.setFeature(intent.feature, { [intent.key]: next, active: true });
    const atEdge = lim && (next === lim.max || next === lim.min) ? ' (that is the limit)' : '';
    return { message: `${describeSet(intent.feature, { [intent.key]: next })}${atEdge}`, undo: restore(engine, intent.feature, prev) };
  }

  if (intent.kind === 'profile') {
    const prev = JSON.parse(JSON.stringify(engine.getState().settings)) as Record<string, FeatureSetting>;
    engine.applyProfile(intent.id);
    const p = PROFILES.find((x) => x.id === intent.id);
    return {
      message: `${p?.label || intent.id} profile on`,
      undo: () => {
        for (const [id, s] of Object.entries(prev)) engine.setFeature(id, s);
      },
    };
  }

  const tts = engine.tts;
  const ai = engine.provider;
  const needKey: Outcome = {
    message: 'AI answers need a key',
    answer: {
      kind: 'ai',
      title: 'Turn on AI answers',
      text: 'Summaries, explanations and questions about a page use AI. Add a free Google Gemini key in Settings (it stays on this device), or use WebAble Pro. Everything else in WebAble works without one.',
    },
  };

  switch (intent.id) {
    case 'hints':
      return { message: 'Click hints', closeFirst: true, ...fire(() => host.startHints({})) };
    case 'hintsNewTab':
      return { message: 'Click hints (new tab)', closeFirst: true, ...fire(() => host.startHints({ newTab: true })) };
    case 'readAloud':
      tts.speakAuto(doc);
      return { message: 'Reading aloud. Say "stop reading" or press Esc twice to stop.', undo: () => tts.stop() };
    case 'stopReading':
      tts.stop();
      return { message: 'Stopped reading' };
    case 'summarize':
    case 'explainPage':
    case 'ask': {
      if (!ai.isConfigured()) return needKey;
      const text = extractMainText(doc).slice(0, 24000);
      const title = doc.title;
      const pending =
        intent.id === 'summarize'
          ? ai.summarize(text, { title, url: win.location.href })
          : intent.id === 'explainPage'
            ? ai.explain(text.slice(0, 8000))
            : ai.ask(intent.arg || '', `${title}\n\n${text}`);
      return {
        message: intent.id === 'ask' ? 'Asking' : 'Working on it',
        answer: { kind: 'ai', title: intent.id === 'summarize' ? 'Summary' : intent.id === 'explainPage' ? 'In plain language' : intent.arg || 'Answer', pending },
      };
    }
    case 'find': {
      if (target) {
        if (target.kind === 'link' && target.href) {
          (target.el as HTMLElement).click();
          return { message: `Opening ${target.label}` };
        }
        jumpTo(target.el);
        return { message: `Jumped to ${target.label}` };
      }
      return { message: 'Find on this page', find: intent.arg || '' };
    }
    case 'siteSearch': {
      const input = findSearchInput(doc);
      if (!input) return { message: 'This site has no search box I can find.' };
      if (!intent.arg) {
        jumpTo(input);
        return { message: 'Search box focused', closeFirst: true };
      }
      typeInto(input, intent.arg);
      submitSearch(input);
      return { message: `Searching for "${intent.arg}"`, closeFirst: true };
    }
    case 'scrollTop':
      win.scrollTo({ top: 0, behavior: 'smooth' });
      return { message: 'Top of the page' };
    case 'scrollBottom':
      win.scrollTo({ top: doc.documentElement.scrollHeight, behavior: 'smooth' });
      return { message: 'Bottom of the page' };
    case 'toggleMedia': {
      const media = Array.from(doc.querySelectorAll<HTMLMediaElement>('video, audio'));
      const playing = media.filter((m) => !m.paused);
      if (playing.length) {
        playing.forEach((m) => m.pause());
        return { message: 'Paused', undo: () => playing.forEach((m) => void m.play().catch(() => undefined)) };
      }
      const first = media.sort((a, b) => area(b) - area(a))[0];
      if (!first) return { message: 'No video or audio on this page' };
      await first.play().catch(() => undefined);
      return { message: 'Playing', undo: () => first.pause() };
    }
    case 'copyCleanLink': {
      const url = cleanUrl(win.location.href);
      await copyText(url);
      return { message: url === win.location.href ? 'Link copied' : 'Clean link copied (tracking removed)' };
    }
    case 'copyMarkdown': {
      const md = selectionMarkdown(win);
      if (!md) return { message: 'Select some text first, then copy it as Markdown.' };
      await copyText(md);
      return { message: 'Copied as Markdown' };
    }
    case 'copyQuote': {
      const q = pageQuote(win);
      await copyText(q);
      return { message: 'Quote copied with its source' };
    }
    case 'fixThisSite':
      return {
        message: 'Click the thing you want gone. Esc cancels.',
        closeFirst: true,
        ...fire(() => {
          startPatchPicker(doc, (el) => {
            void engine.patches
              .add({ action: 'hide', label: describeEl(el), target: buildTarget(el) })
              .then((p) => {
                engine.patches.applyAll(doc);
                lastUndo = () => {
                  void engine.patches.remove(p.id).then(() => {
                    engine.patches.revertAll(doc);
                    engine.patches.applyAll(doc);
                  });
                };
              });
          });
        }),
      };
    case 'siteCheck':
      host.openSiteCheck();
      return { message: 'Opening Site Check' };
    case 'openPanel':
      return { message: 'Opening the panel', closeFirst: true, ...fire(() => host.openPanel()) };
    case 'openSettings':
      host.openSettings();
      return { message: 'Opening settings' };
    case 'resetSite':
      engine.resetAll();
      return { message: 'Everything on this site is reset', undo: () => engine.undoReset() };
    case 'undo': {
      const u = lastUndo;
      lastUndo = null;
      if (!u) return { message: 'Nothing to undo' };
      u();
      return { message: 'Undone' };
    }
    case 'turnOffHere':
      host.turnOffHere();
      return { message: 'WebAble is off on this site. Turn it back on from the toolbar button.' };
    case 'help':
      return { message: 'Help', answer: { kind: 'help', title: 'Shortcuts and tips' } };
  }
  return { message: 'Unknown action' };
}

/** Defer something that needs the bar gone (it would otherwise steal the keys). */
function fire(fn: () => void): Partial<Outcome> {
  setTimeout(fn, 30);
  return {};
}

function area(el: Element): number {
  const r = el.getBoundingClientRect();
  return r.width * r.height;
}

function describeEl(el: Element): string {
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return text ? `${el.tagName.toLowerCase()} "${text}"` : el.tagName.toLowerCase();
}

/** The last undo, for the toast's button and for "undo" typed into the bar. */
export function takeUndo(): (() => void) | null {
  const u = lastUndo;
  lastUndo = null;
  return u;
}

/**
 * The command bar: one shortcut, then type what you want.
 *
 * Ctrl+Shift+K (Cmd+Shift+K on a Mac) opens a search box over the page. It
 * takes a tool's name ("dark"), a number ("text 150%", "2x"), a need ("too
 * bright", "I have dyslexia"), a place ("go to pricing"), or a question ("? who
 * wrote this"), and Enter does the top result. Every change shows a toast with
 * Undo.
 *
 * Accessibility is the brief, not a pass at the end:
 *   - the input is an ARIA 1.2 combobox driving a listbox through
 *     aria-activedescendant, which is the pattern screen readers announce
 *     correctly for a filtered list,
 *   - every result and every outcome is announced through a live region,
 *   - focus is trapped in the dialog while it is open and handed back to
 *     where it was when it closes,
 *   - it follows the panel's theme, honours reduced motion, and sizes in px so
 *     the page's own text scaling cannot break it.
 */
import { render, type JSX } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { rank, words } from './fuzzy';
import { parseIntent, type Intent } from './intents';
import { catalogue, describeIntent, pageCommands, run, type Command, type Outcome, type PowerHost } from './commands';
import { readInsights } from './insights';
import { Glyph } from './icons';
import { COMMAND_CSS } from './commandStyles';

export interface UsageStats {
  get(): Record<string, number>;
  bump(id: string): void;
}

export interface CommandBarOptions {
  host: PowerHost;
  stats?: UsageStats;
  /** Shortcut labels for the help screen, as the browser actually bound them. */
  shortcuts?: { bar?: string; hints?: string; panel?: string };
}

export interface CommandBar {
  open(initial?: string): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  /** Show a toast without opening the bar (used by the shortcut-driven tools). */
  toast(message: string, undo?: () => void): void;
  destroy(): void;
}

type Mode = 'all' | 'find';

interface ViewState {
  open: boolean;
  initial: string;
  /** Bumped on every open so the view resets even when it was already open. */
  session: number;
}

interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

const HOST_TAG = 'webable-command';

export function createCommandBar(opts: CommandBarOptions): CommandBar {
  const { host } = opts;
  const doc = host.doc;
  const el = doc.createElement(HOST_TAG);
  el.setAttribute('data-webable-ui', 'command');
  const shadow = el.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = COMMAND_CSS;
  const mount = doc.createElement('div');
  shadow.append(style, mount);

  let state: ViewState = { open: false, initial: '', session: 0 };
  let toasts: Toast[] = [];
  let toastSeq = 0;
  let restoreFocus: HTMLElement | null = null;

  const attach = () => {
    if (!el.isConnected) doc.documentElement.appendChild(el);
  };

  function paint(): void {
    attach();
    render(
      <Root
        state={state}
        opts={opts}
        toasts={toasts}
        onClose={api.close}
        onOutcome={(o) => {
          if (o.message) pushToast(o.message, o.undo);
        }}
        onDismissToast={(id) => {
          toasts = toasts.filter((t) => t.id !== id);
          paint();
        }}
      />,
      mount,
    );
  }

  function pushToast(message: string, undo?: () => void): void {
    const id = ++toastSeq;
    toasts = [...toasts.slice(-2), { id, message, undo }];
    paint();
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      paint();
    }, undo ? 6500 : 3200);
  }

  const api: CommandBar = {
    open(initial = '') {
      if (!state.open) {
        const active = doc.activeElement as HTMLElement | null;
        restoreFocus = active && active !== doc.body && !active.closest?.('[data-webable-ui]') ? active : null;
      }
      state = { open: true, initial, session: state.session + 1 };
      paint();
    },
    close() {
      if (!state.open) return;
      state = { ...state, open: false };
      paint();
      try {
        restoreFocus?.focus({ preventScroll: true });
      } catch {
        /* the element went away while the bar was open */
      }
      restoreFocus = null;
    },
    toggle() {
      if (state.open) api.close();
      else api.open();
    },
    isOpen: () => state.open,
    toast: pushToast,
    destroy() {
      render(null, mount);
      el.remove();
    },
  };
  return api;
}

/* ---- view ---------------------------------------------------------------- */

interface RootProps {
  state: ViewState;
  opts: CommandBarOptions;
  toasts: Toast[];
  onClose(): void;
  onOutcome(o: Outcome): void;
  onDismissToast(id: number): void;
}

function themeOf(engineTheme: string, win: Window): 'light' | 'dark' {
  if (engineTheme === 'dark' || engineTheme === 'glass') return 'dark';
  if (engineTheme === 'light') return 'light';
  try {
    return win.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function Root({ state, opts, toasts, onClose, onOutcome, onDismissToast }: RootProps): JSX.Element {
  const theme = themeOf(opts.host.engine.getState().ui.theme, opts.host.win);
  return (
    <div class="wa-cmd-root" data-theme={theme}>
      {state.open ? <Bar key={state.session} initial={state.initial} opts={opts} onClose={onClose} onOutcome={onOutcome} /> : null}
      <div class="wa-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div class="wa-toast" key={t.id}>
            <span>{t.message}</span>
            {t.undo ? (
              <button
                type="button"
                class="wa-toast-undo"
                onClick={() => {
                  t.undo?.();
                  onDismissToast(t.id);
                }}
              >
                Undo
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

interface Answer {
  title: string;
  text?: string;
  pending?: boolean;
  kind: 'ai' | 'help';
  error?: boolean;
}

interface BarProps {
  initial: string;
  opts: CommandBarOptions;
  onClose(): void;
  onOutcome(o: Outcome): void;
}

const EXAMPLES = ['too bright', 'text 150%', 'go to pricing', 'click by keyboard', 'read this to me', '2x speed', 'I have dyslexia', 'summarize'];

function Bar({ initial, opts, onClose, onOutcome }: BarProps): JSX.Element {
  const { host, stats } = opts;
  const [query, setQuery] = useState(initial);
  const [mode, setMode] = useState<Mode>(initial.startsWith('#') ? 'find' : 'all');
  const [active, setActive] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [announce, setAnnounce] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  // Built once per open. The page can be large and the catalogue reads engine
  // state, so neither is worth rebuilding per keystroke.
  const base = useMemo(() => catalogue(host.engine), []);
  const page = useMemo(() => pageCommands(host.doc), []);
  const suggestions = useMemo<Command[]>(() => {
    const on = new Set(Object.entries(host.engine.getState().settings).filter(([, s]) => s.active).map(([id]) => id));
    try {
      return readInsights({ doc: host.doc, win: host.win, active: on })
        .slice(0, 3)
        .map((i) => ({ id: `insight:${i.id}`, title: i.action, meta: i.title, group: 'Suggested' as const, icon: 'sparkle', intent: i.fix }));
    } catch {
      return [];
    }
  }, []);
  const usage = useMemo(() => stats?.get() || {}, []);

  const results = useMemo<Command[]>(() => {
    const q = query.trim();
    if (mode === 'find') {
      const text = q.replace(/^[#/]\s*/, '');
      if (!text) return page.filter((c) => c.group === 'On this page').slice(0, 40).concat(page.filter((c) => c.group === 'Links').slice(0, 20));
      return rank(text, page).slice(0, 40);
    }
    if (!q) {
      const recent = Object.entries(usage)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => base.find((c) => c.id === id))
        .filter((c): c is Command => !!c)
        .slice(0, 4)
        .map((c) => ({ ...c, group: 'Recent' as const }));
      const featured = ['act:hints', 'act:readAloud', 'act:summarize', 'act:siteCheck', 'tool:darkMode', 'tool:readerMode', 'tool:fontSize']
        .map((id) => base.find((c) => c.id === id))
        .filter((c): c is Command => !!c && !recent.some((r) => r.id === c.id))
        .map((c) => ({ ...c, group: 'Actions' as const }));
      return [...suggestions, ...recent, ...featured];
    }

    const intents = parseIntent(q)
      .map((i) => describeIntent(host.engine, i))
      .filter((c): c is Command => !!c)
      .slice(0, 3);
    const boost = (c: Command) => Math.min(40, (usage[c.id] || 0) * 4);
    const found = rank(q, base, boost).slice(0, 12);
    const onPage = q.length >= 2 ? rank(q, page).slice(0, 6) : [];
    const out: Command[] = [];
    const seen = new Set<string>();
    const key = (c: Command) => JSON.stringify(c.intent);
    for (const c of [...intents, ...found, ...onPage]) {
      if (seen.has(key(c))) continue;
      seen.add(key(c));
      out.push(c);
    }
    // Three or more words that are not obviously a command read as a question.
    // Offering "ask" last costs nothing and is the escape hatch for anything
    // the phrasebook and the search both missed.
    if (words(q).length >= 3 && !out.some((c) => c.intent.kind === 'action' && c.intent.id === 'ask')) {
      const ask = describeIntent(host.engine, { kind: 'action', id: 'ask', arg: q });
      if (ask) out.push({ ...ask, group: 'Actions' });
    }
    return out;
  }, [query, mode]);

  useEffect(() => setActive(0), [query, mode]);
  // Layout effect, not effect: a fast typist presses the shortcut and starts
  // typing in the same breath, and a plain effect runs after paint, by which
  // time the first letters have gone to the page underneath.
  useLayoutEffect(() => {
    input.current?.focus();
    const len = input.current?.value.length || 0;
    input.current?.setSelectionRange(len, len);
  }, [answer === null]);
  useEffect(() => {
    if (answer) return;
    setAnnounce(results.length ? `${results.length} results. ${results[0].title}` : query ? 'No results' : '');
  }, [results, answer]);
  useEffect(() => {
    const row = list.current?.querySelector(`[data-i="${active}"]`) as HTMLElement | null;
    row?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  async function choose(cmd: Command): Promise<void> {
    stats?.bump(cmd.id);
    const outcome = await run(host, cmd.intent, cmd.target);
    if (outcome.find !== undefined) {
      setMode('find');
      setQuery(outcome.find);
      return;
    }
    if (outcome.answer) {
      setAnswer({ title: outcome.answer.title, text: outcome.answer.text, kind: outcome.answer.kind || 'ai', pending: !!outcome.answer.pending });
      setAnnounce(outcome.answer.pending ? 'Working on it' : outcome.answer.title);
      if (outcome.answer.pending) {
        outcome.answer.pending.then(
          (text) => {
            setAnswer({ title: outcome.answer!.title, text, kind: 'ai' });
            setAnnounce(text.slice(0, 400));
          },
          (err: Error) => {
            setAnswer({ title: 'Something went wrong', text: err?.message || 'The AI request failed.', kind: 'ai', error: true });
            setAnnounce('The AI request failed');
          },
        );
      }
      return;
    }
    onClose();
    onOutcome(outcome);
  }

  function onKeyDown(e: KeyboardEvent): void {
    // The page underneath must not see any of this: a site with its own "k" or
    // "/" shortcut would fire while somebody types into the bar.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (answer) setAnswer(null);
      else if (mode === 'find') {
        setMode('all');
        setQuery('');
      } else if (query) setQuery('');
      else onClose();
      return;
    }
    if (answer) return;
    if (e.key === 'ArrowDown' || (e.key === 'n' && e.ctrlKey)) {
      e.preventDefault();
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp' || (e.key === 'p' && e.ctrlKey)) {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 6));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 6));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = results[active];
      if (!cmd) return;
      // Shift+Enter on a link opens it in a new tab, the browser's own rule.
      if (e.shiftKey && cmd.target?.href) {
        host.win.open(cmd.target.href, '_blank', 'noopener');
        onClose();
        return;
      }
      void choose(cmd);
    } else if (e.key === 'Backspace' && !query && mode === 'find') {
      setMode('all');
    } else if (e.key === 'Tab') {
      trapTab(e);
    }
  }

  function trapTab(e: KeyboardEvent): void {
    const root = dialog.current;
    if (!root) return;
    const focusables = Array.from(root.querySelectorAll<HTMLElement>('input, button:not([disabled])'));
    if (focusables.length < 2) {
      e.preventDefault();
      return;
    }
    const shadow = root.getRootNode() as ShadowRoot;
    const i = focusables.indexOf(shadow.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? focusables.length - 1 : i - 1) : i === focusables.length - 1 ? 0 : i + 1;
    e.preventDefault();
    focusables[next].focus();
  }

  const placeholder =
    mode === 'find' ? 'Type a heading, section or link on this page' : 'What do you need? Try "too bright" or "text 150%"';

  let lastGroup = '';
  return (
    <div class="wa-cmd-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        class="wa-cmd"
        role="dialog"
        aria-modal="true"
        aria-label="WebAble command bar"
        ref={dialog}
        onKeyDown={onKeyDown as unknown as JSX.KeyboardEventHandler<HTMLDivElement>}
      >
        <div class="wa-cmd-field">
          <span class="wa-cmd-mark">
            <Glyph name="logo" size={22} />
          </span>
          {mode === 'find' ? (
            <span class="wa-cmd-chip">
              <Glyph name="compass" size={14} />
              On this page
            </span>
          ) : null}
          <input
            ref={input}
            class="wa-cmd-input"
            type="text"
            role="combobox"
            aria-expanded={answer ? 'false' : 'true'}
            aria-controls="wa-cmd-list"
            aria-autocomplete="list"
            aria-activedescendant={!answer && results[active] ? `wa-opt-${active}` : undefined}
            aria-label="Command"
            aria-describedby="wa-cmd-hint"
            placeholder={placeholder}
            value={query}
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => {
              const v = (e.currentTarget as HTMLInputElement).value;
              setAnswer(null);
              // "go to " with nothing after it is the start of a jump. Switch
              // to the page navigator now, so the list is the page's headings
              // rather than every tool with "to" in its name.
              if (mode === 'all' && /^(go|jump) to $/i.test(v)) {
                setMode('find');
                setQuery('');
                return;
              }
              if (mode === 'all' && /^[#/]/.test(v)) setMode('find');
              setQuery(v);
            }}
          />
          <kbd class="wa-cmd-esc" aria-hidden="true">
            esc
          </kbd>
        </div>

        {answer ? (
          <AnswerView answer={answer} opts={opts} onBack={() => setAnswer(null)} />
        ) : (
          <ul class="wa-cmd-list" id="wa-cmd-list" role="listbox" aria-label="Results" ref={list}>
            {results.length === 0 ? (
              <li class="wa-cmd-empty" role="presentation">
                {query ? (
                  <>
                    Nothing matched "{query}". Try one of these:
                    <span class="wa-cmd-examples">
                      {EXAMPLES.slice(0, 4).map((x) => (
                        <button type="button" class="wa-cmd-example" key={x} onClick={() => setQuery(x)}>
                          {x}
                        </button>
                      ))}
                    </span>
                  </>
                ) : (
                  'Nothing to show yet.'
                )}
              </li>
            ) : null}
            {results.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null;
              lastGroup = c.group;
              return (
                <>
                  {header ? (
                    <li class="wa-cmd-group" role="presentation" key={`g-${header}`}>
                      {header}
                    </li>
                  ) : null}
                  <li
                    key={c.id}
                    id={`wa-opt-${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={i === active}
                    class={`wa-cmd-row${i === active ? ' is-active' : ''}${c.group === 'Best match' ? ' is-best' : ''}`}
                    onMouseMove={() => i !== active && setActive(i)}
                    onClick={() => void choose(c)}
                  >
                    <span class="wa-cmd-icon">
                      <Glyph name={c.icon} size={17} />
                    </span>
                    <span class="wa-cmd-title">
                      <Highlight text={c.title} query={mode === 'find' ? query.replace(/^[#/]\s*/, '') : query} />
                    </span>
                    {c.meta ? <span class={`wa-cmd-meta${c.meta === 'On' || c.meta === 'Active' ? ' is-on' : ''}`}>{c.meta}</span> : null}
                    {i === active ? (
                      <span class="wa-cmd-enter" aria-hidden="true">
                        <Glyph name="enter" size={14} />
                      </span>
                    ) : null}
                  </li>
                </>
              );
            })}
          </ul>
        )}

        <div class="wa-cmd-foot" id="wa-cmd-hint">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
          <span>
            <kbd>#</kbd> go to
          </span>
          <span>
            <kbd>?</kbd> ask
          </span>
          <span class="wa-cmd-brand">WebAble</span>
        </div>
        <div class="wa-sr" aria-live="polite">
          {announce}
        </div>
      </div>
    </div>
  );
}

/** Bold the parts of a title that the query matched, so the eye sees why. */
function Highlight({ text, query }: { text: string; query: string }): JSX.Element {
  const terms = words(query).filter((w) => w.length > 1);
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}
    </>
  );
}

function AnswerView({ answer, opts, onBack }: { answer: Answer; opts: CommandBarOptions; onBack(): void }): JSX.Element {
  const { host } = opts;
  if (answer.kind === 'help') return <HelpView opts={opts} onBack={onBack} />;
  return (
    <div class="wa-cmd-answer">
      <div class="wa-cmd-answer-title">
        <Glyph name="sparkle" size={16} />
        {answer.title}
      </div>
      {answer.pending ? (
        <div class="wa-cmd-thinking" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <div class={`wa-cmd-answer-text${answer.error ? ' is-error' : ''}`}>{answer.text}</div>
      )}
      <div class="wa-cmd-answer-actions">
        <button type="button" class="wa-btn" onClick={onBack}>
          Back
        </button>
        {!answer.pending && answer.text && !answer.error ? (
          <>
            <button type="button" class="wa-btn" onClick={() => host.engine.tts.speak(answer.text || '')}>
              <Glyph name="speaker" size={15} /> Read aloud
            </button>
            <button type="button" class="wa-btn" onClick={() => void navigator.clipboard?.writeText(answer.text || '')}>
              <Glyph name="copy" size={15} /> Copy
            </button>
          </>
        ) : null}
        {!host.engine.provider.isConfigured() ? (
          <button type="button" class="wa-btn is-primary" onClick={() => host.openSettings()}>
            Add a key in Settings
          </button>
        ) : null}
      </div>
    </div>
  );
}

function HelpView({ opts, onBack }: { opts: CommandBarOptions; onBack(): void }): JSX.Element {
  const s = opts.shortcuts || {};
  const rows: Array<[string, string]> = [
    [s.bar || 'Ctrl+Shift+K', 'Open this command bar'],
    [s.hints || 'Alt+Shift+H', 'Click anything by keyboard'],
    [s.panel || 'Ctrl+Shift+U', 'Open the WebAble panel'],
    ['# heading', 'Go to a heading, section or link'],
    ['? question', 'Ask about this page (AI)'],
    ['Shift+Enter', 'Open a link result in a new tab'],
    ['Esc', 'Back, clear, close'],
  ];
  return (
    <div class="wa-cmd-answer">
      <div class="wa-cmd-answer-title">
        <Glyph name="help" size={16} /> Shortcuts and tips
      </div>
      <dl class="wa-cmd-help">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p class="wa-cmd-tip">
        Say it how you would say it: "too bright", "make the text bigger", "2x speed", "search for gift cards", "I'm colorblind". Change a shortcut at
        chrome://extensions/shortcuts.
      </p>
      <div class="wa-cmd-answer-actions">
        <button type="button" class="wa-btn" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

export type { Intent };

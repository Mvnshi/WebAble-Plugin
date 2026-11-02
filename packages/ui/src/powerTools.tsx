/**
 * Power Tools UI blocks for the interactive tools whose logic lives in
 * @webable/core: Clean Copy, Site Patches ("Fix this site", extension only),
 * Friction log, and TrapLens. All local-first; nothing leaves the device
 * without an explicit, per-action opt-in.
 */
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  selectionText,
  selectionMarkdown,
  selectionCSV,
  cleanUrl,
  pageQuote,
  copyText,
  buildTarget,
  startPatchPicker,
  describeAction,
  describeElement,
  scanTraps,
  FRICTION_REASONS,
  type Engine,
  type PatchAction,
  type Finding,
} from '@webable/core';
import { Icon } from './icons';
import type { OpenController } from './controller';

export function BlockHead({ icon, name, desc, on }: { icon: string; name: string; desc: string; on?: boolean }): JSX.Element {
  return (
    <div class="wa-card-main" style="padding:0">
      <span class="wa-card-ic" data-on={on ? 'true' : 'false'}><Icon name={icon} size={18} /></span>
      <div class="wa-card-tx">
        <div class="wa-card-name">{name}</div>
        <div class="wa-card-desc">{desc}</div>
      </div>
    </div>
  );
}

export function CleanCopyBlock({ engine: _engine }: { engine: Engine }): JSX.Element {
  const [status, setStatus] = useState('');
  const flash = (m: string) => {
    setStatus(m);
    setTimeout(() => setStatus(''), 1700);
  };
  const doCopy = async (label: string, get: () => string) => {
    const t = get();
    if (!t) {
      flash('Select something on the page first.');
      return;
    }
    flash((await copyText(t)) ? `Copied ${label}.` : 'Copy failed.');
  };
  return (
    <div class="wa-panel-block">
      <BlockHead icon="copy" name="Clean copy" desc="Copy the selection without the junk." />
      <div class="wa-pt-grid" style="margin-top:11px">
        <button class="wa-btn wa-btn-ghost" onClick={() => doCopy('text', () => selectionText())}>Text</button>
        <button class="wa-btn wa-btn-ghost" onClick={() => doCopy('Markdown', () => selectionMarkdown())}>Markdown</button>
        <button class="wa-btn wa-btn-ghost" onClick={() => doCopy('CSV', () => selectionCSV())}>Table CSV</button>
        <button class="wa-btn wa-btn-ghost" onClick={() => doCopy('clean URL', () => cleanUrl(location.href))}>Clean URL</button>
        <button class="wa-btn wa-btn-ghost" style="grid-column:1/-1" onClick={() => doCopy('quote', () => pageQuote())}>
          Title + URL + quote
        </button>
      </div>
      {/* Rendered unconditionally. A role="status" node inserted together with
          its text is a new element, not a changed one, so screen readers never
          announce it: the region has to pre-exist the message. */}
      <p class="wa-note" role="status" aria-live="polite">{status}</p>
    </div>
  );
}

function usePatches(engine: Engine) {
  const [list, setList] = useState(engine.patches.list());
  useEffect(() => engine.patches.subscribe(() => setList(engine.patches.list())), [engine]);
  return list;
}

/**
 * The picked element lives outside the component.
 *
 * Starting the picker closes the panel so the user can see the page, and
 * root.tsx renders the panel as `{open && Panel && ...}`, so closing unmounts
 * the whole subtree including this block. The old `setPicked(el)` therefore
 * updated a component that no longer existed: after a successful pick the
 * panel reopened on the Profiles tab with no selection and nothing to show for
 * it. The pick is a page-level interaction, so it is held at module level.
 */
let pickedEl: Element | null = null;
const pickedListeners = new Set<() => void>();
function setPickedEl(el: Element | null): void {
  pickedEl = el;
  for (const fn of pickedListeners) fn();
}
function usePickedEl(): Element | null {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    pickedListeners.add(fn);
    return () => {
      pickedListeners.delete(fn);
    };
  }, []);
  return pickedEl;
}

export function SitePatchesBlock({ engine, controller }: { engine: Engine; controller: OpenController }): JSX.Element {
  const list = usePatches(engine);
  const picked = usePickedEl();
  const setPicked = setPickedEl;
  const [lost, setLost] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Land focus on the actions once something is picked. The user came back from
  // the page to act on their selection; making them Tab to find it undoes the
  // point of picking it.
  useEffect(() => {
    if (picked) actionsRef.current?.querySelector('button')?.focus();
  }, [picked]);

  const startPick = () => {
    controller.close();
    setTimeout(() => {
      startPatchPicker(document, (el) => {
        setPicked(el);
        controller.open();
      });
    }, 80);
  };
  const apply = async (action: PatchAction) => {
    if (!picked) return;
    /* The element was picked before the panel reopened, and the user then read
     * four options and chose one. That is seconds, on a page free to re-render
     * underneath: an SPA route, a feed appending, an ad slot rotating.
     *
     * This matters more than the usual stale-node case because a patch is not
     * a one-off action. It is saved per origin and replayed on every future
     * visit, so building a selector out of a node the page has already
     * replaced writes a rule that hides the wrong element from then on, and
     * the user's only clue is that the wrong thing keeps disappearing. Refuse
     * and say so, rather than saving something plausible. */
    if (!picked.isConnected) {
      setPicked(null);
      setLost(true);
      return;
    }
    setLost(false);
    await engine.patches.add({ action, label: describeElement(picked), target: buildTarget(picked) });
    engine.patches.applyAll(document);
    setPicked(null);
  };

  return (
    <div class="wa-panel-block">
      <BlockHead icon="wrench" name="Fix this site" desc="Hide or restyle an annoying element. Saved for this site." />
      {picked ? (
        <div style="margin-top:10px">
          <p class="wa-note" style="margin-top:0">Selected: {describeElement(picked)}</p>
          <div class="wa-pt-grid" ref={actionsRef}>
            <button class="wa-btn wa-btn-ghost" onClick={() => apply('hide')}>Hide</button>
            <button class="wa-btn wa-btn-ghost" onClick={() => apply('collapse')}>Collapse</button>
            <button class="wa-btn wa-btn-ghost" onClick={() => apply('fullwidth')}>Full width</button>
            <button class="wa-btn wa-btn-ghost" onClick={() => apply('restyle')}>Simplify</button>
          </div>
          <button class="wa-btn wa-btn-ghost wa-btn-block" style="margin-top:8px" onClick={() => setPicked(null)}>Cancel</button>
        </div>
      ) : (
        <button class="wa-btn wa-btn-primary wa-btn-block" style="margin-top:10px" onClick={startPick}>
          Pick an element to fix
        </button>
      )}
      {/* Rendered unconditionally, like the friction block's. A role="status"
          node inserted together with its text is a new element rather than a
          changed one, so a screen reader never announces it. */}
      <p class="wa-note" role="status" aria-live="polite">
        {lost ? 'That element is no longer on the page. Pick it again.' : ''}
      </p>
      {list.length > 0 && (
        <div class="wa-pt-list">
          {list.map((p) => (
            <div class="wa-pt-item" key={p.id}>
              <button
                class="wa-switch"
                role="switch"
                aria-checked={p.enabled ? 'true' : 'false'}
                aria-label={`Toggle ${p.label}`}
                onClick={() => {
                  engine.patches.toggle(p.id);
                  engine.patches.applyAll(document);
                }}
              />
              <span class="wa-pt-item-tx">
                <span class="wa-pt-item-name">{describeAction(p.action)} · {p.label}</span>
                {p.stale && <span class="wa-pt-stale">stale</span>}
              </span>
              <button
                class="wa-card-gear"
                aria-label="Delete patch"
                onClick={() => {
                  engine.patches.remove(p.id);
                  engine.patches.applyAll(document);
                }}
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function captureScreenshot(): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c: any = (window as any).chrome;
      if (!c?.runtime?.sendMessage) return resolve(undefined);
      c.runtime.sendMessage({ type: 'WEBABLE_CAPTURE' }, (res: { dataUrl?: string }) => {
        void c.runtime.lastError;
        resolve(res?.dataUrl);
      });
    } catch {
      resolve(undefined);
    }
  });
}

function useFriction(engine: Engine) {
  const [list, setList] = useState(engine.friction.list());
  useEffect(() => engine.friction.subscribe(() => setList(engine.friction.list())), [engine]);
  return list;
}

export function FrictionBlock({ engine, controller }: { engine: Engine; controller?: OpenController }): JSX.Element {
  const blockRef = useRef<HTMLDivElement>(null);
  const list = useFriction(engine);
  const [reason, setReason] = useState(FRICTION_REASONS[0]);
  const [shot, setShot] = useState(false);
  const [status, setStatus] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canShot = typeof (window as any).chrome !== 'undefined' && !!(window as any).chrome?.runtime;

  const log = async () => {
    // The element the user was ON when they opened the panel, not the one that
    // has focus now, which by the time Log is pressed is the panel itself: every
    // note recorded "div#webable-widget-root" as the thing that frustrated
    // them. The controller already captures this on open.
    const opened = controller?.openedFrom() || null;
    const active = opened && opened.isConnected && !opened.closest('#webable-widget-root') ? opened : document.activeElement;
    const el = active && active !== document.body && !active.closest?.('#webable-widget-root') ? active : null;
    const screenshot = shot && canShot ? await captureScreenshot() : undefined;
    await engine.friction.add({
      url: cleanUrl(location.href),
      reason,
      element: describeElement(el),
      ...(screenshot ? { screenshot } : {}),
    });
    setStatus('Logged on this device.');
    setTimeout(() => setStatus(''), 1700);
  };

  return (
    <div class="wa-panel-block" ref={blockRef} tabIndex={-1}>
      <BlockHead icon="flag" name="Friction log" desc="Note something frustrating. Stays on your device." />
      <div class="wa-ai-key" style="margin-top:11px">
        <select class="wa-input" style="flex:1" value={reason} aria-label="What went wrong" onChange={(e) => setReason((e.target as HTMLSelectElement).value)}>
          {FRICTION_REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button class="wa-btn wa-btn-primary" onClick={log}>Log</button>
      </div>
      {canShot && (
        <label class="wa-pt-check">
          <input type="checkbox" checked={shot} onChange={(e) => setShot((e.target as HTMLInputElement).checked)} />
          Attach a screenshot (only when checked)
        </label>
      )}
      {/* Rendered unconditionally. A role="status" node inserted together with
          its text is a new element, not a changed one, so screen readers never
          announce it: the region has to pre-exist the message. */}
      <p class="wa-note" role="status" aria-live="polite">{status}</p>
      {list.length > 0 && (
        <div class="wa-pt-list">
          {list.slice(0, 5).map((f) => (
            <div class="wa-pt-item" key={f.id}>
              <span class="wa-pt-item-tx">
                <span class="wa-pt-item-name">{f.reason}</span>
                <span class="wa-pt-item-sub">{f.element}</span>
              </span>
              <button class="wa-card-gear" aria-label="Delete note" onClick={() => engine.friction.remove(f.id)}>
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
          {/* Focus moves to the block before the button removes itself. A
              control that deletes itself under focus drops that focus to
              document.body, and the panel reads shadowRoot.activeElement for
              both Escape and the Tab trap, so afterwards neither worked. */}
          <button
            class="wa-note wa-pt-clear"
            onClick={() => {
              blockRef.current?.focus();
              engine.friction.clear();
            }}
          >
            Clear all notes
          </button>
        </div>
      )}
    </div>
  );
}

export function TrapLensBlock(): JSX.Element {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [status, setStatus] = useState('');
  return (
    <div class="wa-panel-block">
      <BlockHead icon="trap" name="TrapLens" desc="Heuristic flags for dark patterns. Advisory, not a guarantee." />
      <button
        class="wa-btn wa-btn-primary wa-btn-block"
        style="margin-top:10px"
        onClick={() => {
          const found = scanTraps(document);
          setFindings(found);
          // Scanning produced a silent visual list. The count is what a screen
          // reader user needs to know the button did anything at all.
          setStatus(found.length ? `${found.length} flag${found.length > 1 ? 's' : ''} found on this page` : 'Nothing flagged on this page');
        }}
      >
        Scan this page
      </button>
      <p class="wa-note" role="status" aria-live="polite">{status}</p>
      {findings &&
        (findings.length ? (
          <div class="wa-pt-list">
            {findings.map((f, i) => (
              <div class="wa-trap" key={i}>
                <div class="wa-trap-name"><Icon name="trap" size={13} /> {f.label}</div>
                <div class="wa-trap-detail">{f.detail}</div>
              </div>
            ))}
          </div>
        ) : (
          <p class="wa-note">No common dark patterns detected. This is a heuristic, not a guarantee.</p>
        ))}
    </div>
  );
}

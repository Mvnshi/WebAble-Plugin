/**
 * Open/close controller for the panel. Lives in its own module so the eager
 * launcher/root and the lazy panel can all import it without a cycle through
 * the mount entry.
 *
 * Dialog focus semantics: opening remembers whatever had focus (across shadow
 * roots); closing returns focus there, falling back to the launcher when that
 * element has since left the document. toggle() routes through
 * open()/close() so the focus-return path always runs, no matter how the panel
 * was toggled (launcher click, Alt+Shift+A, or the public WidgetApi).
 */
export interface OpenController {
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  subscribe(fn: (open: boolean) => void): () => void;
  setLauncher(el: HTMLElement | null): void;
  /** The element focused when the panel opened, for tools that need to act on
   *  what the user was actually on rather than on the panel. */
  openedFrom(): HTMLElement | null;
}

/** The focused element, descending through any open shadow roots. */
function deepActiveElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let el = document.activeElement as HTMLElement | null;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) {
    el = el.shadowRoot.activeElement as HTMLElement;
  }
  return el;
}

/** <body> is what activeElement reports when nothing is focused, so it is not
 *  somewhere to send anyone back to. */
function isSomewhere(el: HTMLElement | null): el is HTMLElement {
  return !!el && el.isConnected && el !== el.ownerDocument.body && typeof el.focus === 'function';
}

export function createController(): OpenController {
  let open = false;
  let launcher: HTMLElement | null = null;
  let returnTo: HTMLElement | null = null;
  const listeners = new Set<(o: boolean) => void>();
  const emit = () => listeners.forEach((fn) => fn(open));

  const usefulReturn = () => (isSomewhere(returnTo) ? returnTo : null);

  const restoreFocus = () => {
    // Whatever had focus when the panel opened wins, and the launcher is the
    // fallback. It used to be the other way round, so opening with the
    // keyboard shortcut from the middle of an article and closing again threw
    // the user to the launcher, which is the last thing in the document: they
    // had to tab all the way back to where they were reading. Coming from the
    // launcher, `returnTo` IS the launcher, so that case is unchanged.
    const target = usefulReturn() || launcher;
    if (target && typeof target.focus === 'function') {
      requestAnimationFrame(() => {
        // Re-checked here rather than trusting the check above. `close()` emits
        // first, so the frame this waits for is the one in which the panel
        // actually unmounts, and on a page that re-renders in response (an SPA
        // route, a framework re-mount) the element that was connected a moment
        // ago may not be now. Focusing a detached node silently does nothing
        // and drops focus to <body>, which dumps a keyboard user at the top of
        // the document: the same failure the launcher fallback already exists
        // to prevent, arriving through a gap instead of through a stale read.
        const el = isSomewhere(target) ? target : launcher;
        try {
          el?.focus();
        } catch {
          /* element went away with the page it was on */
        }
      });
    }
    returnTo = null;
  };

  const api: OpenController = {
    isOpen: () => open,
    open() {
      if (open) return;
      returnTo = deepActiveElement();
      open = true;
      emit();
    },
    close() {
      if (!open) return;
      open = false;
      emit();
      restoreFocus();
    },
    toggle() {
      if (open) api.close();
      else api.open();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setLauncher(el) {
      launcher = el;
    },
    openedFrom: () => usefulReturn(),
  };
  return api;
}

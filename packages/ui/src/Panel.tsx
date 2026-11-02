/**
 * The panel: lazy-loaded on first open. Categorized navigation: a vertical
 * icon rail (ARIA tablist) switches one category at a time, with Profiles as the
 * first tab and a search field that jumps to any tool across categories. Owns
 * its own accessibility: role="dialog" + focus trap, Esc to close with focus
 * returned to the launcher, a polite live region, and full keyboard tab nav.
 *
 * Re-exports PANEL_CSS so the mount can inject the panel's styles into the
 * shadow root at the same moment this chunk arrives.
 */
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  FEATURES,
  CATEGORY_LABELS,
  PROFILES,
  type Engine,
  type FeatureCategory,
  type FeatureModule,
  type SettingValue,
} from '@webable/core';
import { Icon } from './icons';
import { BrandGlyph } from './brandGlyph';
import { Switch, FeatureControl } from './controls';
import { TTSCard, AISection } from './panels';
import { CleanCopyBlock } from './powerTools';
import { GuideBlock } from './guide';
import { useEngineState } from './useEngine';
import { t } from './i18n';
import type { PanelProps } from './config';
// Extension-only blocks. apps/widget/build.mjs resolves this module to a
// stub so none of it is bundled into the widget (see extensionBlocks.tsx).
import { ExtensionHeader, ExtensionTools } from './extensionBlocks';

export { PANEL_CSS } from './panelStyles';

type TabId = 'profiles' | 'guide' | FeatureCategory | 'ai';
interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}
const TABS: TabDef[] = [
  { id: 'profiles', label: t('tab.profiles'), icon: 'grid' },
  { id: 'guide', label: t('tab.guide'), icon: 'guide' },
  { id: 'reading', label: CATEGORY_LABELS.reading, icon: 'reader' },
  { id: 'color', label: CATEGORY_LABELS.color, icon: 'contrast' },
  { id: 'motion', label: CATEGORY_LABELS.motion, icon: 'stopMotion' },
  { id: 'aids', label: CATEGORY_LABELS.aids, icon: 'lowVision' },
  { id: 'power', label: CATEGORY_LABELS.power, icon: 'bolt' },
  { id: 'ai', label: t('tab.ai'), icon: 'key' },
];

function FeatureCard({
  engine,
  feature,
  announce,
}: {
  engine: Engine;
  feature: FeatureModule;
  announce: (m: string) => void;
}): JSX.Element {
  const setting = useEngineState(engine).settings[feature.id];
  const hasControls = !!feature.meta.controls?.length;
  const [open, setOpen] = useState(false);

  const toggle = (on: boolean) => {
    engine.toggleFeature(feature.id, on);
    announce(on ? t('announce.on', { label: feature.meta.label }) : t('announce.off', { label: feature.meta.label }));
    if (on && hasControls) setOpen(true);
  };
  const change = (key: string, value: SettingValue) => engine.setFeature(feature.id, { [key]: value, active: true });

  return (
    <div class="wa-card" data-on={setting.active ? 'true' : 'false'}>
      <div class="wa-card-main">
        <span class="wa-card-ic"><Icon name={feature.meta.icon} size={18} /></span>
        <div class="wa-card-tx">
          <div class="wa-card-name">{feature.meta.label}</div>
          <div class="wa-card-desc">{feature.meta.description}</div>
        </div>
        {hasControls && (
          <button
            class="wa-card-gear"
            aria-expanded={open ? 'true' : 'false'}
            aria-label={t('panel.settingsFor', { label: feature.meta.label })}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon name="settings" size={16} />
          </button>
        )}
        <Switch checked={setting.active} onChange={toggle} label={feature.meta.label} />
      </div>
      {/* Renders on `open` alone, not `open && active`. The gear reports
          aria-expanded, so gating the content on the feature also being active
          meant that on an inactive feature the button announced itself as
          expanded and expanded nothing. Changing any control writes
          `active: true` anyway (see `change` above), so adjusting a tool from
          here turns it on, which is what a person reaching for its settings
          meant. */}
      {hasControls && open && (
        <div class="wa-card-controls">
          {feature.meta.controls!.map((c) => (
            <FeatureControl key={c.key} control={c} value={setting[c.key]} onChange={change} scope={feature.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function Profiles({ engine, announce }: { engine: Engine; announce: (m: string) => void }): JSX.Element {
  const active = useEngineState(engine).activeProfile;
  return (
    <div class="wa-profiles">
      {PROFILES.map((p) => (
        <button
          key={p.id}
          class="wa-profile"
          aria-pressed={active === p.id ? 'true' : 'false'}
          onClick={() => {
            engine.applyProfile(p.id);
            announce(active === p.id ? t('announce.profileCleared') : t('announce.profileApplied', { label: p.label }));
          }}
        >
          <span class="wa-profile-ic"><Icon name={p.icon} size={16} /></span>
          <span class="wa-profile-tx">
            <span class="wa-profile-name">{p.label}</span>
            <span class="wa-profile-desc">{p.description}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * What this is, shown on first open.
 *
 * Profiles being the first tab is most of the answer to "where do I start",
 * but it still opened onto eight unlabelled icons down the left and eight
 * cards, with nothing saying what the thing does, where the settings go, or
 * that any of it can be taken back. Someone who has just installed an
 * accessibility tool because a page is unreadable should not have to work that
 * out from the shape of the UI.
 *
 * Deliberately not persisted anywhere. It is shown while nothing is turned on
 * and disappears the moment anything is, which means a returning user with
 * settings never sees it, a first-time user always does, and none of that costs
 * a storage write. Writing a "you have seen this" flag would have meant the
 * widget touching a visitor's localStorage before they had chosen anything,
 * which is the one thing the widget promises not to do. The dismiss button is
 * for this panel session only, for someone who wants the profiles clear now.
 */
function FirstRun({ onDismiss }: { onDismiss: () => void }): JSX.Element {
  return (
    <div class="wa-intro" role="group" aria-label={t('intro.label')}>
      <p>{t('intro.lead')}</p>
      <p>{t('intro.how')}</p>
      <button class="wa-btn wa-btn-ghost" onClick={onDismiss}>
        {t('intro.dismiss')}
      </button>
    </div>
  );
}

const CORNERS = [
  { value: 'bottom-right', key: 'pos.bottomRight' },
  { value: 'bottom-left', key: 'pos.bottomLeft' },
  { value: 'top-right', key: 'pos.topRight' },
  { value: 'top-left', key: 'pos.topLeft' },
] as const;

/**
 * Where the launcher sits.
 *
 * The launcher can be dragged anywhere, but dragging is bound to pointer events
 * and explicitly skipped for touch, so a keyboard or switch user had no way to
 * move it at all: on a site whose own controls sit in the bottom right, it sat
 * on top of them permanently. Four corners is not the full freedom a mouse has,
 * and it is the part that matters.
 */
function LauncherPosition({ engine, announce }: { engine: Engine; announce: (m: string) => void }): JSX.Element {
  const ui = useEngineState(engine).ui;
  const dragged = !!ui.launcherOffset;
  return (
    <div class="wa-scope wa-position">
      <div class="wa-eyebrow" role="heading" aria-level={2}>{t('panel.positionEyebrow')}</div>
      <div class="wa-seg" role="group" aria-label={t('panel.positionEyebrow')}>
        {CORNERS.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-pressed={!dragged && ui.position === c.value ? 'true' : 'false'}
            onClick={() => {
              // Choosing a corner also clears a dragged position, or the corner
              // would be selected and the launcher would not move.
              engine.setUiPref('launcherOffset', null);
              engine.setUiPref('position', c.value);
              announce(t('announce.moved', { where: t(c.key) }));
            }}
          >
            {t(c.key)}
          </button>
        ))}
      </div>
      {dragged && <p class="wa-scope-hint">{t('panel.positionDragged')}</p>}
    </div>
  );
}

function Cards({ engine, items, announce }: { engine: Engine; items: FeatureModule[]; announce: (m: string) => void }): JSX.Element {
  return (
    <div class="wa-cards">
      {items.map((f) => (
        <FeatureCard key={f.id} engine={engine} feature={f} announce={announce} />
      ))}
    </div>
  );
}

const THEME_ORDER = ['auto', 'light', 'dark', 'glass'] as const;
function cycleTheme(engine: Engine) {
  const cur = engine.getState().ui.theme;
  const next = THEME_ORDER[(THEME_ORDER.indexOf(cur) + 1) % THEME_ORDER.length];
  engine.setUiPref('theme', next);
}
function themeIcon(theme: string): string {
  return theme === 'dark' ? 'moon' : theme === 'glass' ? 'glass' : theme === 'light' ? 'sun' : 'contrast';
}

export function Panel({ engine, config, controller, position, style }: PanelProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [live, setLive] = useState('');
  // Shown in place of Reset while an undo is available. Ten seconds is long
  // enough to read the announcement and act, short enough that the panel does
  // not carry a stale offer.
  const [undo, setUndo] = useState(false);
  // Session only, on purpose. See FirstRun.
  const [introDone, setIntroDone] = useState(false);
  const undoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!undo) return;
    // Focus once, on entering the undo state. This used to be an inline
    // `ref={(el) => el?.focus()}`, whose identity changes every render, so
    // Preact re-applied it on every commit and called focus() again. The panel
    // re-renders on every keystroke in the search field, every live-region
    // announcement, and every engine change, so for the whole ten seconds
    // every control the user touched threw focus back to Undo, and their next
    // Space or Enter fired it: silently restoring the settings they had just
    // deliberately cleared.
    undoRef.current?.focus();
    const id = setTimeout(() => setUndo(false), 10000);
    return () => clearTimeout(id);
  }, [undo]);
  const liveNonce = useRef(false);
  const state = useEngineState(engine);
  // Toggle a trailing zero-width space so an identical message re-announces
  // (assistive tech ignores a status update whose text did not change).
  const announce = (m: string) => {
    liveNonce.current = !liveNonce.current;
    setLive(liveNonce.current ? m : `${m}​`);
  };

  // Visible features for this surface, respecting the optional embed allow-list.
  const visible = useMemo<FeatureModule[]>(() => {
    const onSurface = (f: FeatureModule) => {
      const s = f.meta.surfaces;
      return !s || s === 'both' || s === config.surface;
    };
    let list = FEATURES.filter(onSurface);
    if (config.tools && config.tools.length) list = list.filter((f) => config.tools!.includes(f.id));
    return list;
  }, [config.tools, config.surface]);

  const tabs = useMemo<TabDef[]>(
    () =>
      TABS.filter((t) => {
        if (t.id === 'profiles') return config.showProfiles;
        if (t.id === 'guide' || t.id === 'ai') return config.showAI;
        if (t.id === 'power') return true;
        return visible.some((f) => f.meta.category === t.id);
      }),
    [config.showProfiles, config.showAI, visible],
  );

  const [active, setActive] = useState<TabId>(tabs[0]?.id ?? 'reading');
  useEffect(() => {
    if (!tabs.some((t) => t.id === active)) setActive(tabs[0]?.id ?? 'reading');
  }, [tabs, active]);

  // Focus the search on open; trap Tab; Esc closes and returns focus to launcher.
  useEffect(() => {
    searchRef.current?.focus();
    const node = ref.current;
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        // If the Guide spotlight is up, Escape dismisses it first (keeping the
        // panel and transcript); a second Escape closes the panel.
        if (engine.guide.getState().pointing) {
          engine.guide.dismissPoint();
          return;
        }
        controller.close();
        return;
      }
      if (e.key !== 'Tab') return;
      // Tabbable controls, visible only (offsetParent is null for display:none).
      const f = Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[contenteditable="true"],[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === node.ownerDocument.activeElement);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      // Works whether the panel is in a ShadowRoot (widget/extension) or a
      // plain Document (e.g. an extension popup), and both expose activeElement.
      const root = node.getRootNode() as ShadowRoot | Document;
      const activeEl = root.activeElement;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };
    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, [controller, engine]);

  // ARIA tablist roving focus on the rail.
  const onRailKey = (e: KeyboardEvent) => {
    const ids = tabs.map((t) => t.id);
    const i = ids.indexOf(active);
    let ni = i;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') ni = (i + 1) % ids.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ni = (i - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') ni = 0;
    else if (e.key === 'End') ni = ids.length - 1;
    else return;
    e.preventDefault();
    setActive(ids[ni]);
    requestAnimationFrame(() => railRef.current?.querySelector<HTMLElement>(`[data-tab="${ids[ni]}"]`)?.focus());
  };

  const q = query.trim().toLowerCase();
  const results = useMemo<FeatureModule[]>(() => {
    if (!q) return [];
    return visible.filter((f) => {
      const hay = `${f.meta.label} ${f.meta.description} ${(f.meta.keywords || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [q, visible]);

  const catItems = (cat: FeatureCategory) => visible.filter((f) => f.meta.category === cat);

  // Searching swaps the whole tabpanel and removes the rail, and said nothing
  // while doing it. Debounced so a typed word announces its result once rather
  // than once per keystroke.
  useEffect(() => {
    if (!q) return;
    const id = setTimeout(() => {
      announce(
        results.length
          ? t('announce.results', { n: results.length, s: results.length === 1 ? '' : 's' })
          : t('panel.noResults', { q: query }),
      );
    }, 400);
    return () => clearTimeout(id);
    // `announce` is recreated each render; the query and its result count are
    // what should drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, results.length]);

  function TabContent(): JSX.Element {
    if (active === 'profiles') {
      // Position lives here because Profiles is the first tab and the one
      // someone opens to set the panel up. Dragging the launcher is
      // pointer-only, so without this there was no way at all to move it
      // without a mouse (2.1.1).
      // No eyebrow of its own: the caller already prints the active tab's
      // label above this, so "Profiles" and "One-click profiles" were stacked
      // as two near-identical headings. Two lines of duplicated chrome for a
      // sighted reader, two adjacent labels for a screen reader, and 21px that
      // at 400% zoom was the difference between seeing a profile and not.
      return (
        <>
          {!introDone && engine.activeCount() === 0 && !state.activeProfile && (
            <FirstRun onDismiss={() => setIntroDone(true)} />
          )}
          <Profiles engine={engine} announce={announce} />
          {!config.hideLauncher && <LauncherPosition engine={engine} announce={announce} />}
          {config.surface === 'extension' && <ExtensionHeader engine={engine} announce={announce} />}
        </>
      );
    }
    if (active === 'guide') return <GuideBlock engine={engine} controller={controller} />;
    if (active === 'ai') return <AISection engine={engine} announce={announce} />;
    if (active === 'power') {
      return (
        <>
          <Cards engine={engine} items={catItems('power')} announce={announce} />
          <div class="wa-eyebrow" role="heading" aria-level={2}>{t('panel.interactiveTools')}</div>
          <div class="wa-cards">
            <CleanCopyBlock engine={engine} />
            {config.surface === 'extension' && <ExtensionTools engine={engine} controller={controller} />}
          </div>
        </>
      );
    }
    const items = catItems(active);
    return (
      <>
        <Cards engine={engine} items={items} announce={announce} />
        {active === 'aids' && (
          <div style="margin-top:8px">
            <TTSCard engine={engine} />
          </div>
        )}
      </>
    );
  }

  const activeLabel = tabs.find((t) => t.id === active)?.label || '';

  return (
    <div
      ref={ref}
      class={`wa-panel ${position}`}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-label={t('panel.menuLabel', { brand: config.brandName })}
    >
      <div class="wa-head">
        <span class="wa-head-mark">
          {/* The WebAble mark appears only on an unbranded, attributed embed.
              This used to compare brandName to the literal 'WebAble', so
              data-webable-attribution="false" removed the footer word and left
              our glyph on the header and the launcher. */}
          {config.attribution && config.brandName === 'WebAble' ? (
            <BrandGlyph size={22} />
          ) : (
            <Icon name="access" size={18} />
          )}
        </span>
        <div class="wa-head-titles">
          <div class="wa-head-title" role="heading" aria-level={1}>{config.brandName}</div>
          <div class="wa-head-sub">{t('panel.subtitle')}</div>
        </div>
        <button class="wa-iconbtn" aria-label={t('panel.themeToggle', { theme: state.ui.theme })} onClick={() => cycleTheme(engine)}>
          <Icon name={themeIcon(state.ui.theme)} size={17} />
        </button>
        <button class="wa-iconbtn" aria-label={t('panel.close')} onClick={() => controller.close()}>
          <Icon name="close" size={17} />
        </button>
      </div>

      <div class="wa-search">
        <Icon name="search" size={16} />
        <input
          ref={searchRef}
          type="text"
          placeholder={t('panel.searchPlaceholder')}
          value={query}
          aria-label={t('panel.searchLabel')}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="wa-tabwrap">
        {!q && (
          <div class="wa-rail" role="tablist" aria-orientation="vertical" aria-label={t('panel.categories')} ref={railRef} onKeyDown={onRailKey}>
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                data-tab={t.id}
                id={`wa-tab-${t.id}`}
                aria-selected={active === t.id ? 'true' : 'false'}
                aria-controls="wa-tabpanel"
                aria-label={t.label}
                title={t.label}
                tabIndex={active === t.id ? 0 : -1}
                class="wa-railtab"
                onClick={() => setActive(t.id)}
              >
                <Icon name={t.icon} size={19} />
              </button>
            ))}
          </div>
        )}
        <div
          id="wa-tabpanel"
          class="wa-tabpanel"
          role={q ? undefined : 'tabpanel'}
          aria-labelledby={q ? undefined : `wa-tab-${active}`}
          tabIndex={0}
        >
          {q ? (
            results.length ? (
              <>
                <div class="wa-eyebrow" role="heading" aria-level={2} style="margin-top:2px">{t('panel.results')}</div>
                <Cards engine={engine} items={results} announce={announce} />
              </>
            ) : (
              <div class="wa-empty" role="status">{t('panel.noResults', { q: query })}</div>
            )
          ) : (
            <>
              <div class="wa-eyebrow" role="heading" aria-level={2} style="margin-top:2px">{activeLabel}</div>
              {TabContent()}
            </>
          )}
        </div>
      </div>

      <div class="wa-foot">
        {/* Undo rather than a confirmation dialog. Reset is one press that
            clears everything a person may have spent minutes setting up, and
            an "are you sure?" in front of it taxes every correct use to guard
            the rare wrong one. This taxes nobody and is a better answer for
            someone whose hands are unsteady enough to hit it by accident. It
            replaces the Reset button while it is live, so it cannot be missed,
            and it takes focus so a keyboard or screen reader user lands on it. */}
        {undo ? (
          <button
            class="wa-reset wa-undo"
            ref={undoRef}
            onClick={() => {
              if (engine.undoReset()) announce(t('announce.resetUndone'));
              setUndo(false);
            }}
          >
            <Icon name="reset" size={15} /> {t('panel.undoReset')}
          </button>
        ) : (
          <button
            class="wa-reset"
            onClick={() => {
              engine.resetAll();
              const can = engine.canUndoReset();
              setUndo(can);
              announce(can ? t('announce.resetWithUndo') : t('announce.reset'));
            }}
          >
            <Icon name="reset" size={15} /> {t('panel.resetAll')}
          </button>
        )}
        <div class="wa-foot-links">
          {config.accessibilityUrl && (
            <>
              <a href={config.accessibilityUrl} target="_blank" rel="noopener">{t('panel.statement')}</a>
              <span aria-hidden="true">·</span>
            </>
          )}
          {config.attribution ? <span>WebAble</span> : <span>Accessibility</span>}
        </div>
      </div>

      <div class="wa-live" role="status" aria-live="polite">{live}</div>
    </div>
  );
}

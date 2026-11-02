/**
 * Panel blocks that only exist on the extension.
 *
 * Site Patches needs per-origin storage the widget does not have, and the
 * cross-site defaults block has no meaning on a single origin. They used to be
 * gated at runtime on `config.surface`, which is correct behaviour and the
 * wrong economics: the code still shipped inside the widget's bundle, and the
 * widget is the surface with a hard gzip budget.
 *
 * A runtime flag is not enough to get rid of it. esbuild folds the branch (the
 * JSX call becomes `false`) but decides what to tree-shake before it folds, so
 * the components survive as dead weight. The only reliable answer is for the
 * module never to be bundled: apps/widget/build.mjs resolves this file to
 * extensionBlocks.stub.tsx instead, and everything below, plus everything it
 * imports, is simply absent.
 *
 * Anything added here is free for the widget. Anything added to Panel.tsx is
 * not.
 */
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Engine } from '@webable/core';
import { SitePatchesBlock, FrictionBlock, TrapLensBlock } from './powerTools';
import { FeedsBlock } from './feedBlocks';
import { useEngineState } from './useEngine';
import { addMessages, t } from './i18n';
import { whileBusy } from './controls';

/**
 * What `apps/extension/src/content.ts` puts on `window.__WEBABLE_EXT__`.
 *
 * A bridge rather than props, because these blocks are rendered by Panel.tsx,
 * which is shared with the widget: threading an extension-only capability
 * through the shared component's signature would put it in the widget's bundle
 * and its type surface for something the widget can never use.
 */
interface ExtBridge {
  setEnabled?(on: boolean): void;
  account?(): { email: string | null; plan: string } | null;
  signIn?(token: string): void;
  signOut?(): void;
  openSignIn?(): void;
}

// Extension-only copy. Registered here rather than in i18n.ts so it is absent
// from the widget bundle entirely (that build resolves this module to a stub).
addMessages({
  'panel.scopeEyebrow': 'Where these settings apply',
  'panel.scopeSite': 'Saved for this site only.',
  'panel.scopeInherited': 'Using your defaults for every site.',
  'panel.scopeNone': 'Saved for this site only. Nothing is set for other sites yet.',
  'panel.saveDefaults': 'Use everywhere',
  'panel.saveDefaultsHint': 'Apply these settings on every site you have not adjusted.',
  'panel.forgetSite': 'Forget this site',
  'panel.clearDefaults': 'Clear defaults',
  'panel.resetLauncher': 'Reset button position',
  'announce.defaultsSaved': 'Saved as your defaults for every site',
  'announce.defaultsCleared': 'Defaults cleared',
  'account.eyebrow': 'Account',
  'account.signedOut': 'No account. AI works with your own Gemini key, and every other tool works with neither.',
  'account.signIn': 'Sign in',
  'account.signInHint': 'Opens webable.cc. We email you a link, so there is no password.',
  'account.paste': 'Paste activation token',
  'account.pasteLabel': 'Activation token',
  'account.save': 'Activate',
  'account.signedIn': 'Signed in as {email}',
  'account.plan': 'Plan: {plan}',
  'account.signOut': 'Sign out',
  'account.signOutHint': 'Your own Gemini key, if you have one, stays where it is.',
  'account.bad': 'That does not look like an activation token. Copy the whole thing.',
  'announce.signedIn': 'Signed in. AI now runs through your subscription.',
  'announce.signedOut': 'Signed out',
  'announce.siteForgotten': 'This site now uses your defaults',
  'announce.launcherReset': 'Button position reset',
  'panel.offEyebrow': 'If WebAble is breaking this site',
  'panel.offButton': 'Turn off on this site',
  'panel.offHint':
    'The page goes back to exactly how the site made it. The toolbar button turns it on again, here or anywhere you have turned it off.',
});
import type { OpenController } from './controller';

export type { OpenController };

/**
 * The extension-only half of the Power tools tab, as ONE component.
 *
 * It used to be three JSX call sites in Panel.tsx, each guarded by
 * `config.surface === 'extension'` and each backed by its own null-returning
 * stub. Panel.tsx is shared with the widget, so every one of those cost the
 * widget bytes it can never use, and adding a fourth would have cost a fourth
 * time. One call site is the whole extension-only group, so the next tool
 * added here is free rather than another line in a shared file. Measured with
 * `node apps/widget/build.mjs` on 2026-08-30: the swap took the widget from
 * 66,547 to 66,534 gzipped bytes against a 66,560 gate.
 *
 * The feed guard leads, because it is the largest thing here and the reason
 * anybody opens this tab on a social site. It has no rail tab of its own, and
 * that is a budget decision rather than a design one: a tab costs an entry in
 * Panel.tsx's TABS array and a branch in its content switch, measured at 24
 * gzipped bytes in the widget, and the gate had 13 to spare. bundle-gate.mjs
 * says the budget is fixed and that anything new is lazy, extension-only, or
 * does not ship, so the tab did not ship. The popup carries the quick surface
 * instead, and the on-page chip carries the count.
 */
export function ExtensionTools({
  engine,
  controller,
}: {
  engine: Engine;
  controller: OpenController;
}): JSX.Element {
  return (
    <>
      <FeedsBlock />
      <SitePatchesBlock engine={engine} controller={controller} />
      <FrictionBlock engine={engine} controller={controller} />
      <TrapLensBlock />
    </>
  );
}

/**
 * Where the current settings apply, and how to change that.
 *
 * Settings used to key off one origin with no other scope at all: someone who
 * needs 150% text had to set it again on every site they ever visited, forever,
 * and had no way to see or undo what a site had remembered. This is the
 * smallest honest fix: say which scope is in force, let them promote it to
 * every site, and let them take it back.
 */
export function ScopeBlock({
  engine,
  announce,
}: {
  engine: Engine;
  announce: (m: string) => void;
}): JSX.Element {
  // Subscribed so the wording tracks the settings it describes.
  useEngineState(engine);
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);

  const own = engine.hasSiteSettings();
  const has = engine.hasDefaults();

  return (
    <div class="wa-scope">
      <div class="wa-eyebrow" role="heading" aria-level={2}>{t('panel.scopeEyebrow')}</div>
      <p class="wa-scope-state">
        {own ? (has ? t('panel.scopeSite') : t('panel.scopeNone')) : t('panel.scopeInherited')}
      </p>
      <div class="wa-scope-row">
        <button
          class="wa-btn wa-btn-primary"
          onClick={() => {
            engine.saveAsDefaults();
            refresh();
            announce(t('announce.defaultsSaved'));
          }}
        >
          {t('panel.saveDefaults')}
        </button>
        {own && (
          <button
            class="wa-btn wa-btn-ghost"
            onClick={() => {
              engine.clearSite();
              refresh();
              announce(t('announce.siteForgotten'));
            }}
          >
            {t('panel.forgetSite')}
          </button>
        )}
        {engine.getState().ui.launcherOffset && (
          <button
            class="wa-btn wa-btn-ghost"
            onClick={() => {
              engine.setUiPref('launcherOffset', null);
              refresh();
              announce(t('announce.launcherReset'));
            }}
          >
            {t('panel.resetLauncher')}
          </button>
        )}
        {has && (
          <button
            class="wa-btn wa-btn-ghost"
            onClick={() => {
              engine.clearDefaults();
              refresh();
              announce(t('announce.defaultsCleared'));
            }}
          >
            {t('panel.clearDefaults')}
          </button>
        )}
      </div>
      <p class="wa-scope-hint">{t('panel.saveDefaultsHint')}</p>
    </div>
  );
}


/**
 * The way out.
 *
 * The content script matches every URL at document_start in every frame, and
 * until now there was no way to stop it on one site. When these tools broke a
 * page, and they sometimes do, the only recourse was uninstalling: turning off
 * everything, everywhere, to fix one page. Somebody who needs this extension to
 * read the web should never be choosing between one broken site and no tools.
 *
 * Deliberately not a confirm dialog. The hint says how to come back before the
 * press rather than taxing the press itself, the toolbar button always works
 * even on a page where nothing is running, and turning it on again restores the
 * settings untouched because nothing here deletes them.
 */
export function SiteOffBlock(): JSX.Element | null {
  const ext = (window as unknown as { __WEBABLE_EXT__?: ExtBridge }).__WEBABLE_EXT__;
  if (!ext?.setEnabled) return null;
  return (
    <div class="wa-scope">
      <div class="wa-eyebrow" role="heading" aria-level={2}>{t('panel.offEyebrow')}</div>
      <div class="wa-scope-row">
        <button class="wa-btn wa-btn-ghost" onClick={() => ext.setEnabled?.(false)}>
          {t('panel.offButton')}
        </button>
      </div>
      <p class="wa-scope-hint">{t('panel.offHint')}</p>
    </div>
  );
}

/**
 * Account: sign in, see your tier, sign out.
 *
 * This is the door the plumbing was missing. The relay, the token channel and
 * the provider routing all landed before it, and `apps/api/views/activate.html`
 * was already telling people to open "Settings, then Account, then Paste
 * activation token", which did not exist. A page that instructs somebody to
 * press a control that is not there is worse than one that says nothing.
 *
 * Two ways in, because the automatic one cannot always work. A checkout or
 * sign-in page on an allowed origin hands the token straight to the background
 * worker over `externally_connectable`. That fails whenever the page does not
 * know this extension's id, or the browser does not expose `chrome.runtime`, so
 * the paste field is the fallback and is always present rather than appearing
 * only after something has gone wrong.
 *
 * Lives here rather than in Panel.tsx because everything in this file is absent
 * from the widget bundle, and a widget has no user to sign in: it is embedded
 * by a site owner who configures their own relay token in the embed snippet.
 */
export function AccountBlock({ announce }: { announce?: (m: string) => void }): JSX.Element | null {
  const ext = (window as unknown as { __WEBABLE_EXT__?: ExtBridge }).__WEBABLE_EXT__;
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState('');
  // The block re-renders on engine changes like every other block, and signing
  // in nudges the engine store for exactly that reason (see content.ts).
  const account = ext?.account?.() ?? null;
  if (!ext?.account) return null;

  const activate = (): void => {
    const token = draft.trim();
    // A JWT is three dot-separated segments. Checking the shape here turns a
    // truncated copy into a sentence the user can act on, rather than a 401
    // twenty minutes later that reads as "your subscription is broken".
    if (token.split('.').length !== 3) {
      setErr(t('account.bad'));
      return;
    }
    setErr('');
    setDraft('');
    ext.signIn?.(token);
    announce?.(t('announce.signedIn'));
  };

  if (account) {
    return (
      <div class="wa-scope">
        <div class="wa-eyebrow" role="heading" aria-level={2}>{t('account.eyebrow')}</div>
        <p class="wa-scope-hint">{t('account.signedIn', { email: account.email || '' })}</p>
        <p class="wa-scope-hint">{t('account.plan', { plan: account.plan })}</p>
        <div class="wa-scope-row">
          <button
            class="wa-btn wa-btn-ghost"
            onClick={() => {
              ext.signOut?.();
              announce?.(t('announce.signedOut'));
            }}
          >
            {t('account.signOut')}
          </button>
        </div>
        <p class="wa-scope-hint">{t('account.signOutHint')}</p>
      </div>
    );
  }

  return (
    <div class="wa-scope">
      <div class="wa-eyebrow" role="heading" aria-level={2}>{t('account.eyebrow')}</div>
      <p class="wa-scope-hint">{t('account.signedOut')}</p>
      <div class="wa-scope-row">
        <button class="wa-btn wa-btn-ghost" onClick={() => ext.openSignIn?.()}>
          {t('account.signIn')}
        </button>
      </div>
      <p class="wa-scope-hint">{t('account.signInHint')}</p>
      <div class="wa-ai-key" style="margin-top:10px">
        <input
          class="wa-input"
          type="text"
          placeholder={t('account.paste')}
          value={draft}
          autocomplete="off"
          aria-label={t('account.pasteLabel')}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        />
        {/* whileBusy rather than disabled: a control that disables itself under
            focus drops focus to document.body, and the panel reads
            shadowRoot.activeElement for both Escape and the Tab trap. */}
        <button class="wa-btn wa-btn-primary" {...whileBusy(!draft.trim(), activate)}>
          {t('account.save')}
        </button>
      </div>
      {err ? <p class="wa-scope-hint" role="alert">{err}</p> : null}
    </div>
  );
}

/**
 * Everything the extension puts above the tools, as one element.
 *
 * Composed here rather than listed in Panel.tsx because Panel.tsx is shared
 * with the widget and every line of it is charged to a bundle with single-digit
 * bytes of headroom, while this file is resolved to a stub for the widget and
 * is therefore free. Adding a fourth block above the tools should cost the
 * widget nothing, and from here it does.
 */
export function ExtensionHeader({
  engine,
  announce,
}: {
  engine: Engine;
  announce: (m: string) => void;
}): JSX.Element {
  return (
    <>
      <AccountBlock announce={announce} />
      <ScopeBlock engine={engine} announce={announce} />
      <SiteOffBlock />
    </>
  );
}

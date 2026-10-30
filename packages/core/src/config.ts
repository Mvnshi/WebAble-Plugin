/**
 * Runtime config shared across features. The widget loader / extension sets
 * `window.__WEBABLE_ASSET_BASE__` to the origin assets are served from, so
 * features that need a file (fonts, cursors) can build absolute URLs that work
 * whether the widget is loaded from webable.cc, a CDN, or a self-hosted copy.
 */
export const SETTINGS_KEY = 'settings:v1';
/**
 * Global-layer key. When the engine is given a `globalStorage` adapter, the
 * cross-site preferences (panel chrome + AI key + TTS voice) persist here,
 * while per-site feature settings stay under SETTINGS_KEY. Precedence:
 * per-site feature adjustments win for the page; the panel's appearance, the
 * AI key, and the chosen TTS voice are shared across every site.
 */
export const GLOBAL_KEY = 'global:v1';
/**
 * Secret-layer key. The AI key is a credential the user pasted in, so it is
 * kept out of GLOBAL_KEY and stored through a separate adapter the surface
 * points at device-local storage. It used to ride along in the global blob,
 * which in the extension is chrome.storage.sync, so a key the panel described
 * as "stored only in this browser" was in fact uploaded to Google and pushed to
 * every signed-in browser. Convenience is not worth silently moving someone's
 * credential off their machine.
 */
export const SECRET_KEY = 'secret:v1';
/**
 * Cross-site default feature settings. Lives beside GLOBAL_KEY in the global
 * layer. Per-site settings are layered over these, so "I need 150% text
 * everywhere" is expressible; before this the only scope was one origin and
 * someone who needs large text had to set it again on every site they ever
 * visit, forever.
 */
export const DEFAULTS_KEY = 'defaults:v1';

/** One step of the persisted-schema upgrade path. See migratePersisted. */
export type PersistMigration = (payload: Record<string, unknown>) => Record<string, unknown>;

/**
 * Bring a persisted payload up to the current schema version.
 *
 * Every read used to be `payload.version === PERSIST_VERSION`, so the first
 * time that constant was ever bumped, every per-site setting, the cross-site
 * default, the panel theme and the saved key would be silently replaced with
 * defaults. Nothing warned, and nothing recovered. For someone whose per-site
 * adaptations are how they read the web, that is not a preferences reset: it is
 * losing their accommodations without being told, on an ordinary update they
 * did not ask for.
 *
 * The default here is the important part. A version with no registered step is
 * carried forward UNCHANGED rather than discarded, because `mergeSettings`
 * already merges per key over the defaults and drops ids it does not recognise,
 * so an older payload survives a shape that only grew. A step is only needed
 * when a key is renamed or its meaning changes. That way a careless bump keeps
 * someone's settings and a deliberate one migrates them; the failure mode of
 * forgetting is no longer data loss.
 *
 * Two payloads are still refused, and both are refusals rather than losses:
 *
 *   - No numeric `version` at all. There has never been an unversioned format,
 *     so this is corruption or somebody else's data under our key.
 *   - A version from the FUTURE. A newer build on another synced machine may
 *     have written a shape this build cannot read, and guessing at it is worse
 *     than starting from defaults. Nothing is deleted: the payload is left
 *     where it is, and this build writes over it only if the user actually
 *     changes something here.
 */
export function migratePersisted<T>(
  raw: unknown,
  target: number,
  steps: Record<number, PersistMigration> = {},
): T | null {
  if (!raw || typeof raw !== 'object') return null;
  const bag = raw as Record<string, unknown>;
  const from = bag.version;
  if (typeof from !== 'number' || !Number.isFinite(from) || from > target) return null;
  let out = bag;
  for (let v = from; v < target; v++) {
    const step = steps[v];
    if (step) out = step(out);
  }
  return { ...out, version: target } as T;
}

/**
 * The storage key for a site's own settings.
 *
 * Settings used to key off `location.origin` verbatim, which made
 * `https://example.com`, `https://www.example.com` and `http://example.com`
 * three unrelated profiles of the same site. Someone who set up a site would
 * lose it the moment a link took them to the www form. Protocol is dropped and
 * a leading `www.` is stripped; the port stays, because a different port really
 * is a different service.
 */
export function siteKeyFor(origin: string): string {
  try {
    const url = new URL(origin);
    return url.host.replace(/^www\./i, '');
  } catch {
    return String(origin || 'unknown')
      .replace(/^[a-z]+:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/\/.*$/, '');
  }
}

export function getAssetBase(): string {
  try {
    const w = window as unknown as { __WEBABLE_ASSET_BASE__?: string };
    return (w.__WEBABLE_ASSET_BASE__ || '').replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function assetUrl(path: string): string {
  const base = getAssetBase();
  const clean = path.replace(/^\//, '');
  return base ? `${base}/${clean}` : `/${clean}`;
}

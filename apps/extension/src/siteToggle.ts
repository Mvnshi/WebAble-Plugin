/**
 * Where WebAble is switched off.
 *
 * The content script matches `<all_urls>` at document_start in every frame, and
 * until now there was no allowlist, no blocklist and no off switch of any kind.
 * "Forget this site" clears the settings and the engine keeps running. So when
 * the tools broke a site, and `.hostile.mjs` exists precisely because they
 * sometimes do, the only recourse was uninstalling the whole extension: turning
 * off everything, everywhere, to fix one page.
 *
 * The list is one key in the SYNCED bag rather than a flag in each site's own
 * local payload, for two reasons. A site that breaks under these tools breaks
 * on every machine, so the answer should travel with the person. And a single
 * list is somewhere you can look: a per-site local flag is invisible, and a
 * setting you cannot find is a setting you cannot undo.
 *
 * Nothing here is in the widget. The widget is one origin that its owner chose
 * to install this on, so "off on this site" is the owner removing the tag.
 */
import { chromeStorageAdapter, migratePersisted } from '@webable/core';

export const DISABLED_KEY = 'disabled:v1';

/**
 * chrome.storage.sync gives 8KB per item. A few hundred hostnames is far
 * inside that; the cap is here so a runaway writer cannot silently exceed the
 * quota and take the whole list down with it.
 */
const MAX_SITES = 300;
const VERSION = 1;

interface DisabledPayload {
  version: number;
  sites: string[];
}

const store = chromeStorageAdapter('webable', 'sync');

/** Sites where the tools are switched off, most recently switched off first. */
export async function disabledSites(): Promise<string[]> {
  return readList(await store.get<unknown>(DISABLED_KEY));
}

/**
 * Pull the list out of a stored payload.
 *
 * A payload from a newer build cannot be read, and the only available fallback
 * is an empty list, which means the tools run on a site somebody switched off.
 * That is the wrong direction and it is also the only direction available: the
 * sites are the thing we cannot read. It resolves the moment this build
 * catches up, and no list is ever deleted on the way through.
 */
export function readList(raw: unknown): string[] {
  const p = migratePersisted<DisabledPayload>(raw, VERSION);
  return p && Array.isArray(p.sites) ? p.sites.filter((s) => typeof s === 'string') : [];
}

export async function setDisabled(site: string, off: boolean): Promise<void> {
  const sites = await disabledSites();
  const listed = sites.includes(site);
  if (off === listed) return;
  const next = off ? [site, ...sites].slice(0, MAX_SITES) : sites.filter((s) => s !== site);
  await store.set(DISABLED_KEY, { version: VERSION, sites: next } as DisabledPayload);
}

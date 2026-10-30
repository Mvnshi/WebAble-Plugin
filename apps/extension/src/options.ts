/**
 * Options page logic. Reads/writes the SAME storage the engine uses, so
 * options, every content script, and (for the roaming prefs) other signed-in
 * devices share one source of truth. Two layers:
 *   - GLOBAL_KEY in chrome.storage.sync: panel theme and TTS voice, roams.
 *   - SECRET_KEY in chrome.storage.local: the Gemini key, device-local. The key
 *     is a credential; it does not roam, and this page says so.
 * The toolset list comes from @webable/core so this page can never drift from
 * what the extension ships.
 */
import {
  FEATURES,
  CATEGORY_LABELS,
  chromeStorageAdapter,
  GLOBAL_KEY,
  SECRET_KEY,
  type FeatureCategory,
} from '@webable/core';
import { disabledSites, setDisabled } from './siteToggle';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

type ThemePref = 'auto' | 'light' | 'dark' | 'glass';
interface GlobalBlob {
  version?: number;
  ui?: { theme?: ThemePref; [k: string]: unknown };
  apiKey?: string;
  tts?: unknown;
}

interface SecretBlob {
  version?: number;
  apiKey?: string;
}

const globalStore = chromeStorageAdapter('webable', 'sync');
const secretStore = chromeStorageAdapter('webable', 'local');
// Matches PERSIST_VERSION in the engine; the engine ignores a payload whose
// version it does not recognise, so writing the wrong number here would look
// like the key silently failing to save.
const PERSIST_VERSION = 1;
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const mask = (k: string) => (k.length < 8 ? '••••' : `${k.slice(0, 4)}••••${k.slice(-4)}`);

function setStatus(el: HTMLElement, text: string, kind: '' | 'ok' | 'err' = '') {
  el.textContent = text;
  el.className = `status${kind ? ' ' + kind : ''}`;
}

// Read-modify-write the shared global blob so we never clobber sibling prefs.
async function getBlob(): Promise<GlobalBlob> {
  return (await globalStore.get<GlobalBlob>(GLOBAL_KEY)) || {};
}
// The key lives in the device-local secret layer. Older installs still have it
// in the synced blob; read through to it once so the field is not empty on
// first open after the upgrade, and let the engine's load() do the migration.
async function getApiKey(): Promise<string> {
  const secret = await secretStore.get<SecretBlob>(SECRET_KEY);
  if (secret?.apiKey) return secret.apiKey;
  return (await getBlob()).apiKey || '';
}
async function setApiKey(key: string): Promise<void> {
  await secretStore.set(SECRET_KEY, { version: PERSIST_VERSION, apiKey: key });
  // Clear any copy left in the synced blob by a pre-migration install, so
  // saving a key here also stops the old one roaming.
  const blob = await getBlob();
  if (blob.apiKey !== undefined) {
    const { apiKey: _dropped, ...rest } = blob;
    await globalStore.set(GLOBAL_KEY, rest);
  }
}

// ---- API key ----
const keyInput = $('key') as HTMLInputElement;
const keyStatus = $('key-status');

void getApiKey().then((k) => {
  if (k) {
    keyInput.value = k;
    setStatus(keyStatus, `Key set · ${mask(k)} · stored on this device only, never synced`, 'ok');
  }
});

$('save').addEventListener('click', () => {
  const k = keyInput.value.trim();
  if (!k) {
    setStatus(keyStatus, 'Enter a key first.', 'err');
    return;
  }
  void setApiKey(k).then(() =>
    setStatus(keyStatus, `Saved · ${mask(k)} · stored on this device only, never synced`, 'ok'),
  );
});

$('clear').addEventListener('click', () => {
  keyInput.value = '';
  void setApiKey('').then(() => setStatus(keyStatus, 'Key removed.'));
});

$('test').addEventListener('click', async () => {
  const k = keyInput.value.trim();
  if (!k) {
    setStatus(keyStatus, 'Enter a key first.', 'err');
    return;
  }
  setStatus(keyStatus, 'Testing…');
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': k } });
    setStatus(keyStatus, res.ok ? `Key works · ${mask(k)}` : `Key rejected (HTTP ${res.status})`, res.ok ? 'ok' : 'err');
  } catch {
    setStatus(keyStatus, 'Could not reach Google. Check your connection.', 'err');
  }
});

// ---- panel theme (parity with the in-panel theme control, synced) ----
const themeSelect = $('theme') as HTMLSelectElement;
const themeStatus = $('theme-status');
void getBlob().then((b) => {
  themeSelect.value = b.ui?.theme || 'auto';
});
themeSelect.addEventListener('change', () => {
  const theme = themeSelect.value as ThemePref;
  void getBlob().then((b) => {
    void globalStore
      .set(GLOBAL_KEY, { ...b, ui: { ...(b.ui || {}), theme } })
      .then(() => setStatus(themeStatus, `Theme set to ${theme}. Synced to your signed-in devices.`, 'ok'));
  });
});

// ---- toolset (from the shared registry) ----
const tools = $('tools');
const order: FeatureCategory[] = ['reading', 'color', 'motion', 'aids', 'power'];
for (const cat of order) {
  const items = FEATURES.filter((f) => f.meta.category === cat);
  if (!items.length) continue;
  const head = document.createElement('div');
  head.className = 'cat';
  head.textContent = CATEGORY_LABELS[cat];
  tools.appendChild(head);
  for (const f of items) {
    const row = document.createElement('div');
    row.className = 'tool';
    row.innerHTML = `${f.meta.label} <small>${f.meta.wcag?.length ? '· WCAG ' + f.meta.wcag.join(', ') : ''}</small>`;
    tools.appendChild(row);
  }
}

// ---- wipe all data (both local per-site settings and synced global prefs) ----
function wipeArea(area: 'local' | 'sync'): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage[area].get(null, (all: Record<string, unknown>) => {
        const keys = Object.keys(all).filter((k) => k.startsWith('webable'));
        chrome.storage[area].remove(keys, () => resolve());
      });
    } catch {
      resolve();
    }
  });
}
$('wipe').addEventListener('click', () => {
  if (!confirm('Remove all WebAble data (per-site settings, the Gemini key, and the panel theme) from this device, and the panel theme from your synced devices?')) return;
  void Promise.all([wipeArea('local'), wipeArea('sync')]).then(() => {
    keyInput.value = '';
    themeSelect.value = 'auto';
    setStatus(keyStatus, 'No key set.');
    setStatus($('wipe-status'), 'All WebAble data cleared (this device and synced).', 'ok');
  });
});

// ---- sites this is switched off on ----
// The list lives in the synced bag so it travels with the person; this is the
// one place to see all of it, because a per-site switch you cannot find again
// is a switch you cannot undo. See src/siteToggle.ts.
const disabledList = $('disabled-list');
async function renderDisabled() {
  const sites = await disabledSites();
  disabledList.innerHTML = '';
  if (!sites.length) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = 'None. WebAble is running everywhere.';
    disabledList.appendChild(p);
    return;
  }
  for (const site of sites) {
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.className = 'tool';
    name.textContent = site;
    const on = document.createElement('button');
    on.className = 'btn';
    on.textContent = `Turn back on for ${site}`;
    on.addEventListener('click', () => {
      void setDisabled(site, false).then(() => {
        void renderDisabled();
        setStatus($('disabled-status'), `WebAble is on again for ${site}. Reload that tab to see it.`, 'ok');
      });
    });
    row.append(name, on);
    disabledList.appendChild(row);
  }
}
void renderDisabled();

// ---- move a setup to another computer ----
/**
 * Export, import, and the reason this is not just portability.
 *
 * The audience this product names includes older users and people with
 * cognitive differences, who are very often set up by a family member or a
 * support worker. Until now there was no way to build a configuration on one
 * machine and hand it over, no way to survive a reinstall, and no way to carry
 * the "fix this site" rules somebody spent an evening building.
 *
 * The Gemini key is deliberately not in the file. It is a credential, and a
 * settings file is a thing people email to each other and leave in Downloads.
 * Everything else travels.
 */
const IO_VERSION = 1;
const SECRET_KEYS = [SECRET_KEY, 'webable:aikey'];

interface Bundle {
  webable: 'settings';
  version: number;
  exported: string;
  local: Record<string, unknown>;
  sync: Record<string, unknown>;
}

function readArea(area: 'local' | 'sync'): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    try {
      chrome.storage[area].get(null, (all: Record<string, unknown>) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(all || {})) {
          if (!k.startsWith('webable')) continue;
          if (SECRET_KEYS.includes(k)) continue;
          // The device-local bag holds the key alongside things worth carrying,
          // so it is copied minus that one entry rather than skipped whole.
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            const bag: Record<string, unknown> = { ...(v as Record<string, unknown>) };
            for (const secret of SECRET_KEYS) delete bag[secret];
            out[k] = bag;
          } else {
            out[k] = v;
          }
        }
        resolve(out);
      });
    } catch {
      resolve({});
    }
  });
}

function writeArea(area: 'local' | 'sync', bag: Record<string, unknown>): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage[area].set(bag, () => resolve());
    } catch {
      resolve();
    }
  });
}

$('export').addEventListener('click', async () => {
  const [local, sync] = await Promise.all([readArea('local'), readArea('sync')]);
  const bundle: Bundle = {
    webable: 'settings',
    version: IO_VERSION,
    exported: new Date().toISOString(),
    local,
    sync,
  };
  const sites = Object.keys(local).filter((k) => k.startsWith('webable@')).length;
  const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `webable-settings-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  // Revoked on a timer rather than immediately: the click starts the download
  // asynchronously and revoking first cancels it.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  setStatus(
    $('io-status'),
    `Saved. ${sites} site${sites === 1 ? '' : 's'}, and no Gemini key: enter that again on the other computer.`,
    'ok',
  );
});

$('import').addEventListener('click', () => ($('import-file') as HTMLInputElement).click());

($('import-file') as HTMLInputElement).addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  let bundle: Bundle;
  try {
    bundle = JSON.parse(await file.text()) as Bundle;
  } catch {
    setStatus($('io-status'), 'That file is not readable. Pick the file WebAble saved.', 'err');
    return;
  }
  if (bundle?.webable !== 'settings' || typeof bundle.version !== 'number') {
    setStatus($('io-status'), 'That is not a WebAble settings file.', 'err');
    return;
  }
  if (bundle.version > IO_VERSION) {
    setStatus($('io-status'), 'That file was saved by a newer version of WebAble. Update this one first.', 'err');
    return;
  }
  const sites = Object.keys(bundle.local || {}).filter((k) => k.startsWith('webable@')).length;
  if (
    !confirm(
      `Bring in settings for ${sites} site${sites === 1 ? '' : 's'}?\n\n` +
        'Any site in the file replaces what you have set for that site here. Sites that are not in the file are left alone, and your Gemini key is not touched.',
    )
  ) {
    ($('import-file') as HTMLInputElement).value = '';
    return;
  }
  // The key is stripped on the way in as well as on the way out, so a
  // hand-edited file cannot plant a credential in somebody's browser.
  const strip = (bag: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(bag || {})) {
      if (!k.startsWith('webable') || SECRET_KEYS.includes(k)) continue;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const inner: Record<string, unknown> = { ...(v as Record<string, unknown>) };
        for (const secret of SECRET_KEYS) delete inner[secret];
        out[k] = inner;
      } else {
        out[k] = v;
      }
    }
    return out;
  };
  const localIn = strip(bundle.local || {});
  // The device-local `webable` bag holds this machine's key. Merge rather than
  // replace, or importing a setup would wipe the key the user already entered.
  if (localIn.webable) {
    const existing = (await secretStore.get<Record<string, unknown>>(SECRET_KEY)) as unknown;
    const merged = { ...(localIn.webable as Record<string, unknown>) };
    if (existing) merged[SECRET_KEY] = existing;
    localIn.webable = merged;
  }
  await Promise.all([writeArea('local', localIn), writeArea('sync', strip(bundle.sync || {}))]);
  ($('import-file') as HTMLInputElement).value = '';
  await renderDisabled();
  void getBlob().then((b) => {
    themeSelect.value = b.ui?.theme || 'auto';
  });
  setStatus(
    $('io-status'),
    `Brought in settings for ${sites} site${sites === 1 ? '' : 's'}. Reload any open tabs to see them.`,
    'ok',
  );
});

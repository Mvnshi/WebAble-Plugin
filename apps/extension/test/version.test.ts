/**
 * The rule: there is one extension version, and it is the manifest's.
 *
 * Why it exists: the version was stated in four places and disagreed in three
 * ways. manifest.json said 2.6.0, package.json said 2.5.0, the store listing
 * said 2.5.0, and the packaged zip in store/ was built from a 2.5.0 manifest.
 * A reviewer reading the submission kit and a user reading chrome://extensions
 * saw different products. The manifest wins because it is what Chrome installs.
 *
 * Paths are resolved from process.cwd(): scripts/test-core.mjs runs node from
 * the repo root, so the bundled test still finds the real files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const ext = join(root, 'apps/extension');

function read(rel: string): string {
  const path = resolve(ext, rel);
  assert.ok(existsSync(path), `expected ${path} to exist (run the tests from the repo root)`);
  return readFileSync(path, 'utf8');
}

const manifestVersion = (JSON.parse(read('manifest.json')) as { version: string }).version;

test('the manifest version looks like a version', () => {
  assert.match(manifestVersion, /^\d+\.\d+\.\d+$/);
});

test('package.json agrees with the manifest', () => {
  const pkg = JSON.parse(read('package.json')) as { version: string };
  assert.equal(pkg.version, manifestVersion);
});

test('the store listing states the manifest version', () => {
  const listing = read('STORE_LISTING.md');
  const stated = /Version (\d+\.\d+\.\d+) \(MV3\)/.exec(listing)?.[1];
  assert.equal(stated, manifestVersion, 'STORE_LISTING.md quotes a different version');
});

test('no stale packaged zip is left in store/', () => {
  const storeDir = join(ext, 'store');
  if (!existsSync(storeDir)) return;
  const stale = readdirSync(storeDir).filter(
    (f) => f.endsWith('.zip') && !f.includes(`v${manifestVersion}`),
  );
  assert.deepEqual(stale, [], `zips built from an older manifest: ${stale.join(', ')}`);
});

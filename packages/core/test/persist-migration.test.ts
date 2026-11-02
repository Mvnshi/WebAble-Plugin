/**
 * The rule: bumping the persisted schema version must not throw away what the
 * user already set.
 *
 * Why it exists: every read was `payload.version === PERSIST_VERSION`, so the
 * first bump of that constant would have replaced every per-site setting, the
 * cross-site default, the panel theme and the saved key with defaults, silently,
 * on an ordinary update. `siteDirty` would have been false, so the old payload
 * would sit there unread until the next change overwrote it. For someone whose
 * per-site adaptations are how they read the web, that is losing their
 * accommodations without being told.
 *
 * The window to fix it for free closes at v2: after that, anyone already
 * upgraded has already lost the payload there was a chance to migrate.
 *
 * The transform is tested directly, with synthetic versions, because the thing
 * that needs proving is behaviour at a version bump that has not happened yet.
 * The last two tests then prove the engine actually routes through it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { migratePersisted, createEngine, memoryAdapter, SETTINGS_KEY, type PersistMigration } from '@webable/core';

test('a payload already at the current version passes through', () => {
  const out = migratePersisted<{ version: number; a: number }>({ version: 3, a: 1 }, 3);
  assert.deepEqual(out, { version: 3, a: 1 });
});

test('an older payload with no registered step is carried forward, not discarded', () => {
  // The default that matters. mergeSettings already merges per key over the
  // defaults and drops ids it does not recognise, so a payload from a shape
  // that only grew survives untouched. Discarding by default would mean that
  // forgetting to write a migration costs the user their settings.
  const out = migratePersisted<{ version: number; settings: unknown }>(
    { version: 1, settings: { readableFont: { active: true } } },
    4,
  );
  assert.deepEqual(out, { version: 4, settings: { readableFont: { active: true } } });
});

test('registered steps run in order, once each, for every version crossed', () => {
  const seen: number[] = [];
  const steps: Record<number, PersistMigration> = {
    1: (p) => {
      seen.push(1);
      return { ...p, one: true };
    },
    2: (p) => {
      seen.push(2);
      return { ...p, two: true };
    },
    3: (p) => {
      seen.push(3);
      return { ...p, three: true };
    },
  };
  const out = migratePersisted<Record<string, unknown>>({ version: 1, kept: 'yes' }, 4, steps);
  assert.deepEqual(seen, [1, 2, 3], 'every hop is taken, in order');
  assert.deepEqual(out, { version: 4, kept: 'yes', one: true, two: true, three: true });
});

test('only the steps above the stored version run', () => {
  const seen: number[] = [];
  const steps: Record<number, PersistMigration> = {
    1: (p) => (seen.push(1), p),
    2: (p) => (seen.push(2), p),
  };
  migratePersisted({ version: 2 }, 3, steps);
  assert.deepEqual(seen, [2], 'a v2 payload does not get re-run through the v1 step');
});

test('a gap in the registry is a carry-forward, not a stop', () => {
  // Version 2 has no entry. The payload still reaches 4 and still runs the v3
  // step, because a missing step means "this hop changed nothing".
  const seen: number[] = [];
  const steps: Record<number, PersistMigration> = {
    1: (p) => (seen.push(1), p),
    3: (p) => (seen.push(3), p),
  };
  const out = migratePersisted<{ version: number }>({ version: 1 }, 4, steps);
  assert.deepEqual(seen, [1, 3]);
  assert.equal(out?.version, 4);
});

test('a payload from a newer build is refused rather than guessed at', () => {
  // Chrome sync makes this real: a machine on the newer build writes a shape
  // this build cannot read. Reading it wrong is worse than starting from
  // defaults, and nothing here deletes it.
  assert.equal(migratePersisted({ version: 5, settings: {} }, 2), null);
});

test('a payload with no version, or a nonsense one, is refused', () => {
  // There has never been an unversioned format, so this is corruption or
  // somebody else's data under our key.
  assert.equal(migratePersisted({ settings: {} }, 1), null);
  assert.equal(migratePersisted({ version: '1', settings: {} }, 1), null);
  assert.equal(migratePersisted({ version: NaN }, 1), null);
  assert.equal(migratePersisted(null, 1), null);
  assert.equal(migratePersisted('not a payload', 1), null);
});

// ---------------------------------------------------------------------------

function doc(): Document {
  return new JSDOM('<!doctype html><html><head></head><body><p>Hi</p></body></html>', {
    pretendToBeVisual: true,
  }).window.document;
}

test('the engine reads a payload written by an older schema version', async () => {
  // The end-to-end version of the second test. Version 0 was never written by
  // any shipped build, which is exactly what makes it usable here: it is an
  // older version with no registered step, so it exercises the carry-forward
  // path through the real engine. Before the migration step this returned
  // defaults and the user's settings were gone.
  const storage = memoryAdapter();
  await storage.set(SETTINGS_KEY, {
    version: 0,
    settings: { readableFont: { active: true }, fontSize: { active: true, value: 150 } },
    activeProfile: null,
  });

  const d = doc();
  const engine = createEngine({ doc: d, storage });
  await engine.ready;

  assert.ok(d.documentElement.hasAttribute('data-webable-readable'), 'the old settings still apply');
  assert.equal(engine.getState().settings.fontSize.value, 150, 'and their values survived');
  assert.ok(engine.hasSiteSettings(), 'the site is still recognised as one the user has adjusted');
  engine.destroy();
});

test('a payload from a newer build leaves the user on defaults and is not deleted', async () => {
  const storage = memoryAdapter();
  const future = { version: 99, settings: { readableFont: { active: true } }, activeProfile: null };
  await storage.set(SETTINGS_KEY, future);

  const d = doc();
  const engine = createEngine({ doc: d, storage });
  await engine.ready;

  assert.ok(!d.documentElement.hasAttribute('data-webable-readable'), 'a shape we cannot read is not guessed at');
  assert.deepEqual(
    await storage.get(SETTINGS_KEY),
    future,
    'and it is still on disk, so the newer build finds it intact',
  );
  engine.destroy();
});

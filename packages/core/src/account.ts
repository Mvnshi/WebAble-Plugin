/**
 * The signed-in subscription, kept deliberately outside the engine.
 *
 * It would be tidier as a field on `EngineState`. It is not one, for a reason
 * worth writing down: the widget and the extension share one bundle with a hard
 * 65 KB gzip budget, and at the time of writing that budget had 27 bytes spare.
 * Putting accounts in the engine cost 46 gzipped bytes and broke the gate, for a
 * feature the widget cannot reach: a widget is embedded by a site owner who
 * configures their own relay token in the embed snippet, and has no user to sign
 * in. So the extension pays for accounts and the widget does not, which is the
 * correct division and is only achievable by keeping this out of engine.ts.
 *
 * That this had to be reasoned about at all is the symptom `docs/prompts/README.md`
 * predicted: the widget's ceiling silently caps what the extension can be.
 *
 * The token is a credential, so it goes in the same device-local secret layer as
 * the Gemini key and never in `chrome.storage.sync`, which would upload it to
 * Google and push it to every browser the user is signed into.
 */
import type { StorageAdapter } from './types';

/** Sits beside SECRET_KEY in the device-local layer. */
export const ACCOUNT_KEY = 'account:v1';

/**
 * The hosted relay. One constant, so the extension, the checkout page's
 * `externally_connectable` allowlist and the CSP cannot drift apart.
 */
export const RELAY_BASE = 'https://api.webable.cc';

export interface Account {
  token: string;
  email: string | null;
  plan: string;
  /** Seconds since the epoch, matching the JWT's own exp claim. */
  expiresAt: number;
}

export interface AccountStore {
  /** The current account, or null when nobody is signed in. */
  get(): Account | null;
  /** Sign in, or sign out with null. */
  set(account: Account | null): Promise<void>;
  subscribe(fn: (account: Account | null) => void): () => void;
  /** Resolves once the persisted account has been read. */
  readonly ready: Promise<void>;
  /** Adopt a value another context loaded, without writing it back. */
  adopt(account: Account | null): void;
}

/**
 * Accepts only a shape that could actually authenticate.
 *
 * Anything persisted can be edited by hand or written by a build that disagreed
 * about the shape, and a half-account is worse than none: it would make
 * `isConfigured()` true, send an unusable Authorization header, and present the
 * 401 as though the subscription had lapsed.
 */
export function readAccount(raw: unknown): Account | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.token !== 'string' || !a.token) return null;
  return {
    token: a.token,
    email: typeof a.email === 'string' ? a.email : null,
    plan: typeof a.plan === 'string' ? a.plan : 'pro',
    expiresAt: typeof a.expiresAt === 'number' ? a.expiresAt : 0,
  };
}

/**
 * An expired token is treated as signed out.
 *
 * The server is the authority and would reject it anyway, but doing this
 * client-side means the UI says "signed out" rather than offering AI actions
 * that fail with an authentication error the user cannot act on. A zero
 * `expiresAt` means "unknown", not "expired": a token from a build that did not
 * record the claim should not be thrown away.
 */
export function isLive(account: Account | null, now = Date.now()): boolean {
  if (!account) return false;
  if (!account.expiresAt) return true;
  return account.expiresAt * 1000 > now;
}

export function createAccountStore(storage: StorageAdapter): AccountStore {
  let current: Account | null = null;
  const listeners = new Set<(a: Account | null) => void>();

  const emit = (): void => {
    for (const fn of listeners) fn(current);
  };

  const ready = (async () => {
    try {
      current = readAccount(await storage.get(ACCOUNT_KEY));
      if (current) emit();
    } catch {
      // An unreadable store means signed out, which is recoverable by signing
      // in again. Throwing here would take the whole panel down with it.
    }
  })();

  return {
    ready,
    get: () => (isLive(current) ? current : null),
    async set(account) {
      current = account;
      emit();
      try {
        await storage.set(ACCOUNT_KEY, account);
      } catch {
        // The sign-in still holds for this session. Reporting a storage
        // failure as a failed sign-in would be worse: the user did sign in.
      }
    },
    adopt(account) {
      current = account;
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

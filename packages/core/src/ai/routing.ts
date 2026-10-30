/**
 * Chooses between the hosted relay and the user's own key, per call.
 *
 * The choice cannot be made once at construction. A surface that builds a proxy
 * provider up front silently stops honouring the key of every existing
 * bring-your-own-key user, and a surface that builds a Gemini provider up front
 * can never use an account the user signs into later. Both states change while
 * the page is open: signing in, signing out, pasting a key, clearing one.
 *
 * Precedence is account, then key, then nothing:
 *
 *   - An account is what somebody paid for. If they have one, using their
 *     personal Gemini quota instead would be charging them twice.
 *   - A key with no account is the honest fallback, and it is what makes the
 *     privacy story true: nothing reaches our servers on that path.
 *   - Neither is not an error, it is the free tier. The null provider's
 *     messages are what the UI shows.
 *
 * `isConfigured()` is the single question the UI asks before offering an AI
 * action, which is why it has to be true for either route and false for
 * neither. It used to be answered by "is there an apiKey", which is why a
 * signed-in account still saw a key prompt.
 */
import type { CompanionEvent } from '@webable/companion';
import type { AIProvider, GuideReply, GuideTurn } from '../types';
import { createGeminiProvider, createProxyProvider } from './gemini';
import { nullProvider } from './index';

export interface RoutingOptions {
  /** Hosted relay base, e.g. https://api.webable.cc */
  relayBase: string;
  /** The subscriber JWT, or null/empty when nobody is signed in. */
  getToken: () => string | null;
  /** The user's own Gemini key, or empty. */
  getKey: () => string;
}

export function createRoutingProvider(opts: RoutingOptions): AIProvider {
  const { relayBase, getToken, getKey } = opts;

  // Both are cheap and read their credentials through getters on every call,
  // so constructing them once costs nothing and captures nothing stale.
  const hosted = createProxyProvider(relayBase, { getToken });
  const own = createGeminiProvider(() => getKey());

  /** The provider this call should use. Recomputed every time, deliberately. */
  function pick(): AIProvider {
    if (getToken()) return hosted;
    if (getKey()) return own;
    return nullProvider;
  }

  /**
   * Failures where the user's own key is a better answer than an error.
   *
   * Only the ones that mean "the hosted service is not available right now":
   * an operator paused the relay, or the server has no operator key. Both are
   * our problem, not the user's, and somebody who also holds a key should not
   * be stopped by them.
   *
   * Deliberately NOT quota, an inactive subscription, or a rejected token.
   * Falling back on those would spend the user's own Google credit silently,
   * to hide from them that their subscription needs attention. Degrading has
   * to be invisible only when the thing being hidden costs them nothing.
   */
  const SERVICE_DOWN = new Set(['RELAY_DISABLED', 'NO_OPERATOR_KEY']);

  function shouldFallBack(err: unknown): boolean {
    if (!getKey()) return false;
    const code = (err as { code?: string })?.code;
    // A network failure has no code at all: fetch rejects rather than
    // answering. Somebody on a plane whose accessibility tool refuses to work
    // because it cannot reach a server has been failed by the product.
    if (!code) return true;
    return SERVICE_DOWN.has(code);
  }

  /** Run on the chosen route, and degrade to the key rather than to nothing. */
  async function route<T>(fn: (p: AIProvider) => Promise<T>): Promise<T> {
    const chosen = pick();
    if (chosen !== hosted) return fn(chosen);
    try {
      return await fn(hosted);
    } catch (err) {
      if (!shouldFallBack(err)) throw err;
      return fn(own);
    }
  }

  return {
    get id() {
      return pick().id;
    },
    isConfigured: () => !!getToken() || !!getKey(),

    describeImage: (input) => route((p) => p.describeImage(input)),
    simplify: (text, o) => route((p) => p.simplify(text, o)),
    summarize: (text, o) => route((p) => p.summarize(text, o)),
    ask: (question, context) => route((p) => p.ask(question, context)),
    translate: (text, lang) => route((p) => p.translate(text, lang)),
    explain: (text) => route((p) => p.explain(text)),
    ocr: (input) => route((p) => p.ocr(input)),
    guide: (input: { question: string; page: string; history?: GuideTurn[] }): Promise<GuideReply> =>
      route((p) => p.guide(input)),

    /**
     * Present unconditionally, because whether the chosen route can stream is
     * not knowable until the call happens. Declaring it absent would make the
     * Guide fall back to batch answers for everybody, including the routes that
     * can stream; declaring it present and delegating means each call gets the
     * best its own route offers.
     */
    async guideStream(
      input: { question: string; page: string; history?: GuideTurn[] },
      onEvent: (event: CompanionEvent) => void,
      signal?: AbortSignal,
    ): Promise<void> {
      const chosen = pick();
      if (chosen.guideStream) return chosen.guideStream(input, onEvent, signal);
      // The route cannot stream. Answer in one piece rather than failing: a
      // walkthrough that arrives all at once still walks the user through it.
      const reply = await chosen.guide(input);
      const steps = reply.steps?.length ? reply.steps : [{ say: reply.say, point: reply.point }];
      for (const step of steps) {
        if (step.say) onEvent({ type: 'text', text: step.say });
        onEvent({ type: 'step' });
      }
    },
  };
}

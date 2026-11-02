/**
 * TrapLens, best-effort, advisory heuristics that flag common dark patterns on
 * the current page: pre-checked add-on/consent boxes, auto-renew or recurring
 * billing language near a price, buried cancel/unsubscribe paths, and consent
 * banners that offer "Accept all" without an equal "Reject all". These are
 * heuristics, not guarantees, and never take any automated action.
 */
export interface Finding {
  type: 'precheck' | 'recurring' | 'cancel' | 'consent';
  label: string;
  detail: string;
}

const PRICE_RE = /(?:[$£€]\s?\d|\d+[.,]\d{2}\s?(?:usd|eur|gbp|\/mo|\/month))/i;
const RECUR_RE =
  /\b(auto[- ]?renew(?:s|al)?|automatically renew|recurring|per month|\/mo\b|\/month|billed (?:annually|monthly|yearly)|free trial|after (?:the |your )?trial|cancel anytime)\b/i;
const CANCEL_RE = /\b(cancel|unsubscribe|opt[- ]?out|manage subscription|turn off auto)\b/i;
const SIGNUP_RE = /\b(subscribe|sign up|start (?:your |a )?(?:free )?trial|upgrade|buy now|get started|join now)\b/i;
const OPTIN_RE = /\b(add|insurance|protection|warranty|newsletter|subscribe|marketing|consent|agree|gift|donat|round up|priority|recommend)\b/i;

function nearbyText(el: Element): string {
  const id = (el as HTMLElement).id;
  let lbl = '';
  if (id) {
    try {
      lbl = el.ownerDocument.querySelector(`label[for="${id.replace(/"/g, '\\"')}"]`)?.textContent || '';
    } catch {
      /* ignore */
    }
  }
  if (!lbl) lbl = (el.closest('label') || el.parentElement)?.textContent || '';
  return lbl.replace(/\s+/g, ' ').trim();
}

const isBuried = (el: Element): boolean => !!el.closest('footer,[class*="footer" i],[class*="legal" i],small,sub');

export function scanTraps(doc: Document): Finding[] {
  const out: Finding[] = [];

  // 1. Pre-checked opt-in boxes
  let prechecks = 0;
  doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((c) => {
    if (!c.checked || prechecks >= 3) return;
    const lbl = nearbyText(c);
    if (OPTIN_RE.test(lbl)) {
      prechecks++;
      out.push({
        type: 'precheck',
        label: 'Pre-checked option',
        detail: `A box is checked by default: "${lbl.slice(0, 80)}".`,
      });
    }
  });

  // 2. Recurring / auto-renew language near a price
  const bodyText = (doc.body as HTMLElement | null)?.innerText || '';
  const idx = bodyText.search(RECUR_RE);
  if (idx >= 0) {
    const m = bodyText.slice(idx).match(RECUR_RE);
    const around = bodyText.slice(Math.max(0, idx - 160), idx + 160);
    if (m && (PRICE_RE.test(around) || /trial|auto[- ]?renew|cancel anytime/i.test(m[0]))) {
      out.push({
        type: 'recurring',
        label: 'Recurring or auto-renew',
        detail: `Found "${m[0]}" near pricing. Check when it renews and how to cancel.`,
      });
    }
  }

  // 3. Buried or missing cancel path
  const ctas = Array.from(doc.querySelectorAll('a,button,[role="button"]'));
  const hasSignup = ctas.some((b) => SIGNUP_RE.test(b.textContent || ''));
  if (hasSignup) {
    const cancels = ctas.filter((b) => CANCEL_RE.test(b.textContent || ''));
    if (cancels.length === 0) {
      out.push({
        type: 'cancel',
        label: 'Cancel path not visible',
        detail: 'A sign-up or upgrade action is present, but no clear cancel or unsubscribe control was found.',
      });
    } else if (cancels.every(isBuried)) {
      out.push({
        type: 'cancel',
        label: 'Cancel path may be buried',
        detail: 'Cancel or unsubscribe appears only as small print or footer text.',
      });
    }
  }

  // 4. Consent banner: "Accept all" without an equal "Reject all"
  const cmp = doc.querySelector(
    '#onetrust-banner-sdk,#CybotCookiebotDialog,.qc-cmp2-container,#usercentrics-root,[class*="cookie" i][class*="banner" i],[class*="consent" i][class*="banner" i],[aria-label*="cookie" i]',
  );
  if (cmp) {
    const btns = Array.from(cmp.querySelectorAll('button,a,[role="button"]'));
    const accept = btns.some((b) => /\b(accept all|allow all|agree|got it|accept)\b/i.test(b.textContent || ''));
    const reject = btns.some((b) => /\b(reject all|decline all|reject|necessary only|essential only)\b/i.test(b.textContent || ''));
    if (accept && !reject) {
      out.push({
        type: 'consent',
        label: 'Unequal cookie choices',
        detail: '"Accept all" is offered here, but no clear "Reject all" at the same level.',
      });
    }
  }

  return out;
}

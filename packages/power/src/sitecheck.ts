/**
 * Site Check: an audit of the page as it actually rendered.
 *
 * Most free checkers fetch a URL's HTML and read it. That misses everything a
 * modern site builds with JavaScript, guesses at colours from stylesheets, and
 * has no idea how fast the page was for the person looking at it. This runs in
 * the tab instead, so it reads:
 *   - the live DOM, after every framework has finished rendering,
 *   - computed colours, so contrast is measured rather than estimated,
 *   - the browser's own performance timeline for this load (LCP, CLS, TTFB),
 *     which is real data from a real visit, not a lab simulation,
 *   - the site's robots.txt and llms.txt, fetched same-origin, for whether AI
 *     answer engines are allowed in.
 *
 * It is honest about its limits, and the report says so in plain words:
 * automated checks catch roughly a third of accessibility problems. A pass
 * here is "nothing obvious is wrong", never "this site is accessible" or
 * "compliant". No badge, no certificate, no claim on the site's behalf.
 *
 * Read-only. Nothing is sent anywhere; the report page renders what this
 * returns.
 */
import { accessibleName, flash, jumpTo } from './pageMap';
import { backgroundOf, contrast, luminance } from './insights';

export type Pillar = 'access' | 'seo' | 'ai' | 'speed';
export type Status = 'pass' | 'warn' | 'fail' | 'info';
export type Severity = 'critical' | 'serious' | 'moderate' | 'minor';

export interface CheckResult {
  id: string;
  pillar: Pillar;
  title: string;
  status: Status;
  severity: Severity;
  /** WCAG 2.2 success criterion, where there is one. */
  wcag?: string;
  /** What was found, in plain words. */
  detail: string;
  /** Who it affects. Accessibility findings always say. */
  who?: string;
  /** How to fix it in the site's code. */
  fix: string;
  count?: number;
  /** Short text of the offending elements, for recognising them. */
  samples?: string[];
  /** A WebAble tool that works around this for visitors in the meantime. */
  workaround?: string;
}

export interface Vitals {
  lcp?: number;
  cls?: number;
  fcp?: number;
  ttfb?: number;
  /** Bytes the page transferred, a floor: cross-origin resources without Timing-Allow-Origin report zero. */
  transfer?: number;
  requests?: number;
  domNodes: number;
  thirdPartyHosts: number;
}

export interface PillarScore {
  score: number;
  pass: number;
  warn: number;
  fail: number;
}

export interface SiteReport {
  url: string;
  host: string;
  title: string;
  at: number;
  overall: number;
  grade: string;
  pillars: Record<Pillar, PillarScore>;
  checks: CheckResult[];
  vitals: Vitals;
  platform: string | null;
}

export const PILLAR_LABELS: Record<Pillar, string> = {
  access: 'Accessibility',
  seo: 'Search (SEO)',
  ai: 'AI visibility',
  speed: 'Speed and stability',
};

/** Elements behind each finding, kept for "show me" from the report page. */
const evidence = new Map<string, Element[]>();

const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 10, serious: 6, moderate: 3, minor: 1 };

function sample(els: Element[], n = 5): string[] {
  return els.slice(0, n).map((el) => {
    const name = accessibleName(el);
    const tag = el.tagName.toLowerCase();
    const cls = typeof (el as HTMLElement).className === 'string' && (el as HTMLElement).className.trim() ? `.${(el as HTMLElement).className.trim().split(/\s+/)[0]}` : '';
    const src = el.getAttribute('src');
    const file = !src ? '' : src.startsWith('data:') ? ' (inline image)' : ` ${src.split('/').pop()?.split('?')[0]?.slice(0, 40)}`;
    return `<${tag}${cls}>${file}${name ? ` "${name.slice(0, 60)}"` : ''}`;
  });
}

function own(el: Element): boolean {
  return !el.closest('[data-webable-ui], #webable-widget-root');
}

function shown(el: Element, win: Window): boolean {
  if (el.closest('[hidden], [aria-hidden="true"]')) return false;
  const s = win.getComputedStyle(el);
  if (s.display === 'none' || s.visibility === 'hidden') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
}

function all(doc: Document, sel: string): Element[] {
  return Array.from(doc.querySelectorAll(sel)).filter(own);
}

interface Ctx {
  doc: Document;
  win: Window;
  out: CheckResult[];
}

function add(ctx: Ctx, r: Omit<CheckResult, 'status'> & { status?: Status }, els: Element[] = []): void {
  const status: Status = r.status ?? (els.length ? 'fail' : 'pass');
  if (els.length) evidence.set(r.id, els);
  ctx.out.push({ ...r, status, count: r.count ?? (els.length || undefined), samples: r.samples ?? (els.length ? sample(els) : undefined) });
}

/* ---- accessibility ------------------------------------------------------- */

const VAGUE = /^(click here|here|read more|learn more|more|more info|details|continue|go|link|this|see more|find out more)$/i;
const FILENAME_ALT = /\.(jpe?g|png|gif|webp|svg|avif)$|^(img|image|photo|picture|dsc|screenshot)[\s_-]?\d*$/i;

function accessibility(ctx: Ctx): void {
  const { doc, win } = ctx;

  const imgs = all(doc, 'img').filter((i) => shown(i, win) && i.getAttribute('role') !== 'presentation' && i.getAttribute('role') !== 'none');
  const noAlt = imgs.filter((i) => !i.hasAttribute('alt') && !i.getAttribute('aria-label') && !i.getAttribute('aria-labelledby'));
  add(ctx, {
    id: 'img-alt',
    pillar: 'access',
    title: 'Images have text alternatives',
    severity: 'serious',
    wcag: '1.1.1',
    detail: noAlt.length ? `${noAlt.length} of ${imgs.length} images have no alt attribute at all.` : `All ${imgs.length} images have an alt attribute.`,
    who: 'Blind and low-vision people using screen readers hear the file name, or nothing.',
    fix: 'Add alt="..." describing what the image shows. Decorative images get alt="" so screen readers skip them.',
  }, noAlt);

  const badAlt = imgs.filter((i) => FILENAME_ALT.test((i.getAttribute('alt') || '').trim()));
  if (badAlt.length) {
    add(ctx, {
      id: 'img-alt-filename',
      pillar: 'access',
      title: 'Alt text looks like a file name',
      status: 'warn',
      severity: 'moderate',
      wcag: '1.1.1',
      detail: `${badAlt.length} images have alt text such as "IMG_2041.jpg" or "image".`,
      who: 'Screen reader users get a meaningless label.',
      fix: 'Replace it with a short description of what the image shows, or alt="" if it is decorative.',
    }, badAlt);
  }

  const buttons = all(doc, 'button, [role="button"], input[type="submit"], input[type="button"], input[type="reset"]').filter((b) => shown(b, win));
  const unnamedButtons = buttons.filter((b) => !accessibleName(b) && !b.querySelector('img[alt]:not([alt=""]), svg title'));
  add(ctx, {
    id: 'button-name',
    pillar: 'access',
    title: 'Buttons have names',
    severity: 'critical',
    wcag: '4.1.2',
    detail: unnamedButtons.length ? `${unnamedButtons.length} buttons have no text or label, usually icon-only buttons.` : `All ${buttons.length} buttons have a name.`,
    who: 'Screen reader and voice control users cannot tell what the button does, or say its name to press it.',
    fix: 'Give icon-only buttons aria-label="Close" (or visually hidden text).',
    workaround: 'Click hints let keyboard users reach every button, named or not.',
  }, unnamedButtons);

  const links = all(doc, 'a[href]').filter((a) => shown(a, win));
  const unnamedLinks = links.filter((a) => !accessibleName(a));
  add(ctx, {
    id: 'link-name',
    pillar: 'access',
    title: 'Links have names',
    severity: 'serious',
    wcag: '2.4.4',
    detail: unnamedLinks.length ? `${unnamedLinks.length} links have no text, usually an icon or image with no label.` : `All ${links.length} links have a name.`,
    who: 'Screen reader users hear "link" with nothing after it.',
    fix: 'Add text, aria-label, or alt text on the image inside the link.',
  }, unnamedLinks);

  const vague = links.filter((a) => VAGUE.test(accessibleName(a)));
  add(ctx, {
    id: 'link-vague',
    pillar: 'access',
    title: 'Link text says where it goes',
    status: vague.length ? 'warn' : 'pass',
    severity: 'moderate',
    wcag: '2.4.4',
    detail: vague.length ? `${vague.length} links say only "click here", "read more" or similar.` : 'No vague link text found.',
    who: 'People who navigate by a list of links hear ten "read more"s and cannot tell them apart. Search engines learn nothing from them either.',
    fix: 'Say what the link is: "Read more about pricing", or add an aria-label with the full purpose.',
  }, vague);

  const fields = all(doc, 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea').filter((f) => shown(f, win));
  const unlabeled = fields.filter((f) => {
    const input = f as HTMLInputElement;
    if (input.labels && input.labels.length && Array.from(input.labels).some((l) => (l.textContent || '').trim())) return false;
    return !f.getAttribute('aria-label') && !f.getAttribute('aria-labelledby') && !f.getAttribute('title');
  });
  const placeholderOnly = unlabeled.filter((f) => f.getAttribute('placeholder'));
  add(ctx, {
    id: 'form-label',
    pillar: 'access',
    title: 'Form fields have labels',
    severity: 'critical',
    wcag: '1.3.1',
    detail: unlabeled.length
      ? `${unlabeled.length} of ${fields.length} fields have no label${placeholderOnly.length ? `, ${placeholderOnly.length} of them relying on placeholder text that vanishes as you type` : ''}.`
      : `All ${fields.length} fields are labelled.`,
    who: 'Screen reader users do not know what to type. Everyone loses the hint once the placeholder disappears.',
    fix: 'Add a visible <label for="id">, or aria-label when a visible label is truly impossible.',
  }, unlabeled);

  // Contrast, measured: computed colour against the first opaque background.
  const textEls: Element[] = [];
  const walker = doc.createTreeWalker(doc.body || doc.documentElement, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  let node: Node | null;
  let scanned = 0;
  while ((node = walker.nextNode()) && scanned < 600) {
    const t = (node.textContent || '').trim();
    const parent = node.parentElement;
    if (t.length < 3 || !parent || seen.has(parent) || !own(parent)) continue;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(parent.tagName)) continue;
    seen.add(parent);
    scanned++;
    if (!shown(parent, win)) continue;
    const s = win.getComputedStyle(parent);
    const fg = luminance(s.color);
    if (fg === null) continue;
    // Text over an image or gradient cannot be measured from colours alone.
    let n: Element | null = parent;
    let overImage = false;
    while (n && !overImage) {
      const bi = win.getComputedStyle(n).backgroundImage;
      if (bi && bi !== 'none') overImage = true;
      if (luminance(win.getComputedStyle(n).backgroundColor) !== null) break;
      n = n.parentElement;
    }
    if (overImage) continue;
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (parseInt(s.fontWeight, 10) >= 700 && size >= 18.66);
    if (contrast(fg, backgroundOf(parent, win)) < (large ? 3 : 4.5)) textEls.push(parent);
  }
  add(ctx, {
    id: 'contrast',
    pillar: 'access',
    title: 'Text has enough contrast',
    severity: 'serious',
    wcag: '1.4.3',
    detail: textEls.length ? `${textEls.length} of ${scanned} text blocks sampled fall below the 4.5:1 minimum (3:1 for large text).` : `All ${scanned} sampled text blocks meet the minimum.`,
    who: 'People with low vision, older eyes, colour blindness, or anyone reading in sunlight.',
    fix: 'Darken the text or lighten the background. Grey text on white needs to be at least #767676.',
    workaround: 'High contrast and dark mode raise it for visitors who have WebAble.',
  }, textEls);

  const lang = doc.documentElement.getAttribute('lang');
  add(ctx, {
    id: 'html-lang',
    pillar: 'access',
    title: 'Page language is declared',
    status: lang ? 'pass' : 'fail',
    severity: 'serious',
    wcag: '3.1.1',
    detail: lang ? `lang="${lang}"` : 'The <html> element has no lang attribute.',
    who: 'Screen readers guess the language and may read English with a French accent, or worse.',
    fix: 'Add <html lang="en"> (or the right language code).',
  });

  add(ctx, {
    id: 'page-title',
    pillar: 'access',
    title: 'Page has a title',
    status: doc.title.trim() ? 'pass' : 'fail',
    severity: 'serious',
    wcag: '2.4.2',
    detail: doc.title.trim() ? `"${doc.title.trim().slice(0, 80)}"` : 'No <title>.',
    who: 'It is the first thing a screen reader says and the only label on a browser tab.',
    fix: 'Add a unique, descriptive <title>.',
  });

  const hs = all(doc, 'h1, h2, h3, h4, h5, h6').filter((h) => shown(h, win));
  const h1s = hs.filter((h) => h.tagName === 'H1');
  const skips: Element[] = [];
  let prev = 0;
  for (const h of hs) {
    const lvl = Number(h.tagName[1]);
    if (prev && lvl > prev + 1) skips.push(h);
    prev = lvl;
  }
  add(ctx, {
    id: 'headings',
    pillar: 'access',
    title: 'Headings outline the page',
    status: h1s.length === 0 ? 'fail' : skips.length || h1s.length > 1 ? 'warn' : 'pass',
    severity: 'moderate',
    wcag: '1.3.1',
    detail:
      h1s.length === 0
        ? `No <h1>. ${hs.length} headings in total.`
        : `${hs.length} headings, ${h1s.length} H1${h1s.length > 1 ? 's' : ''}${skips.length ? `, ${skips.length} skipped levels (for example H2 straight to H4)` : ''}.`,
    who: 'Screen reader users jump by heading the way sighted people skim. Search engines read the outline too.',
    fix: 'One <h1> naming the page, then H2 for sections, H3 inside them. Style with CSS, not by picking a heading level for its size.',
  }, h1s.length === 0 ? [] : skips);

  const main = doc.querySelector('main, [role="main"]');
  add(ctx, {
    id: 'landmarks',
    pillar: 'access',
    title: 'Main content is marked up',
    status: main ? 'pass' : 'warn',
    severity: 'moderate',
    wcag: '1.3.1',
    detail: main ? 'A <main> landmark is present.' : 'No <main> element, so there is no "skip to content" target.',
    who: 'Keyboard and screen reader users have to go through the whole header and menu on every page.',
    fix: 'Wrap the primary content in <main>, and the menus in <nav>.',
  });

  const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
  const zoomBlocked = /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(viewport);
  add(ctx, {
    id: 'zoom',
    pillar: 'access',
    title: 'Pinch-zoom is allowed',
    status: zoomBlocked ? 'fail' : 'pass',
    severity: 'serious',
    wcag: '1.4.4',
    detail: zoomBlocked ? `The viewport tag blocks zooming: "${viewport}".` : 'Zooming is allowed.',
    who: 'Anyone who zooms to read on a phone. iOS ignores this tag; Android browsers often do not.',
    fix: 'Remove user-scalable=no and maximum-scale=1 from the viewport meta tag.',
    workaround: 'Force zoom gives it back for visitors with WebAble.',
  });

  const ids = new Map<string, Element[]>();
  for (const el of all(doc, '[id]')) {
    const id = el.id;
    if (!id) continue;
    ids.set(id, [...(ids.get(id) || []), el]);
  }
  const dupes = [...ids.values()].filter((v) => v.length > 1);
  const referenced = dupes.filter((v) => doc.querySelector(`[for="${CSS.escape(v[0].id)}"], [aria-labelledby~="${CSS.escape(v[0].id)}"], [aria-describedby~="${CSS.escape(v[0].id)}"]`));
  add(ctx, {
    id: 'duplicate-ids',
    pillar: 'access',
    title: 'Labels point at one element each',
    status: referenced.length ? 'fail' : dupes.length ? 'info' : 'pass',
    severity: 'minor',
    wcag: '1.3.1',
    detail: referenced.length
      ? `${referenced.length} duplicated ids are used by a label or ARIA reference, which then points at the wrong element.`
      : dupes.length
        ? `${dupes.length} ids are duplicated, none used by a label.`
        : 'No duplicated ids.',
    fix: 'Make every id unique, especially ones a <label for> or aria-labelledby refers to.',
  }, referenced.map((v) => v[1]));

  const positive = all(doc, '[tabindex]').filter((el) => Number(el.getAttribute('tabindex')) > 0);
  add(ctx, {
    id: 'tabindex',
    pillar: 'access',
    title: 'Keyboard order follows the page',
    status: positive.length ? 'warn' : 'pass',
    severity: 'moderate',
    wcag: '2.4.3',
    detail: positive.length ? `${positive.length} elements use a positive tabindex, which reorders the Tab key.` : 'No positive tabindex.',
    who: 'Keyboard users jump around the page in an order nobody designed.',
    fix: 'Use tabindex="0" or remove it, and order the HTML the way it should be read.',
  }, positive);

  const autoplay = all(doc, 'video[autoplay], audio[autoplay]').filter((m) => !(m as HTMLMediaElement).muted);
  add(ctx, {
    id: 'autoplay',
    pillar: 'access',
    title: 'No sound plays on its own',
    status: autoplay.length ? 'fail' : 'pass',
    severity: 'serious',
    wcag: '1.4.2',
    detail: autoplay.length ? `${autoplay.length} media elements autoplay with sound.` : 'Nothing autoplays with sound.',
    who: 'Screen reader users cannot hear their reader over it.',
    fix: 'Do not autoplay with sound. If you must autoplay, add muted and a visible pause control.',
    workaround: 'Mute media silences it for visitors with WebAble.',
  }, autoplay);

  // WCAG 2.2 target size (AA): 24 by 24 CSS px, inline links in text excepted.
  const small = all(doc, 'button, [role="button"], input[type="checkbox"], input[type="radio"], a[href]').filter((el) => {
    if (!shown(el, win)) return false;
    if (el.tagName === 'A' && el.closest('p, li, td, dd, blockquote')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24);
  });
  add(ctx, {
    id: 'target-size',
    pillar: 'access',
    title: 'Controls are big enough to tap',
    status: small.length > 3 ? 'warn' : 'pass',
    severity: 'moderate',
    wcag: '2.5.8',
    detail: small.length ? `${small.length} buttons or links are smaller than 24 by 24 pixels.` : 'Controls meet the 24px minimum.',
    who: 'People with tremor, limited dexterity, or large fingers on a phone.',
    fix: 'Give small controls at least 24 by 24 px of hit area (44 is better), with padding rather than a bigger icon.',
    workaround: 'Bigger click targets pads them for visitors with WebAble.',
  }, small.length > 3 ? small : []);

  const frames = all(doc, 'iframe').filter((f) => shown(f, win) && !f.getAttribute('title') && !f.getAttribute('aria-label'));
  add(ctx, {
    id: 'iframe-title',
    pillar: 'access',
    title: 'Embedded frames are titled',
    severity: 'serious',
    wcag: '4.1.2',
    detail: frames.length ? `${frames.length} iframes have no title.` : 'Every iframe has a title, or there are none.',
    who: 'Screen reader users hear "frame" and nothing about what is inside.',
    fix: 'Add title="Product video" (or whatever it holds) to each <iframe>.',
  }, frames);

  const hiddenFocusable = all(doc, '[aria-hidden="true"] a[href], [aria-hidden="true"] button, [aria-hidden="true"] input, [aria-hidden="true"] [tabindex]:not([tabindex="-1"])').filter((el) => shown(el, win));
  add(ctx, {
    id: 'aria-hidden-focus',
    pillar: 'access',
    title: 'Hidden content is not focusable',
    severity: 'serious',
    wcag: '4.1.2',
    detail: hiddenFocusable.length ? `${hiddenFocusable.length} controls are hidden from screen readers but still reachable with Tab.` : 'No focusable content inside aria-hidden.',
    who: 'Keyboard and screen reader users land on something that announces as nothing.',
    fix: 'Add inert to the hidden container, or tabindex="-1" to the controls inside it.',
  }, hiddenFocusable);
}

/* ---- search ------------------------------------------------------------- */

function meta(doc: Document, sel: string): string {
  return (doc.querySelector(sel)?.getAttribute('content') || '').trim();
}

function seo(ctx: Ctx): void {
  const { doc, win } = ctx;
  const title = doc.title.trim();
  add(ctx, {
    id: 'seo-title',
    pillar: 'seo',
    title: 'Title is a good length for search results',
    status: !title ? 'fail' : title.length < 15 || title.length > 65 ? 'warn' : 'pass',
    severity: 'serious',
    detail: !title ? 'No title.' : `${title.length} characters. Google shows about 50 to 60 before cutting it off.`,
    fix: 'Write a 30 to 60 character title with the most important words first.',
  });

  const desc = meta(doc, 'meta[name="description"]');
  add(ctx, {
    id: 'seo-description',
    pillar: 'seo',
    title: 'Meta description is set',
    status: !desc ? 'fail' : desc.length < 50 || desc.length > 170 ? 'warn' : 'pass',
    severity: 'moderate',
    detail: !desc ? 'No meta description, so search engines pick a snippet themselves.' : `${desc.length} characters.`,
    fix: 'Add <meta name="description" content="..."> of 120 to 160 characters that would make you click.',
  });

  const robots = `${meta(doc, 'meta[name="robots"]')} ${meta(doc, 'meta[name="googlebot"]')}`.toLowerCase();
  const noindex = /noindex/.test(robots);
  add(ctx, {
    id: 'seo-indexable',
    pillar: 'seo',
    title: 'Page can be indexed',
    status: noindex ? 'fail' : 'pass',
    severity: 'critical',
    detail: noindex ? 'A robots meta tag says noindex: this page is kept out of search results.' : 'No noindex tag.',
    fix: 'Remove noindex if this page should be found in search.',
  });

  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
  add(ctx, {
    id: 'seo-canonical',
    pillar: 'seo',
    title: 'Canonical URL is declared',
    status: canonical ? 'pass' : 'warn',
    severity: 'minor',
    detail: canonical ? canonical : 'No canonical link, so duplicate URLs (with tracking parameters, for example) can split ranking.',
    fix: 'Add a <link rel="canonical"> whose href is the full preferred URL of this page.',
  });

  const h1 = doc.querySelector('h1');
  add(ctx, {
    id: 'seo-h1',
    pillar: 'seo',
    title: 'Page has one clear H1',
    status: h1 ? 'pass' : 'fail',
    severity: 'moderate',
    detail: h1 ? `"${(h1.textContent || '').trim().slice(0, 80)}"` : 'No H1. Search engines use it to understand the topic.',
    fix: 'Add one <h1> that states what the page is about.',
  });

  const og = ['og:title', 'og:description', 'og:image'].filter((p) => !meta(doc, `meta[property="${p}"]`));
  add(ctx, {
    id: 'seo-social',
    pillar: 'seo',
    title: 'Links look good when shared',
    status: og.length === 0 ? 'pass' : og.length === 3 ? 'fail' : 'warn',
    severity: 'minor',
    detail: og.length ? `Missing ${og.join(', ')}. Shared links show a bare URL or a random image.` : 'Open Graph title, description and image are set.',
    fix: 'Add og:title, og:description and a 1200 by 630 og:image.',
  });

  const vp = doc.querySelector('meta[name="viewport"]');
  add(ctx, {
    id: 'seo-mobile',
    pillar: 'seo',
    title: 'Page is set up for phones',
    status: vp ? 'pass' : 'fail',
    severity: 'serious',
    detail: vp ? 'A viewport meta tag is present.' : 'No viewport meta tag, so phones render a zoomed-out desktop page. Google indexes the mobile version first.',
    fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
  });

  add(ctx, {
    id: 'seo-https',
    pillar: 'seo',
    title: 'Served over HTTPS',
    status: win.location.protocol === 'https:' ? 'pass' : 'fail',
    severity: 'serious',
    detail: win.location.protocol === 'https:' ? 'Secure connection.' : 'Not HTTPS. Browsers label it "Not secure" and rankings suffer.',
    fix: 'Serve the site over HTTPS and redirect HTTP to it.',
  });

  const imgsNoSize = all(doc, 'img').filter((i) => shown(i, win) && !i.getAttribute('width') && !i.getAttribute('height') && !(i as HTMLElement).style.aspectRatio);
  add(ctx, {
    id: 'seo-img-dimensions',
    pillar: 'speed',
    title: 'Images reserve their space',
    status: imgsNoSize.length > 2 ? 'warn' : 'pass',
    severity: 'minor',
    detail: imgsNoSize.length ? `${imgsNoSize.length} images have no width and height, so the page jumps as they load.` : 'Images declare their size.',
    fix: 'Add width and height attributes (the browser keeps the aspect ratio), or CSS aspect-ratio.',
  }, imgsNoSize.length > 2 ? imgsNoSize : []);
}

/* ---- AI answer engines -------------------------------------------------- */

const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'CCBot', 'Applebot-Extended'];

/** Which AI crawlers robots.txt shuts out of the whole site. */
export function blockedBots(robots: string): string[] {
  const groups: Array<{ agents: string[]; disallowAll: boolean }> = [];
  let cur: { agents: string[]; disallowAll: boolean } | null = null;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [k, ...rest] = line.split(':');
    const key = k.trim().toLowerCase();
    const val = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], disallowAll: false };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && key === 'disallow' && val === '/') cur.disallowAll = true;
    }
  }
  return AI_BOTS.filter((bot) => {
    const specific = groups.find((g) => g.agents.includes(bot.toLowerCase()));
    if (specific) return specific.disallowAll;
    const star = groups.find((g) => g.agents.includes('*'));
    return !!star?.disallowAll;
  });
}

async function fetchText(win: Window, path: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = win.setTimeout(() => ctrl.abort(), 4000);
    const res = await win.fetch(new URL(path, win.location.origin).href, { signal: ctrl.signal, credentials: 'omit', redirect: 'follow' });
    win.clearTimeout(t);
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (/html/i.test(type)) return null; // a soft 404 page, not the file
    return (await res.text()).slice(0, 200000);
  } catch {
    return null;
  }
}

function jsonLdTypes(doc: Document): { types: string[]; broken: number } {
  const types: string[] = [];
  let broken = 0;
  const visit = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(visit);
    const o = v as Record<string, unknown>;
    const t = o['@type'];
    if (typeof t === 'string') types.push(t);
    if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && types.push(x));
    if (o['@graph']) visit(o['@graph']);
  };
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      visit(JSON.parse(s.textContent || ''));
    } catch {
      broken++;
    }
  }
  return { types: [...new Set(types)], broken };
}

async function aiVisibility(ctx: Ctx): Promise<void> {
  const { doc, win } = ctx;
  const [robots, llms] = await Promise.all([fetchText(win, '/robots.txt'), fetchText(win, '/llms.txt')]);

  const blocked = robots ? blockedBots(robots) : [];
  add(ctx, {
    id: 'ai-crawlers',
    pillar: 'ai',
    title: 'AI answer engines can read the site',
    status: robots === null ? 'info' : blocked.length ? 'warn' : 'pass',
    severity: 'serious',
    detail:
      robots === null
        ? 'No robots.txt could be read, so every crawler is allowed by default.'
        : blocked.length
          ? `robots.txt blocks ${blocked.join(', ')}. Those assistants cannot cite or recommend this site.`
          : 'robots.txt lets the major AI crawlers in.',
    fix: 'Blocking is a legitimate choice. If you want to be recommended by ChatGPT, Claude, Perplexity and Gemini, allow their crawlers in robots.txt.',
  });

  add(ctx, {
    id: 'ai-llms',
    pillar: 'ai',
    title: 'llms.txt guide for AI',
    status: llms ? 'pass' : 'info',
    severity: 'minor',
    detail: llms ? `Found /llms.txt (${llms.split('\n').length} lines).` : 'No /llms.txt. It is a young convention, not a standard, but costs little.',
    fix: 'Publish /llms.txt: a short Markdown summary of the site with links to the pages that matter most.',
  });

  const { types, broken } = jsonLdTypes(doc);
  add(ctx, {
    id: 'ai-schema',
    pillar: 'ai',
    title: 'Structured data describes the page',
    status: broken ? 'fail' : types.length ? 'pass' : 'warn',
    severity: 'moderate',
    detail: broken
      ? `${broken} JSON-LD blocks do not parse, so they are ignored.`
      : types.length
        ? `Schema.org types: ${types.slice(0, 8).join(', ')}.`
        : 'No JSON-LD structured data. Search and AI engines have to guess what this page is.',
    fix: 'Add JSON-LD for what the page is: Organization, Product, Article, LocalBusiness, FAQPage.',
  });

  const main = doc.querySelector('main, article, [role="main"]') || doc.body;
  const words = (main?.textContent || '').split(/\s+/).filter((w) => w.length > 1).length;
  add(ctx, {
    id: 'ai-content',
    pillar: 'ai',
    title: 'Enough text to be quoted',
    status: words >= 300 ? 'pass' : words >= 120 ? 'warn' : 'fail',
    severity: 'moderate',
    detail: `About ${words} words of text in the main content.`,
    fix: 'Answer engines quote text. Say plainly who you are, what you offer, for whom, and where, in real sentences.',
  });

  const questions = all(doc, 'h2, h3, summary, dt').filter((h) => /\?\s*$/.test((h.textContent || '').trim())).length;
  const faq = types.some((t) => /FAQPage|QAPage/i.test(t));
  add(ctx, {
    id: 'ai-questions',
    pillar: 'ai',
    title: 'Answers the questions people ask',
    status: questions >= 2 || faq ? 'pass' : 'info',
    severity: 'minor',
    detail: faq ? 'FAQ structured data is present.' : questions ? `${questions} question-style headings.` : 'No question-style headings or FAQ.',
    fix: 'Headings phrased as the questions customers ask ("How much does it cost?") are what assistants match against.',
  });

  const author = meta(doc, 'meta[name="author"]') || doc.querySelector('[rel="author"], [itemprop="author"]') || types.some((t) => /Person|Organization/i.test(t));
  const date = meta(doc, 'meta[property="article:published_time"]') || meta(doc, 'meta[property="article:modified_time"]') || doc.querySelector('time[datetime]');
  add(ctx, {
    id: 'ai-trust',
    pillar: 'ai',
    title: 'Says who is behind it, and when',
    status: author && date ? 'pass' : author || date ? 'info' : 'warn',
    severity: 'minor',
    detail: `${author ? 'Author or organisation is identified' : 'No author or organisation'}; ${date ? 'a date is marked up' : 'no machine-readable date'}.`,
    fix: 'Mark up the author (or Organization schema) and a published or updated date. Freshness and authorship are trust signals.',
  });
}

/* ---- speed -------------------------------------------------------------- */

function observed<T extends PerformanceEntry>(win: Window, type: string): Promise<T[]> {
  return new Promise((resolve) => {
    const entries: T[] = [];
    try {
      const PO = (win as Window & { PerformanceObserver: typeof PerformanceObserver }).PerformanceObserver;
      const po = new PO((list: PerformanceObserverEntryList) => entries.push(...(list.getEntries() as T[])));
      po.observe({ type, buffered: true } as PerformanceObserverInit);
      win.setTimeout(() => {
        po.disconnect();
        resolve(entries);
      }, 60);
    } catch {
      resolve(entries);
    }
  });
}

async function speed(ctx: Ctx): Promise<Vitals> {
  const { doc, win } = ctx;
  const perf = win.performance;
  const nav = perf.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const paints = perf.getEntriesByType('paint');
  const fcp = paints.find((p) => p.name === 'first-contentful-paint')?.startTime;
  const lcpEntries = await observed<PerformanceEntry & { startTime: number }>(win, 'largest-contentful-paint');
  const lcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1].startTime : undefined;
  const shifts = await observed<PerformanceEntry & { value: number; hadRecentInput: boolean }>(win, 'layout-shift');
  const cls = shifts.filter((s) => !s.hadRecentInput).reduce((sum, s) => sum + s.value, 0);
  const resources = perf.getEntriesByType('resource') as PerformanceResourceTiming[];
  const transfer = resources.reduce((sum, r) => sum + (r.transferSize || 0), nav?.transferSize || 0);
  const hosts = new Set<string>();
  for (const s of Array.from(doc.querySelectorAll('script[src]'))) {
    try {
      const h = new URL((s as HTMLScriptElement).src).hostname;
      if (h && h !== win.location.hostname && !h.endsWith(`.${win.location.hostname.replace(/^www\./, '')}`)) hosts.add(h);
    } catch {
      /* ignore */
    }
  }
  const vitals: Vitals = {
    lcp,
    cls: shifts.length ? Math.round(cls * 1000) / 1000 : 0,
    fcp,
    ttfb: nav ? nav.responseStart - nav.startTime : undefined,
    transfer: transfer || undefined,
    requests: resources.length + 1,
    domNodes: doc.getElementsByTagName('*').length,
    thirdPartyHosts: hosts.size,
  };

  const band = (v: number | undefined, good: number, poor: number): Status => (v === undefined ? 'info' : v <= good ? 'pass' : v <= poor ? 'warn' : 'fail');
  const s = (ms?: number) => (ms === undefined ? 'not measured' : `${(ms / 1000).toFixed(2)} s`);

  add(ctx, {
    id: 'speed-lcp',
    pillar: 'speed',
    title: 'Main content appears quickly (LCP)',
    status: band(lcp, 2500, 4000),
    severity: 'serious',
    detail: lcp === undefined ? 'Largest Contentful Paint was not recorded for this load.' : `Largest Contentful Paint: ${s(lcp)} on this visit. Good is under 2.5 s.`,
    fix: 'Compress and properly size the hero image, preload it, and cut render-blocking scripts and fonts.',
  });
  add(ctx, {
    id: 'speed-cls',
    pillar: 'speed',
    title: 'Layout stays still (CLS)',
    status: band(vitals.cls, 0.1, 0.25),
    severity: 'moderate',
    detail: `Cumulative Layout Shift: ${vitals.cls} so far on this visit. Good is under 0.1.`,
    who: 'Everyone who has tapped the wrong thing because the page moved, and especially people with motor or cognitive disabilities.',
    fix: 'Reserve space for images, ads and embeds; do not insert banners above content after load.',
  });
  add(ctx, {
    id: 'speed-ttfb',
    pillar: 'speed',
    title: 'Server responds fast (TTFB)',
    status: band(vitals.ttfb, 800, 1800),
    severity: 'moderate',
    detail: `Time to first byte: ${s(vitals.ttfb)}. Good is under 0.8 s.`,
    fix: 'Cache pages at the edge (a CDN), and check slow database queries or plugins.',
  });
  add(ctx, {
    id: 'speed-weight',
    pillar: 'speed',
    title: 'Page weight is reasonable',
    status: transfer > 5e6 ? 'fail' : transfer > 2.5e6 ? 'warn' : transfer ? 'pass' : 'info',
    severity: 'minor',
    detail: transfer
      ? `At least ${(transfer / 1e6).toFixed(1)} MB over ${vitals.requests} requests (cross-origin files that hide their size are not counted).`
      : 'Transfer size is not available for this page.',
    fix: 'Serve images as AVIF or WebP at the size they display, lazy-load below the fold, and drop unused scripts.',
  });
  add(ctx, {
    id: 'speed-dom',
    pillar: 'speed',
    title: 'Page structure is lean',
    status: vitals.domNodes > 3000 ? 'warn' : 'pass',
    severity: 'minor',
    detail: `${vitals.domNodes} elements. Over about 1,500 starts to slow down every interaction, and assistive technology with it.`,
    fix: 'Paginate or virtualise long lists, and remove wrapper elements that do nothing.',
  });
  add(ctx, {
    id: 'speed-third-party',
    pillar: 'speed',
    title: 'Third-party scripts are few',
    status: hosts.size > 12 ? 'warn' : 'pass',
    severity: 'minor',
    detail: `Scripts load from ${hosts.size} other domains.`,
    fix: 'Audit tags and widgets: every vendor script costs load time, and some cost privacy.',
  });
  return vitals;
}

/* ---- platform ----------------------------------------------------------- */

function detectPlatform(doc: Document): string | null {
  const html = doc.documentElement.outerHTML.slice(0, 400000);
  const gen = meta(doc, 'meta[name="generator"]');
  const rules: Array<[RegExp, string]> = [
    [/cdn\.shopify\.com|Shopify\.theme/, 'Shopify'],
    [/wp-content|wp-includes/, 'WordPress'],
    [/static\.wixstatic\.com|wix\.com/, 'Wix'],
    [/squarespace(-cdn)?\.com|static1\.squarespace/, 'Squarespace'],
    [/webflow\.(com|io)|data-wf-page/, 'Webflow'],
    [/framerusercontent\.com|framer\.com\/m\//, 'Framer'],
    [/__NEXT_DATA__|\/_next\/static/, 'Next.js'],
    [/data-reactroot|__REACT_DEVTOOLS/, 'React'],
  ];
  if (/wordpress/i.test(gen)) return 'WordPress';
  for (const [re, name] of rules) if (re.test(html)) return name;
  return gen || null;
}

/* ---- scoring ------------------------------------------------------------ */

export function scorePillar(checks: CheckResult[]): PillarScore {
  let total = 0;
  let earned = 0;
  let pass = 0;
  let warn = 0;
  let fail = 0;
  for (const c of checks) {
    if (c.status === 'info') continue;
    const w = SEVERITY_WEIGHT[c.severity];
    total += w;
    if (c.status === 'pass') {
      earned += w;
      pass++;
    } else if (c.status === 'warn') {
      earned += w * 0.5;
      warn++;
    } else fail++;
  }
  return { score: total ? Math.round((earned / total) * 100) : 100, pass, warn, fail };
}

export function gradeFor(score: number): string {
  return score >= 95 ? 'A+' : score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 55 ? 'D' : 'F';
}

const PILLAR_WEIGHT: Record<Pillar, number> = { access: 0.4, seo: 0.25, ai: 0.15, speed: 0.2 };

export async function runSiteCheck(doc: Document, win: Window): Promise<SiteReport> {
  evidence.clear();
  const ctx: Ctx = { doc, win, out: [] };
  accessibility(ctx);
  seo(ctx);
  const [, vitals] = await Promise.all([aiVisibility(ctx), speed(ctx)]);
  const pillars = {} as Record<Pillar, PillarScore>;
  let overall = 0;
  for (const p of Object.keys(PILLAR_WEIGHT) as Pillar[]) {
    pillars[p] = scorePillar(ctx.out.filter((c) => c.pillar === p));
    overall += pillars[p].score * PILLAR_WEIGHT[p];
  }
  overall = Math.round(overall);
  return {
    url: win.location.href,
    host: win.location.hostname,
    title: doc.title,
    at: Date.now(),
    overall,
    grade: gradeFor(overall),
    pillars,
    checks: ctx.out,
    vitals,
    platform: detectPlatform(doc),
  };
}

/** Scroll to the nth element behind a finding and ring it. False if it is gone. */
export function highlightFinding(_doc: Document, id: string, index = 0): boolean {
  const els = (evidence.get(id) || []).filter((el) => el.isConnected);
  const el = els[index % Math.max(1, els.length)];
  if (!el) return false;
  jumpTo(el);
  flash(el, 2600);
  return true;
}

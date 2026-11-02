/**
 * Clean Copy, copy selected content stripped of junk. Pure DOM + Clipboard,
 * no AI, no network. Exposes: clean text, Markdown, CSV (tables/lists),
 * tracking-free URL, and a "title + url + quote" share string.
 */
const TRACKING =
  /^(utm_|fbclid$|gclid$|gclsrc$|dclid$|msclkid$|mc_eid$|mc_cid$|igshid$|_hsenc$|_hsmi$|ref$|ref_|spm$|cmpid$|ncid$|s_kwcid$|yclid$|wbraid$|gbraid$|twclid$|ttclid$|oly_|vero_|_openstat$|trk$|si$)/i;

export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const keep = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      if (!TRACKING.test(k)) keep.set(k, v);
    });
    const q = keep.toString();
    u.search = q ? `?${q}` : '';
    return u.toString();
  } catch {
    return raw;
  }
}

function textOf(el: Element): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

export function selectionText(win: Window = window): string {
  return (win.getSelection?.()?.toString() || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function selectionFragment(win: Window): HTMLDivElement | null {
  const sel = win.getSelection?.();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const div = win.document.createElement('div');
  div.appendChild(sel.getRangeAt(0).cloneContents());
  return div;
}

function htmlToMd(node: Node): string {
  let out = '';
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) {
      out += (n.textContent || '').replace(/\s+/g, ' ');
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    switch (tag) {
      case 'h1': out += `\n# ${textOf(el)}\n\n`; break;
      case 'h2': out += `\n## ${textOf(el)}\n\n`; break;
      case 'h3': out += `\n### ${textOf(el)}\n\n`; break;
      case 'h4': case 'h5': case 'h6': out += `\n#### ${textOf(el)}\n\n`; break;
      case 'p': out += `\n${htmlToMd(el).trim()}\n\n`; break;
      case 'br': out += '\n'; break;
      case 'strong': case 'b': out += `**${textOf(el)}**`; break;
      case 'em': case 'i': out += `*${textOf(el)}*`; break;
      case 'code': out += '`' + textOf(el) + '`'; break;
      case 'a': out += `[${textOf(el)}](${cleanUrl(el.getAttribute('href') || '')})`; break;
      case 'img': out += `![${el.getAttribute('alt') || ''}](${el.getAttribute('src') || ''})`; break;
      case 'ul': el.querySelectorAll(':scope > li').forEach((li) => (out += `\n- ${htmlToMd(li).trim()}`)); out += '\n\n'; break;
      case 'ol': { let i = 1; el.querySelectorAll(':scope > li').forEach((li) => (out += `\n${i++}. ${htmlToMd(li).trim()}`)); out += '\n\n'; break; }
      case 'li': out += htmlToMd(el); break;
      case 'blockquote': out += `\n> ${textOf(el).replace(/\n/g, '\n> ')}\n\n`; break;
      case 'script': case 'style': case 'noscript': break;
      default: out += htmlToMd(el);
    }
  });
  return out;
}

export function selectionMarkdown(win: Window = window): string {
  const div = selectionFragment(win);
  if (!div) return '';
  return htmlToMd(div).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function csvCell(s: string): string {
  const v = s.replace(/\s+/g, ' ').trim().replace(/"/g, '""');
  return /[",\n]/.test(v) ? `"${v}"` : v;
}

export function selectionCSV(win: Window = window): string {
  const div = selectionFragment(win);
  if (!div) return '';
  const table = div.querySelector('table');
  if (table) {
    const rows: string[] = [];
    table.querySelectorAll('tr').forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll('th,td')).map((td) => csvCell(td.textContent || ''));
      if (cells.length) rows.push(cells.join(','));
    });
    return rows.join('\n');
  }
  const lis = div.querySelectorAll('li');
  if (lis.length) return Array.from(lis).map((li) => csvCell(li.textContent || '')).join('\n');
  return '';
}

export function pageQuote(win: Window = window): string {
  const t = selectionText(win);
  const title = win.document.title || '';
  const url = cleanUrl(win.location.href);
  return `${title}\n${url}${t ? `\n\n> ${t.replace(/\n/g, '\n> ')}` : ''}`.trim();
}

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

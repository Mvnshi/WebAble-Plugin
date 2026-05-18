// WebAble Site Analyzer — local heuristics, no telemetry, no external calls
// (except Gemini for the optional AI Remediation Guide, with the user's key).
//
// Each rule maps to a WCAG 2.2 success criterion. Severity = WCAG impact:
//   critical — blocks users entirely
//   serious  — major barrier; workaround painful
//   moderate — workaround exists
//   minor    — polish-tier
//
// Automated audits cover ~30-40% of issues. The rest needs manual testing.

const $ = (id) => document.getElementById(id);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const WCAG = {
  altMissing:        { id: 'altMissing',        sc: '1.1.1',  sev: 'critical', label: 'Images missing text alternative',     hurt: 'Screen-reader users have no idea what these images show or what they\'re for.', fix: 'Add an alt attribute. Use alt="" on purely decorative images.' },
  formLabelMissing:  { id: 'formLabelMissing',  sc: '1.3.1',  sev: 'critical', label: 'Form inputs without labels',           hurt: 'Voice control and screen readers cannot announce or reference these fields.', fix: 'Add <label for="..."> or aria-label to every form control.' },
  vagueLink:         { id: 'vagueLink',         sc: '2.4.4',  sev: 'serious',  label: 'Links and buttons with unclear text',  hurt: 'Screen-reader users tab through a list of "click here" / "learn more" with no destination context.', fix: 'Replace with text describing the destination or action ("Apply for the program", not "Click here").' },
  headingSkip:       { id: 'headingSkip',       sc: '1.3.1',  sev: 'serious',  label: 'Heading hierarchy skips a level',      hurt: 'Screen-reader users navigate by heading levels; skips break the document outline.', fix: 'Use H1 → H2 → H3 in order. Style for size, not hierarchy.' },
  noH1:              { id: 'noH1',              sc: '2.4.6',  sev: 'moderate', label: 'Page has no H1',                       hurt: 'Users landing on the page have no spoken summary of its purpose.', fix: 'Every primary page should have one H1 describing its purpose.' },
  langMissing:       { id: 'langMissing',       sc: '3.1.1',  sev: 'serious',  label: '<html> has no lang attribute',          hurt: 'Screen readers may use the wrong pronunciation engine.', fix: 'Add lang="en" (or correct BCP-47 code) on the <html> element.' },
  titleMissing:      { id: 'titleMissing',      sc: '2.4.2',  sev: 'serious',  label: '<title> is missing or empty',          hurt: 'Tab labels and bookmarks are unreadable; screen readers lose context.', fix: 'Set a unique <title> per page that summarizes its purpose.' },
  zoomBlocked:       { id: 'zoomBlocked',       sc: '1.4.4',  sev: 'critical', label: 'Pinch-zoom is disabled',                hurt: 'Low-vision users cannot enlarge the page on touch devices — affects ~2.2 billion people.', fix: 'Remove user-scalable=no and maximum-scale=1 from the viewport meta.' },
  metaDesc:          { id: 'metaDesc',          sc: '—',      sev: 'minor',    label: 'No meta description (SEO)',             hurt: 'Search results show garbled snippets; click-through suffers.', fix: 'Add <meta name="description" content="..."> summarizing the page.' },
  emptyButton:       { id: 'emptyButton',       sc: '4.1.2',  sev: 'critical', label: 'Buttons with no accessible name',       hurt: 'Screen readers announce "button, button" with nothing to distinguish them.', fix: 'Add visible text or aria-label so AT can announce the control.' },
  emptyLink:         { id: 'emptyLink',         sc: '2.4.4',  sev: 'critical', label: 'Links with no accessible name',         hurt: 'Screen-reader users cannot tell where a link goes.', fix: 'Add visible text or aria-label so users know where the link goes.' },
  positiveTabIndex:  { id: 'positiveTabIndex',  sc: '2.4.3',  sev: 'serious',  label: 'tabindex value greater than 0',         hurt: 'Keyboard users get bounced around the page in an unpredictable order.', fix: 'Use tabindex="0" or remove. Positive values break natural focus order.' },
  ariaInvalidRole:   { id: 'ariaInvalidRole',   sc: '4.1.2',  sev: 'serious',  label: 'Invalid ARIA role',                     hurt: 'Screen readers may ignore the element or announce it incorrectly.', fix: 'Use a role from the WAI-ARIA spec, or remove the attribute.' },
  duplicateId:       { id: 'duplicateId',       sc: '4.1.1',  sev: 'moderate', label: 'Duplicate id attribute',                hurt: 'label[for=] and aria-labelledby both fail silently when ids are duplicated.', fix: 'IDs must be unique. Refactor or generate stable unique ids.' },
  missingFocus:      { id: 'missingFocus',      sc: '2.4.7',  sev: 'serious',  label: 'Suppressed focus outline',              hurt: 'Keyboard-only users have no visual cue for where their focus is.', fix: 'Don\'t use outline:none without an alternate visible :focus indicator.' },
  htmlSize:          { id: 'htmlSize',          sc: '—',      sev: 'minor',    label: 'Very large DOM (over 1500 nodes)',       hurt: 'Long DOMs hurt screen-reader navigation and battery on low-power devices.', fix: 'Lazy-load below-fold content or paginate.' },
  longForm:          { id: 'longForm',          sc: '—',      sev: 'minor',    label: 'Form has 8+ fields',                    hurt: 'Each extra field drops completion. Most users abandon at ~7.', fix: 'Cut optional fields, split across steps, or defer to post-signup.' },
};

let lastReport = null;
let activeTab = 'critical';
let sourceTabId = null;

const params = new URLSearchParams(location.search);
const queryUrl = params.get('url');
sourceTabId = parseInt(params.get('tabId') || '0', 10) || null;

if (queryUrl) $('ana-run-current').textContent = `Analyze ${shortenUrl(queryUrl)}`;

$('ana-run-current').addEventListener('click', runOnActiveTab);
$('ana-run-paste').addEventListener('click', () => {
  $('ana-paste-pane').hidden = !$('ana-paste-pane').hidden;
});
$('ana-paste-go').addEventListener('click', () => {
  const html = $('ana-paste-text').value;
  const url = $('ana-paste-url').value || 'pasted snippet';
  if (!html.trim()) return;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  showReport(analyze(doc, url));
});

document.querySelectorAll('.ana-tab').forEach((t) => t.addEventListener('click', () => {
  activeTab = t.dataset.tab;
  document.querySelectorAll('.ana-tab').forEach((x) => x.classList.toggle('is-active', x.dataset.tab === activeTab));
  renderIssues();
}));

$('ana-copy').addEventListener('click', copyReport);
$('ana-pdf').addEventListener('click', exportPdf);
$('ana-rerun').addEventListener('click', () => { if (sourceTabId || queryUrl) runOnActiveTab(); });
$('ana-ai').addEventListener('click', generateRemediationGuide);
$('ana-ai-copy').addEventListener('click', () => {
  const text = $('ana-ai-guide-body').dataset.markdown || '';
  navigator.clipboard.writeText(text).then(() => {
    $('ana-ai-copy').textContent = 'Copied ✓';
    setTimeout(() => { $('ana-ai-copy').textContent = 'Copy guide'; }, 1500);
  });
});
$('ana-ai-close').addEventListener('click', () => { $('ana-ai-guide').hidden = true; });

async function runOnActiveTab() {
  $('ana-run-current').disabled = true;
  $('ana-run-current').textContent = 'Reading the page…';
  try {
    const res = await new Promise((r) => chrome.runtime.sendMessage({ type: 'WEBABLE_GRAB_PAGE_FOR_ANALYZER', tabId: sourceTabId }, r));
    if (!res?.ok) throw new Error(res?.error || 'no response');
    const doc = new DOMParser().parseFromString(res.html, 'text/html');
    showReport(analyze(doc, res.url || queryUrl || 'active tab'));
  } catch (e) {
    alert('Could not read the active tab. Open a normal http(s) page and try again.\n\n' + e.message);
  } finally {
    $('ana-run-current').disabled = false;
    $('ana-run-current').textContent = queryUrl ? `Re-analyze ${shortenUrl(queryUrl)}` : 'Analyze the active tab';
  }
}

function shortenUrl(u) { try { return new URL(u).hostname; } catch { return u.slice(0, 40); } }

// ─── Selector path generator (stable enough to round-trip) ────
function selectorFor(el) {
  if (!el || el.nodeType !== 1) return '';
  if (el.id) {
    // Use #id only if it survives CSS.escape
    try { return '#' + CSS.escape(el.id); } catch { return ''; }
  }
  const path = [];
  let node = el;
  while (node && node.nodeType === 1 && node.nodeName.toLowerCase() !== 'html' && path.length < 6) {
    let part = node.nodeName.toLowerCase();
    if (node.id) {
      try { part += '#' + CSS.escape(node.id); path.unshift(part); break; } catch {}
    } else {
      const parent = node.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter((s) => s.nodeName === node.nodeName);
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(node) + 1})`;
      }
    }
    path.unshift(part);
    node = node.parentElement;
  }
  return path.join(' > ');
}

// ─── Analysis core ─────────────────────────────────────────────
function analyze(doc, url) {
  const findings = [];
  const $$d = (sel) => $$(sel, doc);

  function record(rule, items, samplesFn) {
    if (!items?.length) return;
    findings.push({
      rule,
      count: items.length,
      samples: items.slice(0, 4).map((el) => ({
        snippet: snip(el),
        selector: selectorFor(el),
        label: ((el.textContent || el.alt || el.value || el.placeholder || '') + '').trim().slice(0, 80),
      })),
    });
  }

  // 1. Images missing alt
  const missingAlt = $$d('img').filter((i) => !i.hasAttribute('alt'));
  record(WCAG.altMissing, missingAlt);

  // 2. Form labels
  const inputs = $$d('input, select, textarea').filter((el) => !['hidden','submit','button','reset'].includes((el.getAttribute('type') || '').toLowerCase()));
  const unlabeled = inputs.filter((i) => {
    if (i.hasAttribute('aria-label')) return false;
    if (i.hasAttribute('aria-labelledby')) return false;
    const id = i.getAttribute('id');
    if (id) {
      try { if (doc.querySelector(`label[for="${CSS.escape(id)}"]`)) return false; } catch {}
    }
    if (i.closest('label')) return false;
    return true;
  });
  record(WCAG.formLabelMissing, unlabeled);

  // 3. Vague links / buttons
  const VAGUE = /^(click here|learn more|read more|submit|continue|here|more|→|->|next|go|ok|view|see|details)$/i;
  const interactives = $$d('a, button, [role=button], input[type=submit], input[type=button]');
  const vague = interactives.filter((el) => {
    const t = (el.textContent || el.value || '').trim();
    return t && (VAGUE.test(t) || t.length < 3);
  });
  record(WCAG.vagueLink, vague);

  // 4. Headings
  const headings = $$d('h1, h2, h3, h4, h5, h6');
  const levels = headings.map((h) => parseInt(h.tagName[1], 10));
  let firstSkip = null;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i-1] > 1) { firstSkip = headings[i]; break; }
  }
  if (firstSkip) record(WCAG.headingSkip, [firstSkip]);
  if (!doc.querySelector('h1')) findings.push({ rule: WCAG.noH1, count: 1, samples: [] });

  // 5. Lang
  if (!doc.documentElement.getAttribute('lang')) findings.push({ rule: WCAG.langMissing, count: 1, samples: [{ snippet: '<html> with no lang attribute', selector: 'html', label: '' }] });

  // 6. Title
  const titleText = (doc.querySelector('title')?.textContent || '').trim();
  if (!titleText) findings.push({ rule: WCAG.titleMissing, count: 1, samples: [{ snippet: '<title>(empty)</title>', selector: 'title', label: '' }] });

  // 7. Zoom blocked
  const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
  if (/user-scalable\s*=\s*no/i.test(viewport) || /maximum-scale\s*=\s*1(?!\d)/i.test(viewport)) {
    findings.push({ rule: WCAG.zoomBlocked, count: 1, samples: [{ snippet: `<meta name="viewport" content="${escapeHtml(viewport)}">`, selector: 'meta[name=viewport]', label: '' }] });
  }

  // 8. Meta desc
  if (!doc.querySelector('meta[name="description"]')) findings.push({ rule: WCAG.metaDesc, count: 1, samples: [] });

  // 9. Empty button / link
  const emptyBtns = $$d('button, [role=button]').filter((b) => !(b.textContent || '').trim() && !b.hasAttribute('aria-label') && !b.querySelector('img[alt]:not([alt=""])'));
  record(WCAG.emptyButton, emptyBtns);
  const emptyLinks = $$d('a').filter((a) => !(a.textContent || '').trim() && !a.hasAttribute('aria-label') && !a.querySelector('img[alt]:not([alt=""])'));
  record(WCAG.emptyLink, emptyLinks);

  // 10. Positive tabindex
  const positiveTI = $$d('[tabindex]').filter((el) => parseInt(el.getAttribute('tabindex'), 10) > 0);
  record(WCAG.positiveTabIndex, positiveTI);

  // 11. Invalid roles
  const VALID_ROLES = new Set(['alert','alertdialog','application','article','banner','button','cell','checkbox','columnheader','combobox','complementary','contentinfo','dialog','document','feed','figure','form','grid','gridcell','group','heading','img','link','list','listbox','listitem','main','marquee','math','menu','menubar','menuitem','menuitemcheckbox','menuitemradio','navigation','none','note','option','presentation','progressbar','radio','radiogroup','region','row','rowgroup','rowheader','scrollbar','search','searchbox','separator','slider','spinbutton','status','switch','tab','table','tablist','tabpanel','term','textbox','timer','toolbar','tooltip','tree','treegrid','treeitem']);
  const badRoles = $$d('[role]').filter((el) => {
    const r = el.getAttribute('role');
    return r && !VALID_ROLES.has(r.split(' ')[0]);
  });
  record(WCAG.ariaInvalidRole, badRoles);

  // 12. Duplicate IDs
  const idMap = new Map();
  $$d('[id]').forEach((el) => idMap.set(el.id, (idMap.get(el.id) || 0) + 1));
  const dupes = Array.from(idMap.entries()).filter(([, n]) => n > 1).map(([id]) => id);
  if (dupes.length) findings.push({ rule: WCAG.duplicateId, count: dupes.length, samples: dupes.slice(0, 5).map((id) => ({ snippet: `id="${escapeHtml(id)}"`, selector: `#${id}`, label: id })) });

  // 13. Suppressed focus outline (heuristic on inline <style>)
  const styleText = $$d('style').map((s) => s.textContent || '').join(' ');
  if (/(:focus[^{]*\{[^}]*outline\s*:\s*(0|none))/i.test(styleText)) {
    findings.push({ rule: WCAG.missingFocus, count: 1, samples: [{ snippet: ':focus { outline: none }', selector: '', label: '' }] });
  }

  // 14. DOM size
  const totalNodes = doc.querySelectorAll('*').length;
  if (totalNodes > 1500) findings.push({ rule: WCAG.htmlSize, count: totalNodes, samples: [] });

  // 15. Long forms
  $$d('form').forEach((form) => {
    const fields = form.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea');
    if (fields.length >= 8) findings.push({ rule: WCAG.longForm, count: fields.length, samples: [{ snippet: `form#${escapeHtml(form.id || '(no id)')} · ${fields.length} fields`, selector: selectorFor(form), label: form.id || 'form' }] });
  });

  // ─── Score & categories ───
  const sevWeight = { critical: 14, serious: 8, moderate: 4, minor: 2 };
  const penalty = findings.reduce((acc, f) => acc + sevWeight[f.rule.sev], 0);
  const score = Math.max(15, 100 - penalty);

  const accessibility = penalize(findings, ['altMissing','formLabelMissing','vagueLink','headingSkip','noH1','langMissing','titleMissing','zoomBlocked','emptyButton','emptyLink','positiveTabIndex','ariaInvalidRole','duplicateId','missingFocus']);
  const usability     = penalize(findings, ['vagueLink','longForm','htmlSize']);
  const seo           = penalize(findings, ['titleMissing','metaDesc','headingSkip','noH1']);

  return { url, title: titleText, score, accessibility, usability, seo, findings, totalNodes };
}

function penalize(findings, ids) {
  const w = { critical: 14, serious: 8, moderate: 4, minor: 2 };
  const filtered = findings.filter((f) => ids.includes(f.rule.id));
  const penalty = filtered.reduce((s, f) => s + w[f.rule.sev], 0);
  return Math.max(20, Math.round(100 - penalty * 1.4));
}

function snip(el) {
  if (typeof el === 'string') return el;
  const c = el.cloneNode(true);
  if (c.innerHTML && c.innerHTML.length > 200) c.innerHTML = c.innerHTML.slice(0, 200) + '…';
  return c.outerHTML.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─── Render ──────────────────────────────────────────────────
async function showReport(rep) {
  lastReport = rep;
  $('ana-results').hidden = false;
  $('ana-score').textContent = rep.score;
  $('ana-sum-title').textContent = rep.title || '(untitled page)';
  $('ana-sum-sub').textContent = `${rep.url} · ${rep.totalNodes} DOM nodes · ${rep.findings.length} findings`;
  $('ana-arc').setAttribute('d', describeArc(50, 50, 42, rep.score / 100));
  $('ana-arc').setAttribute('stroke', scoreColor(rep.score));
  $('ana-cats').innerHTML = `
    ${cat('Accessibility', rep.accessibility)}
    ${cat('Usability',    rep.usability)}
    ${cat('SEO',          rep.seo)}
  `;
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0, passing: Object.keys(WCAG).length - rep.findings.length };
  rep.findings.forEach((f) => counts[f.rule.sev]++);
  document.querySelectorAll('.ana-tab').forEach((t) => {
    const k = t.dataset.tab;
    t.innerHTML = `${capitalize(k)} <span class="ana-tab-count mono">${counts[k]}</span>`;
  });
  renderIssues();

  // Reveal the AI Remediation button only if a key is set.
  if (window.WebAbleGemini && await window.WebAbleGemini.hasKey()) {
    $('ana-ai').hidden = false;
  } else {
    $('ana-ai').hidden = true;
  }
}

function cat(label, v) {
  return `
    <div class="ana-cat">
      <div class="ana-cat-row">
        <span class="ana-cat-key">${label}</span>
        <span class="ana-cat-val mono">${v}</span>
      </div>
      <div class="ana-cat-bar"><span style="width:${v}%; background:${scoreColor(v)};"></span></div>
    </div>
  `;
}

function renderIssues() {
  if (!lastReport) return;
  const wrap = $('ana-issues');
  if (activeTab === 'passing') {
    const failed = new Set(lastReport.findings.map((f) => f.rule.id));
    const passing = Object.values(WCAG).filter((r) => !failed.has(r.id));
    if (!passing.length) { wrap.innerHTML = `<div class="ana-empty">No passing rules — every check found something.</div>`; return; }
    wrap.innerHTML = passing.map((r) => `
      <div class="ana-issue ana-sev-passing">
        <div class="ana-issue-head">
          <span class="ana-issue-pill">PASS · WCAG ${r.sc}</span>
          <span class="ana-issue-title">${r.label}</span>
        </div>
        <div class="ana-issue-row"><span class="ana-issue-key">Check</span><span>WebAble found no failures of this rule on the page.</span></div>
      </div>
    `).join('');
    return;
  }
  const items = lastReport.findings.filter((f) => f.rule.sev === activeTab);
  if (!items.length) { wrap.innerHTML = `<div class="ana-empty">No ${activeTab} findings.</div>`; return; }
  wrap.innerHTML = items.map((f, i) => `
    <div class="ana-issue ana-sev-${f.rule.sev}" data-finding-idx="${i}">
      <div class="ana-issue-head">
        <span class="ana-issue-pill">${f.rule.sev.toUpperCase()} · WCAG ${f.rule.sc}</span>
        <span class="ana-issue-title">${escapeHtml(f.rule.label)}</span>
        <span class="ana-issue-count mono">${f.count}</span>
      </div>
      <div class="ana-issue-row"><span class="ana-issue-key">Who it hurts</span><span>${escapeHtml(f.rule.hurt || '')}</span></div>
      <div class="ana-issue-row"><span class="ana-issue-key">Fix</span><span class="ana-issue-fix">${escapeHtml(f.rule.fix)}</span></div>
      ${f.samples?.length ? `
        <details class="ana-issue-snippets">
          <summary>${f.samples.length} sample${f.samples.length === 1 ? '' : 's'}</summary>
          ${f.samples.map((s, si) => `
            <div class="ana-snip-row">
              <pre class="ana-issue-snip">${escapeHtml(s.snippet)}</pre>
              ${(s.selector && sourceTabId) ? `<button class="ana-btn ana-btn-mini ana-highlight" data-finding="${i}" data-sample="${si}">Highlight on page</button>` : ''}
            </div>
          `).join('')}
        </details>
      ` : ''}
    </div>
  `).join('');

  // Wire highlight buttons
  wrap.querySelectorAll('.ana-highlight').forEach((b) => b.addEventListener('click', () => {
    const fi = parseInt(b.dataset.finding, 10);
    const si = parseInt(b.dataset.sample, 10);
    const sample = lastReport.findings[fi]?.samples?.[si];
    if (!sample) return;
    chrome.runtime.sendMessage({ type: 'WEBABLE_HIGHLIGHT_ELEMENT', tabId: sourceTabId, selector: sample.selector, label: sample.label }, (res) => {
      if (res?.ok) {
        b.textContent = 'Highlighted ✓';
        setTimeout(() => { b.textContent = 'Highlight on page'; }, 2000);
      }
    });
  }));
}

function describeArc(cx, cy, r, t) {
  const start = -135 * Math.PI / 180;
  const end = start + (t * 270 * Math.PI / 180);
  const sx = cx + r * Math.cos(start);
  const sy = cy + r * Math.sin(start);
  const ex = cx + r * Math.cos(end);
  const ey = cy + r * Math.sin(end);
  const large = (end - start) > Math.PI ? 1 : 0;
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}
function scoreColor(s) { if (s >= 80) return '#1FCB8A'; if (s >= 60) return '#F2B340'; return '#E5484D'; }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ─── Exports ─────────────────────────────────────────────────
function buildMarkdown(r) {
  const lines = [];
  lines.push(`# WebAble Site Analyzer — ${r.title || '(untitled)'}\n`);
  lines.push(`**URL:** ${r.url}`);
  lines.push(`**WebAble Score:** ${r.score} / 100  ·  Accessibility ${r.accessibility} · Usability ${r.usability} · SEO ${r.seo}`);
  lines.push(`**DOM size:** ${r.totalNodes} nodes\n`);
  lines.push(`> Automated tools detect ~30-40% of accessibility issues. The rest needs manual testing with real assistive tech.\n`);
  if (!r.findings.length) {
    lines.push('No findings.');
  } else {
    ['critical','serious','moderate','minor'].forEach((sev) => {
      const items = r.findings.filter((f) => f.rule.sev === sev);
      if (!items.length) return;
      lines.push(`## ${sev[0].toUpperCase() + sev.slice(1)} (${items.length})\n`);
      items.forEach((f) => {
        lines.push(`- **${f.rule.label}** _(WCAG ${f.rule.sc}, ${f.count} affected)_`);
        lines.push(`  - Who it hurts: ${f.rule.hurt || ''}`);
        lines.push(`  - Fix: ${f.rule.fix}`);
        if (f.samples?.length) {
          f.samples.slice(0, 2).forEach((s) => lines.push(`  - Example: \`${(s.snippet || '').replace(/`/g, '\'').slice(0, 200)}\``));
        }
      });
      lines.push('');
    });
  }
  return lines.join('\n');
}

function copyReport() {
  if (!lastReport) return;
  navigator.clipboard.writeText(buildMarkdown(lastReport)).then(() => {
    $('ana-copy').textContent = 'Copied ✓';
    setTimeout(() => { $('ana-copy').textContent = 'Copy as Markdown'; }, 1500);
  });
}

function exportPdf() {
  if (!lastReport) return;
  // Open a print-friendly window with the report and trigger the print dialog.
  // The user's "Save as PDF" action produces a real, browser-native PDF.
  // (jsPDF integration is the v1.2 task in BUILD.md — silent download UX.)
  const w = window.open('', 'webable-pdf', 'width=820,height=720');
  if (!w) return alert('Popup blocked. Allow popups for this page to download the PDF.');
  const r = lastReport;
  const html = `<!doctype html><html><head><meta charset="utf-8" />
    <title>WebAble Audit — ${escapeHtml(r.title || r.url)}</title>
    <style>
      @page { size: A4; margin: 18mm; }
      * { box-sizing: border-box; }
      body { font-family: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif; color: #0B1220; line-height: 1.55; font-size: 12pt; margin: 0; padding: 0; }
      h1 { font-size: 22pt; margin: 0 0 6pt; letter-spacing: -0.01em; }
      h2 { font-size: 16pt; margin: 16pt 0 6pt; padding-top: 10pt; border-top: 1pt solid #ccc; page-break-after: avoid; }
      h3 { font-size: 13pt; margin: 14pt 0 4pt; page-break-after: avoid; }
      .meta { color: #6B768F; margin-bottom: 16pt; font-size: 10pt; }
      .gauge { display: inline-block; padding: 8pt 16pt; border: 1pt solid #ccc; border-radius: 6pt; font-size: 14pt; font-weight: 500; margin-right: 12pt; margin-bottom: 12pt; }
      .findings { margin-top: 8pt; }
      .finding { padding: 10pt 12pt; border: 1pt solid #ddd; border-radius: 6pt; margin-bottom: 8pt; page-break-inside: avoid; }
      .finding .title { font-size: 13pt; font-weight: 500; }
      .finding .pill { display: inline-block; font-size: 9pt; padding: 2pt 6pt; border-radius: 3pt; margin-right: 6pt; text-transform: uppercase; letter-spacing: 0.06em; font-family: ui-monospace, monospace; }
      .pill.critical { background: #fcebec; color: #a51d23; }
      .pill.serious  { background: #fdeeef; color: #b03438; }
      .pill.moderate { background: #fdf3e0; color: #8a6210; }
      .pill.minor    { background: #eef0f4; color: #4a5876; }
      .row { margin-top: 4pt; font-size: 11pt; }
      .key { font-family: ui-monospace, monospace; font-size: 9pt; color: #6B768F; text-transform: uppercase; letter-spacing: 0.06em; margin-right: 8pt; }
      .snip { font-family: ui-monospace, monospace; font-size: 9pt; background: #f5f5f5; padding: 6pt 8pt; border-radius: 4pt; margin-top: 4pt; white-space: pre-wrap; word-wrap: break-word; }
      footer { margin-top: 20pt; padding-top: 10pt; border-top: 1pt dashed #ccc; font-size: 9pt; color: #6B768F; }
    </style></head><body>
    <h1>WebAble Site Analyzer</h1>
    <div class="meta">${escapeHtml(r.title || '(untitled)')} · ${escapeHtml(r.url)} · ${new Date().toLocaleString()}</div>
    <div>
      <span class="gauge">Score ${r.score} / 100</span>
      <span class="gauge">A11y ${r.accessibility}</span>
      <span class="gauge">Usability ${r.usability}</span>
      <span class="gauge">SEO ${r.seo}</span>
    </div>
    <p style="font-style: italic; color: #6B768F;">Automated tools detect ~30-40% of accessibility issues. The remainder needs manual testing with real assistive tech. This report is suggestive, not a compliance certification.</p>
    ${['critical','serious','moderate','minor'].map((sev) => {
      const items = r.findings.filter((f) => f.rule.sev === sev);
      if (!items.length) return '';
      return `<h2>${capitalize(sev)} — ${items.length}</h2>
        <div class="findings">${items.map((f) => `
          <div class="finding">
            <div><span class="pill ${sev}">${sev}</span><span class="title">${escapeHtml(f.rule.label)}</span> <span style="color:#6B768F;font-size:10pt">· WCAG ${f.rule.sc} · ${f.count} affected</span></div>
            <div class="row"><span class="key">Who it hurts</span> ${escapeHtml(f.rule.hurt || '')}</div>
            <div class="row"><span class="key">Fix</span> ${escapeHtml(f.rule.fix)}</div>
            ${f.samples?.length ? f.samples.slice(0,2).map((s) => `<div class="snip">${escapeHtml(s.snippet)}</div>`).join('') : ''}
          </div>
        `).join('')}</div>`;
    }).join('')}
    <footer>WebAble does not claim WCAG compliance for any site. Compliance is a process, not a certificate.</footer>
    <script>setTimeout(() => window.print(), 200);<\/script>
    </body></html>`;
  w.document.write(html);
  w.document.close();
}

// ─── AI remediation guide ────────────────────────────────────
async function generateRemediationGuide() {
  if (!lastReport) return;
  if (!window.WebAbleGemini) return alert('Gemini wrapper failed to load.');
  if (!await window.WebAbleGemini.hasKey()) return alert('Add a Gemini key in WebAble Settings first.');
  $('ana-ai').disabled = true;
  $('ana-ai').textContent = 'Generating with Gemini…';
  $('ana-ai-guide').hidden = false;
  $('ana-ai-guide-body').innerHTML = `<div class="ana-shimmer"></div><div class="ana-shimmer"></div><div class="ana-shimmer"></div>`;
  try {
    const md = buildMarkdown(lastReport);
    const guide = await window.WebAbleGemini.remediationGuide(md);
    $('ana-ai-guide-body').dataset.markdown = guide;
    $('ana-ai-guide-body').innerHTML = renderMarkdown(guide);
    $('ana-ai-guide').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    $('ana-ai-guide-body').innerHTML = `<div class="ana-empty">Could not generate guide: ${escapeHtml(e.message)}</div>`;
  } finally {
    $('ana-ai').disabled = false;
    $('ana-ai').textContent = '✨ Re-generate guide';
  }
}

// Tiny safe markdown renderer (headings / paragraphs / lists / inline code / fenced code).
function renderMarkdown(md) {
  const lines = String(md).split('\n');
  let out = '';
  let inCode = false, inList = false;
  let codeBuf = [];
  const flushList = () => { if (inList) { out += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw;
    if (/^\s*```/.test(line)) {
      if (inCode) { out += `<pre class="ana-md-pre"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`; codeBuf = []; inCode = false; }
      else { flushList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    if (/^### /.test(line)) { flushList(); out += `<h4>${formatInline(line.slice(4))}</h4>`; continue; }
    if (/^## /.test(line))  { flushList(); out += `<h3>${formatInline(line.slice(3))}</h3>`; continue; }
    if (/^# /.test(line))   { flushList(); out += `<h2>${formatInline(line.slice(2))}</h2>`; continue; }
    if (/^[*-]\s+/.test(line)) {
      if (!inList) { out += '<ul>'; inList = true; }
      out += `<li>${formatInline(line.replace(/^[*-]\s+/, ''))}</li>`;
      continue;
    }
    if (/^\s*$/.test(line)) { flushList(); continue; }
    flushList();
    out += `<p>${formatInline(line)}</p>`;
  }
  flushList();
  if (inCode) out += `<pre class="ana-md-pre"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`;
  return out;
}
function formatInline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}

// Popup logic — site state toggles + embedded site analyzer.
//
// The analyzer here is a slimmed-down twin of analyzer.html: same WCAG rules,
// same scoring math, but compact UI. For a deep dive (Highlight on page, AI
// Remediation Guide, PDF export) the "Open full report" button still routes
// to the full analyzer page in a new tab.

const $ = (id) => document.getElementById(id);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

let activeTab = null;
let host = '';
let lastReport = null;
let activeSev = 'critical';

// ─── WCAG rule definitions (mirror of analyzer.js) ───────────────
const WCAG = {
  altMissing:       { sc: '1.1.1',  sev: 'critical', label: 'Images missing alt text',         fix: 'Add an alt attribute. Use alt="" on purely decorative images.' },
  formLabelMissing: { sc: '1.3.1',  sev: 'critical', label: 'Form inputs without labels',       fix: 'Add <label for="..."> or aria-label to every form control.' },
  vagueLink:        { sc: '2.4.4',  sev: 'serious',  label: 'Vague links / buttons',            fix: 'Replace "Click here" / "Learn more" with destination-describing text.' },
  headingSkip:      { sc: '1.3.1',  sev: 'serious',  label: 'Heading hierarchy skips',          fix: 'Use H1 → H2 → H3 in order. Style for size, not hierarchy.' },
  noH1:             { sc: '2.4.6',  sev: 'moderate', label: 'No H1 on page',                    fix: 'Every primary page should have one H1 describing its purpose.' },
  langMissing:      { sc: '3.1.1',  sev: 'serious',  label: '<html> has no lang',               fix: 'Add lang="en" (or correct BCP-47) to the <html> element.' },
  titleMissing:     { sc: '2.4.2',  sev: 'serious',  label: 'Page <title> empty',                fix: 'Set a unique <title> per page that summarizes its purpose.' },
  zoomBlocked:      { sc: '1.4.4',  sev: 'critical', label: 'Pinch-zoom disabled',               fix: 'Remove user-scalable=no and maximum-scale=1 from viewport meta.' },
  metaDesc:         { sc: '—',      sev: 'minor',    label: 'No meta description',               fix: 'Add <meta name="description"> summarizing the page.' },
  emptyButton:      { sc: '4.1.2',  sev: 'critical', label: 'Buttons with no name',              fix: 'Add visible text or aria-label so AT can announce the control.' },
  emptyLink:        { sc: '2.4.4',  sev: 'critical', label: 'Links with no name',                fix: 'Add visible text or aria-label so users know where the link goes.' },
  positiveTabIndex: { sc: '2.4.3',  sev: 'serious',  label: 'Positive tabindex',                  fix: 'Use 0 or remove. Positive values break natural focus order.' },
  duplicateId:      { sc: '4.1.1',  sev: 'moderate', label: 'Duplicate id attributes',           fix: 'IDs must be unique. label[for=] / aria-labelledby fail when not.' },
  htmlSize:         { sc: '—',      sev: 'minor',    label: 'Very large DOM',                    fix: 'Long DOMs hurt screen-reader navigation and battery on low-power devices.' },
  longForm:         { sc: '—',      sev: 'minor',    label: 'Form has 8+ fields',                fix: 'Each extra field drops completion. Split or defer to post-signup.' },
};

// ─── Boot ────────────────────────────────────────────────────────
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  try {
    const u = new URL(tab.url);
    host = u.hostname || tab.url;
  } catch { host = tab.url || 'this page'; }
  $('wa-pop-host').textContent = host;
  $('wa-ana-host').textContent = host;

  const { webable } = await chrome.storage.local.get('webable');
  const site = webable?.perSite?.[host] || {};
  const status = $('wa-pop-status');
  const statusText = $('wa-pop-status-text');
  if (site.disabled) { status.classList.add('is-disabled'); statusText.textContent = 'Disabled here'; }
  else if (site.alwaysOn) { statusText.textContent = 'Always on'; }
  else { statusText.textContent = 'Ready on this tab'; }
  setToggle($('wa-pop-always'), !!site.alwaysOn);
  setToggle($('wa-pop-disable'), !!site.disabled);
}

function setToggle(btn, on) {
  btn.classList.toggle('is-on', !!on);
  btn.setAttribute('aria-pressed', String(!!on));
}

async function patchSite(partial) {
  const { webable } = await chrome.storage.local.get('webable');
  const data = webable || { ui: {}, perSite: {}, apiKey: '' };
  data.perSite = data.perSite || {};
  data.perSite[host] = { alwaysOn: false, disabled: false, tools: {}, ...(data.perSite[host] || {}), ...partial };
  await chrome.storage.local.set({ webable: data });
  try { chrome.tabs.sendMessage(activeTab.id, { type: 'WEBABLE_SITE_PATCH' }); } catch {}
}

// ─── Default-view buttons ────────────────────────────────────────
$('wa-pop-open').addEventListener('click', async () => {
  try {
    await chrome.tabs.sendMessage(activeTab.id, { type: 'WEBABLE_OPEN_PANEL' });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: activeTab.id }, files: ['gemini.js', 'content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: activeTab.id }, files: ['content.css'] });
      await new Promise((r) => setTimeout(r, 80));
      await chrome.tabs.sendMessage(activeTab.id, { type: 'WEBABLE_OPEN_PANEL' });
    } catch {}
  }
  window.close();
});

$('wa-pop-options').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'WEBABLE_OPEN_OPTIONS' }, () => window.close());
});

$('wa-pop-always').addEventListener('click', async () => {
  const next = !$('wa-pop-always').classList.contains('is-on');
  setToggle($('wa-pop-always'), next);
  await patchSite({ alwaysOn: next });
});

$('wa-pop-disable').addEventListener('click', async () => {
  const next = !$('wa-pop-disable').classList.contains('is-on');
  setToggle($('wa-pop-disable'), next);
  await patchSite({ disabled: next });
  if (next) { $('wa-pop-status').classList.add('is-disabled'); $('wa-pop-status-text').textContent = 'Disabled here'; }
  else      { $('wa-pop-status').classList.remove('is-disabled'); $('wa-pop-status-text').textContent = 'Ready on this tab'; }
});

// ─── Analyzer view ───────────────────────────────────────────────
$('wa-pop-analyze').addEventListener('click', () => openAnalyzer());
$('wa-ana-back').addEventListener('click', () => closeAnalyzer());
$('wa-ana-rerun').addEventListener('click', () => runScan());
$('wa-ana-full').addEventListener('click', () => {
  const params = new URLSearchParams();
  if (activeTab?.id) params.set('tabId', String(activeTab.id));
  if (activeTab?.url) params.set('url', activeTab.url);
  chrome.tabs.create({ url: chrome.runtime.getURL('analyzer.html') + '?' + params.toString() }, () => window.close());
});
$('wa-ana-copy').addEventListener('click', () => {
  if (!lastReport) return;
  const md = buildMarkdown(lastReport);
  navigator.clipboard.writeText(md).then(() => {
    const b = $('wa-ana-copy');
    const orig = b.textContent;
    b.textContent = 'Copied ✓';
    setTimeout(() => { b.textContent = orig; }, 1500);
  });
});

// Severity tab switching
$$('.wa-ana-tab').forEach((t) => t.addEventListener('click', () => {
  activeSev = t.dataset.sev;
  $$('.wa-ana-tab').forEach((x) => x.classList.toggle('is-active', x === t));
  renderIssues();
}));

function openAnalyzer() {
  document.body.classList.add('is-analyzer');
  $('wa-pop-main').hidden = true;
  $('wa-pop-ana').hidden = false;
  runScan();
}

function closeAnalyzer() {
  document.body.classList.remove('is-analyzer');
  $('wa-pop-main').hidden = false;
  $('wa-pop-ana').hidden = true;
}

async function runScan() {
  $('wa-ana-loading').hidden = false;
  $('wa-ana-results').hidden = true;
  $('wa-ana-error').hidden = true;
  if (!activeTab?.id) return showError('No active tab.');

  try {
    // Run the scan IN the page so we can read its DOM directly.
    // The function is serialized into the page, so it can't reference outer scope.
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: pageScan,
    });
    if (!res?.result) throw new Error('no result');
    lastReport = computeScores(res.result);
    renderResults();
  } catch (e) {
    showError(e?.message || String(e));
  }
}

// ─── Page-side scanner (executed inside the target tab) ──────────
function pageScan() {
  const $$d = (sel) => Array.from(document.querySelectorAll(sel));
  const findings = [];

  // 1. Images missing alt
  const missingAlt = $$d('img').filter((i) => !i.hasAttribute('alt'));
  if (missingAlt.length) findings.push({ id: 'altMissing', count: missingAlt.length });

  // 2. Form inputs without labels
  const inputs = $$d('input, select, textarea').filter((el) => {
    const t = (el.getAttribute('type') || '').toLowerCase();
    return !['hidden', 'submit', 'button', 'reset'].includes(t);
  });
  const unlabeled = inputs.filter((i) => {
    if (i.hasAttribute('aria-label')) return false;
    if (i.hasAttribute('aria-labelledby')) return false;
    const id = i.getAttribute('id');
    if (id) {
      try { if (document.querySelector('label[for="' + (CSS.escape ? CSS.escape(id) : id) + '"]')) return false; } catch (_) {}
    }
    if (i.closest('label')) return false;
    return true;
  });
  if (unlabeled.length) findings.push({ id: 'formLabelMissing', count: unlabeled.length });

  // 3. Vague links / buttons
  const VAGUE = /^(click here|learn more|read more|submit|continue|here|more|→|->|next|go|ok|view|see|details)$/i;
  const interactives = $$d('a, button, [role=button], input[type=submit], input[type=button]');
  const vague = interactives.filter((el) => {
    const t = (el.textContent || el.value || '').trim();
    return t && (VAGUE.test(t) || t.length < 3);
  });
  if (vague.length) findings.push({ id: 'vagueLink', count: vague.length });

  // 4. Heading skip
  const headings = $$d('h1, h2, h3, h4, h5, h6');
  const levels = headings.map((h) => parseInt(h.tagName[1], 10));
  let skip = false;
  for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) { skip = true; break; }
  if (skip) findings.push({ id: 'headingSkip', count: 1 });

  // 5. No H1
  if (!document.querySelector('h1')) findings.push({ id: 'noH1', count: 1 });

  // 6. Lang
  if (!document.documentElement.getAttribute('lang')) findings.push({ id: 'langMissing', count: 1 });

  // 7. Title
  const t = (document.querySelector('title')?.textContent || '').trim();
  if (!t) findings.push({ id: 'titleMissing', count: 1 });

  // 8. Zoom blocked
  const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
  if (/user-scalable\s*=\s*no/i.test(viewport) || /maximum-scale\s*=\s*1(?!\d)/i.test(viewport)) {
    findings.push({ id: 'zoomBlocked', count: 1 });
  }

  // 9. Meta desc
  if (!document.querySelector('meta[name="description"]')) findings.push({ id: 'metaDesc', count: 1 });

  // 10. Empty button / link
  const emptyBtns = $$d('button, [role=button]').filter((b) =>
    !(b.textContent || '').trim() && !b.hasAttribute('aria-label') && !b.querySelector('img[alt]:not([alt=""])')
  );
  if (emptyBtns.length) findings.push({ id: 'emptyButton', count: emptyBtns.length });

  const emptyLinks = $$d('a').filter((a) =>
    !(a.textContent || '').trim() && !a.hasAttribute('aria-label') && !a.querySelector('img[alt]:not([alt=""])')
  );
  if (emptyLinks.length) findings.push({ id: 'emptyLink', count: emptyLinks.length });

  // 11. Positive tabindex
  const positiveTI = $$d('[tabindex]').filter((el) => parseInt(el.getAttribute('tabindex'), 10) > 0);
  if (positiveTI.length) findings.push({ id: 'positiveTabIndex', count: positiveTI.length });

  // 12. Duplicate IDs
  const idMap = new Map();
  $$d('[id]').forEach((el) => idMap.set(el.id, (idMap.get(el.id) || 0) + 1));
  const dupes = Array.from(idMap.values()).filter((n) => n > 1).length;
  if (dupes) findings.push({ id: 'duplicateId', count: dupes });

  // 13. DOM size
  const totalNodes = document.querySelectorAll('*').length;
  if (totalNodes > 1500) findings.push({ id: 'htmlSize', count: totalNodes });

  // 14. Long form
  $$d('form').forEach((form) => {
    const fields = form.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea');
    if (fields.length >= 8) findings.push({ id: 'longForm', count: fields.length });
  });

  return {
    title: document.title,
    url: location.href,
    totalNodes,
    findings,
  };
}

// ─── Scoring & rendering ─────────────────────────────────────────
function computeScores(raw) {
  const sevWeight = { critical: 14, serious: 8, moderate: 4, minor: 2 };
  const findings = raw.findings.map((f) => ({ ...f, rule: WCAG[f.id] })).filter((f) => f.rule);
  const penalty = findings.reduce((s, f) => s + sevWeight[f.rule.sev], 0);
  const score = Math.max(15, 100 - penalty);

  const penalize = (ids, mult = 1.4) => {
    const filtered = findings.filter((f) => ids.includes(f.id));
    const p = filtered.reduce((s, f) => s + sevWeight[f.rule.sev], 0);
    return Math.max(20, Math.round(100 - p * mult));
  };
  const accessibility = penalize(['altMissing','formLabelMissing','vagueLink','headingSkip','noH1','langMissing','titleMissing','zoomBlocked','emptyButton','emptyLink','positiveTabIndex','duplicateId']);
  const usability = penalize(['vagueLink','longForm','htmlSize']);
  const seo = penalize(['titleMissing','metaDesc','headingSkip','noH1']);

  return { ...raw, score, accessibility, usability, seo, findings };
}

function renderResults() {
  if (!lastReport) return;
  $('wa-ana-loading').hidden = true;
  $('wa-ana-results').hidden = false;
  $('wa-ana-error').hidden = true;

  // Score
  $('wa-ana-score').textContent = lastReport.score;
  $('wa-ana-arc').setAttribute('d', describeArc(50, 50, 42, lastReport.score / 100));
  $('wa-ana-arc').setAttribute('stroke', scoreColor(lastReport.score));

  // Meta
  $('wa-ana-meta-sub').textContent = `${lastReport.findings.length} findings · ${lastReport.totalNodes} nodes`;

  // Categories
  $('wa-ana-cats').innerHTML = `
    ${catRow('A11y',    lastReport.accessibility)}
    ${catRow('Usability', lastReport.usability)}
    ${catRow('SEO',     lastReport.seo)}
  `;

  // Severity counts
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  lastReport.findings.forEach((f) => counts[f.rule.sev]++);
  Object.entries(counts).forEach(([sev, n]) => {
    document.querySelector(`[data-count="${sev}"]`).textContent = n;
  });

  // If active tab has zero, jump to one that doesn't
  if (counts[activeSev] === 0) {
    const firstNonEmpty = ['critical','serious','moderate','minor'].find((s) => counts[s] > 0);
    if (firstNonEmpty) {
      activeSev = firstNonEmpty;
      $$('.wa-ana-tab').forEach((t) => t.classList.toggle('is-active', t.dataset.sev === activeSev));
    }
  }

  renderIssues();
}

function catRow(label, val) {
  return `
    <div class="wa-ana-cat">
      <span class="wa-ana-cat-label">${label}</span>
      <span class="wa-ana-cat-track"><span class="wa-ana-cat-fill" style="width:${val}%; background:${scoreColor(val)};"></span></span>
      <span class="wa-ana-cat-val">${val}</span>
    </div>
  `;
}

function renderIssues() {
  const wrap = $('wa-ana-issues');
  const items = lastReport.findings.filter((f) => f.rule.sev === activeSev);
  if (!items.length) {
    wrap.innerHTML = `<div class="wa-ana-issues-empty">No ${activeSev} findings on this page. ✓</div>`;
    return;
  }
  wrap.innerHTML = items.map((f) => `
    <div class="wa-ana-issue" data-sev="${f.rule.sev}">
      <div class="wa-ana-issue-row">
        <span class="wa-ana-issue-title">${escapeHtml(f.rule.label)}</span>
        <span class="wa-ana-issue-count">${f.count}</span>
      </div>
      <div class="wa-ana-issue-sub">WCAG ${f.rule.sc}</div>
      <div class="wa-ana-issue-detail">
        <div class="wa-ana-issue-fix"><strong>Fix</strong>${escapeHtml(f.rule.fix)}</div>
      </div>
    </div>
  `).join('');
  wrap.querySelectorAll('.wa-ana-issue').forEach((el) => {
    el.addEventListener('click', () => el.classList.toggle('is-open'));
  });
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

function showError(msg) {
  $('wa-ana-loading').hidden = true;
  $('wa-ana-results').hidden = true;
  $('wa-ana-error').hidden = false;
  $('wa-ana-error-sub').textContent = msg
    ? 'Open a normal http(s) page and try again — Chrome blocks scripting on chrome:// and store pages. (' + msg + ')'
    : 'Open a normal http(s) page and try again — Chrome blocks scripting on chrome:// and store pages.';
}

function buildMarkdown(r) {
  const out = [];
  out.push(`# WebAble — ${r.title || '(untitled)'}\n`);
  out.push(`**URL:** ${r.url}`);
  out.push(`**Score:** ${r.score} / 100 · A11y ${r.accessibility} · Usability ${r.usability} · SEO ${r.seo}`);
  out.push(`**DOM:** ${r.totalNodes} nodes\n`);
  ['critical','serious','moderate','minor'].forEach((sev) => {
    const items = r.findings.filter((f) => f.rule.sev === sev);
    if (!items.length) return;
    out.push(`## ${sev[0].toUpperCase() + sev.slice(1)} (${items.length})\n`);
    items.forEach((f) => {
      out.push(`- **${f.rule.label}** _(WCAG ${f.rule.sc} · ${f.count} affected)_`);
      out.push(`  - Fix: ${f.rule.fix}`);
    });
    out.push('');
  });
  return out.join('\n');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

init();

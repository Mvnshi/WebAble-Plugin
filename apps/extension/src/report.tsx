/**
 * Site Check report. Opened in its own tab for the page the person was on
 * (report.html?tab=<id>), it asks that tab's content script to run the audit
 * and renders the result.
 *
 * Two readers, in this order. Somebody who just wants to know "is this site
 * any good" gets a score, four plain-language pillars and the worst problems
 * first. A site owner gets the same report plus what to do about it: every
 * finding says who it hurts and how to fix it, can be found on the page with
 * one click, and exports as Markdown for whoever does the fixing. The offer of
 * help from WebAble comes after the findings, never before them, and nothing
 * about the site leaves this device unless they click it.
 */
import { render, type JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { PILLAR_LABELS, type CheckResult, type Pillar, type SiteReport, type Status } from '@webable/power/sitecheck';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

const TAB = Number(new URLSearchParams(location.search).get('tab'));
const SITE = 'https://webable.cc';

function utm(path: string, extra: Record<string, string> = {}): string {
  const u = new URL(path, SITE);
  u.searchParams.set('utm_source', 'extension');
  u.searchParams.set('utm_medium', 'site_check');
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
  return u.href;
}

function ask<T>(msg: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!Number.isFinite(TAB) || typeof chrome === 'undefined' || !chrome.tabs) return reject(new Error('no tab'));
    chrome.tabs.sendMessage(TAB, msg, { frameId: 0 }, (r: T) => {
      const err = chrome.runtime.lastError;
      if (err || r === undefined) reject(new Error(err?.message || 'no answer'));
      else resolve(r);
    });
  });
}

const STATUS_LABEL: Record<Status, string> = { pass: 'Passed', warn: 'Needs work', fail: 'Problem', info: 'Note' };
const SEVERITY_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;
const STATUS_ORDER: Record<Status, number> = { fail: 0, warn: 1, info: 2, pass: 3 };
const PILLARS: Pillar[] = ['access', 'seo', 'ai', 'speed'];
const PILLAR_BLURB: Record<Pillar, string> = {
  access: 'Can everyone use it, including with a screen reader, a keyboard, or low vision?',
  seo: 'Can people find it in search, and does it look right when shared?',
  ai: 'Can ChatGPT, Claude, Perplexity and Gemini read it, understand it, and cite it?',
  speed: 'How fast and stable it was on this visit, from your own browser.',
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function tone(score: number): 'good' | 'ok' | 'poor' {
  return score >= 90 ? 'good' : score >= 70 ? 'ok' : 'poor';
}

function Ring({ score, size = 132, stroke = 11, label }: { score: number; size?: number; stroke?: number; label?: string }): JSX.Element {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg class={`ring ring-${tone(score)}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label || 'Score'}: ${score} out of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} class="ring-track" stroke-width={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        class="ring-value"
        stroke-width={stroke}
        fill="none"
        stroke-linecap="round"
        stroke-dasharray={`${(c * score) / 100} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dy="0.35em" text-anchor="middle" class="ring-text" style={{ fontSize: `${size * 0.28}px` }}>
        {score}
      </text>
    </svg>
  );
}

function wcagLink(sc: string): string {
  const slug: Record<string, string> = {
    '1.1.1': 'non-text-content',
    '1.3.1': 'info-and-relationships',
    '1.4.2': 'audio-control',
    '1.4.3': 'contrast-minimum',
    '1.4.4': 'resize-text',
    '2.4.2': 'page-titled',
    '2.4.3': 'focus-order',
    '2.4.4': 'link-purpose-in-context',
    '2.5.8': 'target-size-minimum',
    '3.1.1': 'language-of-page',
    '4.1.2': 'name-role-value',
  };
  return slug[sc] ? `https://www.w3.org/WAI/WCAG22/Understanding/${slug[sc]}` : 'https://www.w3.org/WAI/WCAG22/quickref/';
}

function toMarkdown(r: SiteReport): string {
  const lines: string[] = [];
  lines.push(`# Site Check: ${r.host}`, '', `${r.url}`, '', `Checked ${new Date(r.at).toLocaleString()} with WebAble. Overall **${r.overall}/100 (${r.grade})**.`, '');
  for (const p of PILLARS) lines.push(`- ${PILLAR_LABELS[p]}: ${r.pillars[p].score}/100`);
  lines.push('', '> Automated checks find roughly a third of accessibility problems. Test with real assistive technology before calling anything done.', '');
  for (const p of PILLARS) {
    const items = r.checks.filter((c) => c.pillar === p && c.status !== 'pass');
    if (!items.length) continue;
    lines.push(`## ${PILLAR_LABELS[p]}`, '');
    for (const c of items) {
      lines.push(`### ${c.status === 'fail' ? 'Problem' : c.status === 'warn' ? 'Needs work' : 'Note'}: ${c.title}${c.wcag ? ` (WCAG ${c.wcag})` : ''}`, '');
      lines.push(c.detail, '');
      if (c.who) lines.push(`**Who it affects:** ${c.who}`, '');
      lines.push(`**Fix:** ${c.fix}`, '');
      if (c.samples?.length) {
        lines.push('Examples:', '');
        for (const s of c.samples) lines.push(`- \`${s.replace(/`/g, "'")}\``);
        lines.push('');
      }
    }
  }
  const passed = r.checks.filter((c) => c.status === 'pass');
  if (passed.length) {
    lines.push('## Passed', '');
    for (const c of passed) lines.push(`- ${c.title}`);
  }
  return lines.join('\n');
}

function download(name: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Finding({ c, open, onToggle }: { c: CheckResult; open: boolean; onToggle(): void }): JSX.Element {
  const [shown, setShown] = useState<string>('');
  const id = `f-${c.id}`;
  async function show(i: number): Promise<void> {
    try {
      const r = await ask<{ found: boolean }>({ type: 'WEBABLE_HIGHLIGHT', id: c.id, index: i });
      if (r.found) {
        chrome.tabs.update(TAB, { active: true });
        setShown('');
      } else setShown('That element is no longer on the page. Run the check again.');
    } catch {
      setShown('The page was closed or reloaded. Run the check again.');
    }
  }
  return (
    <li class={`finding is-${c.status}`}>
      <button type="button" class="finding-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span class={`dot dot-${c.status}`} aria-hidden="true" />
        <span class="finding-title">{c.title}</span>
        <span class="finding-tags">
          {c.count && c.status !== 'pass' ? <span class="tag">{c.count}</span> : null}
          {c.wcag ? <span class="tag tag-soft">WCAG {c.wcag}</span> : null}
          <span class={`tag tag-${c.status}`}>{STATUS_LABEL[c.status]}</span>
        </span>
        <svg class="chev" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
      {open ? (
        <div class="finding-body" id={id}>
          <p class="finding-detail">{c.detail}</p>
          {c.who ? (
            <p>
              <strong>Who it affects. </strong>
              {c.who}
            </p>
          ) : null}
          {c.status !== 'pass' ? (
            <p>
              <strong>How to fix it. </strong>
              {c.fix}
            </p>
          ) : null}
          {c.samples?.length && c.status !== 'pass' ? (
            <ul class="samples">
              {c.samples.map((s, i) => (
                <li key={i}>
                  <code>{s}</code>
                  <button type="button" class="link-btn" onClick={() => void show(i)}>
                    Show on page
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {shown ? <p class="muted" role="status">{shown}</p> : null}
          {c.workaround && c.status !== 'pass' ? <p class="workaround">For visitors in the meantime: {c.workaround}</p> : null}
          {c.wcag ? (
            <a class="ext" href={wcagLink(c.wcag)} target="_blank" rel="noopener noreferrer">
              Read WCAG {c.wcag}
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Vital({ label, value, band }: { label: string; value: string; band: 'good' | 'ok' | 'poor' | 'na' }): JSX.Element {
  return (
    <div class={`vital vital-${band}`}>
      <div class="vital-value">{value}</div>
      <div class="vital-label">{label}</div>
    </div>
  );
}

function band(v: number | undefined, good: number, poor: number): 'good' | 'ok' | 'poor' | 'na' {
  if (v === undefined) return 'na';
  return v <= good ? 'good' : v <= poor ? 'ok' : 'poor';
}

function Owner({ r }: { r: SiteReport }): JSX.Element {
  const problems = r.checks.filter((c) => c.status === 'fail').length;
  const platform = r.platform ? ` on ${r.platform}` : '';
  return (
    <section class="owner" aria-labelledby="owner-h">
      <div class="owner-copy">
        <p class="eyebrow">For site owners</p>
        <h2 id="owner-h">{problems ? `Want ${problems === 1 ? 'this problem' : `these ${problems} problems`} fixed for you?` : 'Want to keep it this way?'}</h2>
        <p>
          WebAble fixes accessibility, search and AI visibility issues in the site itself{platform}, not with an overlay. Pick a plan matched to how your site is built, bring in
          a specialist for a fix sprint, or keep one on call every month.
        </p>
        <ul class="owner-points">
          <li>Fix plans for custom code, Webflow, Framer, Squarespace, WordPress, Wix and Shopify</li>
          <li>A human-assisted fix sprint with a before and after report</li>
          <li>Monthly partner: accessibility, UX, SEO and growth, month to month</li>
        </ul>
        <p class="muted small">These links open webable.cc. The page address is included only in the deep-scan link, so the scan knows what to check.</p>
      </div>
      <div class="owner-actions">
        <a class="btn btn-primary" href={utm('/business', { utm_campaign: 'fix_plans' }) + '#pricing'} target="_blank" rel="noopener">
          See fix plans
        </a>
        <a class="btn" href={utm('/analyzer', { url: r.url, utm_campaign: 'deep_scan' })} target="_blank" rel="noopener">
          Run the deep scan
        </a>
        <a class="btn" href={utm('/contact', { service: 'fix-sprint', utm_campaign: 'talk' })} target="_blank" rel="noopener">
          Talk to a specialist
        </a>
        <a class="btn btn-quiet" href={utm('/business/widget', { utm_campaign: 'widget' })} target="_blank" rel="noopener">
          Add the free widget to your site
        </a>
      </div>
    </section>
  );
}

function App(): JSX.Element {
  const [report, setReport] = useState<SiteReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [pillar, setPillar] = useState<Pillar | 'all'>('all');
  const [issuesOnly, setIssuesOnly] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  async function check(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const r = await ask<SiteReport & { error?: string }>({ type: 'WEBABLE_SITE_CHECK' });
      if (r.error) throw new Error(r.error);
      setReport(r);
      document.title = `Site Check: ${r.host} (${r.overall})`;
      const worst = r.checks.filter((c) => c.status === 'fail').sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0];
      if (worst) setOpen(new Set([worst.id]));
    } catch {
      setError(
        Number.isFinite(TAB) && TAB > 0
          ? 'Could not reach that page. It may have been closed, or it is a page browsers do not let extensions read (the Chrome Web Store, settings pages, PDFs). Open a normal web page and run Site Check from the WebAble button.'
          : 'Open a web page, then run Site Check from the WebAble toolbar button or the command bar (Ctrl+Shift+K, "check this site").',
      );
    }
    setBusy(false);
  }
  useEffect(() => void check(), []);

  const list = useMemo(() => {
    if (!report) return [];
    return report.checks
      .filter((c) => pillar === 'all' || c.pillar === pillar)
      .filter((c) => !issuesOnly || c.status !== 'pass')
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }, [report, pillar, issuesOnly]);

  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  return (
    <>
      <header class="top">
        <div class="brand">
          <img src="icons/icon48.png" width="28" height="28" alt="" />
          <span>
            WebAble <strong>Site Check</strong>
          </span>
        </div>
        {report ? (
          <div class="top-actions">
            <button type="button" class="btn btn-small" onClick={() => void check()} disabled={busy}>
              {busy ? 'Checking' : 'Check again'}
            </button>
            <button
              type="button"
              class="btn btn-small"
              onClick={() => {
                void navigator.clipboard.writeText(toMarkdown(report)).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? 'Copied' : 'Copy as Markdown'}
            </button>
            <button type="button" class="btn btn-small" onClick={() => download(`site-check-${report.host}.md`, toMarkdown(report))}>
              Download
            </button>
            <button type="button" class="btn btn-small" onClick={() => window.print()}>
              Save as PDF
            </button>
          </div>
        ) : null}
      </header>

      <main id="main">
        {busy && !report ? (
          <div class="loading" role="status">
            <div class="spinner" aria-hidden="true" />
            Reading the page: structure, colours, timing, robots.txt
          </div>
        ) : null}
        {error ? (
          <div class="empty" role="alert">
            <h1>Nothing to check yet</h1>
            <p>{error}</p>
          </div>
        ) : null}
        {report ? (
          <>
            <section class="hero">
              <div class="hero-score">
                <Ring score={report.overall} size={156} stroke={13} label="Overall score" />
                <div class={`grade grade-${tone(report.overall)}`}>{report.grade}</div>
              </div>
              <div class="hero-copy">
                <h1>{report.title || report.host}</h1>
                <p class="url">{report.url}</p>
                <p class="muted small">
                  Checked {new Date(report.at).toLocaleString()} {report.platform ? <span class="pill">Built with {report.platform}</span> : null}
                </p>
                <p class="honest">
                  Automated checks find roughly a third of accessibility problems. A high score means nothing obvious is wrong, not that the site is accessible or compliant.
                </p>
              </div>
            </section>

            <section class="pillars" aria-label="Scores by area">
              {PILLARS.map((p) => (
                <button
                  type="button"
                  key={p}
                  class={`pillar${pillar === p ? ' is-on' : ''}`}
                  aria-pressed={pillar === p}
                  onClick={() => setPillar(pillar === p ? 'all' : p)}
                >
                  <Ring score={report.pillars[p].score} size={64} stroke={7} label={PILLAR_LABELS[p]} />
                  <span class="pillar-text">
                    <span class="pillar-name">{PILLAR_LABELS[p]}</span>
                    <span class="pillar-blurb">{PILLAR_BLURB[p]}</span>
                    <span class="pillar-counts">
                      <span class="c-fail">{plural(report.pillars[p].fail, 'problem')}</span>
                      <span class="c-warn">{report.pillars[p].warn} to improve</span>
                      <span class="c-pass">{report.pillars[p].pass} passed</span>
                    </span>
                  </span>
                </button>
              ))}
            </section>

            <section class="vitals" aria-label="Measured on this visit">
              <Vital label="Largest paint" value={report.vitals.lcp !== undefined ? `${(report.vitals.lcp / 1000).toFixed(1)} s` : 'n/a'} band={band(report.vitals.lcp, 2500, 4000)} />
              <Vital label="Layout shift" value={String(report.vitals.cls ?? 'n/a')} band={band(report.vitals.cls, 0.1, 0.25)} />
              <Vital label="Server response" value={report.vitals.ttfb !== undefined ? `${(report.vitals.ttfb / 1000).toFixed(2)} s` : 'n/a'} band={band(report.vitals.ttfb, 800, 1800)} />
              <Vital label="Transferred" value={report.vitals.transfer ? `${(report.vitals.transfer / 1e6).toFixed(1)} MB` : 'n/a'} band={band(report.vitals.transfer, 2.5e6, 5e6)} />
              <Vital label="Requests" value={String(report.vitals.requests ?? 'n/a')} band="na" />
              <Vital label="Elements" value={report.vitals.domNodes.toLocaleString()} band={band(report.vitals.domNodes, 1500, 3000)} />
            </section>

            <section class="findings" aria-labelledby="findings-h">
              <div class="findings-head">
                <h2 id="findings-h">{pillar === 'all' ? 'Findings' : PILLAR_LABELS[pillar]}</h2>
                <label class="switch">
                  <input type="checkbox" checked={issuesOnly} onChange={(e) => setIssuesOnly((e.currentTarget as HTMLInputElement).checked)} />
                  Issues only
                </label>
              </div>
              {list.length ? (
                <ul class="finding-list">
                  {list.map((c) => (
                    <Finding key={c.id} c={c} open={open.has(c.id)} onToggle={() => toggle(c.id)} />
                  ))}
                </ul>
              ) : (
                <p class="muted">Nothing to fix here. Untick "Issues only" to see what passed.</p>
              )}
            </section>

            <Owner r={report} />
          </>
        ) : null}
      </main>
      <footer class="foot">
        WebAble is free and open source. This report was made on your device and nothing about the page was sent anywhere.
      </footer>
    </>
  );
}

render(<App />, document.getElementById('app')!);

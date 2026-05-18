// Options page logic — appearance, BYOK key, per-site memory.
const $ = (id) => document.getElementById(id);

(async () => {
  const params = new URLSearchParams(location.search);
  if (params.has('welcome')) $('welcome').hidden = false;

  const { webable } = await chrome.storage.local.get('webable');
  const data = webable || { ui: { theme: 'auto', brandColor: 'blue' }, perSite: {}, apiKey: '' };
  if (!data.ui) data.ui = { theme: 'auto', brandColor: 'blue' };

  // Theme segmented
  document.querySelectorAll('[data-setting=theme] button').forEach((b) => {
    if (b.dataset.value === (data.ui.theme || 'auto')) b.classList.add('is-active');
    b.addEventListener('click', async () => {
      document.querySelectorAll('[data-setting=theme] button').forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      await patch({ ui: { ...data.ui, theme: b.dataset.value } });
    });
  });

  // Brand color
  document.querySelectorAll('.opt-color').forEach((c) => {
    if (c.dataset.value === (data.ui.brandColor || 'blue')) c.classList.add('is-active');
    c.addEventListener('click', async () => {
      document.querySelectorAll('.opt-color').forEach((x) => x.classList.remove('is-active'));
      c.classList.add('is-active');
      await patch({ ui: { ...data.ui, brandColor: c.dataset.value } });
    });
  });

  // API key
  if (data.apiKey) {
    $('opt-key').value = data.apiKey;
    $('opt-key-status').classList.add('is-set');
    $('opt-key-status').textContent = `Key set · ${maskKey(data.apiKey)} · stored only in chrome.storage.local`;
  }
  $('opt-key-save').addEventListener('click', async () => {
    const key = $('opt-key').value.trim();
    if (!key) return;
    await patch({ apiKey: key });
    $('opt-key-status').classList.remove('is-error');
    $('opt-key-status').classList.add('is-set');
    $('opt-key-status').textContent = `Key saved · ${maskKey(key)} · stored only in chrome.storage.local`;
  });
  $('opt-key-test').addEventListener('click', async () => {
    const key = $('opt-key').value.trim();
    if (!key) {
      $('opt-key-status').classList.remove('is-set', 'is-set-ok');
      $('opt-key-status').classList.add('is-error');
      $('opt-key-status').textContent = 'Enter a key first.';
      return;
    }
    $('opt-key-status').classList.remove('is-error', 'is-set-ok');
    $('opt-key-status').textContent = 'Testing key against generativelanguage.googleapis.com…';
    if (!window.WebAbleGemini) {
      $('opt-key-status').textContent = 'Gemini wrapper failed to load. Reload the extension.';
      $('opt-key-status').classList.add('is-error');
      return;
    }
    const res = await window.WebAbleGemini.testKey(key);
    if (res.ok) {
      $('opt-key-status').classList.remove('is-error');
      $('opt-key-status').classList.add('is-set', 'is-set-ok');
      $('opt-key-status').textContent = `✓ Key valid. ${res.models} Gemini model(s) accessible.`;
    } else {
      $('opt-key-status').classList.remove('is-set', 'is-set-ok');
      $('opt-key-status').classList.add('is-error');
      $('opt-key-status').textContent = `✕ ${res.error || 'Key rejected.'}`;
    }
  });
  $('opt-key-clear').addEventListener('click', async () => {
    $('opt-key').value = '';
    await patch({ apiKey: '' });
    $('opt-key-status').classList.remove('is-set', 'is-set-ok', 'is-error');
    $('opt-key-status').textContent = 'No key set.';
  });

  $('opt-reset-all').addEventListener('click', async () => {
    if (!confirm('Wipe ALL WebAble preferences (theme, brand colour, Gemini key, every per-site setting)?\nThis cannot be undone.')) return;
    await chrome.storage.local.remove('webable');
    location.reload();
  });

  // ─── WebAble Pro / Account ─────────────────────────────────
  await renderAccount();

  $('opt-pro-monthly').addEventListener('click', () => startCheckout('monthly'));
  $('opt-pro-annual').addEventListener('click',  () => startCheckout('annual'));
  $('opt-pro-paste-go').addEventListener('click', activateFromPaste);
  $('opt-pro-portal').addEventListener('click',  openPortal);
  $('opt-pro-refresh').addEventListener('click', () => renderAccount(true));
  $('opt-pro-logout').addEventListener('click', signOut);

  async function renderAccount(verify = false) {
    const cur = await chrome.storage.local.get('webable');
    const w = cur.webable || {};
    const pro = w.pro;

    if (!pro || !pro.token) {
      $('opt-pro-active').hidden = true;
      $('opt-pro-signup').hidden = false;
      // Pre-fill backend URL from anything we've stored, or env hint.
      $('opt-pro-backend').value = w.proPrefBackend || '';
      return;
    }

    $('opt-pro-active').hidden = false;
    $('opt-pro-signup').hidden = true;

    // Optionally hit /me to refresh status + usage.
    if (verify && window.WebAbleGemini) {
      const me = await window.WebAbleGemini.proMe();
      if (me.ok) {
        const next = (cur.webable || {});
        next.pro = { ...next.pro, status: me.user.status, plan: me.user.plan };
        next.proUsage = { ...me.usage, at: Date.now() };
        await chrome.storage.local.set({ webable: next });
        applyProState(next.pro, me.usage);
        return;
      } else if (me.status === 401) {
        // Token revoked / expired — wipe local session and re-render.
        delete (cur.webable || {}).pro;
        await chrome.storage.local.set({ webable: cur.webable });
        return renderAccount();
      }
    }

    applyProState(pro, w.proUsage);
  }

  function applyProState(pro, usage) {
    const planLabel = ({ pro_monthly: 'Monthly', pro_annual: 'Annual', free: 'Free' })[pro.plan] || pro.plan || 'Pro';
    $('opt-pro-plan').textContent = planLabel;
    const meta = [];
    if (pro.expiresAt) {
      const d = new Date(pro.expiresAt * 1000);
      meta.push('Token valid until ' + d.toLocaleDateString());
    }
    if (pro.backendUrl) meta.push('via ' + pro.backendUrl.replace(/^https?:\/\//, ''));
    $('opt-pro-meta').textContent = meta.join(' · ') || 'Active subscription';

    const statusEl = $('opt-pro-status');
    statusEl.textContent = pro.status || 'active';
    statusEl.dataset.status = pro.status || 'active';

    if (usage && typeof usage.limit === 'number') {
      $('opt-pro-usage').textContent = `${usage.used ?? usage.count ?? 0} / ${usage.limit}`;
      const pct = Math.min(100, ((usage.used ?? usage.count ?? 0) / usage.limit) * 100);
      const bar = $('opt-pro-usage-bar');
      bar.style.width = pct + '%';
      bar.classList.toggle('is-warn', pct >= 80 && pct < 100);
      bar.classList.toggle('is-over', pct >= 100);
    } else {
      $('opt-pro-usage').textContent = '— / —';
    }
  }

  async function startCheckout(plan) {
    const backendUrl = $('opt-pro-backend').value.trim();
    if (!backendUrl) {
      alert('Enter the backend URL first. For local dev: http://localhost:8787');
      $('opt-pro-backend').focus();
      return;
    }
    // Stash backend URL pref so a return visit can restore it.
    const cur = await chrome.storage.local.get('webable');
    cur.webable = cur.webable || {};
    cur.webable.proPrefBackend = backendUrl;
    await chrome.storage.local.set({ webable: cur.webable });

    try {
      const url = await window.WebAbleGemini.proCheckout({ backendUrl, plan });
      chrome.tabs.create({ url });
    } catch (e) {
      alert('Could not start checkout: ' + e.message);
    }
  }

  async function activateFromPaste() {
    const token = $('opt-pro-paste-token').value.trim();
    const backendUrl = $('opt-pro-backend').value.trim();
    if (!token || !backendUrl) return alert('Paste both the activation token and the backend URL.');
    const cur = await chrome.storage.local.get('webable');
    cur.webable = cur.webable || {};
    cur.webable.pro = { token, backendUrl, status: 'active', activatedAt: Date.now() };
    await chrome.storage.local.set({ webable: cur.webable });
    // Verify it works.
    const me = await window.WebAbleGemini.proMe();
    if (!me.ok) {
      delete cur.webable.pro;
      await chrome.storage.local.set({ webable: cur.webable });
      return alert('Token did not validate: ' + (me.error || 'unknown error'));
    }
    await renderAccount(true);
  }

  async function openPortal() {
    try {
      const url = await window.WebAbleGemini.proPortal();
      chrome.tabs.create({ url });
    } catch (e) {
      alert('Billing portal failed: ' + e.message);
    }
  }

  async function signOut() {
    if (!confirm('Sign out of WebAble Pro? Your subscription stays active in Stripe — this just clears the token from this browser.')) return;
    await window.WebAbleGemini.proLogout();
    await renderAccount();
  }

  // Live-refresh when storage changes (e.g. activation from another tab).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.webable) return;
    renderAccount();
  });

  // Sites table
  renderSites(data.perSite || {});

  $('opt-clear-sites').addEventListener('click', async () => {
    if (!confirm('Clear all per-site memory? Tools currently active will keep running until you reload each tab.')) return;
    await patch({ perSite: {} });
    renderSites({});
  });

  function renderSites(sites) {
    const wrap = $('opt-sites');
    const entries = Object.entries(sites);
    if (!entries.length) {
      wrap.innerHTML = `<div class="opt-sites-empty">No sites remembered yet. Toggle "Always-on for this site" on any page to add one.</div>`;
      return;
    }
    wrap.innerHTML = entries.map(([host, st]) => {
      const tools = st.tools ? Object.keys(st.tools).length : 0;
      const tag = st.disabled ? `<span class="opt-site-tag is-off">Disabled</span>`
                : st.alwaysOn ? `<span class="opt-site-tag is-on">Always-on</span>`
                : `<span class="opt-site-tag">Remembered</span>`;
      return `
        <div class="opt-site-row" data-host="${escapeHtml(host)}">
          <span class="opt-site-host">${escapeHtml(host)}</span>
          ${tag}
          <span class="opt-site-tag mono">${tools} tools</span>
          <button class="opt-site-action" data-action="forget">Forget</button>
        </div>
      `;
    }).join('');
    wrap.querySelectorAll('[data-action=forget]').forEach((b) => {
      b.addEventListener('click', async () => {
        const row = b.closest('.opt-site-row');
        const host = row.dataset.host;
        const cur = await chrome.storage.local.get('webable');
        const w = cur.webable || {};
        if (w.perSite) delete w.perSite[host];
        await chrome.storage.local.set({ webable: w });
        renderSites(w.perSite || {});
      });
    });
  }

  async function patch(partial) {
    const cur = await chrome.storage.local.get('webable');
    const next = Object.assign({}, cur.webable || {}, partial);
    if (partial.ui) next.ui = Object.assign({}, (cur.webable?.ui || {}), partial.ui);
    if (partial.perSite !== undefined) next.perSite = partial.perSite;
    await chrome.storage.local.set({ webable: next });
    Object.assign(data, next);
  }

  function maskKey(k) {
    if (!k) return '';
    if (k.length < 8) return '••••';
    return k.slice(0, 4) + '••••' + k.slice(-4);
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();

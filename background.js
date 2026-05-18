// WebAble service worker — keyboard relay, popup<>content bridging, context menus,
// analyzer launcher, cross-tab highlight messaging.

// ─── Context menus ──────────────────────────────────────────────────
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'webable-alt-text',
      title: 'WebAble: Generate alt text for this image',
      contexts: ['image'],
    });
    chrome.contextMenus.create({
      id: 'webable-ocr',
      title: 'WebAble: Extract text from this image (OCR)',
      contexts: ['image'],
    });
    chrome.contextMenus.create({
      id: 'webable-read-aloud-selection',
      title: 'WebAble: Read selection aloud',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: 'webable-summarize',
      title: 'WebAble: Summarize this page',
      contexts: ['page'],
    });
    chrome.contextMenus.create({
      id: 'webable-analyze',
      title: 'WebAble: Analyze this site for accessibility',
      contexts: ['page'],
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  setupContextMenus();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html?welcome=1') });
  }
});
chrome.runtime.onStartup?.addListener?.(setupContextMenus);

// ─── External activation (WebAble Pro) ──────────────────────────
// The backend's /checkout/success page calls
//   chrome.runtime.sendMessage(EXTENSION_ID, { type: 'WEBABLE_PRO_ACTIVATED', token, expiresAt })
// after Stripe Checkout completes. We persist the JWT so gemini.js can route
// AI calls through the backend instead of using a BYOK key. The list of
// origins allowed to do this lives in manifest.json under externally_connectable.
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'WEBABLE_PRO_ACTIVATED') return;
  if (!msg.token) { sendResponse({ ok: false, error: 'missing token' }); return; }
  const backendUrl = (() => {
    try { return new URL(sender.url).origin; } catch { return ''; }
  })();
  chrome.storage.local.get('webable', ({ webable }) => {
    const data = webable || {};
    data.pro = {
      token: msg.token,
      expiresAt: msg.expiresAt || null,
      backendUrl,
      status: 'active',
      activatedAt: Date.now(),
    };
    chrome.storage.local.set({ webable: data }, () => sendResponse({ ok: true }));
  });
  return true;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  const send = (msg) => chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
  if (info.menuItemId === 'webable-alt-text') return send({ type: 'WEBABLE_AI_ALT_TEXT', srcUrl: info.srcUrl });
  if (info.menuItemId === 'webable-ocr')      return send({ type: 'WEBABLE_AI_OCR',      srcUrl: info.srcUrl });
  if (info.menuItemId === 'webable-read-aloud-selection') return send({ type: 'WEBABLE_READ_ALOUD' });
  if (info.menuItemId === 'webable-summarize') return send({ type: 'WEBABLE_AI_SUMMARIZE_NOW' });
  if (info.menuItemId === 'webable-analyze') {
    chrome.tabs.create({ url: chrome.runtime.getURL('analyzer.html') + '?tabId=' + tab.id + '&url=' + encodeURIComponent(tab.url || '') });
  }
});

// ─── Keyboard commands ──────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const send = (msg) => chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
  if (command === 'toggle-panel')  return send({ type: 'WEBABLE_TOGGLE_PANEL' });
  if (command === 'read-aloud')    return send({ type: 'WEBABLE_READ_ALOUD' });
  if (command === 'pin-tooltip')   return send({ type: 'WEBABLE_PIN_TOOLTIP' });
});

// ─── Message routing ────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'WEBABLE_OPEN_FROM_POPUP') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const id = tabs[0]?.id;
      if (!id) return sendResponse({ ok: false });
      chrome.tabs.sendMessage(id, { type: 'WEBABLE_OPEN_PANEL', tab: msg.tab || 'tools' }, () => sendResponse({ ok: !chrome.runtime.lastError }));
    });
    return true;
  }
  if (msg?.type === 'WEBABLE_OPEN_ANALYZER') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const params = new URLSearchParams();
      if (tab?.id) params.set('tabId', String(tab.id));
      if (tab?.url) params.set('url', tab.url);
      chrome.tabs.create({ url: chrome.runtime.getURL('analyzer.html') + (params.toString() ? '?' + params.toString() : '') });
    });
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === 'WEBABLE_OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }
  // Analyzer asks the source tab for its DOM.
  if (msg?.type === 'WEBABLE_GRAB_PAGE_FOR_ANALYZER') {
    const tabId = msg.tabId;
    const finish = (id) => {
      if (!id) return sendResponse({ ok: false, error: 'No tab id' });
      chrome.scripting.executeScript({
        target: { tabId: id },
        func: () => ({ html: document.documentElement.outerHTML, url: location.href, title: document.title }),
      }).then((res) => sendResponse({ ok: true, ...(res?.[0]?.result || {}) }))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
    };
    if (tabId) finish(tabId);
    else chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => finish(tabs[0]?.id));
    return true;
  }
  // Analyzer asks the source tab to highlight an element by selector path.
  if (msg?.type === 'WEBABLE_HIGHLIGHT_ELEMENT') {
    const tabId = msg.tabId;
    if (!tabId) { sendResponse({ ok: false }); return true; }
    chrome.tabs.update(tabId, { active: true });
    chrome.tabs.sendMessage(tabId, { type: 'WEBABLE_HIGHLIGHT', selector: msg.selector, label: msg.label || '' }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }
});

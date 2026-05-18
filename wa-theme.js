// Shared theme bootstrapper for extension pages (options, analyzer, popup).
// Reads webable.ui.theme from chrome.storage.local on load, applies the
// webable-theme-light / webable-theme-dark class to <html>, and listens for
// changes so the page updates the moment a user picks a different theme.
//
// 'auto' follows prefers-color-scheme.

(() => {
  const html = document.documentElement;

  function effectiveTheme(t) {
    if (t === 'light' || t === 'dark') return t;
    return window.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark';
  }

  function applyBrand(c) {
    ['blue', 'green', 'purple', 'mono'].forEach((b) => html.classList.toggle('webable-brand-' + b, c === b));
  }

  function applyTheme(t) {
    const eff = effectiveTheme(t || 'auto');
    html.classList.toggle('webable-theme-light', eff === 'light');
    html.classList.toggle('webable-theme-dark',  eff === 'dark');
  }

  // Default to dark while we read storage so we never flash bright on dark.
  applyTheme('dark');

  try {
    chrome.storage?.local?.get?.('webable', ({ webable } = {}) => {
      const t = webable?.ui?.theme || 'auto';
      const c = webable?.ui?.brandColor || 'blue';
      applyTheme(t);
      applyBrand(c);
    });

    chrome.storage?.onChanged?.addListener?.((changes, area) => {
      if (area !== 'local') return;
      const next = changes.webable?.newValue;
      if (!next?.ui) return;
      applyTheme(next.ui.theme || 'auto');
      applyBrand(next.ui.brandColor || 'blue');
    });
  } catch (_) {}

  // Auto theme also tracks system preference live.
  window.matchMedia?.('(prefers-color-scheme: light)')?.addEventListener?.('change', () => {
    chrome.storage?.local?.get?.('webable', ({ webable } = {}) => {
      const t = webable?.ui?.theme || 'auto';
      if (t === 'auto') applyTheme('auto');
    });
  });
})();

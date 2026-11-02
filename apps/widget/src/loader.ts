/**
 * WebAble widget loader: the one tag a site owner pastes:
 *
 *   <script src="https://cdn.webable.app/widget.js" async></script>
 *
 * Tiny by design. It only: derives the asset base from its own <script> src,
 * reads `data-webable-*` config (and any pre-set window.WebAbleConfig), stands
 * up a queueing `window.WebAble` so the documented API works before the module
 * lands, then injects the functional `boot.js` module. Idempotent, no globals
 * beyond the documented ones, never throws on the host page.
 *
 * Three things it did not used to do, each of which turned a supported setup
 * into silence:
 *   - The documented `<button onclick="WebAble.open()">` snippet threw, because
 *     `window.WebAble` does not exist until an async module has loaded. Calls
 *     are now queued and replayed.
 *   - A blocked or 404'd boot.js produced no signal at all. It now reports.
 *   - Under a strict CSP the injected module was blocked with no explanation.
 *     The loader's own nonce is copied onto it, and the requirements are
 *     written down in apps/widget/CSP.md.
 */
(function () {
  var W = window as unknown as Record<string, unknown> & {
    __WEBABLE_BOOTSTRAPPED__?: boolean;
    WebAbleConfig?: Record<string, unknown>;
    __WEBABLE_ASSET_BASE__?: string;
    __WEBABLE_QUEUE__?: Array<[string, unknown[]]>;
    WebAble?: Record<string, unknown>;
  };
  if (W.__WEBABLE_BOOTSTRAPPED__) return;
  W.__WEBABLE_BOOTSTRAPPED__ = true;

  var d = document;
  var self =
    (d.currentScript as HTMLScriptElement | null) ||
    (function () {
      var all = d.getElementsByTagName('script');
      for (var i = all.length - 1; i >= 0; i--) {
        // webable.js is the v2 file name. Sites that pasted that snippet still
        // point at it, and the build writes the same loader under both names.
        if (all[i].src && /\/(?:widget|webable)\.js(?:[?#]|$)/.test(all[i].src)) return all[i];
      }
      return null;
    })();

  var src = (self && self.src) || '';
  var base = src.replace(/\/(?:widget|webable)\.js(?:[?#].*)?$/, '') || location.origin;
  // Carry the loader's own query through to boot.js. `widget.js?v=2.6.0` used
  // to bust the cache for the 1.8 KB loader and nothing else, so the bytes that
  // matter kept coming from cache while the site owner believed they had
  // refreshed. This is a cache-bust, not immutable pinning: see CSP.md.
  var query = (/\?[^#]*/.exec(src) || [''])[0];

  function warn(message: string) {
    try {
      // eslint-disable-next-line no-console
      console.error('[WebAble] ' + message);
    } catch {
      /* console is gone; nothing sensible left to do */
    }
  }

  function attr(name: string): string | undefined {
    var v = self ? self.getAttribute(name) : null;
    return v == null ? undefined : v;
  }
  function asBool(v: unknown, dflt: boolean): boolean {
    if (v === undefined || v === null) return dflt;
    return v !== false && v !== 'false' && v !== '0' && v !== 'no';
  }

  var pre = (W.WebAbleConfig && typeof W.WebAbleConfig === 'object' ? W.WebAbleConfig : {}) as Record<
    string,
    unknown
  >;
  // `data-webable-key` / `data-webable-site-id` are deliberately absent. They
  // were read into a `siteId` nothing ever consumed, while the docs called the
  // key the primary attribute, so site owners were pasting an identifier into a
  // field with no reader. There is no account system to identify against.
  var cfg: Record<string, unknown> = {
    name: attr('data-webable-name') || pre.name,
    theme: attr('data-webable-theme') || pre.theme,
    position: attr('data-webable-position') || pre.position,
    color: attr('data-webable-color') || attr('data-webable-accent') || pre.color,
    tools: attr('data-webable-tools') || pre.tools,
    accessibilityUrl: attr('data-webable-statement') || pre.accessibilityUrl,
    profiles: asBool(attr('data-webable-profiles') ?? pre.profiles, true),
    remember: asBool(attr('data-webable-remember') ?? pre.remember, true),
    autoOpen: asBool(attr('data-webable-auto-open') ?? pre.autoOpen, false),
    hideLauncher: asBool(attr('data-webable-hide-launcher') ?? pre.hideLauncher, false),
    attribution: asBool(attr('data-webable-attribution') ?? pre.attribution, true),
    ai: (attr('data-webable-ai') || pre.ai) === 'off' ? 'off' : 'on',
    aiProxy: attr('data-webable-ai-proxy') || pre.aiProxy,
  };
  W.WebAbleConfig = cfg;
  W.__WEBABLE_ASSET_BASE__ = base + '/webable';

  // Queue anything called before boot.js arrives; boot replays it. isOpen()
  // answers false rather than queueing, because a caller needs a value back and
  // nothing is open yet.
  var queue: Array<[string, unknown[]]> = [];
  W.__WEBABLE_QUEUE__ = queue;
  var API = ['open', 'close', 'toggle', 'destroy', 'apply', 'set', 'applyProfile', 'reset'];
  var stub: Record<string, unknown> = {
    __queued: true,
    isOpen: function () {
      return false;
    },
  };
  for (var a = 0; a < API.length; a++) {
    (function (name) {
      stub[name] = function () {
        queue.push([name, Array.prototype.slice.call(arguments)]);
      };
    })(API[a]);
  }
  if (!W.WebAble) W.WebAble = stub;

  if (!('noModule' in d.createElement('script'))) {
    // No ES module support means boot.js will never run. There is no legacy
    // bundle: a second transpiled copy would roughly double the payload for
    // every visitor to serve a browser share this small. Saying so out loud is
    // better than the silence this used to be.
    warn('This browser does not support ES modules, so WebAble cannot load. Needs Chrome/Edge 61+, Firefox 60+, or Safari 11+.');
    return;
  }

  function boot() {
    if (d.querySelector('script[data-webable-boot]')) return;
    var s = d.createElement('script');
    s.type = 'module';
    s.src = base + '/webable/boot.js' + query;
    s.setAttribute('data-webable-boot', '');
    // Under a strict CSP the host page gives its own scripts a nonce. Copy ours
    // onto the module or it is blocked, silently, and the widget is simply
    // missing. Read from the property first: browsers hide the nonce attribute
    // value from script, so getAttribute can come back empty.
    var nonce = (self && ((self as unknown as { nonce?: string }).nonce || self.getAttribute('nonce'))) || '';
    if (nonce) {
      (s as unknown as { nonce: string }).nonce = nonce;
      s.setAttribute('nonce', nonce);
    }
    s.onerror = function () {
      warn(
        'Could not load ' +
          s.src +
          '. Check the URL and the page Content-Security-Policy (script-src must allow it). See apps/widget/CSP.md.',
      );
    };
    (d.head || d.documentElement).appendChild(s);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

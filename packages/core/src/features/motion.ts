/**
 * Motion & distraction. Mostly CSS, plus a couple that must touch live media
 * elements (mute, stop autoplay), those are marked `dynamic` so the engine
 * re-applies them after the page mutates, and they record original state so
 * disable restores it.
 */
import type { FeatureModule, FeatureSetting } from '../types';
import { queryDeep } from '../dom';

export const stopAnimations: FeatureModule = {
  id: 'stopAnimations',
  defaults: { active: false },
  meta: {
    id: 'stopAnimations',
    label: 'Stop animations',
    description: 'Freeze CSS animation, transitions, and autoplaying video.',
    category: 'motion',
    icon: 'stopMotion',
    wcag: ['2.2.2', '2.3.1'],
    keywords: ['motion', 'reduce motion', 'pause', 'gif', 'parallax'],
    dynamic: true,
  },
  apply(_s, ctx) {
    ctx.setFlag('stopanim', true);
    ctx.injectCSS(
      'root',
      `html[data-webable-stopanim] *,html[data-webable-stopanim] *::before,html[data-webable-stopanim] *::after{
        animation-duration:0.001ms !important;
        animation-iteration-count:1 !important;
        animation-delay:0ms !important;
        transition-duration:0.001ms !important;
        scroll-behavior:auto !important;
      }`,
    );
    // Deep: a video player is one of the most likely things on a page to be a
    // web component, and "stop animations" that cannot stop the video is the
    // wrong half of the feature.
    queryDeep<HTMLVideoElement>(ctx.doc, 'video').forEach((v) => {
      try {
        // Record whether it was playing so disable() can restore it; only
        // record once (apply re-runs on mutation), and only pause if playing.
        if (v.getAttribute('data-wa-anim-orig') == null) {
          v.setAttribute('data-wa-anim-orig', v.paused ? '0' : '1');
        }
        if (!v.paused) v.pause();
      } catch {
        /* ignore */
      }
    });
  },
  disable(ctx) {
    queryDeep<HTMLVideoElement>(ctx.doc, '[data-wa-anim-orig]').forEach((v) => {
      try {
        if (v.getAttribute('data-wa-anim-orig') === '1') void v.play();
      } catch {
        /* a paused-by-policy video may reject play(); ignore */
      }
      v.removeAttribute('data-wa-anim-orig');
    });
  },
};

export const hideImages: FeatureModule = {
  id: 'hideImages',
  defaults: { active: false },
  meta: {
    id: 'hideImages',
    label: 'Hide images',
    description: 'Blank out images and background art to cut visual noise.',
    category: 'motion',
    icon: 'hideImages',
    keywords: ['images', 'pictures', 'media', 'declutter'],
  },
  apply(_s, ctx) {
    ctx.setFlag('hideimg', true);
    ctx.injectCSS(
      'root',
      `html[data-webable-hideimg] :where(img,picture,video,svg:not(:where(button *,a *))){
        opacity:0 !important;
      }
      html[data-webable-hideimg] :where(img,picture,video){
        outline:1px dashed rgba(15,23,42,.35) !important;
        outline-offset:-1px;
        background:repeating-linear-gradient(45deg,rgba(15,23,42,.04),rgba(15,23,42,.04) 6px,transparent 6px,transparent 12px) !important;
      }`,
    );
  },
  disable() {},
};

export const muteSounds: FeatureModule = {
  id: 'muteSounds',
  defaults: { active: false },
  meta: {
    id: 'muteSounds',
    label: 'Mute media',
    description: 'Silence audio and video, and stop autoplay from un-muting.',
    category: 'motion',
    icon: 'mute',
    wcag: ['1.4.2'],
    keywords: ['sound', 'audio', 'mute', 'autoplay', 'volume'],
    dynamic: true,
  },
  apply(_s, ctx) {
    // Deep for the same reason as stopAnimations, and doubly so here: `play`
    // is not a composed event, so the capture-phase safety net below never sees
    // media inside a shadow root either.
    const media = queryDeep<HTMLMediaElement>(ctx.doc, 'audio,video');
    media.forEach((m) => {
      if (m.getAttribute('data-wa-muted-orig') == null) {
        m.setAttribute('data-wa-muted-orig', m.muted ? '1' : '0');
      }
      try {
        m.muted = true;
      } catch {
        /* ignore */
      }
    });
    // Catch elements that try to start playing after we ran. Bind once:
    // apply() re-runs on every state change and (dynamic) on every mutation.
    if (!ctx.store.bound) {
      ctx.store.bound = true;
      ctx.on(
        ctx.doc,
        'play',
        (e: Event) => {
          const t = e.target as HTMLMediaElement;
          if (t && 'muted' in t) {
            try {
              t.muted = true;
            } catch {
              /* ignore */
            }
          }
        },
        true,
      );
    }
  },
  disable(ctx) {
    queryDeep<HTMLMediaElement>(ctx.doc, '[data-wa-muted-orig]').forEach((m) => {
      try {
        m.muted = m.getAttribute('data-wa-muted-orig') === '1';
      } catch {
        /* ignore */
      }
      m.removeAttribute('data-wa-muted-orig');
    });
  },
};

export const hideDistractions: FeatureModule = {
  id: 'hideDistractions',
  defaults: { active: false },
  meta: {
    id: 'hideDistractions',
    label: 'Hide distractions',
    description: 'Collapse ads, sidebars, and newsletter/cookie clutter.',
    category: 'motion',
    icon: 'declutter',
    keywords: ['ads', 'sidebar', 'distraction', 'focus', 'clutter', 'adhd'],
  },
  apply(_s, ctx) {
    ctx.setFlag('declutter', true);
    // Conservative, label-driven selectors, avoids nuking primary content.
    ctx.injectCSS(
      'root',
      `html[data-webable-declutter] :where(
        aside,[role="complementary"],
        .advertisement,[class*="-ad-"],[class*="_ad_"],[id*="-ad-"],
        [class*="advert"],[id*="advert"],
        [class*="newsletter"],[id*="newsletter"],
        [class*="cookie-banner"],[class*="cookie-consent"],[id*="cookie"],
        [aria-label*="advertisement" i]
      ){display:none !important}`,
    );
  },
  disable() {},
};

interface TargetSetting extends FeatureSetting {
  active: boolean;
  size: number;
}

export const clickTargets: FeatureModule<TargetSetting> = {
  id: 'clickTargets',
  defaults: { active: false, size: 44 },
  meta: {
    id: 'clickTargets',
    label: 'Bigger click targets',
    description: 'Pad buttons and controls to a comfortable minimum tap size.',
    category: 'motion',
    icon: 'target',
    wcag: ['2.5.5', '2.5.8'],
    keywords: ['tap target', 'buttons', 'motor', 'hit area'],
    controls: [
      { key: 'size', type: 'slider', label: 'Minimum', min: 36, max: 64, step: 4, unit: 'px', format: (v) => `${v}px` },
    ],
  },
  apply(s, ctx) {
    ctx.setFlag('targets', true);
    ctx.setVar('target', `${s.size || 44}px`);
    ctx.injectCSS(
      'root',
      `html[data-webable-targets] :where(button,[role="button"],input[type="checkbox"],input[type="radio"],input[type="submit"],input[type="button"],summary){
        min-width:var(--wa-target,44px) !important;
        min-height:var(--wa-target,44px) !important;
      }
      html[data-webable-targets] :where(a[href],button,[role="button"]){
        position:relative;
      }
      html[data-webable-targets] :where(a[href]){
        padding:2px 3px;
      }`,
    );
  },
  disable() {},
};

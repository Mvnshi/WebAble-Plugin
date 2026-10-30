/**
 * Content & reading, typography features. All are pure CSS so they revert by
 * removing the injected <style> (the engine's context cleanup handles it).
 * Text-bearing selectors are listed once and reused.
 */
import type { FeatureModule, FeatureSetting } from '../types';
import { assetUrl } from '../config';

/** Broad but not reckless set of text-bearing elements. */
const TEXT = ':where(p,li,a,span,h1,h2,h3,h4,h5,h6,td,th,blockquote,label,small,strong,em,b,i,figcaption,dd,dt,button,input,textarea,select)';

const READABLE_STACK =
  "'Atkinson Hyperlegible','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

interface FontSizeSetting extends FeatureSetting {
  active: boolean;
  /** Percent of base size, 100–200. */
  value: number;
}

export const fontSize: FeatureModule<FontSizeSetting> = {
  id: 'fontSize',
  defaults: { active: false, value: 120 },
  meta: {
    id: 'fontSize',
    label: 'Text size',
    description: 'Scale text up in steps. Layout reflows; nothing is clipped.',
    category: 'reading',
    icon: 'textSize',
    wcag: ['1.4.4'],
    keywords: ['font', 'bigger', 'larger', 'zoom text', 'enlarge'],
    controls: [
      {
        key: 'value',
        type: 'slider',
        label: 'Scale',
        min: 100,
        max: 300,
        step: 10,
        unit: '%',
        format: (v) => `${v}%`,
      },
    ],
  },
  apply(s, ctx) {
    ctx.setFlag('fontsize', true);
    ctx.setVar('fontsize', (s.value || 100) / 100);
    // Scales rem/em-based sites (Tailwind, Bootstrap, most modern CSS).
    ctx.injectCSS('root', 'html[data-webable-fontsize]{font-size:calc(100% * var(--wa-fontsize,1)) !important}');
  },
  disable() {},
};

interface ReadableFontSetting extends FeatureSetting {
  active: boolean;
}

export const readableFont: FeatureModule<ReadableFontSetting> = {
  id: 'readableFont',
  defaults: { active: false },
  meta: {
    id: 'readableFont',
    label: 'Readable font',
    description: 'Swap every typeface for a clean, legible sans-serif.',
    category: 'reading',
    icon: 'readableFont',
    wcag: ['1.4.8'],
    keywords: ['legible', 'sans', 'clear font'],
  },
  apply(_s, ctx) {
    ctx.setFlag('readable', true);
    ctx.injectCSS(
      'root',
      `html[data-webable-readable] ${TEXT}{font-family:${READABLE_STACK} !important}`,
    );
  },
  disable() {},
};

interface DyslexiaFontSetting extends FeatureSetting {
  active: boolean;
  /** opendyslexic | lexend | atkinson */
  font: string;
}

const DYS_STACKS: Record<string, string> = {
  opendyslexic: "'OpenDyslexic','Comic Sans MS','Lexend',cursive",
  lexend: "'Lexend','Atkinson Hyperlegible',sans-serif",
  atkinson: "'Atkinson Hyperlegible','Verdana',sans-serif",
};

export const dyslexiaFont: FeatureModule<DyslexiaFontSetting> = {
  id: 'dyslexiaFont',
  defaults: { active: false, font: 'opendyslexic' },
  meta: {
    id: 'dyslexiaFont',
    label: 'Dyslexia font',
    description: 'OpenDyslexic, Lexend, or Atkinson Hyperlegible across the page.',
    category: 'reading',
    icon: 'dyslexiaFont',
    wcag: ['1.4.8'],
    keywords: ['dyslexia', 'opendyslexic', 'lexend', 'atkinson'],
    controls: [
      {
        key: 'font',
        type: 'segmented',
        label: 'Typeface',
        options: [
          { value: 'opendyslexic', label: 'OpenDyslexic' },
          { value: 'lexend', label: 'Lexend' },
          { value: 'atkinson', label: 'Atkinson' },
        ],
      },
    ],
  },
  apply(s, ctx) {
    ctx.setFlag('dyslexia', true);
    const stack = DYS_STACKS[s.font] || DYS_STACKS.opendyslexic;
    // @font-face for OpenDyslexic, served from the widget origin. If the file
    // is absent the stack falls back to Comic Sans, so the swap is still visible.
    const face =
      s.font === 'opendyslexic'
        ? `@font-face{font-family:'OpenDyslexic';font-display:swap;src:url('${assetUrl(
            'fonts/OpenDyslexic-Regular.woff2',
          )}') format('woff2')}`
        : '';
    ctx.injectCSS(
      'root',
      `${face}\nhtml[data-webable-dyslexia] ${TEXT}{font-family:${stack} !important}`,
    );
  },
  disable() {},
};

interface SpacingSetting extends FeatureSetting {
  active: boolean;
  line: number;
  letter: number;
  word: number;
}

export const textSpacing: FeatureModule<SpacingSetting> = {
  id: 'textSpacing',
  defaults: { active: false, line: 1.6, letter: 0.05, word: 0.12 },
  meta: {
    id: 'textSpacing',
    label: 'Text spacing',
    description: 'Loosen line height, letter, and word spacing independently.',
    category: 'reading',
    icon: 'textSpacing',
    wcag: ['1.4.12'],
    keywords: ['line height', 'letter spacing', 'word spacing', 'leading', 'tracking'],
    controls: [
      { key: 'line', type: 'slider', label: 'Line height', min: 1, max: 2.5, step: 0.1, format: (v) => `${v}` },
      { key: 'letter', type: 'slider', label: 'Letter spacing', min: 0, max: 0.3, step: 0.01, unit: 'em', format: (v) => `${v}em` },
      { key: 'word', type: 'slider', label: 'Word spacing', min: 0, max: 0.5, step: 0.02, unit: 'em', format: (v) => `${v}em` },
    ],
  },
  apply(s, ctx) {
    ctx.setFlag('spacing', true);
    ctx.setVar('lh', s.line);
    ctx.setVar('ls', `${s.letter}em`);
    ctx.setVar('ws', `${s.word}em`);
    ctx.injectCSS(
      'root',
      `html[data-webable-spacing] ${TEXT}{line-height:var(--wa-lh) !important;letter-spacing:var(--wa-ls) !important;word-spacing:var(--wa-ws) !important}`,
    );
  },
  disable() {},
};

interface AlignSetting extends FeatureSetting {
  active: boolean;
  /** left | center | right | justify */
  align: string;
}

export const textAlign: FeatureModule<AlignSetting> = {
  id: 'textAlign',
  defaults: { active: false, align: 'left' },
  meta: {
    id: 'textAlign',
    label: 'Text alignment',
    description: 'Force a consistent alignment on body text.',
    category: 'reading',
    icon: 'textAlign',
    keywords: ['justify', 'center', 'left align', 'right align'],
    controls: [
      {
        key: 'align',
        type: 'segmented',
        label: 'Align',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
          { value: 'justify', label: 'Justify' },
        ],
      },
    ],
  },
  apply(s, ctx) {
    ctx.setFlag('align', true);
    ctx.setVar('align', s.align || 'left');
    ctx.injectCSS(
      'root',
      'html[data-webable-align] :where(p,li,h1,h2,h3,h4,h5,h6,blockquote,td,dd){text-align:var(--wa-align) !important}',
    );
  },
  disable() {},
};

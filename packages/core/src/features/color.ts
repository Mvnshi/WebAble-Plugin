/**
 * Color & contrast. The page-altering ones (invert, contrast, saturation) work
 * by composing a CSS `filter` on <body> through custom properties declared in
 * the engine's base stylesheet. Each feature owns a DIFFERENT property/flag, so
 * they stack cleanly and their cleanups never collide. The widget's own panel
 * lives on <html> (a sibling of <body>), so it is never tinted by these.
 */
import type { FeatureModule, FeatureSetting } from '../types';

export const darkMode: FeatureModule = {
  id: 'darkMode',
  defaults: { active: false },
  meta: {
    id: 'darkMode',
    label: 'Dark mode',
    description: 'Turn any light site dark, with tuned colors and dark controls.',
    category: 'color',
    icon: 'moon',
    wcag: ['1.4.8'],
    keywords: ['dark mode', 'night mode', 'dark theme', 'dark', 'lights off'],
  },
  apply(_s, ctx) {
    // Tuned invert (keeps hue, softens the harshness of a raw invert), media
    // flipped back, native controls + scrollbars darkened, and a dark backdrop
    // behind transparent areas.
    ctx.setVar('f-dark', 'invert(0.92) hue-rotate(180deg) contrast(0.95) brightness(1.05)');
    ctx.setFlag('reinvert-dark', true);
    ctx.setFlag('dark', true);
    // The backdrop and color-scheme are set on <html>, which is outside the
    // filter on <body>, so in the top document they are seen as authored. In a
    // sub-frame nothing is outside the filter: the parent paints over the whole
    // frame, so a #0e1116 backdrop would be inverted to near-white and dark
    // form controls would come back light. The frame's own background gets
    // darkened by the parent's filter like everything else, which is the
    // result this rule is reaching for anyway.
    if (!ctx.framed) {
      ctx.injectCSS('root', `html[data-webable-dark]{color-scheme:dark;background:#0e1116 !important}`);
    }
  },
  disable() {},
};

export const invertColors: FeatureModule = {
  id: 'invertColors',
  defaults: { active: false },
  meta: {
    id: 'invertColors',
    label: 'Invert / dark',
    description: 'Flip the page to a dark negative. Images are flipped back.',
    category: 'color',
    icon: 'invert',
    wcag: ['1.4.3'],
    keywords: ['invert', 'dark mode', 'negative', 'dark contrast'],
  },
  apply(_s, ctx) {
    ctx.setVar('f-invert', 'invert(1) hue-rotate(180deg)');
    ctx.setFlag('reinvert', true);
  },
  disable() {},
};

interface ContrastSetting extends FeatureSetting {
  active: boolean;
  level: number;
}

export const highContrast: FeatureModule<ContrastSetting> = {
  id: 'highContrast',
  defaults: { active: false, level: 1.35 },
  meta: {
    id: 'highContrast',
    label: 'High contrast',
    description: 'Push contrast so faint, low-contrast text becomes readable.',
    category: 'color',
    icon: 'contrast',
    wcag: ['1.4.3', '1.4.6'],
    keywords: ['contrast', 'bold colors'],
    controls: [
      { key: 'level', type: 'slider', label: 'Strength', min: 1.1, max: 1.8, step: 0.05, format: (v) => `${Math.round((v as number) * 100)}%` },
    ],
  },
  apply(s, ctx) {
    ctx.setVar('f-contrast', `contrast(${s.level || 1.35})`);
  },
  disable() {},
};

interface SaturationSetting extends FeatureSetting {
  active: boolean;
  /** grayscale | low | high */
  mode: string;
}

export const saturation: FeatureModule<SaturationSetting> = {
  id: 'saturation',
  defaults: { active: false, mode: 'grayscale' },
  meta: {
    id: 'saturation',
    label: 'Saturation',
    description: 'Grayscale, or dial color intensity down or up.',
    category: 'color',
    icon: 'saturation',
    wcag: ['1.4.1'],
    keywords: ['grayscale', 'monochrome', 'desaturate', 'color intensity', 'seizure'],
    controls: [
      {
        key: 'mode',
        type: 'segmented',
        label: 'Mode',
        options: [
          { value: 'grayscale', label: 'Mono' },
          { value: 'low', label: 'Low' },
          { value: 'high', label: 'High' },
        ],
      },
    ],
  },
  apply(s, ctx) {
    // Single feature owns both props; clear whichever is not in use.
    if (s.mode === 'grayscale') {
      ctx.setVar('f-grayscale', 'grayscale(1)');
      ctx.setVar('f-saturate', null);
    } else {
      ctx.setVar('f-grayscale', null);
      ctx.setVar('f-saturate', `saturate(${s.mode === 'high' ? 1.7 : 0.45})`);
    }
  },
  disable() {},
};

interface ColorFilterSetting extends FeatureSetting {
  active: boolean;
  /** deuteranopia | protanopia | tritanopia | achromatopsia */
  mode: string;
  /** correct (shift colors to help) | simulate (preview the deficiency) */
  purpose: string;
}

// Daltonization matrices ported from the legacy extension (content.css).
// Encoded as inline SVG feColorMatrix filters composed through --wa-f-cvd.
const CVD_MATRICES: Record<string, string> = {
  deuteranopia: '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
  protanopia: '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
  tritanopia: '0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0',
};

function cvdFilterValue(mode: string, purpose: string): string {
  if (mode === 'achromatopsia') {
    return purpose === 'correct' ? 'grayscale(1) contrast(1.2)' : 'grayscale(1)';
  }
  const matrix = CVD_MATRICES[mode] || CVD_MATRICES.deuteranopia;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><filter id="f"><feColorMatrix values="${matrix}"/></filter></svg>`;
  return `url('data:image/svg+xml;utf8,${svg}#f')`;
}

export const colorFilter: FeatureModule<ColorFilterSetting> = {
  id: 'colorFilter',
  defaults: { active: false, mode: 'deuteranopia', purpose: 'correct' },
  meta: {
    id: 'colorFilter',
    label: 'Color blindness filter',
    description: 'Shift colors for red-green or blue-yellow color vision deficiency.',
    category: 'color',
    icon: 'saturation',
    wcag: ['1.4.1'],
    keywords: ['color blind', 'deuteranopia', 'protanopia', 'tritanopia', 'achromatopsia', 'daltonize', 'cvd'],
    controls: [
      {
        key: 'mode',
        type: 'select',
        label: 'Type',
        options: [
          { value: 'deuteranopia', label: 'Deuteranopia (red-green)' },
          { value: 'protanopia', label: 'Protanopia (red-green)' },
          { value: 'tritanopia', label: 'Tritanopia (blue-yellow)' },
          { value: 'achromatopsia', label: 'Achromatopsia (no color)' },
        ],
      },
      {
        key: 'purpose',
        type: 'segmented',
        label: 'Purpose',
        options: [
          { value: 'correct', label: 'Assist' },
          { value: 'simulate', label: 'Simulate' },
        ],
      },
    ],
  },
  apply(s, ctx) {
    ctx.setVar('f-cvd', cvdFilterValue(s.mode, s.purpose));
  },
  disable() {},
};

interface CustomColorSetting extends FeatureSetting {
  active: boolean;
  /** hex or "auto" (leave the page's own color). */
  text: string;
  heading: string;
  bg: string;
}

export const customColors: FeatureModule<CustomColorSetting> = {
  id: 'customColors',
  defaults: { active: false, text: 'auto', heading: 'auto', bg: 'auto' },
  meta: {
    id: 'customColors',
    label: 'Custom colors',
    description: 'Pick your own text, heading, and background colors.',
    category: 'color',
    icon: 'customColors',
    wcag: ['1.4.3', '1.4.8'],
    keywords: ['color picker', 'background', 'text color', 'tint'],
    controls: [
      { key: 'bg', type: 'color', label: 'Background' },
      { key: 'text', type: 'color', label: 'Body text' },
      { key: 'heading', type: 'color', label: 'Headings' },
    ],
  },
  apply(s, ctx) {
    ctx.setFlag('colors', true);
    const rules: string[] = [];
    if (s.bg && s.bg !== 'auto') {
      rules.push(
        `html[data-webable-colors] body,html[data-webable-colors] body :where(div,section,article,main,header,footer,aside,nav){background-color:${s.bg} !important;background-image:none !important}`,
      );
    }
    if (s.text && s.text !== 'auto') {
      rules.push(
        `html[data-webable-colors] body :where(p,li,span,a,td,th,label,small,strong,em,div){color:${s.text} !important}`,
      );
    }
    if (s.heading && s.heading !== 'auto') {
      rules.push(`html[data-webable-colors] :where(h1,h2,h3,h4,h5,h6){color:${s.heading} !important}`);
    }
    ctx.injectCSS('root', rules.join('\n'));
  },
  disable() {},
};

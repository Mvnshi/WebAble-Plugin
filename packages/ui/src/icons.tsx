/**
 * Icon set: compact line glyphs drawn on a 24×24 grid, stroked with
 * currentColor. Intentionally avoids the accessibility-widget clichés
 * (wheelchair, eyeball, globe, brain, sparkles, checkmark). The launcher uses
 * the universal access mark; everything else is a plain, legible glyph.
 */
import type { JSX } from 'preact';

type Paths = JSX.Element;

const S = (children: Paths, fill = false): ((size: number) => JSX.Element) => {
  return (size: number) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
};

export const ICONS: Record<string, (size: number) => JSX.Element> = {
  // Launcher: universal access mark.
  access: (size) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="4.2" r="1.9" fill="currentColor" />
      <path
        d="M4.5 8.2c2.4.9 5 1.3 7.5 1.3s5.1-.4 7.5-1.3"
        stroke="currentColor"
        stroke-width="1.9"
        stroke-linecap="round"
      />
      <path
        d="M12 9.5v5m0 0-2.6 5.3M12 14.5l2.6 5.3"
        stroke="currentColor"
        stroke-width="1.9"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  ),

  textSize: S(<><path d="M4 7V5h11v2M9.5 5v14M7.5 19h4" /><path d="M15 12v-1.5h6V12M18 10.5V19M16.7 19h2.6" /></>),
  readableFont: S(<><path d="M5 19 10 5l5 14M6.6 14.5h6.8" /><path d="M18 9v10M16.7 19h2.6" /></>),
  dyslexiaFont: S(<><path d="M5 6h9a3 3 0 0 1 0 6H5zM5 12h10a3 3 0 0 1 0 6H5zM5 6v12" /></>),
  textSpacing: S(<><path d="M3 5h18M3 19h18M8 9l4-3 4 3M8 15l4 3 4-3" /></>),
  textAlign: S(<><path d="M4 6h16M4 10h10M4 14h16M4 18h10" /></>),
  highlightLinks: S(<><path d="M9 12a3 3 0 0 1 3-3h3a3 3 0 0 1 0 6h-1.5" /><path d="M15 12a3 3 0 0 1-3 3H9a3 3 0 0 1 0-6h1.5" /></>),
  highlightHeadings: S(<><path d="M5 6v12M5 12h7M12 6v12" /><rect x="15" y="7" width="5" height="10" rx="1" /></>),
  readingGuide: S(<><path d="M3 12h18" /><path d="M7 8.5 5 12l2 3.5M17 8.5l2 3.5-2 3.5" /></>),
  readingMask: S(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 14h18" stroke-dasharray="2 2" /></>),
  magnifier: S(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.5-4.5M8 10.5h5M10.5 8v5" /></>),

  invert: S(<><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor" stroke="none" /></>),
  contrast: S(<><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17" /><path d="M12 6.5a5.5 5.5 0 0 1 0 11Z" fill="currentColor" stroke="none" /></>),
  saturation: S(<><path d="M12 3.5c4 4.5 6 7.5 6 10.2A6 6 0 0 1 6 13.7c0-2.7 2-5.7 6-10.2Z" /></>),
  customColors: S(<><path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 2-2 0-1.4-1-1.8-1-3 0-.8.7-1.5 1.7-1.5H17a3.5 3.5 0 0 0 3.5-3.5c0-3.6-3.8-6.5-8.5-6.5Z" /><circle cx="8.5" cy="11" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="15.5" cy="10" r="1" fill="currentColor" stroke="none" /></>),

  stopMotion: S(<><circle cx="12" cy="12" r="8.5" /><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" stroke="none" /></>),
  hideImages: S(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 18 5-5 3 3M4 5l16 14" /><circle cx="9" cy="9.5" r="1.4" /></>),
  declutter: S(<><path d="M4 6h16M4 12h10M4 18h6" /><path d="m15 14 5 5M20 14l-5 5" /></>),
  target: S(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>),
  cursor: S(<><path d="M5 3.5 18.5 11l-6 1.4L9 18.5Z" fill="currentColor" stroke="currentColor" /></>),
  highlightFocus: S(<><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M3 8V4h4M21 8V4h-4M3 16v4h4M21 16v4h-4" /></>),

  mute: S(<><path d="M4 9v6h4l5 4V5L8 9Z" /><path d="m16 9 5 6M21 9l-5 6" /></>),
  volume: S(<><path d="M4 9v6h4l5 4V5L8 9Z" /><path d="M16 8.5a5 5 0 0 1 0 7" /></>),

  // Profile + meta glyphs
  shield: S(<><path d="M12 3.5 19 6v5c0 4.4-3 7.6-7 9.5-4-1.9-7-5.1-7-9.5V6Z" /></>),
  lowVision: S(<><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" /><circle cx="12" cy="12" r="2.5" /></>),
  pin: S(<><path d="M9 4h6M12 4v7M8.5 11h7l1.5 4H7l1.5-4ZM12 15v5" /></>),
  focusMode: S(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></>),

  search: S(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.8-3.8" /></>),
  close: S(<><path d="M6 6l12 12M18 6 6 18" /></>),
  reset: S(<><path d="M4 12a8 8 0 1 1 2.5 5.8M4 18v-4h4" /></>),
  settings: S(<><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>),
  key: S(<><circle cx="8" cy="12" r="4" /><path d="M11.5 12H21l-2 2.5M16 12v3" /></>),
  play: S(<><path d="M7 5v14l11-7Z" fill="currentColor" stroke="currentColor" /></>),
  pause: S(<><rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" /></>),
  stop: S(<><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" /></>),
  sun: S(<><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></>),
  moon: S(<><path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z" /></>),
  doc: S(<><path d="M6 3h8l4 4v14H6Z" /><path d="M14 3v4h4M9 13h6M9 17h6" /></>),
  link: S(<><path d="M10 14a4 4 0 0 1 0-5.6l2.4-2.4a4 4 0 0 1 5.6 5.6L16 13" /><path d="M14 10a4 4 0 0 1 0 5.6L11.6 18a4 4 0 0 1-5.6-5.6L8 11" /></>),

  // Power tools
  cookie: S(<><path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5 3 3 0 0 1-3-3 3 3 0 0 1-3-3 8.5 8.5 0 0 0-2.5-2.5Z" /><circle cx="9.5" cy="12" r=".9" fill="currentColor" stroke="none" /><circle cx="13.5" cy="9.5" r=".9" fill="currentColor" stroke="none" /><circle cx="14" cy="14.5" r=".9" fill="currentColor" stroke="none" /></>),
  popup: S(<><rect x="3" y="4.5" width="18" height="15" rx="2" /><path d="M3 8.5h18" /><path d="M9.5 13l5 3.5M14.5 13l-5 3.5" /></>),
  sticky: S(<><path d="M14.5 3.5 20.5 9.5M16 8l-7 2-4.5 4.5 9 9L18 19l2-7Z" /><path d="m9 15-5 5" /></>),
  unlock: S(<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 7.4-2.1" /><circle cx="12" cy="15.5" r="1.3" fill="currentColor" stroke="none" /></>),
  zoom: S(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.5-4.5M10.5 8v5M8 10.5h5" /></>),
  gauge: S(<><path d="M4.5 16.5a8 8 0 1 1 15 0" /><path d="M12 14.5 16 9" /><circle cx="12" cy="14.5" r="1.4" fill="currentColor" stroke="none" /></>),
  scroll: S(<><path d="M12 3v13" /><path d="m7 11 5 5 5-5" /><path d="M6 20h12" /></>),
  reader: S(<><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M7.5 9h6M7.5 12h9M7.5 15h9" /></>),
  pip: S(<><rect x="3" y="5" width="18" height="14" rx="2" /><rect x="12.5" y="11.5" width="6" height="5" rx="1" fill="currentColor" stroke="none" /></>),
  expand: S(<><path d="M8 4h8M8 20h8" /><path d="m9 8 3-3 3 3M9 16l3 3 3-3" /></>),
  grid: S(<><rect x="4" y="4" width="7" height="7" rx="1.6" /><rect x="13" y="4" width="7" height="7" rx="1.6" /><rect x="4" y="13" width="7" height="7" rx="1.6" /><rect x="13" y="13" width="7" height="7" rx="1.6" /></>),
  bolt: S(<><path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z" /></>),
  copy: S(<><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M5.5 15.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h9A1.5 1.5 0 0 1 15.5 5v.5" /></>),
  wrench: S(<><path d="M14.5 6.5a3.8 3.8 0 0 1-5 5L5 16v3h3l4.5-4.5a3.8 3.8 0 0 0 5-5l-2.3 2.3-2.5-.6-.6-2.5Z" /></>),
  flag: S(<><path d="M6 21V4M6 4h11l-2 3.5L17 11H6" /></>),
  glass: S(<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 10h16M9 4v16" stroke-opacity=".55" /></>),
  trap: S(<><path d="M12 3 19 6v5c0 4.4-3 7.6-7 9.5-4-1.9-7-5.1-7-9.5V6Z" /><path d="M12 8v4M12 15h.01" /></>),
  guide: S(<><path d="M5 3 11.5 19l2-6.4L20 10.5 5 3Z" fill="currentColor" stroke="currentColor" stroke-linejoin="round" /></>),
  mic: S(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></>),
};

export function Icon({ name, size = 18 }: { name: string; size?: number }): JSX.Element {
  const fn = ICONS[name] || ICONS.settings;
  return fn(size);
}

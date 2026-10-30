/**
 * Glyphs the command bar needs that the panel's set does not have. Same grid,
 * same stroke, same rule as packages/ui/src/icons.tsx: plain and legible, no
 * accessibility clichés. Anything not here falls back to the panel's set, so a
 * tool's icon in the bar is always the icon it has in the panel.
 */
import type { JSX } from 'preact';
import { Icon as PanelIcon, BrandGlyph } from '@webable/ui';

const svg = (size: number, children: JSX.Element) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const OWN: Record<string, (size: number) => JSX.Element> = {
  pointer: (s) => svg(s, <><path d="M8 3l11 8-5 1.4L16.6 18l-2.4 1.1-2.6-5.6L8 17z" /><path d="M3 7h2M4.5 2.8l1.4 1.4M9 1.5v2" /></>),
  compass: (s) => svg(s, <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>),
  arrowUp: (s) => svg(s, <><path d="M12 19V5M6 11l6-6 6 6" /></>),
  arrowDown: (s) => svg(s, <><path d="M12 5v14M6 13l6 6 6-6" /></>),
  wand: (s) => svg(s, <><path d="M4 20L15 9M14 4v2M19 9h2M17.5 5.5l1.5-1.5M18 13l1 1M10 4l1 1" /></>),
  panel: (s) => svg(s, <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M14 4v16" /></>),
  power: (s) => svg(s, <><path d="M12 3v8" /><path d="M6.3 7.2a8 8 0 1 0 11.4 0" /></>),
  gear: (s) => svg(s, <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>),
  help: (s) => svg(s, <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.4-2.5 2.4M12 16.5h.01" /></>),
  heading: (s) => svg(s, <><path d="M6 4v16M18 4v16M6 12h12" /></>),
  speaker: (s) => svg(s, <><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></>),
  sparkle: (s) => svg(s, <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" /></>),
  enter: (s) => svg(s, <><path d="M20 5v7a3 3 0 0 1-3 3H6" /><path d="M10 11l-4 4 4 4" /></>),
  // The real brand mark, the same one the launcher wears, so the bar reads as
  // part of the same product rather than a lookalike.
  logo: (s) => (
    <span style={{ display: 'grid', placeItems: 'center', width: `${s}px`, height: `${s}px`, borderRadius: `${Math.round(s * 0.3)}px`, background: '#0a1324' }}>
      <BrandGlyph size={Math.round(s * 0.82)} />
    </span>
  ),
};

export function Glyph({ name, size = 18 }: { name: string; size?: number }): JSX.Element {
  const own = OWN[name];
  return own ? own(size) : <PanelIcon name={name} size={size} />;
}

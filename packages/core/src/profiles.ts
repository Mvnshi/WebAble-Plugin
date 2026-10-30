/**
 * One-click profiles. Each bundles a handful of feature settings tuned by, and
 * for, people who rely on them. Applying a profile merges these over defaults;
 * the user can still fine-tune any individual tool afterward.
 *
 * These are adaptive presets, not a compliance guarantee. The WCAG references
 * note which success criteria each profile *helps* a user satisfy.
 *
 * No profile may turn on a behaviour that acts on the user's behalf. The
 * privacy profile used to enable the cookie banner auto-reject, which meant
 * one click silently opted the user into a regex answering consent dialogs.
 */
import type { Profile } from './types';

export const PROFILES: ReadonlyArray<Profile> = [
  {
    id: 'seizure',
    label: 'Seizure safe',
    description: 'Kills motion and damps intense color to reduce trigger risk.',
    icon: 'shield',
    wcag: ['2.3.1', '2.2.2'],
    apply: {
      stopAnimations: { active: true },
      saturation: { active: true, mode: 'low' },
    },
  },
  {
    id: 'vision',
    label: 'Vision impaired',
    description: 'Larger text, stronger contrast, a big cursor, and clear focus.',
    icon: 'lowVision',
    wcag: ['1.4.4', '1.4.3', '2.4.7'],
    apply: {
      fontSize: { active: true, value: 160 },
      highContrast: { active: true, level: 1.4 },
      bigCursor: { active: true, size: 56 },
      highlightFocus: { active: true, width: 3 },
    },
  },
  {
    id: 'adhd',
    label: 'ADHD friendly',
    description: 'A reading mask, fewer distractions, and no motion.',
    icon: 'focusMode',
    wcag: ['2.2.2', '1.4.8'],
    apply: {
      readingMask: { active: true, band: 140, dim: 0.6 },
      hideDistractions: { active: true },
      stopAnimations: { active: true },
    },
  },
  {
    id: 'dyslexia',
    label: 'Cognitive / dyslexia',
    description: 'Lexend type, looser spacing, and a reading guide.',
    icon: 'dyslexiaFont',
    wcag: ['1.4.8', '1.4.12'],
    apply: {
      dyslexiaFont: { active: true, font: 'lexend' },
      textSpacing: { active: true, line: 1.9, letter: 0.08, word: 0.16 },
      readingGuide: { active: true, thickness: 6 },
    },
  },
  {
    id: 'motor',
    label: 'Keyboard / motor',
    description: 'Big targets, a big cursor, and an unmissable focus ring.',
    icon: 'target',
    wcag: ['2.5.5', '2.4.7', '2.5.8'],
    apply: {
      clickTargets: { active: true, size: 48 },
      bigCursor: { active: true, size: 56 },
      highlightFocus: { active: true, width: 4 },
    },
  },
  {
    id: 'senior',
    label: 'Senior friendly',
    description: 'Comfortably larger text, bigger targets, and clear focus.',
    icon: 'textSize',
    wcag: ['1.4.4', '2.5.5', '2.4.7'],
    apply: {
      fontSize: { active: true, value: 130 },
      clickTargets: { active: true, size: 48 },
      highlightFocus: { active: true, width: 3 },
    },
  },
  {
    id: 'privacy',
    label: 'Privacy first',
    description: 'Hides cookie banners, popups, and chat bubbles. It does not answer consent for you.',
    icon: 'shield',
    apply: {
      cookieKill: { active: true },
      popupKill: { active: true },
      stickyKill: { active: true },
    },
  },
  {
    id: 'screenReader',
    label: 'Screen-reader assist',
    description: 'Clarifies structure and links; pairs with Read Aloud.',
    icon: 'volume',
    wcag: ['1.3.1', '2.4.6', '2.4.4'],
    apply: {
      readableFont: { active: true },
      highlightHeadings: { active: true },
      highlightLinks: { active: true },
      highlightFocus: { active: true, width: 3 },
    },
  },
];

export const PROFILE_MAP: ReadonlyMap<string, Profile> = new Map(PROFILES.map((p) => [p.id, p]));

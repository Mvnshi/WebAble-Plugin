/**
 * Feature registry. The single source of truth for which tools exist and in
 * what order they render. Both surfaces and the UI import from here, add a
 * feature once and it appears everywhere.
 */
import type { FeatureModule } from '../types';
import { fontSize, readableFont, dyslexiaFont, textSpacing, textAlign } from './text';
import { highlightLinks, highlightHeadings, highlightFocus } from './highlight';
import { darkMode, invertColors, highContrast, saturation, customColors, colorFilter } from './color';
import { stopAnimations, hideImages, muteSounds, hideDistractions, clickTargets } from './motion';
import { bigCursor, readingGuide, readingMask, magnifier } from './cursor';
import { focusMode } from './focus';
import { tooltipPin } from './tooltip';
import { readerMode } from './reader';
import {
  cookieKill,
  popupKill,
  stickyKill,
  copyUnlock,
  forceZoom,
  mediaSpeed,
  autoScroll,
  pictureInPicture,
  expandCollapse,
  volumeBoost,
} from './power';
import { wallBreaker, feedOff, nagMute } from './declutter';
import { bionicFlow } from './bionic';
import { selectionBubble, clickDictionary, tldrPin } from './aiTools';

/** Display order = registry order, grouped by category. */
export const FEATURES: ReadonlyArray<FeatureModule> = [
  // Content & reading
  readerMode,
  fontSize,
  readableFont,
  dyslexiaFont,
  bionicFlow,
  textSpacing,
  textAlign,
  highlightLinks,
  highlightHeadings,
  readingGuide,
  readingMask,
  focusMode,
  magnifier,
  // Reading-aid AI tools (in-page popovers)
  selectionBubble,
  clickDictionary,
  tldrPin,
  // Color & contrast
  darkMode,
  invertColors,
  highContrast,
  saturation,
  colorFilter,
  customColors,
  // Motion & distraction
  stopAnimations,
  hideImages,
  hideDistractions,
  // Navigation & focus
  highlightFocus,
  bigCursor,
  clickTargets,
  tooltipPin,
  // Audio
  muteSounds,
  // Power tools (annoyance killers + quality-of-life, for everyone)
  wallBreaker,
  feedOff,
  nagMute,
  expandCollapse,
  cookieKill,
  popupKill,
  stickyKill,
  mediaSpeed,
  autoScroll,
  pictureInPicture,
  volumeBoost,
  copyUnlock,
  forceZoom,
];

export const FEATURE_MAP: ReadonlyMap<string, FeatureModule> = new Map(
  FEATURES.map((f) => [f.id, f]),
);

export const FEATURE_IDS: readonly string[] = FEATURES.map((f) => f.id);

export {
  fontSize,
  readableFont,
  dyslexiaFont,
  textSpacing,
  textAlign,
  highlightLinks,
  highlightHeadings,
  highlightFocus,
  invertColors,
  highContrast,
  saturation,
  colorFilter,
  customColors,
  stopAnimations,
  hideImages,
  muteSounds,
  hideDistractions,
  clickTargets,
  bigCursor,
  readingGuide,
  readingMask,
  magnifier,
  focusMode,
  tooltipPin,
  readerMode,
  pictureInPicture,
  darkMode,
  cookieKill,
  popupKill,
  stickyKill,
  mediaSpeed,
  autoScroll,
  expandCollapse,
  copyUnlock,
  forceZoom,
  wallBreaker,
  feedOff,
  nagMute,
  bionicFlow,
  volumeBoost,
  selectionBubble,
  clickDictionary,
  tldrPin,
};

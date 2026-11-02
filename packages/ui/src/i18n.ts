/**
 * i18n scaffold. Every user-facing UI-chrome string lives here so the panel
 * components never hard-code copy. English is the only locale today; adding
 * another is just another entry in `dictionaries` plus a `setLocale()` call.
 *
 * Feature and profile names come from the @webable/core registry (they are the
 * canonical tool data, shared with the options page and docs), so they are not
 * duplicated here; localizing those is a core-package concern.
 */

export type Locale = 'en';

type Messages = Record<string, string>;

const en: Messages = {
  // Panel chrome
  'panel.subtitle': 'Adaptive accessibility tools',
  'panel.menuLabel': '{brand} accessibility menu',
  'panel.searchPlaceholder': 'Search tools…',
  'panel.searchLabel': 'Search tools',
  'panel.results': 'Results',
  'panel.noResults': 'No tools match "{q}".',
  'panel.interactiveTools': 'Interactive tools',
  'panel.resetAll': 'Reset all',
  'panel.undoReset': 'Undo reset',
  'panel.close': 'Close',
  'panel.positionEyebrow': 'Where the button sits',
  'panel.positionDragged': 'You have dragged the button somewhere custom. Pick a corner to put it back.',
  'pos.bottomRight': 'Bottom right',
  'pos.bottomLeft': 'Bottom left',
  'pos.topRight': 'Top right',
  'pos.topLeft': 'Top left',
  'panel.themeToggle': 'Switch theme, current {theme}',
  'panel.statement': 'Statement',
  'panel.categories': 'Categories',
  'panel.settingsFor': '{label} settings',

  // First open, while nothing is turned on yet.
  'intro.label': 'About this menu',
  'intro.lead':
    'Everything here changes how this page looks and behaves for you, on this device. Nothing is sent anywhere, nothing changes for anyone else, and all of it is reversible.',
  'intro.how':
    'Start with a profile below, or use the icons on the left to browse by what you need: reading, color, motion, reading aids, and power tools. Reset all, at the bottom, puts the page back.',
  'intro.dismiss': 'Got it',

  // Controls
  'ctl.colorSet': '{label}, {value}',
  'ctl.colorAuto': '{label}, automatic',
  'ctl.colorClear': 'Clear {label}, back to automatic',

  // Tabs
  'tab.profiles': 'Profiles',
  'tab.guide': 'Guide',
  'tab.ai': 'AI assist',

  // Guide
  'guide.title': 'Guide',
  'guide.desc': 'Ask how to do something here. I walk you through it, step by step.',
  'guide.descKey': 'Add a Google Gemini key, then ask how to do anything on this page.',
  'guide.placeholder': 'How do I… on this page?',
  'guide.ask': 'Ask',
  'guide.mic': 'Speak your question',
  'guide.micUnsupported': 'Voice input is not supported in this browser',
  'guide.thinking': 'Reading the page…',
  'guide.empty': 'Ask in plain words, like "How do I subscribe here?" I read the page and point at the right control.',
  'guide.readAloud': 'Read answers aloud',
  'guide.back': 'Back',
  'guide.next': 'Next step',
  'guide.step': 'Step {n} of {m}',
  'guide.takeMeThere': 'Take me to it',
  'guide.clear': 'Clear guide',
  'guide.hint': 'I read the page and walk you through it step by step, pointing and drawing as I go. Press Escape to dismiss the pointer. It uses AI, so double-check anything important.',

  // Launcher
  'launcher.open': 'Open {brand} accessibility menu',
  'launcher.openActive': 'Open {brand} accessibility menu, {count} active',
  'launcher.title': 'Click to open, drag to move',

  // Announcements (live region)
  'announce.on': '{label} on',
  'announce.off': '{label} off',
  'announce.profileApplied': '{label} profile applied',
  'announce.profileCleared': 'Profile cleared',
  'announce.results': '{n} tool{s} match',
  'announce.keySaved': 'Key saved. The AI tools are available.',
  'announce.moved': 'Button moved to {where}',
  'announce.reset': 'All settings reset',
  'announce.resetWithUndo': 'All settings reset. Undo is available for ten seconds.',
  'announce.resetUndone': 'Settings restored',

  // Read aloud (TTS)
  'tts.group': 'Read aloud',
  'tts.title': 'Read aloud',
  'tts.desc': 'Reads your selection, or the whole article.',
  'tts.play': 'Play',
  'tts.resume': 'Resume',
  'tts.pause': 'Pause',
  'tts.stop': 'Stop',
  'tts.speed': 'Speed',
  'tts.pitch': 'Pitch',
  'tts.voice': 'Voice',
  'tts.voiceDefault': 'Default',

  // AI assist
  'ai.titleOptional': 'AI assist (optional)',
  'ai.descKeyPrompt':
    'Add a Google Gemini key to ask the page, translate, explain, simplify, summarize, and generate alt text.',
  'ai.keyPlaceholder': 'Paste your Gemini API key',
  'ai.save': 'Save',
  // Exact, because it is the claim a person decides on. The extension stores
  // the key in chrome.storage.local (device only, never synced); the widget
  // stores it in this site's localStorage. Both are readable by anyone at this
  // machine, which is why the warning stays.
  'ai.keyNote':
    'Stored on this device only, never synced, and sent only to Google. Anyone using this device can read it; on a shared or public machine, use a hosted proxy instead.',
  'ai.title': 'AI assist',
  'ai.connected': 'Gemini connected · {key}',
  'ai.removeKey': 'Remove key',
  'ai.askPlaceholder': 'Ask anything about this page…',
  'ai.askLabel': 'Ask about this page',
  'ai.ask': 'Ask',
  'ai.summarize': 'Summarize this page',
  'ai.summarizing': 'Summarizing…',
  'ai.simplify': 'Simplify',
  'ai.explain': 'Explain',
  'ai.translateLabel': 'Translate selection to',
  'ai.translate': 'Translate',
  'ai.describingImages': 'Describing images…',
  'ai.altText': 'Alt text for images',
  'ai.extractText': 'Read the text in images',
  'ai.extracting': 'Reading the images\u2026',
  'ai.ocrNoImages': 'No images big enough to read on this page.',
  'ai.ocrNoText': 'No text found in the images on this page.',
  'ai.resultLabel': 'AI result',
  'ai.footNote': 'Simplify, Explain, and Translate use the text you select on the page. Ask uses the whole page.',
  'ai.errGeneric': 'Something went wrong.',
  'ai.errNoSummary': 'Not enough text on this page to summarize.',
  'ai.errSelectText': 'Select some text on the page first, then try again.',
  'ai.errSelectPassage': 'Select a word or passage on the page first, then try again.',
  'ai.errTypeQuestion': 'Type a question first.',
  'ai.errNoAnswerText': 'Not enough text on this page to answer from.',
  'ai.altAllPresent': 'Every image on this page already has alt text. Nice.',
  'ai.altDone': 'Generated alt text for {n} image{s}. Screen readers will now describe {them}.',
  'ai.altBlocked': 'Could not read these images (the site blocks cross-origin access).',
};

const dictionaries: Record<Locale, Messages> = { en };

let locale: Locale = 'en';

/**
 * Merge extra messages into the current dictionary.
 *
 * Strings used only by the extension live with the code that uses them
 * (extensionBlocks.tsx), not in this file. The widget build resolves that
 * module to a stub, so those strings are not merely unused there, they are not
 * in the bundle at all. The panel has a hard 65 KB gzip budget and every string
 * in this object ships to every visitor whether it is reachable or not.
 */
export function addMessages(extra: Messages, locale: Locale = 'en'): void {
  Object.assign(dictionaries[locale], extra);
}

export function setLocale(next: Locale): void {
  if (dictionaries[next]) locale = next;
}

export function getLocale(): Locale {
  return locale;
}

/**
 * Look up a message and interpolate `{param}` placeholders. Falls back to the
 * key itself if a string is missing, so a forgotten key is visible, not blank.
 */
export function t(key: keyof typeof en, params?: Record<string, string | number>): string {
  let s = dictionaries[locale][key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return s;
}

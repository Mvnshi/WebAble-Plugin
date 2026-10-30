/**
 * @webable/power: the extension's power layer. Command bar, click hints, page
 * insights and Site Check. Extension only, by design: none of it is imported
 * by the widget, so none of it counts against the widget's 65 KB budget.
 */
export { createCommandBar } from './commandBar';
export type { CommandBar, CommandBarOptions, UsageStats } from './commandBar';
export { run, catalogue, describeIntent, ACTIONS } from './commands';
export type { PowerHost, Command, Outcome } from './commands';
export { parseIntent, clean } from './intents';
export type { Intent, ActionId } from './intents';
export { rank, score } from './fuzzy';
export { startHints, letterLabels, visibleClickables } from './hints';
export type { HintMode, HintSession } from './hints';
export { readInsights } from './insights';
export type { Insight } from './insights';
export { collectTargets, findSearchInput, jumpTo, flash } from './pageMap';

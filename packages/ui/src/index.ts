/**
 * @webable/ui: the shared menu UI. Both surfaces import `mountWidget` and hand
 * it a core `Engine`; nothing here re-implements feature logic. The launcher is
 * eager; the panel UI + its stylesheet load lazily on first open.
 */
export { mountWidget, HOST_ID } from './mount';
export type { WidgetApi, MountOptions } from './mount';
export type { OpenController } from './controller';
export type { PanelConfig, PanelProps, PanelComponent } from './config';
export { LAUNCHER_CSS } from './styles';
export { Icon } from './icons';
export { t, setLocale, getLocale } from './i18n';
export type { Locale } from './i18n';

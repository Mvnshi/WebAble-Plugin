/** Panel configuration + component contract, shared by the eager root and the lazy panel. */
import type { JSX } from 'preact';
import type { Engine, Surface } from '@webable/core';
import type { OpenController } from './controller';

export interface PanelConfig {
  brandName: string;
  attribution: boolean;
  accessibilityUrl?: string | null;
  showProfiles: boolean;
  showAI: boolean;
  hideLauncher: boolean;
  /** Which surface this is, for per-tool availability (e.g. Site Patches = extension only). */
  surface: Surface;
  /** Optional allow-list of feature ids to show (embed `data-webable-tools`). */
  tools?: readonly string[];
}

export interface PanelProps {
  engine: Engine;
  config: PanelConfig;
  controller: OpenController;
  position: string;
  style?: JSX.CSSProperties;
}

/** The lazy-loaded panel's component signature. */
export type PanelComponent = (props: PanelProps) => JSX.Element;

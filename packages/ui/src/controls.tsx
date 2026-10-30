/**
 * Reusable, accessible controls. Each is driven by the feature registry's
 * `Control` descriptors, so the panel never hard-codes a feature's inputs.
 */
import type { JSX } from 'preact';
import type { Control, SettingValue } from '@webable/core';
import { t } from './i18n';

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      class="wa-switch"
      role="switch"
      aria-checked={checked ? 'true' : 'false'}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Slider({
  control,
  value,
  onChange,
  scope,
}: {
  control: Control;
  value: number;
  onChange: (v: number) => void;
  /**
   * Feature id. The slider id used to be keyed on control.key alone, and keys
   * repeat across features ("size", "value", "rate"), so two cards open at once
   * produced two inputs with the same id: the label's `for` bound to the first,
   * and the second slider had no accessible name at all.
   */
  scope?: string;
}): JSX.Element {
  const id = `wa-sl-${scope ? scope + '-' : ''}${control.key}`;
  const display = control.format ? control.format(value) : `${value}${control.unit || ''}`;
  return (
    <div class="wa-ctl-row">
      <div class="wa-ctl-head">
        <label class="wa-ctl-label" for={id}>
          {control.label}
        </label>
        <span class="wa-ctl-val" aria-hidden="true">
          {display}
        </span>
      </div>
      <input
        id={id}
        class="wa-slider"
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        aria-valuetext={display}
        onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))}
      />
    </div>
  );
}

export function Segmented({
  control,
  value,
  onChange,
}: {
  control: Control;
  value: SettingValue;
  onChange: (v: SettingValue) => void;
}): JSX.Element {
  return (
    <div class="wa-ctl-row">
      <div class="wa-ctl-head">
        <span class="wa-ctl-label">{control.label}</span>
      </div>
      <div class="wa-seg" role="group" aria-label={control.label}>
        {(control.options || []).map((opt) => (
          <button
            type="button"
            key={String(opt.value)}
            aria-pressed={value === opt.value ? 'true' : 'false'}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ColorControl({
  control,
  value,
  onChange,
}: {
  control: Control;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  const isSet = value && value !== 'auto';
  return (
    <div class="wa-ctl-row">
      <div class="wa-color-row">
        <span class="wa-ctl-label">{control.label}</span>
        <div class="wa-color-swatch">
          {/* The name carries the state. A colour input reports whatever value
              it holds, and this one holds the brand blue whenever nothing is
              set, so it announced "Text colour, #1e40af" for a colour the user
              had never chosen and gave no way to tell set from automatic. The
              "Auto" text next to it was aria-hidden, so that did not help
              either. */}
          <input
            class="wa-color-input"
            type="color"
            value={isSet ? value : '#1e40af'}
            aria-label={isSet ? t('ctl.colorSet', { label: control.label, value }) : t('ctl.colorAuto', { label: control.label })}
            onInput={(e) => onChange((e.target as HTMLInputElement).value)}
          />
          {isSet ? (
            <button
              type="button"
              class="wa-color-clear"
              aria-label={t('ctl.colorClear', { label: control.label })}
              onClick={() => onChange('auto')}
            >
              Clear
            </button>
          ) : (
            <span class="wa-color-clear">Auto</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Props for a control that is unavailable while an action is in flight.
 *
 * Uses `aria-disabled` rather than the `disabled` attribute, because a control
 * that disables itself under the user's focus drops that focus. Inside a shadow
 * root the browser sends it to document.body and leaves shadowRoot.activeElement
 * null, and the panel's Escape and Tab handling both read activeElement from the
 * root: so pressing Enter on "Summarize this page" put focus outside the modal,
 * stopped Escape closing the dialog, and let Tab walk the host page behind an
 * aria-modal="true" panel with no way back. aria-disabled keeps the control
 * focusable and still announces it as unavailable; the guard makes it inert.
 */
export function whileBusy(busy: boolean, onClick: () => void) {
  return {
    'aria-disabled': busy ? ('true' as const) : undefined,
    onClick: () => {
      if (!busy) onClick();
    },
  };
}

export function FeatureControl({
  control,
  value,
  onChange,
  scope,
}: {
  control: Control;
  value: SettingValue;
  onChange: (key: string, value: SettingValue) => void;
  /** Feature id, so ids stay unique when several cards are open. */
  scope?: string;
}): JSX.Element | null {
  switch (control.type) {
    case 'slider':
      return <Slider control={control} value={Number(value)} onChange={(v) => onChange(control.key, v)} scope={scope} />;
    case 'segmented':
    case 'select':
      return <Segmented control={control} value={value} onChange={(v) => onChange(control.key, v)} />;
    case 'color':
      return <ColorControl control={control} value={String(value)} onChange={(v) => onChange(control.key, v)} />;
    default:
      return null;
  }
}

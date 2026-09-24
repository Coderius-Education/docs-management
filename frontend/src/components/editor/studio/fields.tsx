import './studio.css';
import {
  Checkbox,
  ColorInput,
  NumberInput,
  Select,
  TagsInput,
  Textarea,
  TextInput,
} from '@mantine/core';
import { createContext, useContext, type ReactNode } from 'react';
import {
  changeSetting,
  readSetting,
  type SiteSettings,
} from '../../../lib/authoring/settings';

export interface SettingsState {
  /** The course's own overrides; this is what gets saved. */
  value: SiteSettings;
  /** Inherited values with the overrides applied: what the course shows. */
  merged: SiteSettings;
  inherited?: Record<string, unknown>;
  errors: Record<string, string>;
  onChange: (next: SiteSettings) => void;
}
const SettingsContext = createContext<SettingsState | null>(null);
export const SettingsProvider = SettingsContext.Provider;
export function useSettings() {
  const state = useContext(SettingsContext);
  if (!state) throw new Error('useSettings buiten SettingsProvider');
  const set = (path: string, next: unknown) =>
    state.onChange(changeSetting(state.value, path, next));
  const overridden = (path: string) =>
    readSetting(state.value, path) !== undefined;
  const current = (path: string) => {
    const result = readSetting(state.merged, path);
    // Dark mode falls back to the light value, like the generated CSS does.
    return result === undefined && path.startsWith('tokens.dark.')
      ? readSetting(state.merged, path.replace('tokens.dark.', 'tokens.light.'))
      : result;
  };
  const text = (path: string) => {
    const result = current(path);
    return typeof result === 'string' ? result : '';
  };
  return { ...state, set, overridden, current, text };
}

export const palettes = [
  '#225588',
  '#3578e5',
  '#256a4c',
  '#763fa6',
  '#c24835',
  '#bd7800',
];

/** Shows where a value comes from and lets the author go back to the course value. */
export function Origin({
  path,
  label,
  children,
}: {
  path: string;
  label: string;
  children: ReactNode;
}) {
  const { overridden, set } = useSettings();
  const own = overridden(path);
  return (
    <div className="studio-field">
      {children}
      <div className="studio-field-origin">
        <span data-own={own}>{own ? 'Aangepast' : 'Overgenomen'}</span>
        {own && (
          <button
            type="button"
            aria-label={`${label} overnemen`}
            onClick={() => set(path, undefined)}
          >
            Overnemen ↶
          </button>
        )}
      </div>
    </div>
  );
}

export function TextSetting({
  path,
  label,
  placeholder = 'Overnemen uit cursus',
  description,
  multiline = false,
}: {
  path: string;
  label: string;
  placeholder?: string;
  description?: string;
  multiline?: boolean;
}) {
  const { text, set, errors } = useSettings();
  const Input = multiline ? Textarea : TextInput;
  return (
    <Origin path={path} label={label}>
      <Input
        label={label}
        description={description}
        value={text(path)}
        placeholder={placeholder}
        error={errors[path]}
        autosize={multiline || undefined}
        onChange={(event) => set(path, event.currentTarget.value || undefined)}
      />
    </Origin>
  );
}

export function ColorSetting({
  path,
  label,
  fallback,
}: {
  path: string;
  label: string;
  fallback?: string;
}) {
  const { text, set, errors } = useSettings();
  return (
    <Origin path={path} label={label}>
      <ColorInput
        label={label}
        value={text(path)}
        placeholder={fallback ?? 'Overnemen uit cursus'}
        swatches={palettes}
        error={errors[path]}
        onChange={(next) => set(path, next || undefined)}
      />
    </Origin>
  );
}

export function RangeSetting({
  path,
  label,
  min,
  max,
  fallback,
  unit = 'px',
}: {
  path: string;
  label: string;
  min: number;
  max: number;
  fallback: number;
  unit?: string;
}) {
  const { text, set, errors } = useSettings();
  const raw = text(path);
  const numeric = raw.endsWith(unit) ? Number.parseFloat(raw) : fallback;
  const amount = Number.isFinite(numeric)
    ? Math.max(min, Math.min(max, numeric))
    : fallback;
  return (
    <Origin path={path} label={label}>
      <label className="studio-range">
        <span>
          {label}
          <output>{raw || `${fallback}${unit}`}</output>
        </span>
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          value={amount}
          onChange={(event) => set(path, `${event.currentTarget.value}${unit}`)}
        />
      </label>
      {errors[path] && <span className="studio-error">{errors[path]}</span>}
    </Origin>
  );
}

type Option = { value: string; label: string };
export function SelectSetting({
  path,
  label,
  data,
  placeholder = 'Overnemen uit cursus',
  unknownLabel,
}: {
  path: string;
  label: string;
  data: (string | Option)[];
  placeholder?: string;
  /** Label for an inherited value that is not a plain option, e.g. a resolved theme. */
  unknownLabel?: string;
}) {
  const { current, set, errors } = useSettings();
  const options = data.map((item) =>
    typeof item === 'string' ? { value: item, label: item } : item,
  );
  const raw = current(path);
  const value = typeof raw === 'string' ? raw : null;
  // Keep values from hand-written configs visible instead of an empty select.
  if (value && !options.some((option) => option.value === value))
    options.push({ value, label: value });
  return (
    <Origin path={path} label={label}>
      <Select
        label={label}
        placeholder={
          raw !== undefined && value === null && unknownLabel
            ? unknownLabel
            : placeholder
        }
        clearable
        data={options}
        value={value}
        error={errors[path]}
        onChange={(next) => set(path, next ?? undefined)}
      />
    </Origin>
  );
}

export function SwitchSetting({
  path,
  label,
}: {
  path: string;
  label: string;
}) {
  const { current, set } = useSettings();
  return (
    <Origin path={path} label={label}>
      <Checkbox
        label={label}
        checked={current(path) === true}
        onChange={(event) => set(path, event.currentTarget.checked)}
      />
    </Origin>
  );
}

export function NumberSetting({
  path,
  label,
  min,
  max,
}: {
  path: string;
  label: string;
  min: number;
  max: number;
}) {
  const { current, set, errors } = useSettings();
  const raw = current(path);
  return (
    <Origin path={path} label={label}>
      <NumberInput
        label={label}
        min={min}
        max={max}
        allowDecimal={false}
        placeholder="Overnemen uit cursus"
        value={typeof raw === 'number' ? raw : ''}
        error={errors[path]}
        onChange={(next) => set(path, next === '' ? undefined : Number(next))}
      />
    </Origin>
  );
}

export function TagsSetting({
  path,
  label,
  join,
}: {
  path: string;
  label: string;
  /** Some inherited values are a comma-separated string instead of a list. */
  join?: boolean;
}) {
  const { current, set } = useSettings();
  const raw = current(path);
  const tags = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === 'string' && join
      ? raw
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];
  return (
    <Origin path={path} label={label}>
      <TagsInput
        label={label}
        placeholder="Typ en druk op Enter"
        value={tags}
        onChange={(next) => set(path, next.length ? next : undefined)}
      />
    </Origin>
  );
}

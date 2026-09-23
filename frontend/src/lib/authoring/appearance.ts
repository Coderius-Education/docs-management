import type { SiteSettings } from './settings';

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Build preview values without copying inherited values into the saved overrides. */
export function previewSettings(
  inherited: Record<string, unknown> | undefined,
  overrides: SiteSettings,
  savedOverrides: SiteSettings,
): { settings: SiteSettings; needsBuild: boolean } {
  let needsBuild = false;
  function removeResetValues(
    base: Record<string, unknown>,
    saved: Record<string, unknown>,
    current: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...base };
    for (const [key, value] of Object.entries(saved)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
      if (isObject(value)) {
        const cleaned = removeResetValues(
          isObject(base[key]) ? base[key] : {},
          value,
          isObject(current[key]) ? current[key] : {},
        );
        if (key in base) result[key] = cleaned;
      } else if (!(key in current)) {
        delete result[key];
        needsBuild = true;
      }
    }
    return result;
  }
  function merge(
    base: Record<string, unknown>,
    next: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...base };
    for (const [key, value] of Object.entries(next)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
      result[key] = isObject(value)
        ? merge(isObject(base[key]) ? base[key] : {}, value)
        : value;
    }
    return result;
  }
  const baseline = removeResetValues(
    inherited ?? {},
    savedOverrides,
    overrides,
  );
  return { settings: merge(baseline, overrides) as SiteSettings, needsBuild };
}

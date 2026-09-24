import { readSetting, type SiteSettings } from './settings';

// Mirrors backend/app/authoring/settings.py so mistakes show up next to the field, not on save.
const colorTokens = new Set([
  '--ifm-background-color',
  '--ifm-font-color-base',
  ...[
    '',
    '-dark',
    '-darker',
    '-darkest',
    '-light',
    '-lighter',
    '-lightest',
  ].map((suffix) => `--ifm-color-primary${suffix}`),
]);
const fontTokens = new Set([
  '--ifm-font-family-base',
  '--ifm-font-family-monospace',
]);
const sizeTokens = new Set([
  '--ifm-font-size-base',
  '--ifm-container-width',
  '--ifm-container-width-xl',
  '--ifm-spacing-horizontal',
  '--ifm-global-spacing',
  '--ifm-global-radius',
  '--ifm-code-font-size',
]);
const color =
  /^(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:rgb|rgba|hsl|hsla)\([0-9.,% /+-]+\))$/;
const font = /^[a-zA-Z0-9 ,'"-]+$/;
const size = /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)$/;

export function tokenError(name: string, value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 300)
    return 'Gebruik een korte CSS-waarde.';
  if (colorTokens.has(name))
    return color.test(value)
      ? undefined
      : 'Gebruik een kleur zoals #225588 of rgb(34, 85, 136).';
  if (fontTokens.has(name))
    return font.test(value)
      ? undefined
      : 'Gebruik alleen letters, cijfers, spaties, komma’s en aanhalingstekens.';
  if (sizeTokens.has(name))
    return size.test(value)
      ? undefined
      : 'Gebruik een maat met eenheid, zoals 16px of 1rem.';
  return 'Deze CSS-waarde wordt niet beheerd.';
}

/** Field path → message, for every value the backend would reject. */
export function settingsErrors(value: SiteSettings): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const mode of Object.keys(value.tokens ?? {})) {
    const tokens = value.tokens[mode];
    if (
      !['light', 'dark'].includes(mode) ||
      !tokens ||
      typeof tokens !== 'object'
    ) {
      errors[`tokens.${mode}`] = 'Alleen light en dark zijn toegestaan.';
      continue;
    }
    for (const [name, token] of Object.entries(tokens)) {
      const error = tokenError(name, token);
      if (error) errors[`tokens.${mode}.${name}`] = error;
    }
  }
  const toc = 'themeConfig.tableOfContents';
  const min = readSetting(value, `${toc}.minHeadingLevel`),
    max = readSetting(value, `${toc}.maxHeadingLevel`);
  for (const [key, level] of [
    ['minHeadingLevel', min],
    ['maxHeadingLevel', max],
  ] as const)
    if (
      level !== undefined &&
      !(
        Number.isInteger(level) &&
        (level as number) >= 2 &&
        (level as number) <= 6
      )
    )
      errors[`${toc}.${key}`] = 'Kies een kopniveau van 2 tot en met 6.';
  if (typeof min === 'number' && typeof max === 'number' && min > max)
    errors[`${toc}.maxHeadingLevel`] =
      'Het hoogste kopniveau moet minstens het laagste zijn.';
  const mode = readSetting(value, 'themeConfig.colorMode.defaultMode');
  if (mode !== undefined && mode !== 'light' && mode !== 'dark')
    errors['themeConfig.colorMode.defaultMode'] = 'Kies licht of donker.';
  return errors;
}

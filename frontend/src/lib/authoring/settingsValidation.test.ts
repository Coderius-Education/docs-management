import { describe, expect, it } from 'vitest';
import { parseSettings } from './settings';
import { settingsErrors, tokenError } from './settingsValidation';

const settings = (value: object) =>
  parseSettings(JSON.stringify({ version: 1, ...value }));

describe('settings validation', () => {
  it('accepts the values the backend accepts', () => {
    expect(tokenError('--ifm-color-primary', '#225588')).toBeUndefined();
    expect(tokenError('--ifm-color-primary', 'rgb(1, 2, 3)')).toBeUndefined();
    expect(
      tokenError('--ifm-font-family-base', 'Inter, "Segoe UI"'),
    ).toBeUndefined();
    expect(tokenError('--ifm-font-size-base', '1.1rem')).toBeUndefined();
  });
  it('rejects unitless sizes, CSS injection and unknown tokens', () => {
    expect(tokenError('--ifm-font-size-base', '16')).toBeDefined();
    expect(tokenError('--ifm-color-primary', 'red;}body{')).toBeDefined();
    expect(tokenError('--ifm-font-family-base', 'x; color: red')).toBeDefined();
    expect(tokenError('--unknown', '#fff')).toBeDefined();
  });
  it('reports token and heading errors by field path', () => {
    const errors = settingsErrors(
      settings({
        tokens: { dark: { '--ifm-global-radius': '8' } },
        themeConfig: {
          tableOfContents: { minHeadingLevel: 4, maxHeadingLevel: 3 },
        },
      }),
    );
    expect(Object.keys(errors).sort()).toEqual([
      'themeConfig.tableOfContents.maxHeadingLevel',
      'tokens.dark.--ifm-global-radius',
    ]);
  });
});

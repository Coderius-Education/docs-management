import { describe, expect, it } from 'vitest';
import { previewSettings } from './appearance';
import { parseSettings } from './settings';

const settings = (value: Record<string, unknown>) =>
  parseSettings(JSON.stringify({ version: 1, ...value }));

describe('appearance preview inheritance', () => {
  it('removes old effective values when a saved override is reset, while preserving unrelated inherited values', () => {
    const original = settings({
      themeConfig: { navbar: { title: 'Oude aanpassing' } },
      tokens: { light: { '--ifm-color-primary': '#ee0000' } },
    });
    const current = settings({
      themeConfig: { navbar: {} },
      tokens: { light: {} },
    });
    const inherited = settings({
      site: { title: 'Python' },
      themeConfig: {
        navbar: { title: 'Oude aanpassing', items: [{ label: 'Lessen' }] },
      },
      tokens: {
        light: {
          '--ifm-color-primary': '#ee0000',
          '--ifm-font-size-base': '18px',
        },
      },
    });
    const preview = previewSettings(inherited, current, original);
    expect(preview.needsBuild).toBe(true);
    expect(preview.settings.themeConfig).toEqual({
      navbar: { items: [{ label: 'Lessen' }] },
    });
    expect(preview.settings.tokens).toEqual({
      light: { '--ifm-font-size-base': '18px' },
    });
    expect(preview.settings.site).toEqual({ title: 'Python' });
    expect(inherited.themeConfig).toEqual({
      navbar: { title: 'Oude aanpassing', items: [{ label: 'Lessen' }] },
    });
  });

  it('merges new edits without changing saved overrides or turning inherited arrays into objects', () => {
    const overrides = settings({ themeConfig: { navbar: { title: 'Nieuw' } } });
    const preview = previewSettings(
      settings({
        themeConfig: { navbar: { title: 'Oud', items: [{ label: 'Lessen' }] } },
      }),
      overrides,
      settings({}),
    );
    expect(preview.needsBuild).toBe(false);
    expect(preview.settings.themeConfig).toEqual({
      navbar: { title: 'Nieuw', items: [{ label: 'Lessen' }] },
    });
    expect(overrides.themeConfig).toEqual({ navbar: { title: 'Nieuw' } });
  });
});

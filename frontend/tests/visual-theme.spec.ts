import { expect, test, type Page } from '@playwright/test';

async function themePortal(page: Page, commit = 'head-1') {
  const writes: Record<string, unknown>[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      let result: unknown = [];
      if (path === '/api/auth/me')
        result = { login: 'teacher', csrf_token: 'token' };
      if (path === '/api/sites')
        result = [
          {
            slug: 'python',
            display_name: 'Python',
            domain: 'python.coderius.nl',
          },
        ];
      if (path.endsWith('/capabilities'))
        result = {
          framework: 'docusaurus',
          managed_homepage: true,
          settings_runtime: true,
        };
      if (path.endsWith('/page')) {
        if (
          url.searchParams.get('scope') !== 'homepage' ||
          url.searchParams.get('path') !== 'homepage.mdx' ||
          url.searchParams.get('ref') !== 'lesson'
        ) {
          await route.fulfill({
            status: 404,
            json: { detail: 'Wrong homepage identity' },
          });
          return;
        }
        result = {
          content:
            'import { Hero, Section } from "@coderius/shared/components/HomepageSections";\n\n<Hero title="Leren programmeren" subtitle="Begin vandaag" />\n\n<Section title="Jouw eerste programma">\n\nDeze tekst komt van de cursusbranch.\n\n</Section>',
          sha: 'page-1',
          path: 'homepage.mdx',
          ref: 'lesson',
        };
      }
      if (path.endsWith('/settings')) {
        if (route.request().method() === 'PUT') {
          writes.push(route.request().postDataJSON());
          result = { head_sha: 'head-2', commit_sha: 'head-2' };
        } else
          result = {
            settings: {
              version: 1,
              site: {},
              themeConfig: {},
              tokens: {},
              docs: {},
            },
            head_sha: 'head-1',
            effective: {
              commit,
              settings: {
                version: 1,
                site: { title: 'Python' },
                themeConfig: { navbar: { title: 'Informatica' } },
                tokens: { light: { '--ifm-color-primary': '#225588' } },
                docs: {},
              },
              unresolved: [],
            },
          };
      }
      await route.fulfill({ json: result });
    },
  );
  return writes;
}

test('theme edits the branch homepage live and restores inherited color without losing other changes', async ({
  page,
}) => {
  const writes = await themePortal(page);
  await page.goto('/sites/python/settings?ref=lesson');
  const canvas = page.getByTestId('theme-canvas');
  await expect(
    canvas.getByText('Deze tekst komt van de cursusbranch.'),
  ).toBeVisible();
  await expect(canvas.getByText('Informatica', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Kleuren', exact: true }).click();
  await page.getByText('Donker', { exact: true }).click();
  await expect(canvas.locator('.course-canvas')).toHaveCSS(
    '--ifm-color-primary',
    '#225588',
  );
  await expect(page.getByLabel('Primaire kleur', { exact: true })).toHaveValue(
    '#225588',
  );
  await page.getByLabel('Primaire kleur', { exact: true }).fill('#ab77ee');
  await expect(canvas.locator('.course-canvas')).toHaveCSS(
    '--ifm-color-primary',
    '#ab77ee',
  );
  await page.getByText('Licht', { exact: true }).click();
  await page.getByLabel('Primaire kleur', { exact: true }).fill('#e04040');
  await expect(canvas.locator('.course-canvas')).toHaveCSS(
    '--ifm-color-primary',
    '#e04040',
  );
  await canvas.getByText('Informatica', { exact: true }).click();
  await page.getByLabel('Navigatietitel', { exact: true }).fill('Mijn cursus');
  await expect(canvas.getByText('Mijn cursus', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Kleuren', exact: true }).click();
  await page
    .getByRole('button', { name: 'Primaire kleur overnemen', exact: true })
    .click();
  await expect(canvas.locator('.course-canvas')).toHaveCSS(
    '--ifm-color-primary',
    '#225588',
  );
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  expect(writes[0].expected_head).toBe('head-1');
  const settings = writes[0].settings as {
    themeConfig: unknown;
    tokens: unknown;
    site: unknown;
  };
  expect(settings.themeConfig).toEqual({ navbar: { title: 'Mijn cursus' } });
  expect(settings.site).toEqual({});
  expect(settings.tokens).toEqual({
    light: {},
    dark: { '--ifm-color-primary': '#ab77ee' },
  });
});

test('stale build settings are excluded and mobile controls keep edits when closed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await themePortal(page, 'old-head');
  await page.goto('/sites/python/settings?ref=lesson');
  const canvas = page.getByTestId('theme-canvas');
  await expect(canvas.getByText('Jouw eerste programma')).toBeVisible();
  await expect(canvas.getByText('Informatica', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Geen passende build/)).toBeVisible();
  await page.getByRole('button', { name: 'Koptekst', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await drawer
    .getByLabel('Navigatietitel', { exact: true })
    .fill('Mobiele cursus');
  await drawer.getByRole('button', { name: 'Bediening sluiten' }).click();
  await expect(
    canvas.getByText('Mobiele cursus', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Koptekst', exact: true }).click();
  await expect(page.getByLabel('Navigatietitel', { exact: true })).toHaveValue(
    'Mobiele cursus',
  );
});

test('typography changes appear on the page and survive advanced view changes', async ({
  page,
}) => {
  await themePortal(page);
  await page.goto('/sites/python/settings?ref=lesson');
  const canvas = page.getByTestId('theme-canvas').locator('.course-canvas');
  await page.getByRole('button', { name: 'Lettertypen', exact: true }).click();
  await page.getByRole('textbox', { name: 'Lettertype', exact: true }).click();
  await page
    .getByRole('option', { name: 'Georgia — klassiek', exact: true })
    .click();
  await page
    .getByRole('slider', { name: 'Tekstgrootte', exact: true })
    .press('End');
  await expect(canvas).toHaveCSS('font-family', 'Georgia, serif');
  await expect(canvas).toHaveCSS('font-size', '24px');
  await page.getByRole('button', { name: 'Geavanceerd', exact: true }).click();
  const advanced = page.getByRole('dialog', {
    name: 'Geavanceerde vormgeving',
  });
  await advanced
    .getByLabel('Beschrijving', { exact: true })
    .fill('Een toegankelijke cursus');
  await advanced.getByRole('button', { name: 'Geavanceerd sluiten' }).click();
  await expect(canvas).toHaveCSS('font-family', 'Georgia, serif');
  await page.getByRole('button', { name: 'Geavanceerd', exact: true }).click();
  await expect(
    advanced.getByLabel('Beschrijving', { exact: true }),
  ).toHaveValue('Een toegankelijke cursus');
});

test('content width changes the actual homepage layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await themePortal(page);
  await page.goto('/sites/python/settings?ref=lesson');
  const container = page
    .getByTestId('theme-canvas')
    .locator('.course-container')
    .first();
  await expect(container).toBeVisible();
  const before = await container.boundingBox();
  await page
    .getByRole('slider', { name: 'Inhoudsbreedte', exact: true })
    .press('Home');
  await expect(container).toHaveCSS('max-width', '720px');
  expect((await container.boundingBox())!.width).toBeLessThan(before!.width);
});

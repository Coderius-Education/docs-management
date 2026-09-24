import { expect, test, type Page } from '@playwright/test';
import {
  EMPTY_SETTINGS,
  mockStudio,
  saveStudio,
  studioUrl,
} from './studio-mock';

const homepage =
  'import { Hero, Section } from "@coderius/shared/components/HomepageSections";\n\n<Hero title="Leren programmeren" subtitle="Begin vandaag" />\n\n<Section title="Jouw eerste programma">\n\nDeze tekst komt van de cursusbranch.\n\n</Section>\n';
const inherited = {
  version: 1,
  site: { title: 'Python' },
  themeConfig: {
    navbar: {
      title: 'Informatica',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          label: 'Lessen',
          position: 'left',
        },
        { to: '/docenten', label: 'Docenten', position: 'right' },
      ],
    },
  },
  tokens: { light: { '--ifm-color-primary': '#225588' } },
  docs: {},
};
function studio(page: Page, effective: Record<string, unknown> | null = {}) {
  return mockStudio(page, {
    content: homepage,
    effective:
      effective === null
        ? undefined
        : { commit: 'head-1', settings: inherited, stale: false, ...effective },
  });
}
const canvasOf = (page: Page) =>
  page.getByRole('region', { name: 'Cursuspagina', exact: true });

test('style edits show live and an inherited colour can be restored', async ({
  page,
}) => {
  const writes = await studio(page);
  await page.goto(studioUrl());
  const canvas = canvasOf(page);
  await expect(
    canvas.getByText('Deze tekst komt van de cursusbranch.'),
  ).toBeVisible();
  await expect(canvas.getByText('Informatica', { exact: true })).toBeVisible();
  await expect(page.getByText('Cursusbuild actueel')).toBeVisible();
  await page.getByRole('button', { name: 'Stijl', exact: true }).click();
  await page.getByText('Donkere weergave', { exact: true }).click();
  await expect(canvas).toHaveCSS('--ifm-color-primary', '#225588');
  await expect(page.getByLabel('Cursuskleur', { exact: true })).toHaveValue(
    '#225588',
  );
  await page.getByLabel('Cursuskleur', { exact: true }).fill('#ab77ee');
  await expect(canvas).toHaveCSS('--ifm-color-primary', '#ab77ee');
  await page.getByText('Lichte weergave', { exact: true }).click();
  await page.getByLabel('Cursuskleur', { exact: true }).fill('#e04040');
  await expect(canvas).toHaveCSS('--ifm-color-primary', '#e04040');
  await canvas.getByText('Informatica', { exact: true }).click();
  await page.getByLabel('Navigatietitel', { exact: true }).fill('Mijn cursus');
  await expect(canvas.getByText('Mijn cursus', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stijl', exact: true }).click();
  await page
    .getByRole('button', { name: 'Cursuskleur overnemen', exact: true })
    .click();
  await expect(canvas).toHaveCSS('--ifm-color-primary', '#225588');
  await saveStudio(page);
  expect(writes).toHaveLength(1);
  expect(writes[0].expected_head).toBe('head-1');
  expect(writes[0].content).toBeUndefined();
  expect(writes[0].settings!.themeConfig).toEqual({
    navbar: { title: 'Mijn cursus' },
  });
  expect(writes[0].settings!.site).toEqual({});
  expect(writes[0].settings!.tokens).toEqual({
    light: {},
    dark: { '--ifm-color-primary': '#ab77ee' },
  });
});

test('menu links start from the course, keep shared links and save as overrides', async ({
  page,
}) => {
  const writes = await studio(page);
  await page.goto(studioUrl());
  const canvas = canvasOf(page);
  await canvas.getByRole('button', { name: 'Lessen', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Koptekst' });
  await expect(panel.getByLabel('Link 1 — tekst')).toHaveValue('Lessen');
  await expect(panel.getByLabel('Zijmenu-ID')).toHaveValue('tutorialSidebar');
  await expect(panel.locator('.studio-shared-link')).toHaveText([/Docenten/]);
  await panel
    .getByRole('button', { name: 'Link toevoegen', exact: true })
    .click();
  await panel.getByLabel('Link 2 — tekst').fill('Oefeningen');
  await panel.getByLabel('Link 2 — bestemming').fill('/oefeningen');
  await expect(
    canvas.getByRole('button', { name: 'Oefeningen', exact: true }),
  ).toBeVisible();
  await expect(
    canvas.getByRole('button', { name: 'Docenten', exact: true }),
  ).toBeVisible();
  await saveStudio(page);
  expect(writes[0].settings!.themeConfig.navbar.items).toEqual([
    {
      type: 'docSidebar',
      sidebarId: 'tutorialSidebar',
      label: 'Lessen',
      position: 'left',
    },
    { label: 'Oefeningen', to: '/oefeningen' },
  ]);
  await panel
    .getByRole('button', { name: 'Menu overnemen', exact: true })
    .click();
  await expect(
    canvas.getByRole('button', { name: 'Oefeningen', exact: true }),
  ).toHaveCount(0);
});

test('page text and appearance are saved together in one commit', async ({
  page,
}) => {
  const writes = await studio(page);
  await page.goto(studioUrl());
  const canvas = canvasOf(page);
  await canvas
    .getByRole('textbox', { name: 'Titel', exact: true })
    .first()
    .fill('Welkom');
  await canvas.locator('footer').click();
  await page
    .getByRole('complementary', { name: 'Voettekst' })
    .getByLabel('Copyrighttekst', { exact: true })
    .fill('Coderius 2026');
  await expect(canvas.locator('footer')).toContainText('Coderius 2026');
  await saveStudio(page);
  expect(writes).toHaveLength(1);
  expect(writes[0].content).toContain('title={"Welkom"}');
  expect(writes[0].settings!.themeConfig).toEqual({
    footer: { copyright: 'Coderius 2026' },
  });
  await canvas
    .getByRole('textbox', { name: 'Titel', exact: true })
    .first()
    .fill('Welkom terug');
  await saveStudio(page);
  expect(writes[1].expected_head).toBe('head-2');
  expect(writes[1].settings).toBeUndefined();
});

test('without a build the editor says so and mobile panels keep edits when closed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await studio(page, null);
  await page.goto(studioUrl());
  const canvas = canvasOf(page);
  await expect(canvas.getByText('Jouw eerste programma')).toBeVisible();
  await expect(canvas.getByText('Informatica', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Geen cursusbuild')).toBeVisible();
  await canvas.getByRole('button', { name: 'Koptekst aanpassen' }).click();
  const drawer = page.getByRole('dialog', { name: 'Koptekst' });
  await expect(
    drawer.getByText(/Er is nog geen cursusvoorbeeld/),
  ).toBeVisible();
  await drawer
    .getByLabel('Navigatietitel', { exact: true })
    .fill('Mobiele cursus');
  await drawer.getByRole('button', { name: 'Paneel sluiten' }).click();
  await expect(
    canvas.getByText('Mobiele cursus', { exact: true }),
  ).toBeVisible();
  await canvas.getByRole('button', { name: 'Koptekst aanpassen' }).click();
  await expect(page.getByLabel('Navigatietitel', { exact: true })).toHaveValue(
    'Mobiele cursus',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test('an older build is used but marked as possibly outdated', async ({
  page,
}) => {
  await studio(page, { stale: true, built_at: '2026-09-01T10:00:00Z' });
  await page.goto(studioUrl());
  await expect(
    canvasOf(page).getByText('Informatica', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/mogelijk verouderd/)).toBeVisible();
});

test('typography and site settings survive switching panels', async ({
  page,
}) => {
  await studio(page);
  await page.goto(studioUrl());
  const canvas = canvasOf(page);
  await page.getByRole('button', { name: 'Stijl', exact: true }).click();
  await page.getByRole('textbox', { name: 'Lettertype', exact: true }).click();
  await page
    .getByRole('option', { name: 'Georgia — klassiek', exact: true })
    .click();
  await page
    .getByRole('slider', { name: 'Tekstgrootte', exact: true })
    .press('End');
  await expect(canvas).toHaveCSS('font-family', 'Georgia, serif');
  await expect(canvas).toHaveCSS('font-size', '24px');
  await page.getByRole('button', { name: 'Site', exact: true }).click();
  await page
    .getByLabel('Beschrijving voor zoekmachines', { exact: true })
    .fill('Een toegankelijke cursus');
  await page.getByRole('button', { name: 'Stijl', exact: true }).click();
  await expect(canvas).toHaveCSS('font-family', 'Georgia, serif');
  await page.getByRole('button', { name: 'Site', exact: true }).click();
  await expect(
    page.getByLabel('Beschrijving voor zoekmachines', { exact: true }),
  ).toHaveValue('Een toegankelijke cursus');
});

test('invalid sizes are reported next to the field and block saving', async ({
  page,
}) => {
  await studio(page);
  await page.goto(studioUrl());
  await page.getByRole('button', { name: 'Site', exact: true }).click();
  await page.getByRole('button', { name: 'Broncode', exact: true }).click();
  const editor = page.locator('.studio-source .cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(
    JSON.stringify({
      ...EMPTY_SETTINGS,
      tokens: { light: { '--ifm-font-size-base': '16' } },
    }),
  );
  await expect(
    page.getByRole('button', { name: 'Opslaan…', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Stijl', exact: true }).click();
  await expect(
    page.getByText('Gebruik een maat met eenheid, zoals 16px of 1rem.'),
  ).toBeVisible();
});

test('content width changes the homepage layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await studio(page);
  await page.goto(studioUrl('lesson', 'style'));
  const container = canvasOf(page).locator('.course-container').first();
  await expect(container).toBeVisible();
  const before = await container.boundingBox();
  await page
    .getByRole('slider', { name: 'Inhoudsbreedte', exact: true })
    .press('Home');
  await expect(container).toHaveCSS('max-width', '720px');
  expect((await container.boundingBox())!.width).toBeLessThan(before!.width);
});

test('old Vormgeving links open the style panel of the homepage editor', async ({
  page,
}) => {
  await studio(page);
  await page.goto('/sites/python/settings?ref=lesson');
  await expect(page).toHaveURL(/scope=homepage.*ref=lesson.*panel=style/);
  await expect(page.getByLabel('Cursuskleur', { exact: true })).toBeVisible();
});

test('every menu link of a large course is shown, left and right like the course', async ({
  page,
}) => {
  const items = [
    {
      type: 'docSidebar',
      sidebarId: 'tutorialSidebar',
      label: 'Tutorial',
      position: 'left',
    },
    { to: '/playground', label: 'Playground', position: 'left' },
    { to: '/cheatsheet', label: 'Cheatsheet', position: 'left' },
    { to: '/begrippenlijst', label: 'Begrippenlijst', position: 'left' },
    { to: '/hulp', label: 'Hulp', position: 'left' },
    { to: '/speeltuin', label: 'Speeltuin', position: 'left' },
    { to: '/spel-checken', label: 'Spel checken', position: 'left' },
    {
      href: 'https://github.com/Coderius-Education/play',
      label: 'GitHub',
      position: 'right',
    },
    { to: '/docenten', label: 'Docenten', position: 'right' },
    { type: 'dropdown', label: 'Cursussen', position: 'right', items: [] },
  ];
  await mockStudio(page, {
    content: homepage,
    effective: {
      commit: 'head-1',
      settings: {
        ...inherited,
        themeConfig: { navbar: { title: 'Python', items } },
      },
    },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(studioUrl());
  const navbar = canvasOf(page).locator('header');
  for (const item of items)
    await expect(
      navbar.getByRole('button', { name: item.label, exact: false }),
    ).toBeVisible();
  const right = navbar.locator('.course-navlinks-right');
  await expect(right.getByRole('button')).toHaveText([
    'GitHub',
    'Docenten',
    'Cursussen ▾',
  ]);
  await navbar.getByRole('button', { name: 'Docenten', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Koptekst' });
  await expect(panel.getByLabel('Link 8 — tekst')).toHaveValue('GitHub');
  await expect(panel.locator('.studio-shared-link.is-highlighted')).toHaveText(
    /Docenten/,
  );
  await panel
    .getByRole('button', { name: 'Link toevoegen', exact: true })
    .click();
  await expect(panel.locator('.studio-shared-link')).toHaveCount(2);
  await expect(
    navbar.getByRole('button', { name: 'Cursussen ▾' }),
  ).toBeVisible();
});

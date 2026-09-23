import { expect, test, type Page } from '@playwright/test';

async function mockCreation(page: Page, conflict = false) {
  const saves: Record<string, any>[] = [];
  const branches: Record<string, any>[] = [];
  const folders = ['01-basis', '01-basis/02-verdieping'];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      let data: unknown = [];
      if (url.pathname === '/api/auth/me')
        data = { login: 'teacher', csrf_token: 'test' };
      if (url.pathname === '/api/sites')
        data = [{ slug: 'python', display_name: 'Python' }];
      if (
        url.pathname === '/api/branches' &&
        route.request().method() === 'POST'
      ) {
        branches.push(route.request().postDataJSON());
        data = { sha: 'branch' };
      }
      if (url.pathname.endsWith('/tree'))
        data = [
          ...folders.map((path) => ({ path, type: 'tree', sha: 'tree' })),
          ...(url.searchParams.get('scope') === 'metadata'
            ? [
                {
                  path: '01-basis/_category_.yaml',
                  type: 'blob',
                  sha: 'category-sha',
                },
              ]
            : []),
        ];
      if (url.pathname.endsWith('/capabilities'))
        data = { managed_homepage: true, settings: true };
      if (
        url.pathname.endsWith('/page') &&
        route.request().method() === 'PUT'
      ) {
        const payload = route.request().postDataJSON();
        saves.push(payload);
        if (conflict) {
          await route.fulfill({ status: 409, json: { detail: 'Conflict' } });
          return;
        }
        if (payload.scope === 'metadata')
          folders.push(payload.path.replace('/_category_.json', ''));
        data = { content_sha: 'saved-sha', commit_sha: 'commit' };
      }
      if (url.pathname.endsWith('/page') && route.request().method() === 'GET')
        data = {
          path: url.searchParams.get('path'),
          ref: url.searchParams.get('ref'),
          sha: 'category-sha',
          content: 'label: Existing category\ncustom: keep\n',
        };
      await route.fulfill({ json: data });
    },
  );
  return { saves, branches };
}

test('nested folder is persisted and its draft branch and location carry into a new lesson', async ({
  page,
}) => {
  const { saves, branches } = await mockCreation(page);
  await page.goto('/sites/python?ref=main&folder=01-basis/02-verdieping');
  await expect(page.getByLabel('Huidige map')).toContainText('Basis');
  await page.getByRole('button', { name: 'Nieuwe map', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Naam van de map', exact: true })
    .fill('Één stap verder');
  await expect(
    page.getByText('01-basis/02-verdieping/een-stap-verder/_category_.json'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Map aanmaken', exact: true }).click();
  await page
    .getByLabel('Naam conceptversie', { exact: true })
    .fill('docs/new-folder');
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  expect(branches).toEqual([{ name: 'docs/new-folder', from_branch: 'main' }]);
  expect(saves[0]).toMatchObject({
    path: '01-basis/02-verdieping/een-stap-verder/_category_.json',
    scope: 'metadata',
    branch: 'docs/new-folder',
    sha: null,
  });
  expect(JSON.parse(saves[0].content)).toMatchObject({
    label: 'Één stap verder',
    collapsed: true,
    link: { type: 'generated-index' },
  });
  await page
    .getByRole('button', { name: 'Verder naar map', exact: true })
    .click();
  await expect(page).toHaveURL(/ref=docs%2Fnew-folder/);
  await page.getByRole('button', { name: 'Nieuwe les', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Map in de cursus', exact: true }),
  ).toHaveValue('Basis / Verdieping / Een stap verder');
  await page
    .getByRole('textbox', { name: 'Titel van de les', exact: true })
    .fill('Samen oefenen');
  await page
    .getByRole('radio', { name: /Opdracht met leerdoel en tip/ })
    .check();
  await page
    .getByRole('button', { name: 'Openen in editor', exact: true })
    .click();
  await expect(page).toHaveURL(
    /path=01-basis%2F02-verdieping%2Feen-stap-verder%2F01-samen-oefenen.mdx/,
  );
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  expect(saves[1]).toMatchObject({
    branch: 'docs/new-folder',
    scope: 'docs',
    sha: null,
  });
  expect(saves[1].content).toContain('## Leerdoel');
});

test('folder settings open the existing YAML metadata file without replacing its format', async ({
  page,
}) => {
  await mockCreation(page);
  await page.goto('/sites/python?ref=lesson');
  await page
    .getByRole('button', { name: 'Mapinstellingen Basis', exact: true })
    .click();
  await expect(page).toHaveURL(
    /metadata\?path=01-basis%2F_category_.yaml&ref=lesson&scope=metadata$/,
  );
  await expect(
    page.getByRole('textbox', { name: 'Categorienaam', exact: true }),
  ).toHaveValue('Existing category');
});

test('standalone page creation keeps the selected folder and pages scope', async ({
  page,
}) => {
  await mockCreation(page);
  await page.goto('/sites/python?ref=lesson&scope=pages');
  await expect(
    page.getByRole('button', { name: 'Nieuwe map', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Map Verdieping', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Nieuwe pagina', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Map', exact: true }),
  ).toHaveValue('Basis / Verdieping');
  await page
    .getByRole('textbox', { name: 'Titel van de pagina', exact: true })
    .fill('Over deze cursus');
  await page
    .getByRole('button', { name: 'Openen in editor', exact: true })
    .click();
  await expect(page).toHaveURL(
    /path=01-basis%2F02-verdieping%2F01-over-deze-cursus.mdx&ref=lesson&scope=pages&nieuw=1/,
  );
});

test('folder creation validates names, duplicate paths and parent location', async ({
  page,
}) => {
  await mockCreation(page);
  await page.goto('/sites/python?ref=lesson&folder=missing');
  await page.getByRole('button', { name: 'Nieuwe map', exact: true }).click();
  const name = page.getByRole('textbox', {
    name: 'Naam van de map',
    exact: true,
  });
  const create = page.getByRole('button', {
    name: 'Map aanmaken',
    exact: true,
  });
  await name.fill('!!!');
  await expect(create).toBeDisabled();
  await name.fill('../escape');
  await expect(create).toBeDisabled();
  await name.fill('01 basis');
  await expect(create).toBeDisabled();
  await name.fill('Nieuwe map');
  await expect(create).toBeEnabled();
  await expect(
    page.getByRole('textbox', { name: 'Bovenliggende map', exact: true }),
  ).toHaveValue('Alle lessen');
});

test('folder conflict retains the draft and never displays an unsaved folder', async ({
  page,
}) => {
  const { saves } = await mockCreation(page, true);
  await page.goto('/sites/python?ref=lesson');
  await page.getByRole('button', { name: 'Nieuwe map', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Naam van de map', exact: true })
    .fill('Nieuwe map');
  await page.getByRole('button', { name: 'Map aanmaken', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(
    page.getByText('Deze pagina is op de server gewijzigd.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Annuleren', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Naam van de map', exact: true }),
  ).toHaveValue('Nieuwe map');
  expect(saves).toHaveLength(1);
  await page.getByRole('button', { name: 'Annuleren', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Map Nieuwe map', exact: true }),
  ).toHaveCount(0);
});

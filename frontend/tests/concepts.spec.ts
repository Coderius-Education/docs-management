import { expect, test, type Page } from '@playwright/test';
import { mockConcepts } from './studio-mock';

const BASE = '# Les\n\nIntro.\n\nUitleg.\n\nSlot.\n';

function detail(overrides: Record<string, unknown> = {}) {
  return {
    number: 9,
    title: 'Uitleg over lussen',
    branch: 'concept/python-k3j4',
    site: 'python',
    author_login: 'docent',
    state: 'open',
    head_sha: 'head',
    html_url: '',
    updated_at: '2026-10-01T10:00:00Z',
    body: '',
    mergeable: true,
    merged: false,
    checks: [
      { id: 1, name: 'build', status: 'in_progress', conclusion: null },
      { id: 2, name: 'tekst', status: 'completed', conclusion: 'success' },
    ],
    status: 'wordt_gecontroleerd',
    publish_blocked: 'Wordt nog gecontroleerd…',
    behind_by: 0,
    previews: [],
    expected_previews: [
      {
        site: 'python',
        url: 'https://concept-python-k3j4--informatica.preview.coderius.nl/python/',
      },
    ],
    ...overrides,
  };
}

/** Concept pages: the detail can be swapped while the test runs. */
async function mockConceptApi(page: Page) {
  const state = { detail: detail() as Record<string, unknown> };
  const calls: { path: string; body: unknown }[] = [];
  let updateResult: unknown = { status: 'actueel' };
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();
      if (method === 'POST') calls.push({ path, body: route.request().postDataJSON() });
      let json: unknown = [];
      if (path === '/api/auth/me') json = { login: 'teacher', csrf_token: 'token' };
      if (path === '/api/sites')
        json = [
          {
            slug: 'python',
            display_name: 'Python',
            domain: 'informatica.coderius.nl',
            subject: 'informatica',
            path: 'python',
            url: 'https://informatica.coderius.nl/python/',
          },
        ];
      if (path === '/api/concepts/9') json = state.detail;
      if (path === '/api/concepts/9/publiceren') json = { merged: true, sha: 'squash' };
      if (path === '/api/concepts/9/bijwerken') json = updateResult;
      if (path === '/api/concepts/9/conflicten') json = { status: 'bijgewerkt', sha: 'merge' };
      await route.fulfill({ json });
    },
  );
  const concepts = await mockConcepts(page, [
    { number: 9, title: 'Uitleg over lussen', branch: 'concept/python-k3j4', site: 'python' },
  ]);
  for (const c of concepts.concepts) Object.assign(c, { status: 'wordt_gecontroleerd' });
  return {
    state,
    calls,
    setUpdate(result: unknown) {
      updateResult = result;
    },
  };
}

test('concept list shows titles and statuses without git words', async ({ page }) => {
  await mockConceptApi(page);
  await page.goto('/concepten');
  await expect(page.getByRole('heading', { name: 'Concepten' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Uitleg over lussen' })).toBeVisible();
  await expect(page.getByText('Wordt gecontroleerd')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/branch|pull request|merge/i);
});

test('old addresses redirect to the concept page', async ({ page }) => {
  await mockConceptApi(page);
  await page.goto('/prs/9');
  await expect(page).toHaveURL(/\/concepten\/9$/);
  await expect(page.getByRole('heading', { name: 'Uitleg over lussen' })).toBeVisible();
});

test('publiceren waits for the check and then publishes', async ({ page }) => {
  const api = await mockConceptApi(page);
  await page.goto('/concepten/9');
  await expect(page.getByText('Concept van docent')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Controle' })).toBeVisible();
  await expect(page.getByText('Eindcontrole')).toBeVisible();
  await expect(page.getByText('Spelling en schrijfstijl')).toBeVisible();
  const publish = page.getByRole('button', { name: 'Publiceren', exact: true });
  await expect(publish).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Wordt nog gecontroleerd' })).toBeVisible();

  api.state.detail = detail({
    status: 'klaar',
    publish_blocked: null,
    checks: [{ id: 3, name: 'build', status: 'completed', conclusion: 'success' }],
  });
  await page.reload();
  await expect(page.getByText('Klaar om te publiceren')).toBeVisible();
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByText('Gepubliceerd. De site wordt opnieuw gebouwd.')).toBeVisible();
  expect(api.calls.map((c) => c.path)).toContain('/api/concepts/9/publiceren');
});

test('a concept behind the published version is updated and conflicts are resolved per block', async ({
  page,
}) => {
  const api = await mockConceptApi(page);
  api.state.detail = detail({ behind_by: 1 });
  api.setUpdate({
    status: 'conflicten',
    branch_sha: 'bhead',
    main_sha: 'mhead',
    files: [
      {
        file: 'sites/informatica/python/docs/les.mdx',
        binary: false,
        whole_file: false,
        segments: [],
        hunks: [
          {
            id: '0',
            base: 'Uitleg.\n',
            ours: 'Mijn uitleg.\n',
            theirs: 'Hun uitleg.\n',
            context_before: 'Intro.\n\n',
            context_after: '\nSlot.\n',
          },
        ],
      },
    ],
  });
  await page.goto('/concepten/9');
  // Opening the concept runs the update by itself.
  await expect(page.getByText('Blok 1 van 1')).toBeVisible();
  const publish = page.getByRole('button', { name: 'Publiceren', exact: true });
  await expect(publish).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Eerst conflicten oplossen' })).toBeVisible();
  const merge = page.getByRole('button', { name: 'Samenvoegen', exact: true });
  await expect(merge).toBeDisabled();
  await page.getByText('Jouw versie', { exact: true }).last().click();
  await expect(page.getByLabel('Resultaat')).toHaveValue('Mijn uitleg.\n');
  await page.getByLabel('Resultaat').fill('Onze uitleg.\n');
  await merge.click();
  await expect(page.getByText('Het concept is bijgewerkt met de gepubliceerde versie.')).toBeVisible();
  const resolved = api.calls.find((c) => c.path === '/api/concepts/9/conflicten');
  expect(resolved?.body).toEqual({
    choices: { 'sites/informatica/python/docs/les.mdx': { '0': { custom: 'Onze uitleg.\n' } } },
    expected_head: 'bhead',
    expected_main: 'mhead',
  });
  await expect(page.getByText('Blok 1 van 1')).toHaveCount(0);
});

test('a save that collides with another save opens the block chooser', async ({ page }) => {
  const puts: Record<string, unknown>[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      if (url.pathname === '/api/auth/me')
        return route.fulfill({ json: { login: 'teacher', csrf_token: 'token' } });
      if (url.pathname === '/api/sites')
        return route.fulfill({ json: [{ slug: 'python', display_name: 'Python', domain: 'x' }] });
      if (url.pathname.endsWith('/page') && method === 'PUT') {
        const body = route.request().postDataJSON();
        puts.push(body);
        if (puts.length === 1)
          return route.fulfill({
            status: 409,
            json: {
              detail: {
                message: 'Iemand anders heeft deze pagina in hetzelfde concept gewijzigd.',
                conflict: {
                  file: 'les.mdx',
                  current_sha: 'nieuwste',
                  current_content: BASE.replace('Uitleg.', 'Hun uitleg.'),
                  segments: [
                    { type: 'text', text: '# Les\n\nIntro.\n\n' },
                    {
                      type: 'conflict',
                      id: '0',
                      base: 'Uitleg.\n',
                      ours: 'Mijn uitleg.\n',
                      theirs: 'Hun uitleg.\n',
                    },
                    { type: 'text', text: '\nSlot.\n' },
                  ],
                  hunks: [
                    {
                      id: '0',
                      base: 'Uitleg.\n',
                      ours: 'Mijn uitleg.\n',
                      theirs: 'Hun uitleg.\n',
                      context_before: 'Intro.\n\n',
                      context_after: '\nSlot.\n',
                    },
                  ],
                },
              },
            },
          });
        return route.fulfill({ json: { content_sha: 'saved', commit_sha: 'c' } });
      }
      if (url.pathname.endsWith('/page'))
        return route.fulfill({
          json: { path: 'les.mdx', ref: 'lesson', content: BASE, sha: 'oud' },
        });
      return route.fulfill({ json: [] });
    },
  );
  await mockConcepts(page, [
    { number: 7, title: 'Les verbeteren', branch: 'lesson', site: 'python' },
  ]);
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  await expect(page.getByText('Concept: Les verbeteren')).toBeVisible();
  await page.getByText('Broncode', { exact: true }).click();
  await page.locator('.cm-content').fill(BASE.replace('Uitleg.', 'Mijn uitleg.'));
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page.getByRole('button', { name: 'Concept opslaan', exact: true }).click();
  await expect(page.getByText('Iemand anders heeft deze pagina ook gewijzigd')).toBeVisible();
  expect(puts[0]).toMatchObject({ sha: 'oud', base_text: BASE, branch: 'lesson' });
  await page.getByText('Beide', { exact: true }).click();
  await page.getByRole('button', { name: 'Samengevoegde versie opslaan', exact: true }).click();
  await expect(page.getByText('het voorbeeld wordt gebouwd')).toBeVisible();
  expect(puts[1]).toMatchObject({
    sha: 'nieuwste',
    content: '# Les\n\nIntro.\n\nMijn uitleg.\nHun uitleg.\n\nSlot.\n',
  });
  await page.getByRole('button', { name: 'Verder bewerken', exact: true }).click();
  // The editor now shows the merged text, so nothing is left unsaved.
  await expect(page.getByText('Opgeslagen', { exact: true })).toBeVisible();
});

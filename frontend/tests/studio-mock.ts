import { expect, type Page } from '@playwright/test';

/** Success text of the save dialog. */
export const SAVED = 'Nog niet gepubliceerd; het voorbeeld wordt gebouwd.';

export const EMPTY_SETTINGS = {
  version: 1,
  site: {},
  themeConfig: {},
  tokens: {},
  docs: {},
};
export interface StudioWrite {
  branch: string;
  expected_head: string;
  message: string;
  content?: string;
  settings?: Record<string, any>;
}

export interface MockConcept {
  number: number;
  title: string;
  branch: string;
  site: string | null;
  state?: string;
}

/**
 * Mocks /api/concepts: listing plus "Nieuw concept" (creates concept/<site>-<n>).
 * Registered after a spec's catch-all route, so it takes precedence.
 */
export async function mockConcepts(page: Page, seed: MockConcept[] = []) {
  const concepts = seed.map((c) => ({
    author_login: 'teacher',
    state: 'open',
    head_sha: 'head',
    html_url: '',
    updated_at: '2026-10-01T10:00:00Z',
    ...c,
  }));
  const created: { site: string; title: string }[] = [];
  await page.route(
    (url) => url.pathname === '/api/concepts',
    async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        created.push(body);
        const concept = {
          number: 100 + created.length,
          title: body.title,
          branch: `concept/${body.site}-${created.length}`,
          site: body.site,
          author_login: 'teacher',
          state: 'open',
          head_sha: 'head',
          html_url: '',
          updated_at: '2026-10-01T10:00:00Z',
        };
        concepts.push(concept);
        await route.fulfill({ json: concept });
      } else await route.fulfill({ json: concepts });
    },
  );
  return { created, concepts };
}

/** Mocks the API behind the combined homepage and appearance editor. */
export async function mockStudio(
  page: Page,
  init: {
    content: string | null;
    settings?: Record<string, unknown>;
    effective?: Record<string, unknown>;
  },
) {
  const state = {
    content: init.content,
    settings: init.settings ?? EMPTY_SETTINGS,
    head: 'head-1',
  };
  const writes: StudioWrite[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname;
      const method = route.request().method();
      let json: unknown = [];
      if (path === '/api/auth/me')
        json = { login: 'teacher', csrf_token: 'token' };
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
      if (path.endsWith('/capabilities'))
        json = { managed_homepage: true, settings_runtime: true };
      if (path === '/api/sites/python/homepage') {
        if (method === 'PUT') {
          const body = route.request().postDataJSON() as StudioWrite;
          writes.push(body);
          if (body.content !== undefined) state.content = body.content;
          if (body.settings !== undefined) state.settings = body.settings;
          state.head = `head-${writes.length + 1}`;
          json = { head_sha: state.head };
        } else
          json = {
            head_sha: state.head,
            page:
              state.content === null
                ? null
                : { content: state.content, sha: 'blob' },
            settings: state.settings,
            ...(init.effective ? { effective: init.effective } : {}),
          };
      }
      await route.fulfill({ json });
    },
  );
  await mockConcepts(page, [
    { number: 7, title: 'Startpagina vernieuwen', branch: 'lesson', site: 'python' },
  ]);
  return writes;
}

export const studioUrl = (ref = 'lesson', panel?: string) =>
  `/sites/python/edit?${new URLSearchParams({ scope: 'homepage', path: 'homepage.mdx', ref, ...(panel ? { panel } : {}) })}`;

export async function saveStudio(page: Page) {
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText(SAVED)).toBeVisible();
  await page
    .getByRole('button', { name: 'Verder bewerken', exact: true })
    .click();
}

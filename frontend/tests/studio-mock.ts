import { expect, type Page } from '@playwright/test';

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
            domain: 'python.coderius.nl',
          },
        ];
      if (path.endsWith('/capabilities'))
        json = { managed_homepage: true, settings_runtime: true };
      if (path === '/api/branches' && method === 'POST')
        json = { name: route.request().postDataJSON().name, sha: state.head };
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
  return writes;
}

export const studioUrl = (ref = 'lesson', panel?: string) =>
  `/sites/python/edit?${new URLSearchParams({ scope: 'homepage', path: 'homepage.mdx', ref, ...(panel ? { panel } : {}) })}`;

export async function saveStudio(page: Page) {
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  await page
    .getByRole('button', { name: 'Verder bewerken', exact: true })
    .click();
}

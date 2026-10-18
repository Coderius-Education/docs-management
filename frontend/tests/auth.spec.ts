import { expect, test, type Page, type Request } from '@playwright/test';

const KLAS = {
  id: 7,
  code: 'abcdef2345',
  vak: 'informatica',
  naam: '4H-inf',
  url: 'https://informatica.coderius.nl/klas/abcdef2345',
  gearchiveerd: false,
  versie: 1,
  eigenaar: { login: 'teacher', name: null, avatar_url: null },
  docenten: [],
  rol: 'eigenaar',
  aantal_items: 0,
  updated_at: null,
};

type Antwoord = { status: number; json: unknown };

async function mockApi(
  page: Page,
  { me = true, dupliceren }: { me?: boolean; dupliceren?: Antwoord } = {},
) {
  const requests: Request[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      requests.push(request);
      const path = new URL(request.url()).pathname;
      if (path === '/api/auth/me')
        return me
          ? route.fulfill({ json: { login: 'teacher', name: 'Docent', csrf_token: 'csrf-123' } })
          : route.fulfill({ status: 401, json: { detail: 'Niet ingelogd' } });
      if (path === '/api/auth/logout') return route.fulfill({ status: 204 });
      if (path === '/api/klassen') return route.fulfill({ json: [KLAS] });
      if (path === '/api/klassen/7/dupliceren' && dupliceren)
        return route.fulfill(dupliceren);
      return route.fulfill({ json: [] });
    },
  );
  return requests;
}

test('without a session every page sends the teacher to the login page', async ({ page }) => {
  await mockApi(page, { me: false });

  await page.goto('/klassen');

  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('link', { name: 'Inloggen met GitHub' })).toHaveAttribute(
    'href',
    '/api/auth/login',
  );
});

for (const [error, melding] of [
  ['geen-org-lid', 'geen lid van de Coderius-Education organisatie'],
  ['inloggen-mislukt', 'Inloggen is niet gelukt'],
]) {
  test(`the login page explains ${error}`, async ({ page }) => {
    await page.goto(`/login?error=${error}`);
    await expect(page.getByRole('alert')).toContainText(melding);
  });
}

test('changes carry the CSRF token from /me, reads do not', async ({ page }) => {
  const requests = await mockApi(page);
  await page.goto('/klassen');
  await expect(page.getByRole('link', { name: '4H-inf' })).toBeVisible();

  await page.getByRole('button', { name: /Docent/ }).click();
  await page.getByRole('menuitem', { name: 'Uitloggen' }).click();
  await expect(page).toHaveURL('/login');

  const logout = requests.find((r) => new URL(r.url()).pathname === '/api/auth/logout');
  expect(logout?.method()).toBe('POST');
  expect(logout?.headers()['x-csrf-token']).toBe('csrf-123');
  const reads = requests.filter((r) => r.method() === 'GET');
  expect(reads.length).toBeGreaterThan(0);
  expect(reads.every((r) => r.headers()['x-csrf-token'] === undefined)).toBe(true);
});

test('a 401 during the session sends the teacher to the login page', async ({ page }) => {
  await mockApi(page, {
    dupliceren: { status: 401, json: { detail: 'GitHub-token ongeldig; log opnieuw in' } },
  });
  await page.goto('/klassen');

  await page.getByRole('button', { name: 'Dupliceren' }).click();

  await expect(page).toHaveURL('/login');
});

test('a 403 shows the reason and keeps the teacher on the page', async ({ page }) => {
  await mockApi(page, {
    dupliceren: { status: 403, json: { detail: 'CSRF-token ontbreekt of klopt niet' } },
  });
  await page.goto('/klassen');

  await page.getByRole('button', { name: 'Dupliceren' }).click();

  await expect(page.getByText('CSRF-token ontbreekt of klopt niet')).toBeVisible();
  await expect(page).toHaveURL('/klassen');
});

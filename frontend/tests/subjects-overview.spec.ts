import { expect, test, type Page } from '@playwright/test';

const SITES = [
  { slug: 'python', display_name: 'Python', subject: 'informatica' },
  { slug: 'webdev', display_name: 'Webdevelopment', subject: 'informatica' },
  { slug: 'onderzoek', display_name: 'Onderzoek', subject: 'wo' },
  { slug: 'home', display_name: 'Coderius College', subject: null },
].map((site) => {
  const domain = site.subject ? `${site.subject}.coderius.nl` : 'coderius.nl';
  return { ...site, domain, path: site.slug, url: `https://${domain}/${site.slug}/` };
});

const SUBJECTS = [
  { slug: 'informatica', display_name: 'Informatica', domain: 'informatica.coderius.nl' },
  { slug: 'wo', display_name: 'Wetenschapsoriëntatie', domain: 'wo.coderius.nl' },
];

async function mockApi(page: Page) {
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      let json: unknown = [];
      if (path === '/api/auth/me') json = { login: 'teacher', csrf_token: 'token' };
      if (path === '/api/sites') json = SITES;
      if (path === '/api/subjects') json = SUBJECTS;
      await route.fulfill({ json });
    },
  );
}

const main = (page: Page) => page.getByRole('main');
const navbar = (page: Page) => page.getByRole('navigation');
const vakToggle = (page: Page, name: string) =>
  main(page).getByRole('button', { name: new RegExp(`^${name}`) });

test('a closed Vak on the dashboard stays closed after reloading', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  const card = main(page).getByRole('link', { name: 'Python', exact: true });
  await expect(card).toBeVisible();

  await vakToggle(page, 'Informatica').click();
  await expect(vakToggle(page, 'Informatica')).toHaveAttribute('aria-expanded', 'false');
  await expect(card).toBeHidden();

  await page.reload();
  await expect(vakToggle(page, 'Informatica')).toHaveAttribute('aria-expanded', 'false');
  await expect(card).toBeHidden();
  await expect(main(page).getByRole('link', { name: 'Onderzoek', exact: true })).toBeVisible();
});

test('searching opens matching Vakken and clearing restores the saved state', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await main(page).getByRole('button', { name: 'Alles sluiten' }).click();
  await expect(main(page).getByRole('link', { name: 'Python', exact: true })).toBeHidden();

  const search = main(page).getByRole('textbox', { name: 'Zoek een site' });
  await search.fill('pyth');
  await expect(main(page).getByRole('link', { name: 'Python', exact: true })).toBeVisible();
  await expect(main(page).getByRole('link', { name: 'Webdevelopment', exact: true })).toHaveCount(0);
  await expect(main(page).getByRole('region', { name: 'Wetenschapsoriëntatie' })).toHaveCount(0);

  await search.fill('java');
  await expect(main(page).getByText('Geen sites gevonden voor “java”.')).toBeVisible();

  await main(page).getByRole('button', { name: 'Zoekopdracht wissen' }).click();
  await expect(vakToggle(page, 'Informatica')).toHaveAttribute('aria-expanded', 'false');
  await expect(vakToggle(page, 'Wetenschapsoriëntatie')).toHaveAttribute('aria-expanded', 'false');
});

test('sidebar folders remember their own state, separate from the dashboard', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  const folder = navbar(page).getByRole('button', { name: 'Wetenschapsoriëntatie' });
  await expect(folder).toHaveAttribute('aria-expanded', 'true');

  await folder.click();
  await expect(folder).toHaveAttribute('aria-expanded', 'false');

  await page.reload();
  await expect(folder).toHaveAttribute('aria-expanded', 'false');
  await expect(navbar(page).getByRole('button', { name: 'Informatica' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  // The dashboard keeps its own state: the Vak is still open there.
  await expect(vakToggle(page, 'Wetenschapsoriëntatie')).toHaveAttribute('aria-expanded', 'true');
});

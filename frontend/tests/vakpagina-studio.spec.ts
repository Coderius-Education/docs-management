import { expect, test, type Page } from '@playwright/test';
import { mockConcepts, SAVED } from './studio-mock';

const SITES = [
  { slug: 'python', display_name: 'Python', subject: 'informatica' },
  { slug: 'web', display_name: 'Web', subject: 'informatica' },
  { slug: 'onderzoek', display_name: 'Onderzoek', subject: 'wo' },
].map((site) => ({
  ...site,
  domain: `${site.subject}.coderius.nl`,
  path: site.slug,
  url: `https://${site.subject}.coderius.nl/${site.slug}/`,
}));
const SUBJECTS = [
  { slug: 'informatica', display_name: 'Informatica', domain: 'informatica.coderius.nl' },
  { slug: 'wo', display_name: 'Wetenschapsoriëntatie', domain: 'wo.coderius.nl' },
];

async function mockApi(page: Page) {
  const writes: any[] = [];
  let state: { head: string; document: unknown } = { head: 'head-1', document: null };
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (path === '/api/auth/me') return route.fulfill({ json: { login: 'teacher', csrf_token: 't' } });
      if (path === '/api/sites') return route.fulfill({ json: SITES });
      if (path === '/api/subjects') return route.fulfill({ json: SUBJECTS });
      if (path === '/api/subjects/informatica/pagina') {
        if (method === 'PUT') {
          const body = route.request().postDataJSON();
          writes.push(body);
          state = { head: `head-${writes.length + 1}`, document: body.document };
          return route.fulfill({ json: { head_sha: state.head, document: body.document } });
        }
        return route.fulfill({ json: { head_sha: state.head, document: state.document } });
      }
      return route.fulfill({ json: [] });
    },
  );
  await mockConcepts(page);
  return writes;
}

const main = (page: Page) => page.getByRole('main');

test('a teacher designs the informatica landing page and saves it into a concept', async ({ page }) => {
  const writes = await mockApi(page);
  await page.goto('/');
  await main(page).getByRole('region', { name: 'Informatica' }).getByRole('button', { name: 'Vakpagina' }).click();
  await expect(page).toHaveURL(/\/vakken\/informatica\/pagina$/);
  await expect(main(page).getByText('Informatica gebruikt de standaardpagina')).toBeVisible();

  await main(page).getByRole('button', { name: 'Ontwerp de vakpagina' }).click();
  // The default page is there: catalogue, then Lesmateriaal and Visie.
  await expect(main(page).getByRole('heading', { name: 'Lesmateriaal' })).toBeVisible();

  await main(page).getByRole('button', { name: 'Blok toevoegen' }).click();
  await page.getByRole('menuitem', { name: 'Introductie' }).click();
  await main(page).getByRole('textbox', { name: 'Kop', exact: true }).fill('Informatica op Coderius');
  await main(page).getByRole('button', { name: 'Blok omhoog' }).click();
  await main(page).getByRole('button', { name: 'Blok omhoog' }).click();

  await main(page).getByRole('button', { name: 'Cursusoverzicht bewerken' }).click();
  await main(page).getByRole('textbox', { name: 'Uitgelicht' }).click({ force: true });
  await page.getByRole('option', { name: 'Web' }).click();

  await main(page).getByRole('tab', { name: 'Thema' }).click();
  await main(page).getByLabel('Hoofdkleur', { exact: true }).fill('#ffff00');
  await main(page).getByLabel('Tekst op de hoofdkleur', { exact: true }).fill('#ffffff');
  await expect(main(page).getByText('te laag, minstens 4,5:1')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Opslaan…' })).toBeDisabled();
  await main(page).getByLabel('Hoofdkleur', { exact: true }).fill('#1d4ed8');
  await expect(main(page).getByText('goed leesbaar')).toBeVisible();

  await main(page).getByRole('button', { name: 'Opslaan…' }).click();
  await page.getByLabel('Waar gaat dit over?').fill('Nieuwe vakpagina');
  await page.getByRole('button', { name: 'Concept opslaan', exact: true }).click();
  await expect(page.getByText(SAVED)).toBeVisible();

  expect(writes).toHaveLength(1);
  expect(writes[0].branch).toMatch(/^concept\/home-/);
  const doc = writes[0].document;
  expect(doc.vak).toBe('informatica');
  expect(doc.blokken.map((b: { type: string }) => b.type)).toEqual(['Hero', 'Courses', 'Columns']);
  expect(doc.blokken[0].props.title).toBe('Informatica op Coderius');
  expect(doc.blokken[1].props.uitgelicht).toEqual(['web']);
  expect(doc.thema.licht).toEqual({ primary: '#1d4ed8', primaryForeground: '#ffffff' });
});

test('the sidebar links each vak to its landing page', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await page.getByRole('navigation').getByText('Vakpagina').first().click();
  await expect(page).toHaveURL(/\/vakken\/informatica\/pagina$/);
});

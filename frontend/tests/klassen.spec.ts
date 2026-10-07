import { expect, test, type Page } from '@playwright/test';

const SITES = [
  { slug: 'python', display_name: 'Python', subject: 'informatica' },
  { slug: 'web', display_name: 'Web', subject: 'informatica' },
  { slug: 'onderzoek', display_name: 'Onderzoek', subject: 'wo' },
].map((site) => {
  const domain = `${site.subject}.coderius.nl`;
  return { ...site, domain, path: site.slug, url: `https://${domain}/${site.slug}/` };
});
const SUBJECTS = [
  { slug: 'informatica', display_name: 'Informatica', domain: 'informatica.coderius.nl' },
  { slug: 'wo', display_name: 'Wetenschapsoriëntatie', domain: 'wo.coderius.nl' },
];

const MANIFEST = {
  site: 'python',
  path: 'python',
  manifest: {
    stale: false,
    built_at: null,
    sidebars: {
      tutorialSidebar: [
        {
          key: 'cat:basis',
          type: 'category',
          label: 'Basis',
          items: [
            {
              key: 'doc:basis/introductie',
              type: 'doc',
              docId: 'basis/introductie',
              label: 'Welkom bij Python',
              href: '/python/docs/basis/introductie',
            },
          ],
        },
        { key: 'cat:tekst', type: 'category', label: 'Tekst', items: [] },
        { key: 'cat:klassen', type: 'category', label: 'Klassen', items: [] },
      ],
    },
  },
};

function nieuweKlas(rol: 'eigenaar' | 'geen' = 'eigenaar') {
  return {
    id: 7,
    code: 'abcdef2345',
    vak: 'informatica',
    naam: '4H-inf',
    url: 'https://informatica.coderius.nl/klas/abcdef2345',
    gearchiveerd: false,
    versie: 1,
    eigenaar: { login: rol === 'eigenaar' ? 'teacher' : 'collega', name: null, avatar_url: null },
    docenten: [],
    rol,
    aantal_items: 0,
    updated_at: null,
    inhoud: { versie: 1, intro: '', groepen: [], cursussen: {} },
  };
}

async function mockApi(page: Page, rol: 'eigenaar' | 'geen' = 'eigenaar') {
  let klas = nieuweKlas(rol);
  const saves: any[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/auth/me') return route.fulfill({ json: { login: 'teacher', csrf_token: 't' } });
      if (path === '/api/sites') return route.fulfill({ json: SITES });
      if (path === '/api/subjects') return route.fulfill({ json: SUBJECTS });
      if (path === '/api/klassen') return route.fulfill({ json: [klas] });
      if (path === '/api/klassen/hoofdstukken/python') return route.fulfill({ json: MANIFEST });
      if (path.startsWith('/api/klassen/hoofdstukken/'))
        return route.fulfill({ json: { site: 'web', path: 'web', manifest: null } });
      if (path === '/api/klassen/7' && request.method() === 'PUT') {
        const body = request.postDataJSON();
        saves.push(body);
        if (body.versie !== klas.versie) {
          return route.fulfill({ status: 409, json: { detail: 'Een collega heeft deze klas intussen gewijzigd' } });
        }
        klas = { ...klas, naam: body.naam, inhoud: body.inhoud, versie: klas.versie + 1 };
        return route.fulfill({ json: klas });
      }
      if (path === '/api/klassen/7') return route.fulfill({ json: klas });
      return route.fulfill({ json: [] });
    },
  );
  return saves;
}

const main = (page: Page) => page.getByRole('main');

test('a teacher builds a class: course, lesson, link and hidden chapter', async ({ page }) => {
  const saves = await mockApi(page);
  await page.goto('/klassen');
  await main(page).getByRole('link', { name: '4H-inf' }).click();

  await main(page).getByRole('button', { name: 'Groep', exact: true }).click();
  await main(page).getByRole('textbox', { name: 'Titel van de groep' }).fill('Periode 1');

  await main(page).getByRole('button', { name: 'Cursus', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Python' }).click();

  await main(page).getByRole('button', { name: 'Les', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Les toevoegen' });
  await dialog.getByText('Basis').click();
  await dialog.getByText('Welkom bij Python').click();

  await main(page).getByRole('button', { name: 'Link', exact: true }).click();
  const linkDialog = page.getByRole('dialog', { name: 'Link toevoegen' });
  await linkDialog.getByLabel('Naam').fill('Inleveren');
  await linkDialog.getByLabel('Adres').fill('javascript:alert(1)');
  await expect(linkDialog.getByRole('button', { name: 'Toevoegen' })).toBeDisabled();
  await linkDialog.getByLabel('Adres').fill('https://forms.example/inleveren');
  await linkDialog.getByRole('button', { name: 'Toevoegen' }).click();

  await main(page).getByRole('checkbox', { name: 'Klassen tonen' }).uncheck();
  await main(page).getByRole('button', { name: 'Tekst omhoog' }).click();

  await main(page).getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByText('Opgeslagen; leerlingen zien het meteen.')).toBeVisible();

  expect(saves).toHaveLength(1);
  expect(saves[0].inhoud.groepen[0]).toEqual({
    id: 'g1',
    titel: 'Periode 1',
    items: [
      { type: 'cursus', site: 'python' },
      {
        type: 'pagina',
        site: 'python',
        docId: 'basis/introductie',
        pad: '/python/docs/basis/introductie',
        label: 'Welkom bij Python',
      },
      { type: 'link', url: 'https://forms.example/inleveren', label: 'Inleveren' },
    ],
  });
  expect(saves[0].inhoud.cursussen.python).toEqual({
    volgorde: ['cat:tekst', 'cat:basis', 'cat:klassen'],
    verborgen: ['cat:klassen'],
  });
  await expect(main(page).getByRole('button', { name: 'Opgeslagen' })).toBeDisabled();
});

test('a colleague’s class is read-only but can be duplicated', async ({ page }) => {
  await mockApi(page, 'geen');
  await page.goto('/klassen/7');
  await expect(main(page).getByText('Je kunt hem bekijken en dupliceren')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Dupliceren' })).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Opslaan' })).toHaveCount(0);
  await expect(main(page).getByRole('textbox', { name: 'Welkomsttekst' })).toBeDisabled();
});

test('a course without a build explains where the chapter list comes from', async ({ page }) => {
  await mockApi(page);
  await page.goto('/klassen/7');
  await main(page).getByRole('textbox', { name: 'Cursus' }).click();
  await page.getByRole('option', { name: 'Web' }).click();
  await expect(main(page).getByText('Van deze cursus is nog geen hoofdstukkenlijst.')).toBeVisible();
});

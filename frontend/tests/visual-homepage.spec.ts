import { expect, test, type Page } from '@playwright/test';
const original = `import { Hero, Section, Columns, Card, Buttons, Button } from '@coderius/shared/components/HomepageSections';
import AlgorithmGrid from '@site/src/components/AlgorithmGrid';

<Hero title="Welkom" tagline="Leer op jouw manier">
  <Buttons><Button href="/docs/intro">Begin hier</Button></Buttons>
</Hero>

<Section title="Ontdek de cursus">
  <Columns count={2}>
    <Card title="Eerste kaart">Korte uitleg.</Card>
    <Card title="Tweede kaart">Meer uitleg.</Card>
  </Columns>
</Section>

<AlgorithmGrid custom={keepThis()} />
`;
async function setup(page: Page) {
  let content = original;
  const writes: any[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const u = new URL(route.request().url());
      let json: unknown = [];
      if (u.pathname === '/api/auth/me')
        json = { login: 'teacher', csrf_token: 'token' };
      if (u.pathname === '/api/sites')
        json = [
          {
            slug: 'python',
            display_name: 'Python',
            domain: 'python.coderius.nl',
          },
        ];
      if (u.pathname.endsWith('/page')) {
        if (route.request().method() === 'PUT') {
          const body = route.request().postDataJSON();
          writes.push(body);
          content = body.content;
          json = {
            content_sha: `file-${writes.length + 1}`,
            commit_sha: 'commit',
          };
        } else
          json = {
            content,
            sha: `file-${writes.length + 1}`,
            path: 'homepage.mdx',
            ref: 'lesson',
          };
      }
      if (u.pathname.endsWith('/settings'))
        json = {
          settings: {
            version: 1,
            site: { title: 'Python' },
            themeConfig: {},
            tokens: { light: { '--ifm-color-primary': '#843a7a' } },
            docs: {},
          },
          head_sha: 'head-1',
        };
      if (u.pathname.endsWith('/capabilities'))
        json = { managed_homepage: true, settings_runtime: true };
      await route.fulfill({ json });
    },
  );
  await page.goto(
    '/sites/python/edit?scope=homepage&path=homepage.mdx&ref=lesson',
  );
  return writes;
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  await page
    .getByRole('button', { name: 'Verder bewerken', exact: true })
    .click();
}
test('edit homepage text directly on the page and preserve nested tools across saves', async ({
  page,
}) => {
  const writes = await setup(page);
  const canvas = page.getByRole('region', {
    name: 'Cursuspagina',
    exact: true,
  });
  await expect(canvas).toBeVisible();
  const title = canvas
    .locator('[contenteditable="plaintext-only"][aria-label="Titel"]')
    .first();
  await title.fill('Welkom bij Python');
  await expect(title).toHaveText('Welkom bij Python');
  await canvas
    .locator('[contenteditable="plaintext-only"][aria-label="Titel"]')
    .nth(2)
    .fill('Start met oefenen');
  await save(page);
  expect(writes[0].content).toContain('Welkom bij Python');
  expect(writes[0].content).toContain('Start met oefenen');
  expect(writes[0].content).toContain('<AlgorithmGrid custom={keepThis()} />');
  expect(writes[0].content).toContain('href="/docs/intro"');
  await title.fill('Welkom terug');
  await save(page);
  expect(writes[1].sha).toBe('file-2');
  await page.reload();
  await expect(title).toHaveText('Welkom terug');
});
test('visual section gallery adds content and undo restores the page', async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole('button', { name: 'Sectie toevoegen', exact: true })
    .click();
  const gallery = page.getByRole('dialog', { name: 'Kies een sectie' });
  await expect(gallery).toBeVisible();
  await gallery
    .getByRole('button', { name: 'Tekstsectie', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Cursuspagina', exact: true }),
  ).toContainText('Nieuwe sectie');
  await page
    .getByRole('button', { name: 'Ongedaan maken', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Cursuspagina', exact: true }),
  ).not.toContainText('Nieuwe sectie');
});
test('mobile canvas stays within the screen and section controls are reachable by keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  const canvas = page.getByRole('region', {
    name: 'Cursuspagina',
    exact: true,
  });
  await expect(canvas).toBeVisible();
  await canvas
    .locator('[contenteditable="plaintext-only"][aria-label="Titel"]')
    .first()
    .focus();
  await page.getByRole('button', { name: 'Omlaag 1', exact: true }).click();
  const titles = canvas.locator(
    '[contenteditable="plaintext-only"][aria-label="Titel"]',
  );
  await expect(titles.first()).toHaveText('Ontdek de cursus');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test('button text edits and dragging preserve valid MDX and existing tools', async ({
  page,
}) => {
  const writes = await setup(page);
  const canvas = page.getByRole('region', {
    name: 'Cursuspagina',
    exact: true,
  });
  const label = canvas.getByRole('textbox', { name: 'Knoptekst', exact: true });
  await label.fill('Start <Python> {nu} *hier*');
  await expect(label).toHaveText('Start <Python> {nu} *hier*');
  await canvas
    .getByRole('textbox', { name: 'Titel', exact: true })
    .first()
    .focus();
  await canvas.locator('[data-section-path="1"]').scrollIntoViewIfNeeded();
  await page
    .locator('.homepage-drag-handle')
    .dragTo(canvas.locator('[data-section-path="1"]'));
  await expect(
    canvas.getByRole('textbox', { name: 'Titel', exact: true }).first(),
  ).toHaveText('Ontdek de cursus');
  await save(page);
  expect(writes[0].content.indexOf('<Section')).toBeLessThan(
    writes[0].content.indexOf('<Hero'),
  );
  expect(writes[0].content).toContain('<AlgorithmGrid custom={keepThis()} />');
  await page.reload();
  await expect(
    canvas.getByRole('textbox', { name: 'Knoptekst', exact: true }),
  ).toHaveText('Start <Python> {nu} *hier*');
});

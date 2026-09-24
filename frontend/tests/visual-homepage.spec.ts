import { expect, test, type Page } from '@playwright/test';
import { EMPTY_SETTINGS, mockStudio, studioUrl } from './studio-mock';
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
  const writes = await mockStudio(page, {
    content: original,
    settings: {
      ...EMPTY_SETTINGS,
      site: { title: 'Python' },
      tokens: { light: { '--ifm-color-primary': '#843a7a' } },
    },
  });
  await page.goto(studioUrl());
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
  expect(writes[1].expected_head).toBe('head-2');
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
  expect(writes[0].content!.indexOf('<Section')).toBeLessThan(
    writes[0].content!.indexOf('<Hero'),
  );
  expect(writes[0].content).toContain('<AlgorithmGrid custom={keepThis()} />');
  await page.reload();
  await expect(
    canvas.getByRole('textbox', { name: 'Knoptekst', exact: true }),
  ).toHaveText('Start <Python> {nu} *hier*');
});

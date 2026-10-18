import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockConcepts } from './studio-mock';
import YAML from 'yaml';

async function mockContent(page: Page, initial: string) {
  let content = initial;
  let sha = 'sha-1';
  const saves: { content: string; sha: string; scope?: string }[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      let data: unknown = [];
      if (url.pathname === '/api/auth/me')
        data = { login: 'teacher', name: 'Docent', csrf_token: 'test' };
      if (url.pathname === '/api/sites')
        data = [
          {
            slug: 'python',
            display_name: 'Python',
            domain: 'python.coderius.nl',
          },
        ];
      if (url.pathname === '/api/branches')
        data = [
          { name: 'main', sha: 'main' },
          { name: 'lesson', sha: 'branch' },
        ];
      if (url.pathname.endsWith('/capabilities'))
        data = {
          managed_homepage: true,
          settings: true,
          mermaid: false,
          math: false,
        };
      if (url.pathname.endsWith('/page')) {
        if (route.request().method() === 'PUT') {
          const payload = route.request().postDataJSON();
          saves.push(payload);
          content = payload.content;
          sha = `sha-${saves.length + 1}`;
          data = { content_sha: sha, commit_sha: 'commit' };
        } else
          data = {
            path: url.searchParams.get('path'),
            ref: url.searchParams.get('ref'),
            content,
            sha,
          };
      }
      await route.fulfill({ json: data });
    },
  );
  await mockConcepts(page, [
    { number: 7, title: 'Les verbeteren', branch: 'lesson', site: 'python' },
  ]);
  return saves;
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('het voorbeeld wordt gebouwd')).toBeVisible();
  await page
    .getByRole('button', { name: 'Verder bewerken', exact: true })
    .click();
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('textbox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
function properties(source: string): Record<string, unknown> {
  return YAML.parse(source.match(/^---\n([\s\S]*?)\n---/)![1]);
}

test('advanced title edits preserve original YAML comments and intentional comment revisions', async ({
  page,
}) => {
  const saves = await mockContent(
    page,
    "---\n# original header\ntitle: 'Original' # title note\nunknown: {nested: true} # keep custom note\n---\n\nBody",
  );
  await page.goto('/sites/python/edit?path=yaml-comments.mdx&ref=lesson');
  await page.getByRole('button', { name: 'Geavanceerd', exact: true }).click();
  const yaml = page.getByLabel('Alle eigenschappen als YAML', { exact: true });
  await expect(yaml).toHaveValue(
    "# original header\ntitle: 'Original' # title note\nunknown: {nested: true} # keep custom note\n",
  );
  await yaml.fill(
    (await yaml.inputValue())
      .replace("'Original'", "'Updated'")
      .replace('# original header', '# revised header'),
  );
  await save(page);
  expect(saves[0].content).toContain("title: 'Updated' # title note");
  expect(saves[0].content).toContain(
    'unknown: {nested: true} # keep custom note',
  );
  expect(saves[0].content).toContain('# revised header');
  expect(saves[0].content).not.toContain('# original header');
});

test('properties preserve explicit false and disabled links through repeated saves', async ({
  page,
}) => {
  const saves = await mockContent(
    page,
    "---\n# Keep metadata comments\ntitle: 'Original' # title note\nhide_title: true\npagination_prev: previous\nunknown:\n  nested: [one, two] # nested note\n---\n\nLesson text",
  );
  await page.goto('/sites/python/edit?path=properties.mdx&ref=lesson');
  await page
    .getByRole('textbox', { name: 'Titel', exact: true })
    .fill('Updated');
  await page.getByRole('button', { name: 'Weergave', exact: true }).click();
  await choose(page, 'Titel verbergen', 'Nee');
  await page
    .getByRole('button', { name: 'Menu en navigatie', exact: true })
    .click();
  await choose(page, 'Vorige les', 'Uitgeschakeld');
  await save(page);
  expect(properties(saves[0].content)).toMatchObject({
    title: 'Updated',
    hide_title: false,
    pagination_prev: null,
    unknown: { nested: ['one', 'two'] },
  });
  expect(saves[0].content).toContain('# Keep metadata comments');
  expect(saves[0].content).toContain('# nested note');
  expect(saves[0].content).toContain('# title note');
  await choose(page, 'Titel verbergen', 'Overnemen (automatisch)');
  await save(page);
  expect(saves[1].sha).toBe('sha-2');
  expect(properties(saves[1].content)).not.toHaveProperty('hide_title');
  expect(properties(saves[1].content).pagination_prev).toBeNull();
});

test('invalid advanced YAML and property values block saving and retain repair text', async ({
  page,
}) => {
  const saves = await mockContent(page, '---\ntitle: Initial\n---\n\nText');
  await page.goto('/sites/python/edit?path=invalid.mdx&ref=lesson');
  await page.getByRole('button', { name: 'Geavanceerd', exact: true }).click();
  const yaml = page.getByLabel('Alle eigenschappen als YAML', { exact: true });
  await yaml.fill('title: [');
  await expect(yaml).toHaveValue('title: [');
  await expect(
    page.getByRole('button', { name: 'Opslaan…', exact: true }),
  ).toBeDisabled();
  await yaml.fill(
    'title: Changed\ntoc_min_heading_level: 6\ntoc_max_heading_level: 2',
  );
  await expect(
    page.getByRole('button', { name: 'Opslaan…', exact: true }),
  ).toBeDisabled();
  await yaml.fill(
    '# authored comment\ntitle: Changed\npagination_next: null\nhide_title: false\ncustom: { nested: [1, 2] }\n',
  );
  await expect(yaml).toHaveValue(
    '# authored comment\ntitle: Changed\npagination_next: null\nhide_title: false\ncustom: { nested: [1, 2] }\n',
  );
  await save(page);
  expect(saves[0].content).toContain('# authored comment');
  expect(properties(saves[0].content)).toMatchObject({
    title: 'Changed',
    pagination_next: null,
    hide_title: false,
    custom: { nested: [1, 2] },
  });
});

test('standalone pages offer applicable fields and preserve custom docs metadata', async ({
  page,
}) => {
  const saves = await mockContent(
    page,
    '---\ntitle: Page\nsidebar_label: keep-custom\n---\n\nText',
  );
  await page.goto('/sites/python/edit?path=about.mdx&ref=lesson&scope=pages');
  await expect(
    page.getByRole('button', { name: 'Menu en navigatie', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Weergave', exact: true }).click();
  await page
    .getByLabel('CSS-klasse van pagina', { exact: true })
    .fill('wide-page');
  await expect(page.getByLabel('Titel verbergen', { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole('button', { name: 'Publicatie en SEO', exact: true })
    .click();
  await page
    .getByLabel('Auteur laatste wijziging', { exact: true })
    .fill('Ada');
  await save(page);
  expect(saves[0].scope).toBe('pages');
  expect(properties(saves[0].content)).toMatchObject({
    wrapperClassName: 'wide-page',
    sidebar_label: 'keep-custom',
    last_update: { author: 'Ada' },
  });
});

test('visual code metadata and stable heading IDs survive saving with unknown source', async ({
  page,
}) => {
  const saves = await mockContent(
    page,
    '## Original {#stable}\n\n```python title="demo.py" {1} magic=keep\nprint(1)\nprint(2)\n```\n\n<Unknown config={makeConfig()} />',
  );
  await page.goto('/sites/python/edit?path=code.mdx&ref=lesson');
  await page.getByLabel('Koptekst', { exact: true }).fill('Changed heading');
  await expect(page.getByLabel('Vast kop-ID', { exact: true })).toHaveValue(
    'stable',
  );
  await page
    .getByLabel('Titel van codevoorbeeld', { exact: true })
    .fill('lesson.py');
  await page.getByLabel('Gemarkeerde regels', { exact: true }).fill('2');
  await page.getByLabel('Regelnummers tonen', { exact: true }).check();
  await page
    .getByLabel('Code', { exact: true })
    .fill('print("first")\nprint("second")');
  await expect(page.locator('.mdx-preview h2#stable')).toHaveText(
    'Changed heading',
  );
  await expect(page.locator('.mdx-preview figcaption')).toHaveText('lesson.py');
  await expect(
    page.locator('.mdx-preview [data-line="2"][data-highlighted="true"]'),
  ).toContainText('second');
  await save(page);
  expect(saves[0].content).toContain('## Changed heading {#stable}');
  expect(saves[0].content).toContain('title="lesson.py"');
  expect(saves[0].content).toContain('{2}');
  expect(saves[0].content).toContain('showLineNumbers');
  expect(saves[0].content).toContain('magic=keep');
  expect(saves[0].content).toContain('<Unknown config={makeConfig()} />');
});

test('visual tabs edit labels, defaults and group settings while keeping imports and unknown children', async ({
  page,
}) => {
  const source =
    'import Group from \'@theme/Tabs\';\nimport Item from \'@theme/TabItem\';\n\n<Group groupId="language" defaultValue="two" custom={keep()}>\n<Item value="one" label="One">\n\nFirst\n\n<Unknown />\n\n</Item>\n<Item value="two" label="Two">\n\nSecond\n\n</Item>\n</Group>';
  const saves = await mockContent(page, source);
  await page.goto('/sites/python/edit?path=tabs.mdx&ref=lesson');
  await page.getByLabel('Label tabblad 1', { exact: true }).fill('Python');
  await page.getByLabel('Tabgroep-ID', { exact: true }).fill('examples');
  await choose(page, 'Standaardtabblad', 'Python');
  await page
    .getByLabel('Alleen het actieve tabblad laden (lazy)', { exact: true })
    .check();
  await expect(
    page
      .locator('.preview-tabs')
      .getByRole('tab', { name: 'Python', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page
    .locator('.preview-tabs')
    .getByRole('tab', { name: 'Python', exact: true })
    .focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page
      .locator('.preview-tabs')
      .getByRole('tab', { name: 'Two', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await page
    .getByRole('button', { name: 'Tabblad toevoegen', exact: true })
    .click();
  await page.getByLabel('Label tabblad 3', { exact: true }).fill('Extra');
  await save(page);
  expect(saves[0].content.match(/import /g)).toHaveLength(2);
  expect(saves[0].content).toContain('label={"Python"}');
  expect(saves[0].content).toContain('defaultValue={"one"}');
  expect(saves[0].content).toContain('groupId={"examples"}');
  expect(saves[0].content).toContain('lazy={true}');
  expect(saves[0].content).toContain('<Unknown />');
  expect(saves[0].content).toContain('custom={keep()}');
  expect(saves[0].content).toContain('label={"Extra"}');
});

test('adding tabs inside a tip places imports at document scope', async ({
  page,
}) => {
  const saves = await mockContent(
    page,
    '<details>\n<summary>Tip</summary>\n\nNested text\n\n</details>',
  );
  await page.goto('/sites/python/edit?path=nested-tabs.mdx&ref=lesson');
  await page
    .locator('.lesson-editor-nested')
    .getByRole('button', { name: 'Blok toevoegen', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Tabbladen', exact: true }).click();
  await expect(
    page.getByLabel('Label tabblad 1', { exact: true }),
  ).toBeVisible();
  await save(page);
  const content = saves[0].content;
  expect(content.indexOf("import Tabs from '@theme/Tabs'")).toBeLessThan(
    content.indexOf('<details>'),
  );
  expect(content.indexOf('<Tabs>')).toBeGreaterThan(
    content.indexOf('<summary>'),
  );
  expect(content.indexOf('</Tabs>')).toBeLessThan(
    content.indexOf('</details>'),
  );
});

test('page settings sit below the editor and the save dialog folds the diff away', async ({
  page,
}) => {
  await mockContent(page, '---\ntitle: Les\n---\n\nEerste zin.');
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  const settings = page.locator('#pagina-instellingen');
  await expect(settings).toBeVisible();
  const below = await settings.evaluate((el) => {
    const workspace = document.querySelector('.editor-workspace');
    return !!workspace && !!(workspace.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(below).toBe(true);

  await page.getByLabel('Titel', { exact: true }).fill('Nieuwe les');
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  const toggle = page.getByRole('button', { name: /Wijzigingen bekijken/ });
  await expect(toggle).toContainText('(+1 −1, 1 bestand)');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  const diff = page.locator('#opslaan-wijzigingen');
  await expect(diff).toHaveAttribute('aria-hidden', 'true');
  await toggle.click();
  await expect(diff).toHaveAttribute('aria-hidden', 'false');
  await expect(diff.getByText('+title: Nieuwe les')).toBeVisible();
});

test('the site browser shows a rendered preview with the source one click away', async ({
  page,
}) => {
  await mockContent(page, '---\ntitle: Les\n---\n\n## Lussen\n\nHerhalen met **for**.');
  await page.goto('/sites/python?path=les.mdx&ref=lesson');
  await expect(page.getByRole('heading', { name: 'Lussen' })).toBeVisible();
  await expect(page.getByText('## Lussen')).toHaveCount(0);
  await page.getByText('Broncode', { exact: true }).click();
  await expect(page.getByText('## Lussen')).toBeVisible();
});

test('Blok toevoegen in the toolbar inserts at the cursor, also mid-paragraph', async ({
  page,
}) => {
  const saves = await mockContent(
    page,
    '---\ntitle: Les\n---\n\nEerste zin. Tweede zin.\n\nSlot.',
  );
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  const paragraph = page
    .locator('.milkdown .ProseMirror p')
    .filter({ hasText: 'Eerste zin.' });
  await paragraph.click();
  await page.keyboard.press('End');
  for (let i = 0; i < ' Tweede zin.'.length; i++)
    await page.keyboard.press('ArrowLeft');
  await page
    .locator('.editor-session-toolbar')
    .getByRole('button', { name: 'Blok toevoegen', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Tip (callout)', exact: true }).click();
  await save(page);
  expect(saves[0].content).toMatch(
    /Eerste zin\.\n\n:::tip\nSchrijf hier je tip\.\n:::\n\nTweede zin\.\n\nSlot\./,
  );
});

test('the toolbar inserts components inside the callout that holds the cursor', async ({
  page,
}) => {
  const saves = await mockContent(
    page,
    'Intro.\n\n:::tip\nBinnen de tip.\n:::\n\nSlot.',
  );
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  await page
    .locator('.lesson-editor-nested .milkdown .ProseMirror p')
    .filter({ hasText: 'Binnen de tip.' })
    .click();
  await page.keyboard.press('End');
  await page
    .locator('.editor-session-toolbar')
    .getByRole('button', { name: 'Blok toevoegen', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Python-oefening', exact: true }).click();
  await save(page);
  const content = saves[0].content;
  const component = content.indexOf('<CodeExercise');
  expect(component).toBeGreaterThan(content.indexOf('Binnen de tip.'));
  expect(component).toBeLessThan(content.lastIndexOf(':::'));
  expect(content.indexOf('import CodeExercise')).toBeLessThan(
    content.indexOf('Intro.'),
  );
});

test('full screen hides the app shell and keeps the toolbar on top', async ({
  page,
}) => {
  await mockContent(page, 'Tekst.');
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  const header = page.getByText('Coderius Docs Beheer');
  await expect(header).toBeVisible();
  await page.getByRole('button', { name: 'Volledig scherm', exact: true }).click();
  await expect(header).toBeHidden();
  const toolbar = page.locator('.editor-session-toolbar');
  await expect(toolbar.getByRole('button', { name: 'Blok toevoegen', exact: true })).toBeVisible();
  // AppShell schuift kop en navigatie met een transitie weg.
  await expect
    .poll(async () => (await toolbar.boundingBox())!.y)
    .toBeLessThan(5);
  await page.getByRole('button', { name: 'Volledig scherm sluiten', exact: true }).click();
  await expect(header).toBeVisible();
  await page.getByRole('button', { name: 'Volledig scherm', exact: true }).click();
  await expect(header).toBeHidden();
  await page.locator('body').click({ position: { x: 2, y: 400 } });
  await page.keyboard.press('Escape');
  await expect(header).toBeVisible();
});

// Een vaste klikpositie hangt af van het lettertype van de machine.
async function dblclickWord(paragraph: Locator, word: string) {
  const box = await paragraph.evaluate((el, w) => {
    const text = el.firstChild as Text;
    const start = text.data.indexOf(w);
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + w.length);
    const r = range.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, word);
  await paragraph.page().mouse.dblclick(box.x, box.y);
}

test('Link naar pagina wraps the selection in a site: link to a page and heading', async ({
  page,
}) => {
  const saves = await mockContent(page, '---\ntitle: Les\n---\n\nHerhaal eerst lussen hier.');
  await page.route('**/api/links/index', (route) =>
    route.fulfill({
      json: {
        missing: [],
        sites: [
          {
            site: 'python',
            label: 'Python',
            subject: 'informatica',
            build_id: 1,
            built_at: null,
            stale: false,
            pages: [
              {
                path: '/docs/herhalen',
                title: 'Herhalen met lussen',
                kind: 'docs',
                headings: [['de-for-lus', 'De for-lus', 2]],
              },
            ],
          },
          {
            site: 'onderzoek',
            label: 'Onderzoek',
            subject: 'wo',
            build_id: 2,
            built_at: null,
            stale: false,
            pages: [{ path: '/lussen-in-data', title: 'Lussen in data', kind: 'docs', headings: [] }],
          },
        ],
      },
    }),
  );
  await page.route('**/api/subjects', (route) =>
    route.fulfill({
      json: [
        { slug: 'informatica', display_name: 'Informatica', domain: 'informatica.coderius.nl' },
        { slug: 'wo', display_name: 'Wetenschapsoriëntatie', domain: 'wo.coderius.nl' },
      ],
    }),
  );
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  const paragraph = page.locator('.milkdown .ProseMirror p').getByText('Herhaal eerst lussen hier.');
  await dblclickWord(paragraph, 'lussen');
  await page.getByRole('img', { name: 'Link naar pagina' }).click();
  const dialog = page.getByRole('dialog', { name: 'Link naar pagina' });
  await expect(dialog.getByLabel('Zoek een pagina')).toHaveValue('lussen');
  // Zonder filter zoek je over alle vakken; het vak-filter is optioneel.
  const andereVak = dialog.getByRole('option', { name: /Lussen in data/ });
  await expect(andereVak).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Vak' }).click();
  await page.getByRole('option', { name: 'Informatica', exact: true }).click();
  await expect(andereVak).toHaveCount(0);
  await dialog.getByRole('option', { name: /Herhalen met lussen/ }).click();
  await dialog.getByLabel('De for-lus').check();
  await expect(dialog.getByText('site:python/docs/herhalen#de-for-lus')).toBeVisible();
  await dialog.getByRole('button', { name: 'Link invoegen' }).click();
  await save(page);
  expect(saves[0].content).toContain(
    'Herhaal eerst [lussen](site:python/docs/herhalen#de-for-lus) hier.',
  );
});

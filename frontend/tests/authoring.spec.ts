import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
async function mockPortal(page: Page, initial = '# Les\n\nEen gewone les.\n') {
  let content = initial;
  let sha = 'sha-1';
  const saves: Record<string, unknown>[] = [];
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
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
      if (url.pathname.endsWith('/page')) {
        if (method === 'PUT') {
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
  return saves;
}
test('a visual tip survives typing and switching to source', async ({
  page,
}) => {
  await mockPortal(page);
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  await expect(page.locator('.milkdown .ProseMirror')).toHaveCount(1);
  await page
    .getByRole('button', { name: /Snippet invoegen|Blok toevoegen/ })
    .first()
    .click();
  await page.getByRole('menuitem', { name: /:::tip|Tip \(callout\)/ }).click();
  const editor = page.locator('.milkdown .ProseMirror').first();
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Nog een zin.');
  await expect(editor).toContainText('Nog een zin.');
  await page.waitForTimeout(1200); // editor/preview debounce, then verify persistent source
  await page.getByText(/^(MDX|Broncode)$/).click();
  await expect(page.locator('.cm-content').first()).toContainText(':::tip');
});

test('preview retains Python imports and never evaluates lesson expressions', async ({
  page,
}) => {
  await mockPortal(
    page,
    '```python\nimport time\nprint(time.time())\n```\n\n{globalThis.__lessonExecuted = true}',
  );
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  await expect(page.locator('.mdx-preview')).toContainText('import time');
  expect(
    await page.evaluate(
      () => (globalThis as Record<string, unknown>).__lessonExecuted,
    ),
  ).toBeUndefined();
});
export { mockPortal };

test('configures a Python exercise while preserving unknown MDX', async ({
  page,
}) => {
  const saves = await mockPortal(
    page,
    "import Exercise from '@site/src/components/CodeExercise';\n\n# Les\n\n<Exercise custom={retain}>{`print(1)`}</Exercise>\n\n<Unknown {...props} />\n",
  );
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  await page
    .getByLabel('Python-code', { exact: true })
    .fill('print(`hello`)\n${literal}');
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  expect(saves[0].content).toContain('<Unknown {...props} />');
  expect(saves[0].content).toContain('custom={retain}');
  expect(saves[0].content).toContain('${literal}');
  await page
    .getByRole('button', { name: 'Verder bewerken', exact: true })
    .click();
  await page.getByLabel('Python-code', { exact: true }).fill('print(2)');
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  expect(saves).toHaveLength(2);
  expect(saves[1].sha).toBe('sha-2');
  expect(saves[1].content).toContain('print(2)');
});

test('inserts a course component with its import and edits a nested solution', async ({
  page,
}) => {
  await mockPortal(page);
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  await page
    .getByRole('button', { name: 'Blok toevoegen', exact: true })
    .first()
    .click();
  await page
    .getByRole('menuitem', { name: 'Python-oefening', exact: true })
    .click();
  await page.getByLabel('Python-code', { exact: true }).fill('print("Hello")');
  await page
    .getByRole('button', { name: 'Blok toevoegen', exact: true })
    .first()
    .click();
  await page
    .getByRole('menuitem', { name: 'Uitklapbare tip', exact: true })
    .click();
  await page.getByLabel('Uitklaptitel').fill('Mijn tip');
  const nested = page.locator('.lesson-editor-nested .ProseMirror');
  await expect(nested).toHaveCount(1);
  await nested.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Extra hulp.');
  await page.getByText('Broncode', { exact: true }).click();
  await expect(page.locator('.cm-content').first()).toContainText(
    "import CodeExercise from '@site/src/components/CodeExercise'",
  );
  await expect(page.locator('.cm-content').first()).toContainText(
    'Extra hulp.',
  );
  await expect(page.locator('.cm-content').first()).toContainText('Mijn tip');
});

test('offers recovery after reloading and blocks unsaved navigation', async ({
  page,
}) => {
  await mockPortal(page);
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  const editor = page.locator('.ProseMirror').first();
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Recover me.');
  await page.getByText('Dashboard', { exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Niet-opgeslagen wijzigingen',
  );
  await page
    .getByRole('button', { name: 'Verder bewerken', exact: true })
    .click();
  page.on('dialog', (d) => d.accept());
  await page.reload();
  await page
    .getByRole('button', { name: 'Concept herstellen', exact: true })
    .click();
  await expect(page.locator('.ProseMirror').first()).toContainText(
    'Recover me.',
  );
});

test('shows an accessible single pane on a phone in dark mode', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await mockPortal(page);
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  await expect(page.locator('.ProseMirror')).toHaveCount(1);
  await expect(page.locator('.editor-preview-secondary')).toBeHidden();
  await page.getByText('Voorbeeld', { exact: true }).click();
  await expect(page.locator('.mdx-preview')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('teacher-phone.png') });
});

test('inserts a nested callout without moving preserved siblings outside its parent', async ({
  page,
}) => {
  const saves = await mockPortal(
    page,
    ':::tip[Outer]\nOriginal\n\n<Unknown {...props} />\n:::\n\nFollowing text',
  );
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  await page
    .locator('.lesson-editor-nested')
    .getByRole('button', { name: 'Blok toevoegen', exact: true })
    .click();
  await page
    .getByRole('menuitem', { name: 'Informatie (callout)', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Soort blok', exact: true }),
  ).toHaveCount(2);
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  expect(saves[0].content).toContain('::::tip[Outer]');
  expect(saves[0].content).toContain('<Unknown {...props} />');
  expect(saves[0].content).toMatch(/::::\n\nFollowing text$/);
});

test('saving from main adopts the new branch and content SHA', async ({
  page,
}) => {
  const saves = await mockPortal(page);
  const branches: unknown[] = [];
  await page.route('**/api/branches', async (route) => {
    if (route.request().method() === 'POST') {
      branches.push(route.request().postDataJSON());
      await route.fulfill({ json: { name: 'docs/new-lesson', sha: 'branch' } });
    } else await route.fulfill({ json: [{ name: 'main', sha: 'main' }] });
  });
  await page.goto('/sites/python/edit?path=les.mdx');
  await expect(
    page.getByRole('button', { name: 'Opslaan…', exact: true }),
  ).toBeDisabled();
  await page.getByText('Broncode', { exact: true }).click();
  await page.locator('.cm-content').fill('# Changed');
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page.getByLabel('Naam conceptversie').fill('docs/new-lesson');
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  expect(branches).toEqual([{ name: 'docs/new-lesson', from_branch: 'main' }]);
  await expect(page).toHaveURL(/ref=docs%2Fnew-lesson/);
  await page
    .getByRole('button', { name: 'Verder bewerken', exact: true })
    .click();
  await page.locator('.cm-content').fill('# Again');
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  expect(saves[1]).toMatchObject({
    branch: 'docs/new-lesson',
    sha: 'sha-2',
    content: '# Again',
  });
});

test('a save conflict keeps the local text and offers retry', async ({
  page,
}) => {
  await mockPortal(page);
  let conflict = true;
  await page.route(
    (url) => url.pathname === '/api/sites/python/page',
    async (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      if (conflict) {
        conflict = false;
        return route.fulfill({ status: 409, json: { detail: 'Conflict' } });
      }
      return route.fallback();
    },
  );
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  await page.getByText('Broncode', { exact: true }).click();
  await page.locator('.cm-content').fill('# My draft');
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Je eigen tekst blijft bewaard',
  );
  await page.getByRole('button', { name: 'Annuleren', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('My draft');
});

test('can add a registered component inside a collapsible tip', async ({
  page,
}) => {
  const saves = await mockPortal(
    page,
    '# Les\n\n<details>\n<summary>Hint</summary>\n\nText\n\n</details>',
  );
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  await page
    .locator('.lesson-editor-nested')
    .getByRole('button', { name: 'Blok toevoegen', exact: true })
    .click();
  await page
    .getByRole('menuitem', { name: 'Python-oefening', exact: true })
    .click();
  await page.getByLabel('Python-code', { exact: true }).fill('print("Nested")');
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  const text = saves[0].content as string;
  expect(text.indexOf('import CodeExercise')).toBeLessThan(
    text.indexOf('<details>'),
  );
  expect(text.indexOf('<CodeExercise>')).toBeGreaterThan(
    text.indexOf('<summary>'),
  );
  expect(text.indexOf('<CodeExercise>')).toBeLessThan(
    text.indexOf('</details>'),
  );
});

test('prevents publishing temporary image URLs pasted into source', async ({
  page,
}) => {
  await mockPortal(page);
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  await page.getByText('Broncode', { exact: true }).click();
  await page.locator('.cm-content').fill('![Local](blob:browser-only)');
  await expect(page.getByRole('alert')).toContainText(
    'tijdelijke of ongeldige URL',
  );
  await expect(
    page.getByRole('button', { name: 'Opslaan…', exact: true }),
  ).toBeDisabled();
});

test('opens a real Python lesson without producing a diff on view switches', async ({
  page,
}, testInfo) => {
  const source = readFileSync(
    new URL('./fixtures/python-lesson.mdx', import.meta.url),
    'utf8',
  );
  await mockPortal(page, source);
  await page.goto('/sites/python/edit?path=real.mdx&ref=lesson');
  await expect(
    page.getByLabel('Python-code', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Opslaan…', exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath('teacher-desktop.png'),
    fullPage: false,
  });
  await page.getByText('Broncode', { exact: true }).click();
  await page.getByText('Bewerken', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Opslaan…', exact: true }),
  ).toBeDisabled();
});

test('loads a different document when the route changes and retains in-flight edits', async ({
  page,
}) => {
  await mockPortal(page);
  let release: (() => void) | undefined;
  await page.route(
    (url) => url.pathname === '/api/sites/python/page',
    async (route) => {
      if (route.request().method() === 'PUT') {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return route.fulfill({
          json: { content_sha: 'sha-saved', commit_sha: 'c' },
        });
      }
      const url = new URL(route.request().url());
      if (url.searchParams.get('path') === 'second.mdx')
        return route.fulfill({
          json: {
            path: 'second.mdx',
            ref: 'lesson',
            sha: 'second-sha',
            content: '# Second document',
          },
        });
      return route.fallback();
    },
  );
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  await page.getByText('Broncode', { exact: true }).click();
  await page.locator('.cm-content').fill('# First change');
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect.poll(() => !!release).toBe(true);
  // Model a late input transaction while the save request is outstanding.
  await page.locator('.cm-content').fill('# Newer local change');
  release!();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  await page
    .getByRole('button', { name: 'Verder bewerken', exact: true })
    .click();
  await expect(page.locator('.cm-content')).toContainText('Newer local change');
  await expect(
    page.getByRole('button', { name: 'Opslaan…', exact: true }),
  ).toBeEnabled();
  await page.locator('.cm-content').fill('# First change');
  await expect(
    page.getByRole('button', { name: 'Opslaan…', exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    window.history.pushState(
      { idx: (window.history.state?.idx ?? 0) + 1 },
      '',
      '/sites/python/edit?path=second.mdx&ref=lesson',
    );
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.locator('.ProseMirror')).toContainText('Second document');
});

test('creates an exercise lesson through the portal and saves it as a new file', async ({
  page,
}) => {
  const saves = await mockPortal(page);
  await page.goto('/sites/python?ref=lesson');
  await page
    .getByRole('button', { name: 'Nieuwe pagina', exact: true })
    .click();
  await page.getByLabel('Titel van de les').fill('!!!');
  await expect(
    page.getByRole('button', { name: 'Openen in editor', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Titel van de les').fill('Mijn nieuwe les');
  await page.getByRole('textbox', { name: 'Begin met', exact: true }).click();
  await page
    .getByRole('option', { name: 'Opdracht met leerdoel en tip', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Openen in editor', exact: true })
    .click();
  await expect(page.getByLabel('Uitklaptitel')).toBeVisible();
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  expect(saves[0]).toMatchObject({
    path: '01-mijn-nieuwe-les.mdx',
    branch: 'lesson',
    sha: null,
  });
  expect(saves[0].content).toContain('# Mijn nieuwe les');
});

test('invalid frontmatter stays in source recovery instead of entering Markdown conversion', async ({
  page,
}) => {
  await mockPortal(page, '---\n- invalid\n---\n\n# Text');
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  await expect(page.locator('.ProseMirror')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Broncode openen', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Broncode openen', exact: true })
    .click();
  await expect(page.locator('.cm-content')).toContainText('- invalid');
  await expect(
    page.getByRole('button', { name: 'Opslaan…', exact: true }),
  ).toBeDisabled();
});

const uploadPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);

test('uploads an image to a new draft from main, previews it and saves the lesson on that branch', async ({
  page,
}) => {
  const saves = await mockPortal(page);
  let uploaded = '';
  let createdBranch = '';
  await page.route('**/api/branches', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      expect(body.from_branch).toBe('main');
      createdBranch = body.name;
      await route.fulfill({ json: { name: body.name, sha: 'main' } });
    } else
      await route.fulfill({
        json: [
          { name: 'main', sha: 'main' },
          { name: createdBranch, sha: 'b' },
          { name: 'other-draft', sha: 'c' },
        ],
      });
  });
  await page.route(
    (url) => url.pathname.endsWith('/assets'),
    async (route) => {
      if (route.request().method() === 'POST') {
        uploaded = route.request().postDataBuffer()!.toString('latin1');
        expect(route.request().headers()['x-csrf-token']).toBe('test');
        await route.fulfill({
          json: {
            path: 'diagram-1234567890abcdef.png',
            url: './diagram-1234567890abcdef.png',
            commit_sha: 'image-commit',
          },
        });
      } else await route.fulfill({ body: uploadPng, contentType: 'image/png' });
    },
  );
  await page.goto('/sites/python/edit?path=les.mdx');
  await page
    .getByRole('button', { name: 'Blok toevoegen', exact: true })
    .click();
  await page.getByRole('menuitem', { name: /Afbeelding/ }).click();
  await page.getByLabel('Afbeeldingsbestand', { exact: true }).setInputFiles({
    name: 'diagram.png',
    mimeType: 'image/png',
    buffer: uploadPng,
  });
  await page
    .getByLabel('Alternatieve tekst', { exact: true })
    .fill('Schema van de les');
  await page
    .getByRole('button', { name: 'Uploaden en invoegen', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(createdBranch).toMatch(/^docs\//);
  expect(uploaded).toContain(createdBranch);
  expect(uploaded).toContain('diagram.png');
  await expect(page).toHaveURL(/ref=docs%2F/);
  const img = page.locator('.mdx-preview img');
  await expect(img).toHaveAttribute('alt', 'Schema van de les');
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBe(1);
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Conceptversie (branch)', exact: true })
    .click();
  await expect(
    page.getByRole('option', { name: createdBranch, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('option', { name: 'other-draft', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  expect(saves[0]).toMatchObject({ branch: createdBranch, sha: 'sha-1' });
  expect(saves[0].content).toContain('./diagram-1234567890abcdef.png');
  expect(saves[0].content).not.toContain('blob:');
});

test('an upload failure keeps the selected file and text for retry inside a nested block', async ({
  page,
}) => {
  const saves = await mockPortal(
    page,
    '<details>\n<summary>Tip</summary>\n\nExisting text\n\n</details>',
  );
  let attempts = 0;
  await page.route(
    (url) => url.pathname.endsWith('/assets'),
    async (route) => {
      if (route.request().method() !== 'POST')
        return route.fulfill({ body: uploadPng, contentType: 'image/png' });
      attempts++;
      await route.fulfill(
        attempts === 1
          ? { status: 502, json: { detail: 'Upload mislukt' } }
          : {
              json: {
                path: 'image-1234567890abcdef.png',
                url: './image-1234567890abcdef.png',
                commit_sha: 'i',
              },
            },
      );
    },
  );
  await page.goto('/sites/python/edit?path=les.mdx&ref=lesson');
  await page
    .locator('.lesson-editor-nested')
    .getByRole('button', { name: 'Blok toevoegen', exact: true })
    .click();
  await page.getByRole('menuitem', { name: /Afbeelding/ }).click();
  await page.getByLabel('Afbeeldingsbestand', { exact: true }).setInputFiles({
    name: 'image.png',
    mimeType: 'image/png',
    buffer: uploadPng,
  });
  await page
    .getByLabel('Alternatieve tekst', { exact: true })
    .fill('Nested image');
  await page
    .getByRole('button', { name: 'Uploaden en invoegen', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Upload mislukt');
  await expect(
    page.getByLabel('Alternatieve tekst', { exact: true }),
  ).toHaveValue('Nested image');
  await page
    .getByRole('button', { name: 'Uploaden en invoegen', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  expect(saves[0].content).toMatch(
    /Existing text[\s\S]*image-1234567890abcdef.png[\s\S]*<\/details>/,
  );
  expect(saves[0].branch).toBe('lesson');
});

test('a new unsaved lesson retains its uploaded image and draft branch after recovery', async ({
  page,
}) => {
  const saves = await mockPortal(page);
  let branch = '';
  await page.addInitScript(() =>
    sessionStorage.setItem(
      'nieuw:python:folder/new.mdx',
      '# New lesson\n\nUnsaved text',
    ),
  );
  await page.route('**/api/branches', async (route) => {
    if (route.request().method() === 'POST') {
      branch = route.request().postDataJSON().name;
      await route.fulfill({ json: { name: branch, sha: 'base' } });
    } else
      await route.fulfill({
        json: [
          { name: 'main', sha: 'base' },
          { name: branch, sha: 'base' },
        ],
      });
  });
  await page.route(
    (url) => url.pathname.endsWith('/assets'),
    async (route) => {
      if (route.request().method() === 'POST') {
        expect(route.request().postData()).toContain('folder');
        await route.fulfill({
          json: {
            url: './new-1234567890abcdef.png',
            path: 'folder/new-1234567890abcdef.png',
            commit_sha: 'image',
          },
        });
      } else await route.fulfill({ body: uploadPng, contentType: 'image/png' });
    },
  );
  await page.goto('/sites/python/edit?path=folder%2Fnew.mdx&nieuw=1');
  await page
    .getByRole('button', { name: 'Blok toevoegen', exact: true })
    .click();
  await page.getByRole('menuitem', { name: /Afbeelding/ }).click();
  await page
    .getByLabel('Afbeeldingsbestand', { exact: true })
    .setInputFiles({
      name: 'new.png',
      mimeType: 'image/png',
      buffer: uploadPng,
    });
  await page
    .getByLabel('Alternatieve tekst', { exact: true })
    .fill('New image');
  await page
    .getByRole('button', { name: 'Uploaden en invoegen', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page).toHaveURL(/nieuw=1/);
  await page.reload();
  await page
    .getByRole('button', { name: 'Concept herstellen', exact: true })
    .click();
  await expect(page.locator('.mdx-preview')).toContainText('Unsaved text');
  await expect(page.locator('.mdx-preview img')).toHaveAttribute(
    'alt',
    'New image',
  );
  await page.getByRole('button', { name: 'Opslaan…', exact: true }).click();
  await page
    .getByRole('button', { name: 'Concept opslaan', exact: true })
    .click();
  await expect(page.getByText('Je concept is opgeslagen op')).toBeVisible();
  expect(saves[0]).toMatchObject({ branch, sha: null, path: 'folder/new.mdx' });
  expect(saves[0].content).toContain('Unsaved text');
  expect(saves[0].content).toContain('./new-1234567890abcdef.png');
});

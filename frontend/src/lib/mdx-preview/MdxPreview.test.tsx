import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderLesson } from './MdxPreview';
it('preserves imports inside code while omitting actual multiline ESM', () => {
  const source =
    'import {\n Thing\n} from "./module";\n\n```python\nimport time\nprint(time.time())\n```';
  const html = renderToStaticMarkup(renderLesson(source));
  expect(html).toContain('import time');
  expect(html).not.toContain('Thing');
  expect(html).not.toContain('./module');
});
it('never runs source expressions or forwards event handlers to HTML', () => {
  const source =
    '{globalThis.__previewRan = true}\n\n<img src="javascript:alert(1)" onError={() => alert(1)} />\n\n<script>bad()</script>';
  const html = renderToStaticMarkup(renderLesson(source));
  expect((globalThis as Record<string, unknown>).__previewRan).toBeUndefined();
  expect(html).not.toContain('onError');
  expect(html).not.toContain('<script');
  expect(html).not.toContain('<img');
});
it('renders callout titles, details and branch-aware static assets', () => {
  const html = renderToStaticMarkup(
    renderLesson(
      ':::tip[Titel]\nUitleg\n:::\n\n<details>\n<summary>Hint</summary>\n\nTekst\n\n</details>\n\n![Voorbeeld](@site/static/img/a.png)',
      {
        domain: 'python.coderius.nl',
        branch: 'lesson',
        previewOrigin: 'https://lesson--python.preview.coderius.nl',
      },
    ),
  );
  expect(html).toContain('admonition-tip');
  expect(html).toContain('<strong>Titel</strong>');
  expect(html).toContain('<summary>Hint</summary>');
  expect(html).toContain(
    'https://lesson--python.preview.coderius.nl/img/a.png',
  );
});

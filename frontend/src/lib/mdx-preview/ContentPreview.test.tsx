import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseLesson } from '../authoring/document';
import { tabsModel } from '../authoring/content';
import { CodePreview, HeadingPreview, TabsPreview } from './ContentPreview';
it('renders actual code title, numbered lines and highlights', () => {
  const source =
    '```js title="example.js" {2} showLineNumbers=5\nfirst\nsecond\n```';
  const node = parseLesson(source, '').tree.children![0];
  const html = renderToStaticMarkup(
    <CodePreview node={node} source={source} />,
  );
  expect(html).toContain('<figcaption>example.js</figcaption>');
  expect(html).toContain('data-line="5"');
  expect(html).toContain('data-line="6"');
  expect(html).toContain('data-highlighted="true"');
  expect(html).not.toContain('showLineNumbers');
});
it('uses explicit heading IDs without printing their syntax', () => {
  const source = '## Stable {#stable}';
  const node = parseLesson(source, '').tree.children![0];
  const html = renderToStaticMarkup(
    <HeadingPreview
      node={node}
      source={source}
      render={(child) => child.value}
    />,
  );
  expect(html).toBe('<h2 id="stable">Stable</h2>');
});
it('renders tab labels and honors a static default tab', () => {
  const source =
    'import Tabs from \'@theme/Tabs\';\nimport TabItem from \'@theme/TabItem\';\n\n<Tabs defaultValue="two">\n<TabItem value="one" label="One">\n\nFirst\n\n</TabItem>\n<TabItem value="two" label="Two">\n\nSecond\n\n</TabItem>\n</Tabs>';
  const doc = parseLesson(source, '');
  const model = tabsModel(doc.tree.children!.at(-1)!, source, doc.imports)!;
  const html = renderToStaticMarkup(
    <TabsPreview
      model={model}
      render={(node) => node.children?.[0]?.value ?? node.value}
    />,
  );
  expect(html).toContain('role="tablist"');
  expect(html).toMatch(/aria-selected="true"[^>]*>Two<\/button>/);
  expect(html).toContain('Second');
});

import { describe, expect, it } from 'vitest';
import { parseLesson } from './document';
import { parseTree, range } from './syntax';
import {
  codeModel,
  updateCode,
  headingModel,
  updateHeading,
  tabsModel,
  updateTabProperty,
  insertTabs,
  insertTab,
  removeTab,
} from './content';

describe('Docusaurus code and headings', () => {
  it('separates code and heading controls from surrounding rich text', () => {
    const doc = parseLesson(
      'Text\n\n## Heading {#heading}\n\n```js\nalert(1)\n```\n\nAfter',
      'python',
    );
    expect(doc.blocks.map((block) => block.kind)).toEqual([
      'markdown',
      'heading',
      'code',
      'markdown',
    ]);
  });
  it('patches code metadata without losing unknown tokens or surrounding source', () => {
    const source =
      'Before\n\n```python title="demo.py" {1,3-4} showLineNumbers magic=keep\nprint(1)\n```\n\nAfter';
    const node = parseTree(source).children![1];
    expect(codeModel(node, source)).toMatchObject({
      title: 'demo.py',
      highlights: '1,3-4',
      lineNumbers: true,
    });
    const changed = updateCode(source, node, {
      title: 'new.py',
      highlights: '2',
      lineNumbers: false,
      code: '```\nprint(2)',
    });
    expect(changed).toContain('title="new.py"');
    expect(changed).toContain('{2}');
    expect(changed).toContain('magic=keep');
    expect(changed).not.toContain('showLineNumbers');
    expect(changed).toMatch(/^Before\n\n````python/);
    expect(changed).toMatch(/````\n\nAfter$/);
    expect(parseTree(changed).children![1].value).toBe('```\nprint(2)');
  });
  it('keeps code examples with explicit heading syntax literal', () => {
    const source =
      '```md\n## Example {#literal}\n```\n\n## Real {#real}\n\n<Unknown x={getValue()} />';
    const parsed = parseLesson(source, 'python');
    expect(parsed.error).toBeUndefined();
    expect(parsed.tree.children![0].value).toBe('## Example {#literal}');
    const heading = parsed.tree.children![1];
    expect(headingModel(heading, source)).toMatchObject({
      title: 'Real',
      id: 'real',
      depth: 2,
    });
    const changed = updateHeading(source, heading, { title: 'Changed' });
    expect(changed).toBe(
      source.replace('## Real {#real}', '## Changed {#real}'),
    );
    const unknown = parsed.tree.children![2];
    expect(source.slice(range(unknown).from, range(unknown).to)).toBe(
      '<Unknown x={getValue()} />',
    );
  });
});

describe('source-preserving tab groups', () => {
  const source =
    'import Group from \'@theme/Tabs\';\nimport Item from \'@theme/TabItem\';\n\n<Group groupId="languages" custom={keep()}><Item value="py" label="Python" default>\n\nText\n\n<Unknown />\n\n</Item><Item value="js" label="JavaScript">\n\nOther\n\n</Item></Group>';
  it('edits static aliases, defaults and group settings without flattening children or unknown props', () => {
    const doc = parseLesson(source, 'python');
    const node = doc.tree.children!.at(-1)!;
    const model = tabsModel(node, source, doc.imports)!;
    expect(model.items).toHaveLength(2);
    expect(model.groupId.value).toBe('languages');
    const result = updateTabProperty(source, node, 'groupId', 'examples');
    expect(result).toContain('groupId={"examples"}');
    expect(result).toContain('custom={keep()}');
    const changed = updateTabProperty(
      source,
      model.items[0].node,
      'label',
      'Python 3',
    );
    expect(changed).toContain('label={"Python 3"}');
    expect(changed).toContain('<Unknown />');
    const removed = removeTab(source, model, 1);
    expect(removed).not.toContain('value="js"');
    expect(removed).toContain('import Item');
    expect(insertTab(source, model)).toContain('Nieuw tabblad');
  });
  it('does not make dynamic or spread values editable', () => {
    const doc = parseLesson(
      "import Tabs from '@theme/Tabs';\nimport TabItem from '@theme/TabItem';\n\n<Tabs groupId={compute()}><TabItem {...props}>Text</TabItem></Tabs>",
      'python',
    );
    const model = tabsModel(doc.tree.children!.at(-1)!, '', doc.imports)!;
    expect(model.groupId.editable).toBe(false);
    expect(model.items[0].label.editable).toBe(false);
    expect(() =>
      updateTabProperty(
        doc.tree.children!.at(-1)!.value ?? '',
        model.items[0].node,
        'label',
        'No',
      ),
    ).toThrow();
  });
  it('reuses existing imports and avoids local binding collisions for insertion', () => {
    const result = insertTabs(source, source.length);
    expect(result.match(/import /g)).toHaveLength(2);
    expect(result).toContain('<Group>');
    expect(result).toContain('<Item value="tab-1"');
    const collision = insertTabs("import Tabs from './custom';\n", 29);
    expect(collision).toContain("import Tabs2 from '@theme/Tabs'");
    expect(collision).toContain('<Tabs2>');
  });
  it('prevents tab settings that Docusaurus rejects at runtime', () => {
    const initial = insertTabs('', 0);
    const doc = parseLesson(initial, '');
    const model = tabsModel(doc.tree.children!.at(-1)!, initial, doc.imports)!;
    expect(() =>
      updateTabProperty(initial, model.node, 'queryString', true),
    ).toThrow(/groupId/);
    const selected = updateTabProperty(
      initial,
      model.node,
      'defaultValue',
      'tab-2',
    );
    const parsed = parseLesson(selected, '');
    const selectedModel = tabsModel(
      parsed.tree.children!.at(-1)!,
      selected,
      parsed.imports,
    )!;
    expect(() => removeTab(selected, selectedModel, 1)).toThrow(/standaard/);
  });
});

import { describe, expect, it } from 'vitest';
import { compile } from '@mdx-js/mdx';
import { parseLesson, replaceRange } from './document';
import { componentModel, insertComponent, updateComponent } from './components';
import { resolveAsset, persistentImage } from './assets';

describe('source-preserving lessons', () => {
  it('changes prose without touching imports, unknown components or fence metadata', () => {
    const source =
      'import X from \'./x\';\r\n\r\nHello\r\n\r\n<X {...props} />\r\n\r\n```python title="demo"\nimport time\n```\n';
    const doc = parseLesson(source, 'python');
    expect(doc.error).toBeUndefined();
    const block = doc.blocks.find((b) => b.kind === 'markdown')!;
    expect(replaceRange(source, block, 'Changed')).toBe(
      source.replace('Hello', 'Changed'),
    );
    expect(doc.blocks.filter((b) => b.kind === 'source')).toHaveLength(2);
  });
  it('recognizes nested lesson containers without flattening their source', () => {
    const source =
      '<details>\n<summary>Tip</summary>\n\n:::tip[Titel]\nText\n\n<Unknown foo={call()} />\n:::\n\n</details>';
    const outer = parseLesson(source, 'python').blocks[0];
    expect(outer.kind).toBe('container');
    const body = source.slice(
      outer.container!.body.from,
      outer.container!.body.to,
    );
    const inner = parseLesson(body, 'python').blocks[0];
    expect(inner.container?.title).toBe('Titel');
    expect(
      replaceRange(body, inner.container!.body, 'Replacement\n'),
    ).toContain(':::tip[Titel]');
  });
  it('does not mistake fenced imports and JSX for active components', () => {
    expect(
      parseLesson('```python\nimport time\n<X />\n```', 'python').blocks[0]
        .kind,
    ).toBe('markdown');
  });
  it('retains malformed source for recovery', () => {
    expect(parseLesson('<X foo={', 'python').error).toBeTruthy();
  });
});

describe('site-aware forms', () => {
  it('recognizes aliased imports and changes only a literal code field', async () => {
    const source =
      "import Exercise from '@site/src/components/CodeExercise';\n\n<Exercise custom={untouched}>{`print(1)`}</Exercise>";
    const doc = parseLesson(source, 'python');
    const node = doc.blocks[1].node;
    const model = componentModel(node, 'python', doc.imports)!;
    expect(model.name).toBe('CodeExercise');
    const code = 'print(`hello`)\n${literal}\\path';
    const changed = updateComponent(source, node, model, 'code', code);
    expect(changed).toContain('custom={untouched}');
    expect(changed).toContain('<Exercise');
    expect(
      componentModel(
        parseLesson(changed, 'python').blocks[1].node,
        'python',
        doc.imports,
      )?.fields.code.value,
    ).toBe(code);
    await expect(compile(changed)).resolves.toBeTruthy();
  });
  it('never offers to replace a dynamic expression or a spread with a guessed value', () => {
    for (const source of [
      '<PyRunner initialCode={getCode()} />',
      '<PyRunner {...props} />',
    ]) {
      const doc = parseLesson(source, 'algorithms');
      expect(
        componentModel(doc.blocks[0].node, 'algorithms', doc.imports)?.fields
          .code.editable ?? false,
      ).toBe(false);
    }
  });
  it('preserves unknown props when adding a setting', () => {
    const source = '<PyRunner initialCode={`x`} custom={fn()} />';
    const doc = parseLesson(source, 'algorithms');
    const node = doc.blocks[0].node;
    const changed = updateComponent(
      source,
      node,
      componentModel(node, 'algorithms', doc.imports)!,
      'rows',
      8,
    );
    expect(changed).toContain('custom={fn()}');
    expect(changed).toContain('rows={8}');
  });
  it('reuses imports and avoids bindings already used by another module', () => {
    const source =
      "import Run from '@site/src/components/CodeRunner/TryButton';\n\n# Lesson";
    const result = insertComponent(source, 'play', 'TryButton', source.length);
    expect(result.match(/import /g)).toHaveLength(1);
    expect(result).toContain('<Run ');
    const collision = insertComponent(
      "import CodeExercise from './custom';\n",
      'python',
      'CodeExercise',
      36,
    );
    expect(collision).toContain('import CodeExercise2 from');
    expect(() => insertComponent('', 'python', 'TryButton', 0)).toThrow();
  });
});

it('resolves persistent images without accepting temporary or executable URLs', () => {
  const ctx = {
    domain: 'python.coderius.nl',
    path: 'chapter/lesson.mdx',
    branch: 'main',
  };
  expect(resolveAsset('@site/static/img/a.png', ctx)).toBe(
    'https://python.coderius.nl/img/a.png',
  );
  expect(resolveAsset('/img/a.png', ctx)).toBe(
    'https://python.coderius.nl/img/a.png',
  );
  expect(resolveAsset('https://cdn.example/a.png', ctx)).toBe(
    'https://cdn.example/a.png',
  );
  expect(persistentImage('blob:local')).toBe(false);
  expect(persistentImage('javascript:alert(1)')).toBe(false);
  expect(persistentImage('data:image/png;base64,xxx')).toBe(false);
});

it('blocks temporary images in Markdown and JSX, including reference images', async () => {
  const { imageProblems } = await import('./assets');
  expect(imageProblems('![x](blob:abc)')).toHaveLength(1);
  expect(imageProblems('<img src={"blob:abc"} />')).toHaveLength(1);
  expect(
    imageProblems('![x][photo]\n\n[photo]: data:image/png;base64,abc'),
  ).toHaveLength(1);
  expect(imageProblems('![x](/img/existing.png)')).toHaveLength(0);
});

it('does not confuse a locally exported component with a registered global', () => {
  const source =
    'export const PyRunner = Custom;\n\n<PyRunner initialCode={"x"} />';
  const doc = parseLesson(source, 'algorithms');
  expect(doc.blocks.at(-1)?.kind).toBe('source');
});

it('edits a summary title without changing attributes containing a greater-than sign', () => {
  const source =
    '<details>\n<summary title="a > b">Tip</summary>\n\nBody\n\n</details>';
  const block = parseLesson(source, 'python').blocks[0];
  const result = replaceRange(source, block.container!.titleRange!, 'Updated');
  expect(result).toBe(source.replace('>Tip<', '>Updated<'));
  expect(parseLesson(result, 'python').error).toBeUndefined();
});
it('reads children attributes and never overrides a dynamic children expression', () => {
  for (const [source, expected, editable] of [
    ['<PyRunner children={getCode()} />', '', false],
    ['<PyRunner children={"print(1)"} />', 'print(1)', true],
  ] as const) {
    const doc = parseLesson(source, 'algorithms');
    const model = componentModel(
      doc.blocks[0].node,
      'algorithms',
      doc.imports,
    )!;
    expect(model.fields.code.value).toBe(expected);
    expect(model.fields.code.editable).toBe(editable);
    if (editable)
      expect(
        updateComponent(source, doc.blocks[0].node, model, 'code', 'print(2)'),
      ).toBe('<PyRunner children={"print(2)"} />');
  }
});

it('lengthens ancestor callout fences without moving preserved siblings outside', async () => {
  const { updateContainer } = await import('./document');
  const source =
    ':::tip[Outer]\nOriginal\n\n<Unknown {...props} />\n:::\n\nFollowing text';
  const block = parseLesson(source, 'python').blocks[0];
  const result = updateContainer(
    source,
    block,
    'Original\n\n:::info\nInner\n:::\n\n<Unknown {...props} />',
  );
  const doc = parseLesson(result, 'python');
  expect(doc.blocks).toHaveLength(2);
  expect(result).toContain('::::tip[Outer]');
  const body = result.slice(
    doc.blocks[0].container!.body.from,
    doc.blocks[0].container!.body.to,
  );
  expect(body).toContain('<Unknown {...props} />');
  expect(
    parseLesson(body, 'python').blocks.some(
      (b) => b.container?.type === 'info',
    ),
  ).toBe(true);
  expect(result.slice(doc.blocks[1].from, doc.blocks[1].to)).toBe(
    'Following text',
  );
});
it('keeps unclosed directives in source instead of guessing their body bounds', () => {
  const block = parseLesson(':::tip\nFirst\nLast', 'python').blocks[0];
  expect(block.kind).toBe('source');
});

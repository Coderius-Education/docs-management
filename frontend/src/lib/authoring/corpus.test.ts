import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { compile } from '@mdx-js/mdx';
import remarkDirective from 'remark-directive';
import { splitFrontmatter, joinFrontmatter } from '../frontmatter';
import { parseLesson, replaceRange } from './document';
import { componentModel, updateComponent } from './components';
for (const [file, site] of [
  ['python-lesson.mdx', 'python'],
  ['algorithm-lesson.mdx', 'algorithms'],
]) {
  it(`preserves and compiles an edited real ${site} lesson`, async () => {
    const source = readFileSync(
      new URL(`../../../tests/fixtures/${file}`, import.meta.url),
      'utf8',
    );
    const split = splitFrontmatter(source);
    const doc = parseLesson(split.body, site);
    expect(doc.error).toBeUndefined();
    expect(joinFrontmatter(split, split.frontmatter, split.body)).toBe(source);
    const block = doc.blocks.find((b) => b.kind === 'markdown')!;
    let modified = replaceRange(
      split.body,
      block,
      split.body.slice(block.from, block.to) + '\n\nExtra uitleg.',
    );
    for (const preserved of doc.blocks.filter((b) => b.kind !== 'markdown')) {
      expect(modified).toContain(
        split.body.slice(preserved.from, preserved.to),
      );
    }
    const next = parseLesson(modified, site);
    const component = next.blocks.find((b) => b.kind === 'component')!;
    expect(component).toBeTruthy();
    modified = updateComponent(
      modified,
      component.node,
      componentModel(component.node, site, next.imports)!,
      'code',
      'print("Nieuw")\n# ${text} `code`',
    );
    await expect(
      compile(modified, { remarkPlugins: [remarkDirective] }),
    ).resolves.toBeTruthy();
  });
}

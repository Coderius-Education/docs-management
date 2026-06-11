import { describe, expect, it } from 'vitest';

import { hasMdxConstructs, joinFrontmatter, splitFrontmatter } from './frontmatter';

function roundtrip(content: string): string {
  const doc = splitFrontmatter(content);
  return joinFrontmatter(doc, doc.frontmatter, doc.body);
}

describe('frontmatter round-trip (nul diff bij openen+opslaan)', () => {
  const cases: [string, string][] = [
    ['standaard lespagina', '---\nsidebar_position: 3\nhide_table_of_contents: true\n---\n\n# 3.1 Acties\n\nTekst.\n'],
    ['met comments en volgorde', '---\n# volgorde bewust\nsidebar_label: Kort\nsidebar_position: 1\n---\nBody\n'],
    ['quotes en speciale tekens', "---\ndescription: 'Les: variabelen & strings'\n---\nInhoud\n"],
    ['zonder frontmatter', '# Gewoon een pagina\n\nZonder frontmatter.\n'],
    ['lege body', '---\nsidebar_position: 9\n---\n'],
    ['CRLF', '---\r\nsidebar_position: 2\r\n---\r\nBody\r\n'],
    ['kapotte yaml blijft onaangeroerd', '---\n{niet: [geldig\n---\nBody\n'],
    ['mdx met imports', "---\nsidebar_position: 1\n---\n\nimport TryButton from '@site/x';\n\n<TryButton code={`x`} />\n"],
  ];

  it.each(cases)('%s', (_name, content) => {
    expect(roundtrip(content)).toBe(content);
  });
});

describe('joinFrontmatter met wijzigingen', () => {
  it('serialiseert opnieuw als velden veranderen', () => {
    const doc = splitFrontmatter('---\nsidebar_position: 1\n---\n\nBody\n');
    const result = joinFrontmatter(doc, { ...doc.frontmatter, sidebar_position: 5 }, doc.body);
    expect(result).toContain('sidebar_position: 5');
    expect(result).toContain('Body');
  });

  it('laat onbekende velden intact bij wijziging', () => {
    const doc = splitFrontmatter('---\nsidebar_position: 1\ncustom_field: blijf\n---\nBody\n');
    const result = joinFrontmatter(doc, { ...doc.frontmatter, sidebar_position: 2 }, doc.body);
    expect(result).toContain('custom_field: blijf');
  });
});

describe('hasMdxConstructs', () => {
  it('herkent imports en JSX', () => {
    expect(hasMdxConstructs("import X from 'y';\n")).toBe(true);
    expect(hasMdxConstructs('<TryButton />')).toBe(true);
  });
  it('laat gewone markdown en html door', () => {
    expect(hasMdxConstructs('# Kop\n\n<details>\n<summary>tip</summary>\n</details>')).toBe(false);
    expect(hasMdxConstructs('a < b en b > c')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import {
  hasMdxConstructs,
  joinFrontmatter,
  splitFrontmatter,
} from './frontmatter';

function roundtrip(content: string): string {
  const doc = splitFrontmatter(content);
  return joinFrontmatter(doc, doc.frontmatter, doc.body);
}

describe('frontmatter round-trip (nul diff bij openen+opslaan)', () => {
  const cases: [string, string][] = [
    [
      'standaard lespagina',
      '---\nsidebar_position: 3\nhide_table_of_contents: true\n---\n\n# 3.1 Acties\n\nTekst.\n',
    ],
    [
      'met comments en volgorde',
      '---\n# volgorde bewust\nsidebar_label: Kort\nsidebar_position: 1\n---\nBody\n',
    ],
    [
      'quotes en speciale tekens',
      "---\ndescription: 'Les: variabelen & strings'\n---\nInhoud\n",
    ],
    ['zonder frontmatter', '# Gewoon een pagina\n\nZonder frontmatter.\n'],
    ['lege body', '---\nsidebar_position: 9\n---\n'],
    ['CRLF', '---\r\nsidebar_position: 2\r\n---\r\nBody\r\n'],
    ['kapotte yaml blijft onaangeroerd', '---\n{niet: [geldig\n---\nBody\n'],
    [
      'mdx met imports',
      "---\nsidebar_position: 1\n---\n\nimport TryButton from '@site/x';\n\n<TryButton code={`x`} />\n",
    ],
  ];

  it.each(cases)('%s', (_name, content) => {
    expect(roundtrip(content)).toBe(content);
  });
});

describe('joinFrontmatter met wijzigingen', () => {
  it.each(['\n', '\r\n'])(
    'edits empty scaffold frontmatter with %j line endings without duplicating delimiters',
    (eol) => {
      const source = `---${eol}---${eol}${eol}Body${eol}`;
      const doc = splitFrontmatter(source);
      expect(doc.hadFrontmatter).toBe(true);
      expect(doc.frontmatter).toEqual({});
      expect(doc.body).toBe(`${eol}Body${eol}`);
      expect(joinFrontmatter(doc, doc.frontmatter, doc.body)).toBe(source);
      const updated = joinFrontmatter(doc, { title: 'New' }, doc.body);
      expect(updated).toBe(
        `---${eol}title: New${eol}---${eol}${eol}Body${eol}`,
      );
      expect(splitFrontmatter(updated).frontmatter).toEqual({ title: 'New' });
    },
  );
  it('patches nested values while preserving comments, quotes, null and unknown values', () => {
    const doc = splitFrontmatter(
      "---\n# metadata\ntitle: 'Old' # visible title\npagination_prev: null\nhide_title: false\ncustom:\n  nested: [a, b] # keep\nlast_update:\n  author: 'Ada' # credit\n  date: 2026-01-01 # date\n---\n\nBody\n",
    );
    const result = joinFrontmatter(
      doc,
      {
        ...doc.frontmatter,
        title: 'New',
        last_update: { author: 'Grace', date: '2026-01-01' },
      },
      doc.body,
    );
    expect(result).toContain("title: 'New' # visible title");
    expect(result).toMatch(/nested: \[\s*a, b\s*\] # keep/);
    expect(result).toContain("author: 'Grace' # credit");
    expect(result).toContain('date: 2026-01-01 # date');
    expect(result).toContain('# metadata');
    expect(splitFrontmatter(result).frontmatter).toMatchObject({
      pagination_prev: null,
      hide_title: false,
    });
  });

  it('preserves explicit empty strings and arrays but deletes undefined values', () => {
    const doc = splitFrontmatter('---\ntitle: Old\nslug: old\n---\nBody');
    const result = joinFrontmatter(
      doc,
      { title: '', tags: [], pagination_next: null, slug: undefined },
      doc.body,
    );
    expect(splitFrontmatter(result).frontmatter).toEqual({
      title: '',
      tags: [],
      pagination_next: null,
    });
  });

  it('does not alter body spacing when properties change', () => {
    const doc = splitFrontmatter('---\ntitle: Old\n---\n\n\nBody');
    expect(
      splitFrontmatter(joinFrontmatter(doc, { title: 'New' }, doc.body)).body,
    ).toBe('\n\nBody');
  });
  it('serialiseert opnieuw als velden veranderen', () => {
    const doc = splitFrontmatter('---\nsidebar_position: 1\n---\n\nBody\n');
    const result = joinFrontmatter(
      doc,
      { ...doc.frontmatter, sidebar_position: 5 },
      doc.body,
    );
    expect(result).toContain('sidebar_position: 5');
    expect(result).toContain('Body');
  });

  it('laat onbekende velden intact bij wijziging', () => {
    const doc = splitFrontmatter(
      '---\nsidebar_position: 1\ncustom_field: blijf\n---\nBody\n',
    );
    const result = joinFrontmatter(
      doc,
      { ...doc.frontmatter, sidebar_position: 2 },
      doc.body,
    );
    expect(result).toContain('custom_field: blijf');
  });
});

describe('hasMdxConstructs', () => {
  it('herkent imports en JSX', () => {
    expect(hasMdxConstructs("import X from 'y';\n")).toBe(true);
    expect(hasMdxConstructs('<TryButton />')).toBe(true);
  });
  it('laat gewone markdown en html door', () => {
    expect(
      hasMdxConstructs(
        '# Kop\n\n<details>\n<summary>tip</summary>\n</details>',
      ),
    ).toBe(false);
    expect(hasMdxConstructs('a < b en b > c')).toBe(false);
  });
});

it('marks invalid and non-mapping frontmatter for source-only recovery', () => {
  for (const content of [
    '---\n{broken: [\n---\nBody',
    '---\n- item\n---\nBody',
    '---\nhello\n---\nBody',
  ]) {
    const doc = splitFrontmatter(content);
    expect(doc.error).toBeTruthy();
    expect(joinFrontmatter(doc, doc.frontmatter, doc.body)).toBe(content);
  }
});

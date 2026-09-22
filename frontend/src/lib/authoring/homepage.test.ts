import { describe, expect, it } from 'vitest';
import { addSection, changeSection, moveSection, removeSection, duplicateSection, sectionModel } from './homepage';
import { parseTree } from './syntax';

describe('homepage source editing', () => {
  const source = "import {Section as Content} from '@coderius/shared/components/HomepageSections';\n\n<Content title=\"First\">\n\nHello **world**.\n\n</Content>\n\n<Unknown value={dynamic} />\n";
  it('recognizes aliased registered sections and retains dynamic source', () => {
    const model = sectionModel(source, 0)!;
    expect(model.name).toBe('Section');
    expect(model.props.title).toBe('First');
    const updated = changeSection(source, 0, 'title', 'New "title"');
    expect(updated).toContain('<Unknown value={dynamic} />');
    expect(sectionModel(updated, 0)?.props.title).toBe('New "title"');
  });
  it('moves sections without rewriting imports or unknown content', () => {
    const result = moveSection(source, 0, 1);
    expect(result.indexOf('<Unknown')).toBeLessThan(result.indexOf('<Content'));
    expect(result.startsWith(source.split('\n\n')[0])).toBe(true);
    expect(parseTree(result).children).toHaveLength(3);
  });
  it('adds missing imports once and duplicates/removes exact blocks', () => {
    const added = addSection(addSection('', 'Hero'), 'Hero');
    expect(added.match(/import /g)).toHaveLength(1);
    expect(parseTree(added).children).toHaveLength(3);
    const duplicated = duplicateSection(source, 0);
    expect(duplicated.match(/<Content /g)).toHaveLength(2);
    expect(removeSection(duplicated, 0)).toContain('Hello **world**.');
  });
  it('refuses to overwrite expressions with literal form fields', () => {
    const dynamic = source.replace('title="First"', 'title={getTitle()}');
    expect(sectionModel(dynamic, 0)?.locked).toContain('title');
    expect(() => changeSection(dynamic, 0, 'title', 'Oops')).toThrow();
  });
});

it('inserts children inside a self-closing section without touching a previous section', async () => {
 const { insertSectionInParent } = await import('./homepage');
 const source="import {Section} from '@coderius/shared/components/HomepageSections';\n\n<Section>Earlier</Section>\n\n<Section title=\"Empty\" />";
 const node=parseTree(source).children![2];
 const result=insertSectionInParent(source,node,'Card');
 expect(result).toContain('<Section>Earlier</Section>');
 const parent=parseTree(result).children!.find(n=>n.name==='Section')!;
 expect(parent.children?.some(n=>n.name==='Card')).toBe(true);
});

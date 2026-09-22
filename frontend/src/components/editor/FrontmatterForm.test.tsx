import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { FrontmatterForm } from './FrontmatterForm';
import { joinFrontmatter, splitFrontmatter } from '../../lib/frontmatter';
import { parsePropertyYaml } from '../../lib/authoring/properties';

describe('property controls', () => {
  it('starts the advanced editor with original comments and preserves them in authored edits', () => {
    const source =
      "---\n# original header\ntitle: 'Old' # title comment\ncustom: {nested: true} # custom comment\n---\nBody";
    const doc = splitFrontmatter(source);
    const html = renderToStaticMarkup(
      <MantineProvider>
        <FrontmatterForm
          value={doc.frontmatter}
          rawFrontmatter={doc.rawFrontmatter}
          onChange={() => {}}
        />
      </MantineProvider>,
    );
    const textarea = html
      .match(/<textarea[^>]*>[\s\S]*?<\/textarea>/g)!
      .find((entry) => entry.includes('# original header'))!;
    expect(textarea).toBeDefined();
    expect(textarea).toContain('# custom comment');
    const yaml = textarea
      .replace(/^<textarea[^>]*>/, '')
      .replace(/<\/textarea>$/, '')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    const edited = parsePropertyYaml(
      yaml
        .replace("'Old'", "'New'")
        .replace('# original header', '# revised header'),
    );
    const result = joinFrontmatter(doc, edited, doc.body);
    expect(result).toContain("title: 'New' # title comment");
    expect(result).toContain('custom: {nested: true} # custom comment');
    expect(result).toContain('# revised header');
    expect(result).not.toContain('# original header');
  });
  it('exposes inherited booleans and explicit disabled navigation without hiding custom YAML', () => {
    const html = renderToStaticMarkup(
      <MantineProvider>
        <FrontmatterForm
          value={{ hide_title: false, pagination_prev: null }}
          onChange={() => {}}
        />
      </MantineProvider>,
    );
    for (const text of [
      'Basisgegevens',
      'Menu en navigatie',
      'Weergave',
      'Publicatie en SEO',
      'Geavanceerd',
      'Titel verbergen',
      'Vorige les',
      'YAML',
    ])
      expect(html).toContain(text);
  });
  it('exposes page-specific settings and excludes docs-only controls', () => {
    const html = renderToStaticMarkup(
      <MantineProvider>
        <FrontmatterForm
          value={{ sidebar_label: 'preserved' }}
          kind="pages"
          onChange={() => {}}
        />
      </MantineProvider>,
    );
    expect(html).toContain('CSS-klasse van pagina');
    expect(html).not.toContain('Naam in menu');
    expect(html).toContain('Laatste wijziging');
  });
});

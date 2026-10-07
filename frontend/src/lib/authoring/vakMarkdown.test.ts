import { describe, expect, it } from 'vitest';

import { markdownNaarHtml, veiligeHref } from './vakMarkdown';

// Same cases as sites/home/src/lib/vakpagina.test.ts in the docs repo.
describe('vakpagina markdown', () => {
  it('escapes HTML and only lets safe links through', () => {
    expect(markdownNaarHtml('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
    expect(markdownNaarHtml('[klik](javascript:alert(1))')).not.toContain('<a');
    expect(markdownNaarHtml('[klik](javascript:void)')).toBe('<p>klik</p>');
    expect(markdownNaarHtml('[x](//evil.example)')).toBe('<p>x</p>');
    expect(markdownNaarHtml('[x](https://a.nl/?q=1&b=2)')).toBe(
      '<p><a href="https://a.nl/?q=1&amp;b=2" target="_blank" rel="noopener noreferrer">x</a></p>',
    );
    expect(markdownNaarHtml('[x](/docent" onmouseover="alert(1))')).not.toContain('onmouseover="');
  });

  it('knows paragraphs, lists, bold, italic and code', () => {
    expect(markdownNaarHtml('**vet** en *schuin*\nregel 2\n\n- a\n- `b`')).toBe(
      '<p><strong>vet</strong> en <em>schuin</em><br>regel 2</p><ul><li>a</li><li><code>b</code></li></ul>',
    );
    expect(markdownNaarHtml('[docenten](/docent)')).toBe('<p><a href="/docent">docenten</a></p>');
  });

  it('veiligeHref', () => {
    expect(veiligeHref('mailto:a@b.nl')).toBe('mailto:a@b.nl');
    expect(veiligeHref('/\t/evil')).toBeNull();
    expect(veiligeHref('http://onveilig.nl')).toBeNull();
  });
});

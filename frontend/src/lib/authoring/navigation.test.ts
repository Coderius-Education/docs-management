import { describe, expect, it } from 'vitest';
import { asFooterColumns, displayLinks, splitLinks } from './navigation';

const docenten = { to: '/docenten', label: 'Docenten', position: 'right' };
const cursussen = { type: 'dropdown', label: 'Cursussen', items: [] };
const own = {
  type: 'docSidebar',
  sidebarId: 'tutorialSidebar',
  label: 'Lessen',
};
const home = {
  title: 'Coderius',
  items: [
    { label: 'Home', href: 'https://coderius.nl' },
    { label: 'Privacy', to: '/privacy' },
  ],
};

describe('navigation links', () => {
  it('keeps shared Coderius links out of the editable list', () => {
    expect(splitLinks([own, docenten, cursussen], 'navbar')).toEqual({
      own: [own],
      shared: [docenten, cursussen],
    });
    expect(
      splitLinks([{ title: 'Leren', items: [] }, home], 'footer').shared,
    ).toEqual([home]);
  });
  it('shows inherited shared links after an override without them', () => {
    const extra = { to: '/extra', label: 'Extra' };
    expect(displayLinks([own, extra], [own, docenten], 'navbar')).toEqual([
      own,
      extra,
      docenten,
    ]);
  });
  it('wraps flat footer links in one column', () => {
    expect(asFooterColumns([{ label: 'A', to: '/a' }])).toEqual([
      { title: 'Links', items: [{ label: 'A', to: '/a' }] },
    ]);
    expect(asFooterColumns([home])).toEqual([home]);
  });
});

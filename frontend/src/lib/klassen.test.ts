import { describe, expect, it } from 'vitest';

import type { KlasInhoud, ManifestItem } from '../api/klassen';
import {
  herstelHoofdstukken,
  inKlasVolgorde,
  pasHoofdstukkenToe,
  sidebarNaam,
  verdwenenHoofdstukken,
  verouderdeLessen,
  verplaatsHoofdstuk,
  verplaatsItem,
  verschuif,
  voegGroepToe,
  voegItemToe,
  zetItemLabel,
  zetZichtbaar,
} from './klassen';

const leeg: KlasInhoud = { versie: 1, intro: '', groepen: [], cursussen: {} };

const cat = (key: string, label: string, items: ManifestItem[] = []): ManifestItem => ({
  key,
  type: 'category',
  label,
  items,
});
const doc = (docId: string): ManifestItem => ({
  key: `doc:${docId}`,
  type: 'doc',
  docId,
  label: docId,
  href: `/python/docs/${docId}`,
});
const SIDEBAR = [doc('intro'), cat('cat:basis', 'Basis', [doc('basis/a')]), cat('cat:tekst', 'Tekst')];

describe('groups and items', () => {
  it('adds groups with unique ids and moves items', () => {
    let inhoud = voegGroepToe(voegGroepToe(leeg, 'Periode 1'), 'Periode 2');
    expect(inhoud.groepen.map((g) => g.id)).toEqual(['g1', 'g2']);
    inhoud = voegItemToe(inhoud, 'g1', { type: 'cursus', site: 'python' });
    inhoud = voegItemToe(inhoud, 'g1', { type: 'link', url: 'https://x.nl', label: 'X' });
    inhoud = verplaatsItem(inhoud, 'g1', 1, -1);
    expect(inhoud.groepen[0].items.map((i) => i.type)).toEqual(['link', 'cursus']);
    // A course label of '' means "use the course name".
    inhoud = zetItemLabel(inhoud, 'g1', 1, '');
    expect(inhoud.groepen[0].items[1]).toEqual({ type: 'cursus', site: 'python', label: null });
  });

  it('ignores moves past the ends', () => {
    const lijst = [1, 2, 3];
    expect(verschuif(lijst, 0, -1)).toBe(lijst);
    expect(verschuif(lijst, 2, 1)).toBe(lijst);
    expect(verschuif(lijst, 0, 2)).toEqual([2, 3, 1]);
  });
});

describe('chapters', () => {
  it('orders, hides and resets like the course sidebar does', () => {
    let inhoud = verplaatsHoofdstuk(leeg, 'python', SIDEBAR, 'cat:tekst', -2);
    expect(inKlasVolgorde(SIDEBAR, inhoud.cursussen.python).map((i) => i.label)).toEqual([
      'Tekst',
      'intro',
      'Basis',
    ]);
    inhoud = zetZichtbaar(inhoud, 'python', 'cat:basis', false);
    expect(pasHoofdstukkenToe(SIDEBAR, inhoud.cursussen.python).map((i) => i.label)).toEqual([
      'Tekst',
      'intro',
    ]);
    inhoud = zetZichtbaar(inhoud, 'python', 'cat:basis', true);
    expect(inhoud.cursussen.python.verborgen).toEqual([]);
    expect(herstelHoofdstukken(inhoud, 'python').cursussen).toEqual({});
  });

  it('keeps the order of other sidebars when moving in one', () => {
    const inhoud = {
      ...leeg,
      cursussen: { python: { volgorde: ['doc:projecten/x'], verborgen: [] } },
    };
    const uit = verplaatsHoofdstuk(inhoud, 'python', SIDEBAR, 'cat:basis', -1);
    expect(uit.cursussen.python.volgorde).toEqual([
      'cat:basis',
      'doc:intro',
      'cat:tekst',
      'doc:projecten/x',
    ]);
  });

  it('flags lessons and chapters that left the course', () => {
    const inhoud = voegItemToe(voegGroepToe(leeg), 'g1', {
      type: 'pagina',
      site: 'python',
      docId: 'weg/les',
      pad: '/python/docs/weg/les',
      label: 'Oude les',
    });
    expect(verouderdeLessen(inhoud, 'python', { tutorialSidebar: SIDEBAR })).toEqual(['Oude les']);
    expect(
      verdwenenHoofdstukken({ volgorde: ['cat:basis', 'cat:weg'], verborgen: [] }, { s: SIDEBAR }),
    ).toEqual(['cat:weg']);
  });

  it('names sidebars for teachers', () => {
    expect(sidebarNaam('tutorialSidebar')).toBe('Tutorial');
    expect(sidebarNaam('projectenSidebar')).toBe('Projecten');
  });
});

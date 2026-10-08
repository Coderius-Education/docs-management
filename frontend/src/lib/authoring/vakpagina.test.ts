import { describe, expect, it } from 'vitest';

import {
  dupliceerBlok,
  magKind,
  nieuwBlok,
  ouderVan,
  problemen,
  standaardDocument,
  verplaatsBlok,
  verwijderBlok,
  vindBlok,
  voegToe,
  zetMeta,
  zetProp,
  zetTekst,
  zetThema,
} from './vakpagina';

describe('vakpagina document edits', () => {
  it('adds, nests, moves, duplicates and removes blocks with unique ids', () => {
    let doc = standaardDocument('informatica');
    const hero = nieuwBlok(doc, 'Hero');
    doc = voegToe(doc, hero);
    doc = verplaatsBlok(doc, hero.id, -2);
    expect(doc.blokken.map((b) => b.type)).toEqual(['Hero', 'Courses', 'Columns']);

    doc = voegToe(doc, nieuwBlok(doc, 'Buttons'), hero.id);
    const knoppen = vindBlok(doc.blokken, hero.id)!.kinderen![0];
    expect(knoppen.type).toBe('Buttons');
    expect(ouderVan(doc.blokken, knoppen.kinderen![0].id)?.id).toBe(knoppen.id);

    doc = dupliceerBlok(doc, 'lesmateriaal');
    const kolommen = vindBlok(doc.blokken, 'over')!;
    expect(kolommen.kinderen!.map((b) => b.id)).toEqual(['lesmateriaal', 'lesmateriaal-2', 'visie']);

    doc = verwijderBlok(doc, 'visie');
    expect(vindBlok(doc.blokken, 'visie')).toBeNull();
  });

  it('keeps the document minimal: empty values disappear', () => {
    let doc = standaardDocument('wo');
    doc = zetProp(doc, 'cursussen', 'uitgelicht', ['onderzoek']);
    expect(vindBlok(doc.blokken, 'cursussen')!.props.uitgelicht).toEqual(['onderzoek']);
    doc = zetProp(doc, 'cursussen', 'uitgelicht', []);
    expect('uitgelicht' in vindBlok(doc.blokken, 'cursussen')!.props).toBe(false);
    doc = zetTekst(doc, 'visie', '');
    expect('tekst' in vindBlok(doc.blokken, 'visie')!).toBe(false);
    doc = zetThema(doc, { licht: { primary: '' }, kopletter: 'mono' });
    expect(doc.thema).toEqual({ kopletter: 'mono' });
    doc = zetMeta(doc, { titel: '' });
    expect('meta' in doc).toBe(false);
  });

  it('knows which blocks may hold which', () => {
    expect(magKind(null, 'Hero')).toBe(true);
    expect(magKind(null, 'Button')).toBe(false);
    expect(magKind('Hero', 'Buttons')).toBe(true);
    expect(magKind('Hero', 'Card')).toBe(false);
    expect(magKind('Columns', 'Card')).toBe(true);
    expect(magKind('Card', 'Divider')).toBe(false);
  });

  it('flags unreadable colours and pictures without description', () => {
    let doc = zetThema(standaardDocument('informatica'), {
      licht: { primary: '#ffff00', primaryForeground: '#ffffff' },
    });
    doc = voegToe(doc, nieuwBlok(doc, 'Picture'));
    expect(problemen(doc)).toHaveLength(2);
  });
});

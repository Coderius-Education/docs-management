// Pure edits on a class's content. The editor keeps a draft KlasInhoud and
// runs these; the backend validates the result again on save.
import type { Hoofdstukken, KlasGroep, KlasInhoud, KlasItem, ManifestItem } from '../api/klassen';

export function nieuweGroepId(groepen: KlasGroep[]): string {
  const bezet = new Set(groepen.map((g) => g.id));
  let n = groepen.length + 1;
  while (bezet.has(`g${n}`)) n++;
  return `g${n}`;
}

export function voegGroepToe(inhoud: KlasInhoud, titel = ''): KlasInhoud {
  return {
    ...inhoud,
    groepen: [...inhoud.groepen, { id: nieuweGroepId(inhoud.groepen), titel, items: [] }],
  };
}

function wijzigGroep(
  inhoud: KlasInhoud,
  groepId: string,
  fn: (groep: KlasGroep) => KlasGroep,
): KlasInhoud {
  return { ...inhoud, groepen: inhoud.groepen.map((g) => (g.id === groepId ? fn(g) : g)) };
}

export function zetGroepTitel(inhoud: KlasInhoud, groepId: string, titel: string): KlasInhoud {
  return wijzigGroep(inhoud, groepId, (g) => ({ ...g, titel }));
}

export function verwijderGroep(inhoud: KlasInhoud, groepId: string): KlasInhoud {
  return { ...inhoud, groepen: inhoud.groepen.filter((g) => g.id !== groepId) };
}

/** Moves an element `delta` places; out-of-range moves return the list unchanged. */
export function verschuif<T>(lijst: T[], index: number, delta: number): T[] {
  const doel = index + delta;
  if (index < 0 || index >= lijst.length || doel < 0 || doel >= lijst.length) return lijst;
  const kopie = [...lijst];
  const [weg] = kopie.splice(index, 1);
  kopie.splice(doel, 0, weg);
  return kopie;
}

export function verplaatsGroep(inhoud: KlasInhoud, groepId: string, delta: number): KlasInhoud {
  const index = inhoud.groepen.findIndex((g) => g.id === groepId);
  return { ...inhoud, groepen: verschuif(inhoud.groepen, index, delta) };
}

export function voegItemToe(inhoud: KlasInhoud, groepId: string, item: KlasItem): KlasInhoud {
  return wijzigGroep(inhoud, groepId, (g) => ({ ...g, items: [...g.items, item] }));
}

export function verplaatsItem(
  inhoud: KlasInhoud,
  groepId: string,
  index: number,
  delta: number,
): KlasInhoud {
  return wijzigGroep(inhoud, groepId, (g) => ({ ...g, items: verschuif(g.items, index, delta) }));
}

export function verwijderItem(inhoud: KlasInhoud, groepId: string, index: number): KlasInhoud {
  return wijzigGroep(inhoud, groepId, (g) => ({
    ...g,
    items: g.items.filter((_, i) => i !== index),
  }));
}

export function zetItemLabel(
  inhoud: KlasInhoud,
  groepId: string,
  index: number,
  label: string,
): KlasInhoud {
  return wijzigGroep(inhoud, groepId, (g) => ({
    ...g,
    items: g.items.map((item, i) => {
      if (i !== index) return item;
      if (item.type === 'cursus') return { ...item, label: label || null };
      return { ...item, label };
    }),
  }));
}

const LEEG: Hoofdstukken = { volgorde: [], verborgen: [] };

export function instellingVan(inhoud: KlasInhoud, site: string): Hoofdstukken {
  return inhoud.cursussen[site] ?? LEEG;
}

function zetInstelling(inhoud: KlasInhoud, site: string, instelling: Hoofdstukken): KlasInhoud {
  const cursussen = { ...inhoud.cursussen };
  if (instelling.volgorde.length === 0 && instelling.verborgen.length === 0) delete cursussen[site];
  else cursussen[site] = instelling;
  return { ...inhoud, cursussen };
}

/**
 * The top level of a sidebar in class order, hidden chapters included (the
 * editor shows them unticked). Same rule as pasKlasToe in the docs repo:
 * ordered keys first, everything else after in its original order.
 */
export function inKlasVolgorde(items: ManifestItem[], instelling: Hoofdstukken): ManifestItem[] {
  const plek = new Map(instelling.volgorde.map((sleutel, i) => [sleutel, i]));
  const rang = (item: ManifestItem, i: number) =>
    item.key && plek.has(item.key) ? (plek.get(item.key) as number) : instelling.volgorde.length + i;
  return items
    .map((item, i) => ({ item, r: rang(item, i) }))
    .sort((a, b) => a.r - b.r)
    .map(({ item }) => item);
}

/** What students will see: class order without the hidden chapters. */
export function pasHoofdstukkenToe(items: ManifestItem[], instelling: Hoofdstukken): ManifestItem[] {
  const verborgen = new Set(instelling.verborgen);
  return inKlasVolgorde(items, instelling).filter((item) => !item.key || !verborgen.has(item.key));
}

export function verplaatsHoofdstuk(
  inhoud: KlasInhoud,
  site: string,
  items: ManifestItem[],
  sleutel: string,
  delta: number,
): KlasInhoud {
  const instelling = instellingVan(inhoud, site);
  const volgorde = inKlasVolgorde(items, instelling)
    .map((item) => item.key)
    .filter((key): key is string => !!key);
  const nieuw = verschuif(volgorde, volgorde.indexOf(sleutel), delta);
  if (nieuw === volgorde) return inhoud;
  // Keys of other sidebars keep their place after this one.
  const rest = instelling.volgorde.filter((key) => !nieuw.includes(key));
  return zetInstelling(inhoud, site, { ...instelling, volgorde: [...nieuw, ...rest] });
}

export function zetZichtbaar(
  inhoud: KlasInhoud,
  site: string,
  sleutel: string,
  zichtbaar: boolean,
): KlasInhoud {
  const instelling = instellingVan(inhoud, site);
  const verborgen = zichtbaar
    ? instelling.verborgen.filter((key) => key !== sleutel)
    : [...new Set([...instelling.verborgen, sleutel])];
  return zetInstelling(inhoud, site, { ...instelling, verborgen });
}

export function herstelHoofdstukken(inhoud: KlasInhoud, site: string): KlasInhoud {
  return zetInstelling(inhoud, site, LEEG);
}

function alleSleutels(items: ManifestItem[]): Set<string> {
  const uit = new Set<string>();
  const loop = (lijst: ManifestItem[]) => {
    for (const item of lijst) {
      if (item.key) uit.add(item.key);
      if (item.docId) uit.add(`doc:${item.docId}`);
      if (item.items) loop(item.items);
    }
  };
  loop(items);
  return uit;
}

/** Lessons whose docId no longer exists in the course's current build. */
export function verouderdeLessen(
  inhoud: KlasInhoud,
  site: string,
  sidebars: Record<string, ManifestItem[]>,
): string[] {
  const bekend = alleSleutels(Object.values(sidebars).flat());
  return inhoud.groepen
    .flatMap((g) => g.items)
    .filter((item): item is Extract<KlasItem, { type: 'pagina' }> => item.type === 'pagina')
    .filter((item) => item.site === site && !bekend.has(`doc:${item.docId}`))
    .map((item) => item.label);
}

/** Chapter keys the class still mentions but the course no longer has. */
export function verdwenenHoofdstukken(
  instelling: Hoofdstukken,
  sidebars: Record<string, ManifestItem[]>,
): string[] {
  const bekend = alleSleutels(Object.values(sidebars).flat());
  return [...new Set([...instelling.volgorde, ...instelling.verborgen])].filter(
    (key) => !bekend.has(key),
  );
}

/** "tutorialSidebar" → "Tutorial", for courses with more than one sidebar. */
export function sidebarNaam(naam: string): string {
  const kaal = naam.replace(/Sidebar$/, '') || naam;
  return kaal.charAt(0).toUpperCase() + kaal.slice(1);
}

// The landing page of a vak (informatica.coderius.nl/) as a block document.
// Mirrors sites/home/src/lib/vakpagina/types.ts in the docs repo; the backend
// validates every save with the same rules as the home build.

export const BLOK_TYPES = [
  'Hero',
  'Section',
  'Columns',
  'Card',
  'Buttons',
  'Button',
  'Picture',
  'Divider',
  'Courses',
] as const;
export type BlokType = (typeof BLOK_TYPES)[number];

export interface BlokProps {
  width?: 'full' | 'wide' | 'normal' | 'narrow';
  spacing?: 'none' | 'small' | 'normal' | 'large';
  align?: 'left' | 'center' | 'right';
  background?: 'transparent' | 'muted' | 'primary';
  title?: string;
  tagline?: string;
  subtitle?: string;
  info?: string;
  alt?: string;
  caption?: string;
  variant?: 'default' | 'compact' | 'plain' | 'primary' | 'secondary';
  count?: number;
  href?: string;
  src?: string;
  size?: 'sm' | 'lg';
  automatischeKop?: boolean;
  filters?: boolean;
  niveaus?: string[];
  themas?: string[];
  uitgelicht?: string[];
  alleen?: string[];
}

export interface Blok {
  id: string;
  type: BlokType;
  props: BlokProps;
  tekst?: string;
  kinderen?: Blok[];
}

export interface Kleuren {
  primary?: string;
  primaryForeground?: string;
}

export interface Vakpagina {
  version: 1;
  vak: string;
  meta?: { titel?: string; omschrijving?: string; afbeelding?: string };
  thema?: {
    licht?: Kleuren;
    donker?: Kleuren;
    kopletter?: 'literata' | 'atkinson' | 'mono';
    logo?: { licht?: string; donker?: string };
  };
  blokken: Blok[];
}

/** Teacher-facing names, shared with the course homepage studio. */
export const BLOK_NAMEN: Record<BlokType, string> = {
  Hero: 'Introductie',
  Section: 'Tekstsectie',
  Columns: 'Kolommen',
  Card: 'Kaart',
  Buttons: 'Knoppen',
  Button: 'Knop',
  Picture: 'Afbeelding',
  Divider: 'Scheidingslijn',
  Courses: 'Cursusoverzicht',
};

/** Which children a block may hold; null = any block except a loose Button. */
export const KINDEREN: Partial<Record<BlokType, BlokType[] | null>> = {
  Hero: ['Buttons'],
  Section: null,
  Columns: null,
  Buttons: ['Button'],
};

export function magKind(ouder: BlokType | null, kind: BlokType): boolean {
  if (ouder === null) return kind !== 'Button';
  if (!(ouder in KINDEREN)) return false;
  const mag = KINDEREN[ouder];
  return mag === null ? kind !== 'Button' : !!mag?.includes(kind);
}

export const REPO_URL = 'https://github.com/Coderius-Education/docs';

/** Copy of standaardDocument in the docs repo: the page before vakpagina's. */
export function standaardDocument(vak: string): Vakpagina {
  return {
    version: 1,
    vak,
    blokken: [
      {
        id: 'cursussen',
        type: 'Courses',
        props: { automatischeKop: true, filters: true, spacing: 'none' },
      },
      {
        id: 'over',
        type: 'Columns',
        props: { count: 2, spacing: 'small', width: 'wide' },
        kinderen: [
          {
            id: 'lesmateriaal',
            type: 'Section',
            props: { title: 'Lesmateriaal' },
            tekst: `Wij maken ons eigen lesmateriaal en geven het gratis weg. Alles is open source, dus docenten mogen het gebruiken, aanpassen en delen zoals het bij hun leerlingen past. Ideeën of een bijdrage? Het materiaal staat [op GitHub](${REPO_URL}).`,
          },
          {
            id: 'visie',
            type: 'Section',
            props: { title: 'Visie' },
            tekst:
              'Leren gaat het best door te doen. Elke cursus combineert korte uitleg met opdrachten, projecten en voorbeelden die je direct uitvoert, meestal in de browser zelf. Zo pas je kennis meteen toe, en samen met docenten verbeteren we het materiaal steeds verder.',
          },
        ],
      },
    ],
  };
}

function alleIds(blokken: Blok[]): Set<string> {
  const ids = new Set<string>();
  const loop = (lijst: Blok[]) => {
    for (const b of lijst) {
      ids.add(b.id);
      if (b.kinderen) loop(b.kinderen);
    }
  };
  loop(blokken);
  return ids;
}

export function nieuwId(doc: Vakpagina, type: BlokType): string {
  const ids = alleIds(doc.blokken);
  const basis = type.toLowerCase();
  let n = 1;
  while (ids.has(`${basis}-${n}`)) n++;
  return `${basis}-${n}`;
}

/** A sensible new block of a type, so it shows up right away. */
export function nieuwBlok(doc: Vakpagina, type: BlokType): Blok {
  const id = nieuwId(doc, type);
  switch (type) {
    case 'Hero':
      return { id, type, props: { title: 'Welkom', tagline: 'Een korte zin over dit vak' } };
    case 'Section':
      return { id, type, props: { title: 'Nieuwe sectie' }, tekst: 'Schrijf hier je tekst.' };
    case 'Columns': {
      const kaart = (n: number): Blok => ({
        id: `${id}-kaart-${n}`,
        type: 'Card',
        props: { title: `Kaart ${n}` },
        tekst: 'Korte tekst.',
      });
      return { id, type, props: { count: 3 }, kinderen: [kaart(1), kaart(2), kaart(3)] };
    }
    case 'Card':
      return { id, type, props: { title: 'Kaart' }, tekst: 'Korte tekst.' };
    case 'Buttons':
      return {
        id,
        type,
        props: {},
        kinderen: [{ id: `${id}-knop-1`, type: 'Button', props: { href: '/' }, tekst: 'Knop' }],
      };
    case 'Button':
      return { id, type, props: { href: '/' }, tekst: 'Knop' };
    case 'Picture':
      return { id, type, props: {} };
    case 'Divider':
      return { id, type, props: {} };
    case 'Courses':
      return { id, type, props: { filters: true } };
  }
}

/** Walks the tree and replaces the list that holds `id` via `fn`. */
function wijzigLijst(
  blokken: Blok[],
  id: string,
  fn: (lijst: Blok[], index: number) => Blok[],
): Blok[] {
  const index = blokken.findIndex((b) => b.id === id);
  if (index !== -1) return fn(blokken, index);
  return blokken.map((b) =>
    b.kinderen ? { ...b, kinderen: wijzigLijst(b.kinderen, id, fn) } : b,
  );
}

export function vindBlok(blokken: Blok[], id: string): Blok | null {
  for (const b of blokken) {
    if (b.id === id) return b;
    const gevonden = b.kinderen && vindBlok(b.kinderen, id);
    if (gevonden) return gevonden;
  }
  return null;
}

export function ouderVan(blokken: Blok[], id: string, ouder: Blok | null = null): Blok | null | undefined {
  for (const b of blokken) {
    if (b.id === id) return ouder;
    const gevonden = b.kinderen && ouderVan(b.kinderen, id, b);
    if (gevonden !== undefined) return gevonden;
  }
  return undefined;
}

export function zetBlok(doc: Vakpagina, id: string, fn: (blok: Blok) => Blok): Vakpagina {
  const loop = (lijst: Blok[]): Blok[] =>
    lijst.map((b) => (b.id === id ? fn(b) : b.kinderen ? { ...b, kinderen: loop(b.kinderen) } : b));
  return { ...doc, blokken: loop(doc.blokken) };
}

/** Sets one prop; '' and undefined remove it so the document stays minimal. */
export function zetProp<K extends keyof BlokProps>(
  doc: Vakpagina,
  id: string,
  sleutel: K,
  waarde: BlokProps[K] | '' | undefined,
): Vakpagina {
  return zetBlok(doc, id, (b) => {
    const props = { ...b.props };
    if (waarde === '' || waarde === undefined || (Array.isArray(waarde) && waarde.length === 0))
      delete props[sleutel];
    else props[sleutel] = waarde as BlokProps[K];
    return { ...b, props };
  });
}

export function zetTekst(doc: Vakpagina, id: string, tekst: string): Vakpagina {
  return zetBlok(doc, id, (b) => {
    const { tekst: _oud, ...rest } = b;
    return tekst ? { ...rest, tekst } : rest;
  });
}

export function verplaatsBlok(doc: Vakpagina, id: string, delta: number): Vakpagina {
  return {
    ...doc,
    blokken: wijzigLijst(doc.blokken, id, (lijst, i) => {
      const doel = i + delta;
      if (doel < 0 || doel >= lijst.length) return lijst;
      const kopie = [...lijst];
      const [b] = kopie.splice(i, 1);
      kopie.splice(doel, 0, b);
      return kopie;
    }),
  };
}

export function verwijderBlok(doc: Vakpagina, id: string): Vakpagina {
  return { ...doc, blokken: wijzigLijst(doc.blokken, id, (lijst, i) => lijst.filter((_, j) => j !== i)) };
}

export function dupliceerBlok(doc: Vakpagina, id: string): Vakpagina {
  const ids = alleIds(doc.blokken);
  const vrij = (basis: string) => {
    let n = 2;
    while (ids.has(`${basis}-${n}`)) n++;
    const nieuw = `${basis}-${n}`;
    ids.add(nieuw);
    return nieuw;
  };
  const kopieer = (b: Blok): Blok => ({
    ...b,
    id: vrij(b.id.replace(/-\d+$/, '')),
    props: { ...b.props },
    ...(b.kinderen ? { kinderen: b.kinderen.map(kopieer) } : {}),
  });
  return {
    ...doc,
    blokken: wijzigLijst(doc.blokken, id, (lijst, i) => [
      ...lijst.slice(0, i + 1),
      kopieer(lijst[i]),
      ...lijst.slice(i + 1),
    ]),
  };
}

/** Adds a block at the top level, or inside `ouderId`. */
export function voegToe(doc: Vakpagina, blok: Blok, ouderId: string | null = null): Vakpagina {
  if (!ouderId) return { ...doc, blokken: [...doc.blokken, blok] };
  return zetBlok(doc, ouderId, (b) => ({ ...b, kinderen: [...(b.kinderen ?? []), blok] }));
}

export function zetThema(doc: Vakpagina, thema: NonNullable<Vakpagina['thema']>): Vakpagina {
  const schoon = JSON.parse(JSON.stringify(thema, (_k, v) => (v === '' ? undefined : v)));
  for (const k of ['licht', 'donker', 'logo'] as const)
    if (schoon[k] && Object.keys(schoon[k]).length === 0) delete schoon[k];
  const { thema: _oud, ...rest } = doc;
  return Object.keys(schoon).length ? { ...rest, thema: schoon } : rest;
}

export function zetMeta(doc: Vakpagina, meta: NonNullable<Vakpagina['meta']>): Vakpagina {
  const schoon = Object.fromEntries(Object.entries(meta).filter(([, v]) => v));
  const { meta: _oud, ...rest } = doc;
  return Object.keys(schoon).length ? { ...rest, meta: schoon } : rest;
}

/** WCAG contrast of two #rrggbb colours, for a hint before the server refuses. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hoog, laag] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hoog + 0.05) / (laag + 0.05);
}

export const isHex = (waarde?: string) => !!waarde && /^#[0-9a-fA-F]{6}$/.test(waarde);

/** Problems the teacher must fix before saving (the server checks again). */
export function problemen(doc: Vakpagina): string[] {
  const uit: string[] = [];
  for (const modus of ['licht', 'donker'] as const) {
    const k = doc.thema?.[modus];
    if (isHex(k?.primary) && isHex(k?.primaryForeground) && contrast(k!.primary!, k!.primaryForeground!) < 4.5)
      uit.push(`Thema ${modus}: tekst op de hoofdkleur is slecht leesbaar (minder dan 4,5:1).`);
  }
  const loop = (lijst: Blok[]) => {
    for (const b of lijst) {
      if (b.type === 'Picture' && (!b.props.src || !b.props.alt))
        uit.push(`${BLOK_NAMEN.Picture} “${b.id}” heeft een afbeelding en een beschrijving nodig.`);
      if (b.kinderen) loop(b.kinderen);
    }
  };
  loop(doc.blokken);
  return uit;
}

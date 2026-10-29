import { SITES, SITES_BY_ID } from '@coderius/shared/sites';
import type { ExamMapping } from './ExamProgram';

export const KLASSEN = ['4', '5+', '4 en 5+'] as const;
export type Klas = (typeof KLASSEN)[number];

export type Activity = {
  /** Registry-id uit packages/shared/sites.js; bepaalt label, beschrijving, link en voorkennis. */
  id: string;
  /** Weergavenaam uit de registry. */
  label: string;
  /** Korte omschrijving uit de registry. */
  description: string;
  /** Voorkennis (registry-ids van cursussen waarop deze voortbouwt). */
  requires: string[];
  /** Vak uit de registry (SUBJECTS-id), bv. 'informatica' of 'wo'. */
  subject: string;
  labels: string[]; // Keep for backward compatibility

  // New categorical fields
  programmingLanguages?: string[];
  projectTypes?: string[];
  operatingSystems?: string[];

  // Examenprogramma-raakvlakken (havo/vwo informatica)
  examDomains?: ExamMapping[];

  /** Twee niveaus: Beginner (klas 4-instap) en Medium (Gevorderd). */
  level: 'Beginner' | 'Medium';
  /**
   * Waar de cursus in de leerlijn van de school valt. Een eigen veld, los van
   * het niveau: robotica en godot passen in beide klassen.
   */
  klas: Klas;
  /** Afgeleid uit de gedeelde registry (SITES_BY_ID[id].url); niet hardcoden. */
  link: string;
  order: {
    vwo: number;
    havo: number;
  };
};

// Naam, omschrijving, URL en voorkennis komen uit de gedeelde registry
// (packages/shared/sites.js), de enige bron van waarheid. Hier staat alleen wat
// de registry niet weet: niveau, thema's en examendomeinen. Zo blijven de
// homepage-kaarten en de navigatie van de cursussites automatisch in sync; de
// eigen titels die hier eerst stonden ("Python Play", "Code Editor") waren van
// de registry weggedreven.
function siteVan(id: string) {
  const site = SITES_BY_ID[id];
  if (!site) throw new Error(`Onbekende cursus-id in Curriculum: ${id}`);
  return site;
}

type CurriculumEntry = Omit<Activity, 'label' | 'description' | 'requires' | 'subject' | 'link'>;

// examDomains: 'strong' is een kern van de cursus, 'weak' een zijdelings
// raakvlak. Beoordeeld op de inhoudsopgave van elke cursussite (PR #58);
// de reden staat per cursus in een commentaar. Domein A blijft buiten beeld.
const entries: CurriculumEntry[] = [
  {
    id: 'web',
    labels: [],
    programmingLanguages: ['HTML', 'CSS'],
    projectTypes: ['Web Development'],
    operatingSystems: ['Windows', 'Linux', 'macOS', 'ChromeOS'],
    // O3: formulieren, layout en media queries zijn interface-ontwerp. D2: de
    // JS-lessen laten gegeven code (DOM, events) uitleggen en aanpassen.
    examDomains: [
      { code: 'O3', strength: 'strong' },
      { code: 'D1', strength: 'strong' },
      { code: 'C4', strength: 'weak' },
      { code: 'D2', strength: 'weak' },
      { code: 'F1', strength: 'weak' },
    ],
    level: 'Beginner',
    klas: '4',
    order: {
      vwo: 1,
      havo: 1,
    },
  },
  {
    id: 'python',
    labels: [],
    programmingLanguages: ['Python'],
    projectTypes: [],
    operatingSystems: ['Windows', 'Linux', 'macOS', 'ChromeOS'],
    // Hoofdstuk 6 vergelijkt lijsten, dictionaries, tuples en sets (C3, B2).
    examDomains: [
      { code: 'D1', strength: 'strong' },
      { code: 'D2', strength: 'strong' },
      { code: 'B1', strength: 'weak' },
      { code: 'B2', strength: 'weak' },
      { code: 'C3', strength: 'weak' },
    ],
    level: 'Beginner',
    klas: '4',
    order: {
      vwo: 2,
      havo: 2,
    },
  },
  {
    id: 'play',
    labels: [],
    programmingLanguages: ['Python'],
    projectTypes: ['Game Development'],
    operatingSystems: ['Windows', 'Linux', 'macOS'],
    // Zie ook docs/voor-de-docent/examenprogramma.md op de play-site: D1 en D2
    // zijn de kern, B1 pas bij een computertegenstander, B2 bij grotere spellen.
    // C5: het database-hoofdstuk. P2: toetsen, muis, controller en startmenu.
    examDomains: [
      { code: 'D1', strength: 'strong' },
      { code: 'D2', strength: 'strong' },
      { code: 'B1', strength: 'weak' },
      { code: 'B2', strength: 'weak' },
      { code: 'C5', strength: 'weak' },
      { code: 'P2', strength: 'weak' },
    ],
    level: 'Beginner',
    klas: '4',
    order: {
      vwo: 3,
      havo: 3,
    },
  },
  {
    id: 'editor',
    labels: [],
    programmingLanguages: [],
    projectTypes: ['VS Code web', 'VS Code Python', 'git', 'GitHub'],
    operatingSystems: ['Windows', 'Linux', 'macOS'],
    // Geen examDomains: het instrumentarium (editor, git, GitHub) valt onder domein A
    // dat we bewust niet meenemen in de mapping.
    level: 'Medium',
    klas: '5+',
    order: {
      vwo: 2,
      havo: 2,
    },
  },
  {
    id: 'robotica',
    labels: ['Robotics', 'Python'],
    programmingLanguages: ['Python'],
    projectTypes: ['Robotics'],
    operatingSystems: ['Windows', 'Linux', 'macOS'],
    examDomains: [
      { code: 'B1', strength: 'weak' },
      { code: 'D1', strength: 'strong' },
      { code: 'E1', strength: 'weak' },
      { code: 'M1', strength: 'strong' },
      { code: 'M2', strength: 'strong' },
    ],
    level: 'Medium',
    klas: '4 en 5+',
    order: {
      vwo: 4,
      havo: 4,
    },
  },
  {
    id: 'ctf',
    labels: [],
    programmingLanguages: [],
    projectTypes: ['Cybersecurity'],
    operatingSystems: ['Windows', 'Linux', 'macOS'],
    // Privacy en maatschappelijke aspecten (F2-F4) komen in geen challenge
    // voor. Risicoanalyse en maatregelen zitten er impliciet in (zwak). C4:
    // encoderingen en rotaties; L2/L4: headers, cookies, robots.txt.
    examDomains: [
      { code: 'E2', strength: 'strong' },
      { code: 'N1', strength: 'weak' },
      { code: 'N2', strength: 'weak' },
      { code: 'C4', strength: 'weak' },
      { code: 'L2', strength: 'weak' },
      { code: 'L4', strength: 'weak' },
    ],
    level: 'Beginner',
    klas: '4',
    order: {
      vwo: 5,
      havo: 5,
    },
  },
  {
    id: 'godot',
    labels: [],
    programmingLanguages: ['GDScript'],
    projectTypes: ['Game Development'],
    operatingSystems: ['Windows', 'Linux', 'macOS', 'ChromeOS'],
    // D2: 'Het bewegingsscript begrijpen' laat gegeven code uitleggen en
    // aanpassen. F1 zwak: geen usability-heuristieken.
    examDomains: [
      { code: 'B1', strength: 'weak' },
      { code: 'D1', strength: 'strong' },
      { code: 'D2', strength: 'strong' },
      { code: 'P2', strength: 'strong' },
      { code: 'O3', strength: 'weak' },
      { code: 'F1', strength: 'weak' },
    ],
    level: 'Medium',
    klas: '4 en 5+',
    order: {
      vwo: 6,
      havo: 6,
    },
  },
  {
    id: 'dvwa',
    labels: ['Cybersecurity', 'Web'],
    programmingLanguages: ['Linux Shell'],
    projectTypes: ['Cybersecurity', 'Web Development'],
    operatingSystems: ['Windows', 'Linux'],
    // N2 sterk: elk Impossible-niveau en 'Word de Developer' leggen de
    // maatregel uit. D2: PHP-code aanpassen in de fix-it-challenge.
    examDomains: [
      { code: 'E2', strength: 'strong' },
      { code: 'N1', strength: 'strong' },
      { code: 'N2', strength: 'strong' },
      { code: 'D2', strength: 'weak' },
      { code: 'L2', strength: 'weak' },
      { code: 'L4', strength: 'weak' },
    ],
    level: 'Medium',
    klas: '5+',
    order: {
      vwo: 5,
      havo: 5,
    },
  },
  {
    id: 'fullstack',
    labels: ['Javascript', 'Python'],
    programmingLanguages: ['HTML', 'CSS', 'JavaScript', 'Python'],
    projectTypes: ['Web Development'],
    operatingSystems: ['Windows', 'Linux', 'macOS'],
    // Geen usability- of interface-lessen (F1, O3). C5: POST naar database en
    // gegevens opvragen.
    examDomains: [
      { code: 'D1', strength: 'strong' },
      { code: 'E1', strength: 'strong' },
      { code: 'H1', strength: 'weak' },
      { code: 'L2', strength: 'weak' },
      { code: 'C5', strength: 'weak' },
    ],
    level: 'Medium',
    klas: '5+',
    order: {
      vwo: 5,
      havo: 5,
    },
  },
  {
    id: 'algorithms',
    labels: [],
    programmingLanguages: ['Python'],
    projectTypes: ['Algorithms'],
    operatingSystems: ['Windows', 'Linux', 'macOS', 'ChromeOS'],
    // Big O is een heel hoofdstuk (G1), context-vrije grammatica's ook (B4);
    // elke module heeft een stap 'Aanpassen' en 'Bouw zelf' (D1, D2).
    examDomains: [
      { code: 'B1', strength: 'strong' },
      { code: 'B2', strength: 'strong' },
      { code: 'B4', strength: 'strong' },
      { code: 'G1', strength: 'strong' },
      { code: 'D1', strength: 'strong' },
      { code: 'D2', strength: 'strong' },
      { code: 'I1', strength: 'weak' },
    ],
    level: 'Medium',
    klas: '5+',
    order: {
      vwo: 7,
      havo: 7,
    },
  },
  {
    id: 'ide',
    labels: [],
    programmingLanguages: ['Python', 'HTML', 'CSS'],
    projectTypes: ['Online Editor'],
    operatingSystems: ['Windows', 'Linux', 'macOS', 'ChromeOS'],
    // Gereedschap (browser-IDE), zoals de Code Editor: valt onder domein A en
    // krijgt daarom geen examDomains-mapping.
    level: 'Beginner',
    klas: '4',
    order: {
      vwo: 1,
      havo: 1,
    },
  },
  {
    id: 'embedded',
    labels: [],
    programmingLanguages: ['C++', 'MicroPython'],
    projectTypes: ['Embedded', 'Robotics'],
    operatingSystems: ['Windows', 'Linux', 'macOS'],
    // M1/M2: sensoren, PWM, timers, actuatoren. E1: 'Onder de motorkap'
    // (abstractielagen, GPIO met registers). K4: Arduino Uno tegenover STM32.
    examDomains: [
      { code: 'M1', strength: 'strong' },
      { code: 'M2', strength: 'strong' },
      { code: 'E1', strength: 'strong' },
      { code: 'K4', strength: 'weak' },
      { code: 'D1', strength: 'weak' },
    ],
    level: 'Medium',
    klas: '5+',
    order: {
      vwo: 4,
      havo: 4,
    },
  },
  {
    id: 'onderzoek',
    labels: [],
    programmingLanguages: [],
    projectTypes: ['Research'],
    operatingSystems: ['Windows', 'Linux', 'macOS', 'ChromeOS'],
    // Wetenschapsoriëntatie, geen informatica: geen examDomains. Bedoeld voor
    // de bovenbouw, bij een profielwerkstuk of praktische opdracht.
    level: 'Beginner',
    klas: '4 en 5+',
    order: {
      vwo: 1,
      havo: 1,
    },
  },
  {
    id: 'hartjespuzzel',
    labels: [],
    programmingLanguages: [],
    projectTypes: ['Techniek'],
    operatingSystems: ['Windows', 'Linux', 'macOS', 'ChromeOS'],
    level: 'Beginner',
    klas: '4 en 5+',
    order: {
      vwo: 1,
      havo: 1,
    },
  },
];

// Eerst alle cursussen voor beginners, dan de gevorderde; binnen een niveau in
// de volgorde van de registry (de leerlijn, en die staat op één plek).
const volgorde = new Map(SITES.map((s, i) => [s.id, i]));
const niveauVolgorde: Record<Activity['level'], number> = { Beginner: 0, Medium: 1 };

export const curriculum: Activity[] = entries
  .map((e) => {
    const site = siteVan(e.id);
    return {
      ...e,
      label: site.label,
      description: site.description,
      requires: site.requires,
      subject: site.subject,
      link: site.url,
    };
  })
  .sort(
    (a, b) =>
      niveauVolgorde[a.level] - niveauVolgorde[b.level] ||
      (volgorde.get(a.id) ?? 99) - (volgorde.get(b.id) ?? 99),
  );

/** Badge-klassen per niveau, leesbaar in licht én donker thema. */
export const levelColors: { [key in Activity['level']]: string } = {
  Beginner:
    'border-transparent bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950',
  Medium: 'border-transparent bg-orange-700 text-white',
};

/** Nederlandse naam per niveau, zoals de leerling 'm op de kaart ziet. */
export const levelLabels: { [key in Activity['level']]: string } = {
  Beginner: 'Beginner',
  Medium: 'Gevorderd',
};

/** De voorkennis van een cursus als leesbare namen, uit de registry. */
export function voorkennisVan(activity: Activity): string {
  return activity.requires.map((id) => SITES_BY_ID[id]?.label ?? id).join(', ');
}

// Herkenbare thema's voor de filters op de homepage, per vak: een leerling
// kiest niet uit 23 fijnmazige opties, en de examendomeinen blijven op de
// docentenpagina. Elk thema hoort bij precies één vak; de Thema-filter toont
// alleen de thema's van de gekozen vakken.
export const THEMAS_PER_VAK = {
  informatica: ['Python', 'Web', 'Games', 'Hardware', 'Security'],
  wo: ['Onderzoek'],
  techniek: ['Techniek'],
} as const;
export type Thema = (typeof THEMAS_PER_VAK)[keyof typeof THEMAS_PER_VAK][number];

/** Alle thema's, vak na vak. */
export const THEMAS: Thema[] = Object.values(THEMAS_PER_VAK).flat();

/** De thema's van één vak (leeg voor een vak zonder thema's). */
export function themasVanVak(vak: string): readonly Thema[] {
  return (THEMAS_PER_VAK as Record<string, readonly Thema[]>)[vak] ?? [];
}

/** De thema's van de gekozen vakken, of alle thema's als er geen vak gekozen is. */
export function themasVoorVakken(vakken: readonly string[]): Thema[] {
  return vakken.length === 0
    ? THEMAS
    : THEMAS.filter((t) => vakken.some((v) => themasVanVak(v).includes(t)));
}

// De thema's van een cursus, afgeleid uit de fijnmazige velden hierboven.
// Curriculum.test.ts eist dat ze allemaal bij het vak van de cursus horen.
export function themasVan(activity: Activity): Thema[] {
  const talen = activity.programmingLanguages ?? [];
  const typen = activity.projectTypes ?? [];
  const uit: Thema[] = [];
  if (
    talen.some((t) => t === 'Python' || t === 'MicroPython') ||
    typen.includes('VS Code Python')
  ) {
    uit.push('Python');
  }
  if (
    typen.includes('Web Development') ||
    typen.includes('VS Code web') ||
    talen.some((t) => ['HTML', 'CSS', 'JavaScript'].includes(t))
  ) {
    uit.push('Web');
  }
  if (typen.includes('Game Development')) uit.push('Games');
  if (typen.includes('Robotics') || typen.includes('Embedded')) uit.push('Hardware');
  if (typen.includes('Cybersecurity')) uit.push('Security');
  if (typen.includes('Research')) uit.push('Onderzoek');
  // Een thema van het eigen vak mag ook letterlijk in projectTypes staan; zo
  // zet docs-management een nieuwe cursus onder een thema zonder regel hier.
  for (const t of themasVanVak(activity.subject)) {
    if (typen.includes(t) && !uit.includes(t)) uit.push(t);
  }
  return uit;
}

// Centrale registry van alle Coderius-vakken en -cursussen — de enige bron van
// waarheid voor cross-site links (footer, navbar-dropdown, Voorkennis-callout en
// de leerlijn-overzichtspagina), voor de map waarin een site staat en voor de
// scripts die over alle sites lopen. CommonJS zodat zowel de config-factory
// (require) als React-componenten (import) hem kunnen gebruiken.
//
// Vakken (SUBJECTS) hebben elk een eigen host: informatica.coderius.nl,
// wo.coderius.nl. Een cursus staat onder het pad van zijn vak:
// https://informatica.coderius.nl/python/. De bronbestanden staan in
// sites/<vak>/<id>/ (zie siteDir).
//
// Per cursus:
//   id          stabiele sleutel (gebruikt door <Voorkennis site="...">), en de
//               mapnaam onder sites/<vak>/; ook de naam van het build-artifact
//   label       weergavenaam
//   subject     id van het vak (SUBJECTS)
//   path        URL-segment onder de host van het vak (algorithms → algoritmes)
//   url         afgeleid: `${vak.url}/${path}/`; productie-URL van de cursus
//   legacyUrl   (optioneel) het oude subdomein, bv. https://python.coderius.nl;
//               dat stuurt door naar url (delivery) en mag niet meer in links
//   description korte omschrijving (footer/overzicht)
//   requires    leerlijn-voorkennis: cursussen waarop deze voortbouwt
//
// De volgorde hieronder is de globale leerlijn-volgorde (gebruikt door het
// /cursussen-overzicht).

const SUBJECTS = [
  { id: 'informatica', label: 'Informatica', url: 'https://informatica.coderius.nl' },
  { id: 'wo', label: 'Wetenschapsoriëntatie', url: 'https://wo.coderius.nl' },
];

const SUBJECTS_BY_ID = Object.fromEntries(SUBJECTS.map((v) => [v.id, v]));

// Vult de afgeleide velden in. `url` staat als echte property op elk object,
// zodat bestaande consumenten (site.url) gewoon blijven werken.
function defineSites(lijst) {
  return lijst.map((site) => {
    const vak = SUBJECTS_BY_ID[site.subject];
    if (!vak) throw new Error(`Site ${site.id}: onbekend vak ${site.subject}`);
    return { ...site, url: `${vak.url}/${site.path}/` };
  });
}

const SITES = defineSites([
  {
    id: 'editor',
    label: 'VS Code & Git',
    subject: 'informatica',
    path: 'editor',
    legacyUrl: 'https://editor.coderius.nl',
    description:
      'Programmeren in de editor VS Code, en je code bewaren en delen met Git en GitHub.',
    requires: [],
  },
  {
    id: 'python',
    label: 'Python',
    subject: 'informatica',
    path: 'python',
    legacyUrl: 'https://python.coderius.nl',
    description: 'Leer stap voor stap programmeren in Python.',
    requires: [],
  },
  {
    id: 'web',
    label: 'Webontwikkeling',
    subject: 'informatica',
    path: 'web',
    legacyUrl: 'https://web.coderius.nl',
    description: 'Maak je eerste website met HTML, CSS en JavaScript.',
    requires: [],
  },
  {
    id: 'play',
    label: 'Coderius Play',
    subject: 'informatica',
    path: 'play',
    legacyUrl: 'https://play.coderius.nl',
    description: 'Maak games met Python en pygame.',
    requires: ['python'],
  },
  {
    id: 'algorithms',
    label: 'Algoritmes',
    subject: 'informatica',
    path: 'algoritmes',
    legacyUrl: 'https://algoritmes.coderius.nl',
    description: 'Leer algoritmes door ze zelf uit te voeren.',
    requires: ['python'],
  },
  {
    id: 'fullstack',
    label: 'Fullstack (FastAPI)',
    subject: 'informatica',
    path: 'fullstack',
    legacyUrl: 'https://fullstack.coderius.nl',
    description: 'Voeg een Python back-end toe aan je website met FastAPI.',
    requires: ['python', 'web'],
  },
  {
    id: 'robotica',
    label: 'Robotica',
    subject: 'informatica',
    path: 'robotica',
    legacyUrl: 'https://robotica.coderius.nl',
    description: 'Stuur sensoren en motoren aan met MicroPython.',
    requires: ['python'],
  },
  {
    id: 'embedded',
    label: 'Embedded',
    subject: 'informatica',
    path: 'embedded',
    legacyUrl: 'https://embedded.coderius.nl',
    description: 'Programmeer microcontrollers: van Arduino tot STM32.',
    requires: [],
  },
  {
    id: 'godot',
    label: 'Godot',
    subject: 'informatica',
    path: 'godot',
    legacyUrl: 'https://godot.coderius.nl',
    description: 'Bouw je eerste 2D game in Godot 4.',
    requires: ['python'],
  },
  {
    id: 'ctf',
    label: 'Capture The Flag',
    subject: 'informatica',
    path: 'ctf',
    legacyUrl: 'https://ctf.coderius.nl',
    description: 'Leer cybersecurity door CTF-challenges op te lossen.',
    requires: ['python', 'web'],
  },
  {
    id: 'dvwa',
    label: 'DVWA Websecurity',
    subject: 'informatica',
    path: 'dvwa',
    legacyUrl: 'https://dvwa.coderius.nl',
    description: 'Oefen websecurity in een veilige DVWA-omgeving.',
    requires: ['web'],
  },
  {
    id: 'ide',
    label: 'Online Editor',
    subject: 'informatica',
    path: 'ide',
    legacyUrl: 'https://ide.coderius.nl',
    description: 'Schrijf en draai code direct in je browser.',
    requires: [],
  },
]);

// Sites voor docenten. Bewust niet in SITES: die lijst vult de navbar-dropdown,
// de footer en /cursussen van elke cursussite, en dit zijn geen cursussen. Wel
// in SITES_BY_ID, zodat <SiteLink site="didactiek"> vanuit een les werkt en de
// docentenpagina van de homepage ze kan tonen.
const DOCENTEN_SITES = defineSites([
  {
    id: 'didactiek',
    label: 'Didactiek',
    subject: 'informatica',
    path: 'didactiek',
    legacyUrl: 'https://didactiek.coderius.nl',
    description: 'Didactische tips en achtergrond voor docenten.',
    requires: [],
  },
]);

// De apex-homepage. Bewust GEEN cursus: niet in SITES (anders verschijnt hij in
// /cursussen en in elke "Cursussen"-dropdown als kaart), maar wel de centrale
// bron voor de teruglink vanaf elke cursussite naar coderius.nl. Hoort bij geen
// vak en staat in sites/home.
const HOME = {
  id: 'home',
  label: 'Coderius',
  url: 'https://coderius.nl',
  description: 'Alle cursussen op één plek.',
};

// Alle cursussen en gedeelde packages leven sinds de samenvoeging in één
// monorepo. De losse per-cursus repo's (web-docs, Godot, python-docs, …)
// bestaan niet meer, dus verwijs daar nergens meer naar — vandaar dat ook deze
// URL hier staat en niet in dertien losse configs.
const REPO_URL = 'https://github.com/Coderius-Education/docs';
const REPO_BRANCH = 'main';

const SITES_BY_ID = Object.fromEntries([...SITES, ...DOCENTEN_SITES].map((s) => [s.id, s]));

/**
 * Map van een site, relatief aan de repo-root en met forward slashes:
 * `sites/<vak>/<id>` voor een cursus of docentensite, `sites/home` voor de
 * homepage. Gooit bij een onbekend id, zodat een tikfout in een script niet
 * stil een lege map doorzoekt.
 *
 * @param {string} id
 */
function siteDir(id) {
  if (id === HOME.id) return 'sites/home';
  const site = SITES_BY_ID[id];
  if (!site) throw new Error(`Onbekende site: ${id}`);
  return `sites/${site.subject}/${site.id}`;
}

/**
 * Alle sites (cursussen en docentensites) als { id, dir }: precies de mappen
 * met een Docusaurus-site, plus de homepage. Voor scripts die over alle sites
 * lopen (tekstcontrole, run-all-sites, de Python-blokrunners via
 * scripts/sites-json.mjs).
 */
function alleSiteMappen() {
  return [...SITES, ...DOCENTEN_SITES, HOME].map((s) => ({ id: s.id, dir: siteDir(s.id) }));
}

/** Cursussen (SITES) van één vak, in leerlijn-volgorde. */
function sitesOfSubject(subjectId) {
  return SITES.filter((s) => s.subject === subjectId);
}

/** Host van het oude subdomein (bv. 'python.coderius.nl'), of undefined. */
function legacyHost(id) {
  const url = SITES_BY_ID[id]?.legacyUrl;
  return url ? new URL(url).host : undefined;
}

/**
 * Basis-URL voor Docusaurus' `editUrl` van één cursus. Docusaurus plakt daar
 * het pad van het bronbestand achter, gerekend vanaf de map van de site — dus
 * `docs/FastAPI/links.mdx` wordt
 * `…/tree/main/sites/informatica/fullstack/docs/FastAPI/links.mdx`.
 *
 * @param {string} id site-id, bv. 'fullstack'
 */
function repoEditUrl(id) {
  return `${REPO_URL}/tree/${REPO_BRANCH}/${siteDir(id)}/`;
}

// Normaliseer een url voor vergelijking (trailing slash weg).
function normalizeUrl(url) {
  return (url || '').replace(/\/+$/, '');
}

/**
 * Vind de cursus bij een url. Een cursus staat onder een pad van de vak-host,
 * dus de url mag dieper gaan: https://informatica.coderius.nl/python/docs/x
 * hoort bij python. Een kale vak-host hoort bij geen cursus. Geef voor de
 * huidige Docusaurus-site `siteConfig.url + siteConfig.baseUrl` mee.
 *
 * @param {string | null | undefined} url
 */
function siteByUrl(url) {
  const norm = normalizeUrl(url);
  if (!norm) return undefined;
  return SITES.find((s) => {
    const basis = normalizeUrl(s.url);
    return norm === basis || norm.startsWith(`${basis}/`);
  });
}

module.exports = {
  SUBJECTS,
  SUBJECTS_BY_ID,
  SITES,
  DOCENTEN_SITES,
  SITES_BY_ID,
  HOME,
  REPO_URL,
  repoEditUrl,
  siteDir,
  alleSiteMappen,
  sitesOfSubject,
  legacyHost,
  siteByUrl,
  normalizeUrl,
};

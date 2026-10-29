// De huisstijl van Coderius: kleuren, letters en het merk per cursus, op één
// plek. Het script scripts/genereer-huisstijl.mjs maakt hier de logo's en de
// cursus-CSS van; huisstijl.test.ts eist dat die uitvoer bij deze bron past.
//
// Het idee: Coderius begon op het Corderius College, genoemd naar de
// humanistische schoolmeester Maturinus Corderius, die leerlingen Latijn liet
// leren door het te doen en erover te praten. Coderius is dezelfde naam met
// "code" erin. Het merk is zijn schoolboek, in code geschreven: links code,
// rechts wat je in de cursus doet, de kaft in de kleur van de cursus.

const { oklch, contrast } = require('./kleur');

// Neutralen met een zweem bordgroen, zodat grijs gekozen oogt en niet geërfd.
const NEUTRAAL = {
  licht: {
    achtergrond: oklch(0.99, 0.004, 165),
    oppervlak: '#ffffff',
    inkt: oklch(0.25, 0.02, 165),
  },
  donker: {
    achtergrond: oklch(0.2, 0.012, 165),
    oppervlak: oklch(0.24, 0.014, 165),
    inkt: oklch(0.93, 0.01, 165),
  },
};

// Grijsschaal voor Infima (--ifm-color-gray-*); Infima draait hem zelf om in
// donker thema.
const GRIJS = Object.fromEntries(
  [
    [100, 0.97],
    [200, 0.93],
    [300, 0.88],
    [400, 0.83],
    [500, 0.77],
    [600, 0.62],
    [700, 0.5],
    [800, 0.38],
    [900, 0.25],
  ].map(([stap, L]) => [stap, oklch(L, 0.012, 165)]),
);

// Markeerstift: de gele streep uit het schrift. Alleen als vlak achter inkt,
// nooit als tekstkleur.
const MARKEER = oklch(0.9, 0.15, 98);

// Tinten per cursus in OKLCH, zo gelijk als het gaat over de kleurcirkel
// verdeeld. Veertien kleuren zijn niet allemaal uit elkaar te houden; de glyph
// op de rechterbladzijde doet het echte onderscheid, de kleur helpt.
const CURSUSSEN = [
  { id: 'home', label: 'Coderius', tint: 163, glyph: 'cursor' },
  { id: 'editor', label: 'VS Code & Git', tint: 284, glyph: 'branch' },
  { id: 'python', label: 'Python', tint: 260, glyph: 'prompt3' },
  { id: 'web', label: 'Webontwikkeling', tint: 50, glyph: 'tags' },
  { id: 'play', label: 'Play', tint: 308, glyph: 'play' },
  { id: 'algorithms', label: 'Algoritmes', tint: 135, glyph: 'staven' },
  { id: 'fullstack', label: 'Fullstack', tint: 190, glyph: 'lagen' },
  { id: 'robotica', label: 'Robotica', tint: 78, glyph: 'robot' },
  { id: 'embedded', label: 'Embedded', tint: 106, glyph: 'chip' },
  { id: 'godot', label: 'Godot', tint: 236, glyph: 'dpad' },
  { id: 'ctf', label: 'Capture The Flag', tint: 25, glyph: 'vlag' },
  { id: 'dvwa', label: 'DVWA', tint: 0, glyph: 'slot' },
  { id: 'ide', label: 'Online Editor', tint: 212, glyph: 'terminal' },
  { id: 'didactiek', label: 'Didactiek', tint: 335, glyph: 'gesprek' },
  { id: 'onderzoek', label: 'Onderzoek', tint: 248, glyph: 'loep' },
  { id: 'hartjespuzzel', label: 'Hartjespuzzel', tint: 350, glyph: 'hart' },
];

const CHROMA = 0.14;

// Licht: de lichtste L waarbij de kleur als tekst op wit én als vlak onder witte
// tekst de drempel haalt. Donker: de donkerste L waarbij hij als tekst op de
// donkere grond haalt; tekst óp de kleur is die grondkleur, dus dat telt mee.
function zoekL(tint, start, stap, voldoet) {
  let L = start;
  while (!voldoet(oklch(L, CHROMA, tint)) && L > 0.2 && L < 0.98) L += stap;
  return L;
}

function schaal(L, tint) {
  const k = (d) => oklch(L + d, CHROMA, tint);
  return {
    primary: k(0),
    'primary-dark': k(-0.035),
    'primary-darker': k(-0.06),
    'primary-darkest': k(-0.12),
    'primary-light': k(0.035),
    'primary-lighter': k(0.06),
    'primary-lightest': k(0.12),
  };
}

function kleurenVoor(tint) {
  const Llicht = zoekL(
    tint,
    0.56,
    -0.005,
    (c) => contrast(c, '#ffffff') >= 5 && contrast(c, NEUTRAAL.licht.achtergrond) >= 4.8,
  );
  const donkerInkt = NEUTRAAL.donker.achtergrond;
  const Ldonker = zoekL(tint, 0.74, 0.005, (c) => contrast(c, donkerInkt) >= 7);
  return {
    licht: { ...schaal(Llicht, tint), 'on-primary': '#ffffff' },
    donker: { ...schaal(Ldonker, tint), 'on-primary': donkerInkt },
  };
}

const CURSUS_KLEUREN = Object.fromEntries(CURSUSSEN.map((c) => [c.id, kleurenVoor(c.tint)]));

// Dubbele aanhalingstekens: deze stapels gaan letterlijk de CSS in, en biome
// schrijft CSS-strings met dubbele.
const LETTERS = {
  tekst:
    '"Atkinson Hyperlegible Next Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  koppen: '"Literata Variable", Georgia, "Times New Roman", serif',
  code: '"Atkinson Hyperlegible Mono Variable", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
};

module.exports = { NEUTRAAL, GRIJS, MARKEER, CURSUSSEN, CURSUS_KLEUREN, LETTERS };

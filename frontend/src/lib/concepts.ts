import type {
  ConceptStatus,
  ConflictChoice,
  ConflictSegment,
} from '../api/git';

export const STATUS_LABEL: Record<ConceptStatus, string> = {
  concept: 'Concept',
  wordt_gecontroleerd: 'Wordt gecontroleerd',
  klaar: 'Klaar om te publiceren',
  aandacht: 'Heeft aandacht nodig',
  gepubliceerd: 'Gepubliceerd',
  verworpen: 'Verworpen',
};

export const STATUS_COLOR: Record<ConceptStatus, string> = {
  concept: 'gray',
  wordt_gecontroleerd: 'yellow',
  klaar: 'green',
  aandacht: 'red',
  gepubliceerd: 'grape',
  verworpen: 'gray',
};

/** Readable names for the CI jobs in docs/.github/workflows/build.yml. */
const CHECK_LABEL: Record<string, string> = {
  build: 'Eindcontrole',
  plan: 'Bepalen wat er gecontroleerd moet worden',
  test: 'Automatische tests',
  checks: 'Code-opmaak en typen',
  tekst: 'Spelling en schrijfstijl',
  'cross-links': 'Links tussen cursussen',
  python: 'Python-codeblokken',
  algorithms: 'Algoritmes-codeblokken',
  play: 'Play-codeblokken',
  godot: 'Godot-codeblokken',
  robotica: 'Robotica-codeblokken',
  fullstack: 'Fullstack-codeblokken',
};

export function checkLabel(name: string): string {
  if (CHECK_LABEL[name]) return CHECK_LABEL[name];
  // Matrix jobs look like "build (python)" or "site (python)".
  const matrix = /^([\w-]+) \(([^)]+)\)$/.exec(name);
  if (matrix) return `Cursus ${matrix[2]} bouwen`;
  return name;
}

/** Text for one conflict block under a choice (mirrors the server). */
export function chosenText(
  segment: { ours: string; theirs: string },
  choice: ConflictChoice | undefined,
): string | undefined {
  if (choice === undefined) return undefined;
  if (typeof choice === 'object') return choice.custom;
  if (choice === 'ours') return segment.ours;
  if (choice === 'theirs') return segment.theirs;
  const ours =
    segment.ours && !segment.ours.endsWith('\n')
      ? `${segment.ours}\n`
      : segment.ours;
  return ours + segment.theirs;
}

/** Whole text after applying choices; undefined while a block is undecided. */
export function applyChoices(
  segments: ConflictSegment[],
  choices: Record<string, ConflictChoice>,
): string | undefined {
  let out = '';
  for (const segment of segments) {
    if (segment.type === 'text') {
      out += segment.text;
      continue;
    }
    const text = chosenText(segment, choices[segment.id]);
    if (text === undefined) return undefined;
    out += text;
  }
  return out;
}

export function conceptFileStatus(status: string): string {
  return (
    {
      added: 'nieuw',
      removed: 'verwijderd',
      modified: 'gewijzigd',
      renamed: 'verplaatst',
    }[status] ?? status
  );
}

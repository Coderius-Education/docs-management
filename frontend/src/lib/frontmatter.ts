import YAML from 'yaml';

export interface SplitDoc {
  frontmatter: Record<string, unknown>;
  /** De oorspronkelijke frontmatter-tekst (zonder ---), letterlijk. */
  rawFrontmatter: string;
  body: string;
  hadFrontmatter: boolean;
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFrontmatter(content: string): SplitDoc {
  const match = content.match(FM_RE);
  if (!match) {
    return { frontmatter: {}, rawFrontmatter: '', body: content, hadFrontmatter: false };
  }
  let frontmatter: Record<string, unknown> = {};
  try {
    frontmatter = (YAML.parse(match[1]) as Record<string, unknown>) ?? {};
  } catch {
    // kapotte frontmatter: behandel als body zodat er niets verloren gaat
    return { frontmatter: {}, rawFrontmatter: '', body: content, hadFrontmatter: false };
  }
  return {
    frontmatter,
    rawFrontmatter: match[0],
    body: content.slice(match[0].length),
    hadFrontmatter: true,
  };
}

/**
 * Zet het document weer in elkaar. Als de frontmatter-velden niet zijn aangepast
 * blijft de oorspronkelijke tekst (incl. volgorde/comments) letterlijk behouden —
 * zo geeft openen+opslaan zonder wijzigingen gegarandeerd nul diff.
 */
export function joinFrontmatter(doc: SplitDoc, frontmatter: Record<string, unknown>, body: string): string {
  if (doc.hadFrontmatter && deepEqual(frontmatter, doc.frontmatter)) {
    return doc.rawFrontmatter + body;
  }
  const entries = Object.entries(frontmatter).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return body;
  const yamlText = YAML.stringify(Object.fromEntries(entries)).trimEnd();
  return `---\n${yamlText}\n---\n\n${body.replace(/^\n+/, '')}`;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Bevat de pagina MDX-constructies (imports/JSX) die de WYSIWYG niet aankan? */
export function hasMdxConstructs(body: string): boolean {
  return /^(import|export)\s/m.test(body) || /<[A-Z][A-Za-z]*/.test(body);
}

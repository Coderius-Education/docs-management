import YAML, { isMap, isNode, isScalar, isSeq } from 'yaml';

export interface SplitDoc {
  frontmatter: Record<string, unknown>;
  /** De oorspronkelijke frontmatter-tekst inclusief delimiters, letterlijk. */
  rawFrontmatter: string;
  body: string;
  hadFrontmatter: boolean;
  error?: string;
}

const FM_RE = /^---\r?\n((?:[^\n]*\n)*?)---(?:\r?\n|$)/;

/** Return YAML without the delimiters, retaining comments and line endings. */
export function extractFrontmatterYaml(
  rawFrontmatter: string,
): string | undefined {
  return rawFrontmatter.match(FM_RE)?.[1];
}

// Preserve explicitly authored YAML without adding metadata keys to the value.
const authoredSources = new WeakMap<Record<string, unknown>, string>();
export function rememberFrontmatterSource(
  value: Record<string, unknown>,
  source: string,
): Record<string, unknown> {
  authoredSources.set(value, source);
  return value;
}

export function splitFrontmatter(content: string): SplitDoc {
  const match = content.match(FM_RE);
  if (!match) {
    return {
      frontmatter: {},
      rawFrontmatter: '',
      body: content,
      hadFrontmatter: false,
    };
  }
  let frontmatter: Record<string, unknown> = {};
  try {
    const parsed: unknown = YAML.parse(match[1]);
    if (
      parsed !== null &&
      (typeof parsed !== 'object' || Array.isArray(parsed))
    )
      throw new Error('Frontmatter moet een object zijn');
    frontmatter = (parsed as Record<string, unknown>) ?? {};
  } catch {
    // Keep invalid frontmatter intact and require explicit source recovery.
    return {
      frontmatter: {},
      rawFrontmatter: '',
      body: content,
      hadFrontmatter: false,
      error:
        'De pagina-instellingen bevatten ongeldige YAML of zijn geen object. Corrigeer de broncode.',
    };
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
export function joinFrontmatter(
  doc: SplitDoc,
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const authored = authoredSources.get(frontmatter);
  if (authored !== undefined) {
    // parsePropertyYaml has already checked that this is a valid mapping.
    return `---\n${authored}${authored.endsWith('\n') ? '' : '\n'}---\n${body}`;
  }
  if (doc.hadFrontmatter && deepEqual(frontmatter, doc.frontmatter)) {
    return doc.rawFrontmatter + body;
  }
  if (doc.error) {
    if (!deepEqual(frontmatter, doc.frontmatter)) throw new Error(doc.error);
    return body;
  }
  const entries = Object.entries(frontmatter).filter(
    ([, v]) => v !== undefined,
  );
  if (!doc.hadFrontmatter) {
    if (entries.length === 0) return body;
    return `---\n${YAML.stringify(Object.fromEntries(entries))}---\n${body}`;
  }
  const source = doc.rawFrontmatter.match(FM_RE)![1];
  const yamlDoc = YAML.parseDocument(source);
  // Only replace changed nodes: scalar style, map comments and untouched nested
  // collections remain attached to their original syntax-tree nodes.
  const patch = (
    path: (string | number)[],
    before: unknown,
    after: unknown,
  ) => {
    if (deepEqual(before, after)) return;
    const node = yamlDoc.getIn(path, true);
    if (isMap(node) && isRecord(before) && isRecord(after)) {
      for (const key of Object.keys(before)) {
        if (after[key] === undefined) yamlDoc.deleteIn([...path, key]);
      }
      for (const [key, value] of Object.entries(after)) {
        if (value !== undefined) patch([...path, key], before[key], value);
      }
    } else if (
      isSeq(node) &&
      Array.isArray(before) &&
      Array.isArray(after) &&
      before.length === after.length
    ) {
      after.forEach((value, index) =>
        patch([...path, index], before[index], value),
      );
    } else if (
      isScalar(node) &&
      (after === null || typeof after !== 'object')
    ) {
      node.value = after;
    } else {
      const replacement = yamlDoc.createNode(after);
      if (isNode(node)) {
        replacement.comment = node.comment;
        replacement.commentBefore = node.commentBefore;
        replacement.spaceBefore = node.spaceBefore;
      }
      yamlDoc.setIn(path, replacement);
    }
  };
  patch([], doc.frontmatter, Object.fromEntries(entries));
  const eol = doc.rawFrontmatter.startsWith('---\r\n') ? '\r\n' : '\n';
  const yamlText = yamlDoc.toString().replace(/\r?\n/g, eol);
  return `---${eol}${yamlText}---${eol}${body}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Bevat de pagina MDX-constructies (imports/JSX) die de WYSIWYG niet aankan? */
export function hasMdxConstructs(body: string): boolean {
  return /^(import|export)\s/m.test(body) || /<[A-Z][A-Za-z]*/.test(body);
}

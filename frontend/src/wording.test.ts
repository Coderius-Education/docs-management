// Teachers never see Git words: a change is a "concept" and merging it is
// "publiceren". This test reads every screen and component and fails when a
// user-facing string says branch, pull request, PR or merge again.
//
// Only text a teacher can read is checked: JSX text, string values of
// user-facing props (label, title, …), strings rendered as JSX children, object
// fields like `message`/`label` (notifications, select options) and default
// values of text props. Code identifiers, URLs and query keys are not checked.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const FORBIDDEN = /branch(es)?\b|pull ?requests?|\bprs?\b|merg(e|ed|en|es|ing)\b/i;

const TEXT_PROPS = new Set([
  'label',
  'description',
  'title',
  'placeholder',
  'aria-label',
  'alt',
  'error',
  'message',
  'summary',
  'continueLabel',
  'defaultMessage',
  'oursLabel',
  'theirsLabel',
]);

function stringParts(node: ts.Node): string[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isTemplateExpression(node))
    return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
  return [];
}

/** All string literals inside an expression, without entering nested JSX. */
function stringsIn(node: ts.Node): string[] {
  const out = [...stringParts(node)];
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node))
    return out;
  // Comparisons and property access hold code values ("main", "ready"), not text.
  if (ts.isBinaryExpression(node) && node.operatorToken.kind !== ts.SyntaxKind.PlusToken) {
    if (
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
      ].includes(node.operatorToken.kind)
    )
      return out;
  }
  if (ts.isElementAccessExpression(node) || ts.isCallExpression(node)) {
    // Arguments of calls may be text (t('…')), but not keys/urls: keep template text only.
    if (ts.isCallExpression(node))
      for (const arg of node.arguments) if (ts.isTemplateExpression(arg)) out.push(...stringsIn(arg));
    return out;
  }
  // Template literals: the literal text is already collected; ${…} parts are code.
  if (ts.isTemplateExpression(node)) return out;
  node.forEachChild((child) => {
    out.push(...stringsIn(child));
  });
  return out;
}

export function userFacingStrings(source: string, fileName = 'file.tsx'): string[] {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (text) found.push(text);
    } else if (ts.isJsxAttribute(node) && TEXT_PROPS.has(node.name.getText(file))) {
      const init = node.initializer;
      if (init && ts.isStringLiteral(init)) found.push(init.text);
      else if (init && ts.isJsxExpression(init) && init.expression)
        found.push(...stringsIn(init.expression));
    } else if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      found.push(...stringsIn(node.expression));
    } else if (
      ts.isPropertyAssignment(node) &&
      TEXT_PROPS.has(node.name.getText(file).replace(/['"]/g, ''))
    ) {
      found.push(...stringsIn(node.initializer));
    } else if (
      (ts.isBindingElement(node) || ts.isParameter(node)) &&
      node.initializer &&
      TEXT_PROPS.has(node.name.getText(file))
    ) {
      found.push(...stringParts(node.initializer));
    }
    node.forEachChild(visit);
  };
  visit(file);
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('wording for teachers', () => {
  it('finds Git words in user-facing strings (self-check)', () => {
    const sample = `
      const x = <Button title="Branch kiezen">Mergen</Button>;
      notifications.show({ message: \`PR \${n} geopend\` });
      const opts = [{ value: 'a', label: 'Pull requests' }];
      function M({ summary = 'via een pull request' }) { return <Text>{ok ? 'Gemerged' : 'Nee'}</Text>; }
      const ok = <Select label={'Conceptversie (branch)'} />;
    `;
    const hits = userFacingStrings(sample).filter((s) => FORBIDDEN.test(s));
    expect(hits).toEqual([
      'Branch kiezen',
      'Mergen',
      'PR ',
      'Pull requests',
      'via een pull request',
      'Gemerged',
      'Conceptversie (branch)',
    ]);
  });

  it('ignores code: keys, comparisons, URLs and identifiers', () => {
    const sample = `
      const branch = 'main';
      if (p.branch === 'merge') navigate(\`/prs/\${n}\`);
      const k = <Badge color={pr.state === 'open' ? 'green' : 'gray'}>{pr.title}</Badge>;
      const q = useQuery({ queryKey: ['prs', state] });
    `;
    expect(userFacingStrings(sample).filter((s) => FORBIDDEN.test(s))).toEqual([]);
  });

  it('screens and components never say branch, pull request, PR or merge', () => {
    const root = join(__dirname);
    const offenders = ['routes', 'components'].flatMap((dir) =>
      sourceFiles(join(root, dir)).flatMap((path) =>
        userFacingStrings(readFileSync(path, 'utf8'), path)
          .filter((text) => FORBIDDEN.test(text))
          .map((text) => `${relative(root, path)}: ${JSON.stringify(text)}`),
      ),
    );
    expect(offenders).toEqual([]);
  });
});

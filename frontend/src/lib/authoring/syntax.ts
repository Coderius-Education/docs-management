import { createProcessor } from '@mdx-js/mdx';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import { parse } from 'acorn';

export interface Range {
  from: number;
  to: number;
}
export interface Attribute {
  type: string;
  name?: string;
  value?: string | null | { value: string };
  position?: LessonNode['position'];
}
export interface LessonNode {
  type: string;
  name?: string;
  value?: string;
  url?: string;
  alt?: string;
  title?: string;
  depth?: number;
  lang?: string;
  meta?: string;
  ordered?: boolean;
  start?: number;
  checked?: boolean | null;
  identifier?: string;
  attributes?: Attribute[] | Record<string, string>;
  children?: LessonNode[];
  data?: { directiveLabel?: boolean };
  position?: { start: { offset: number }; end: { offset: number } };
}
const processor = createProcessor({
  remarkPlugins: [remarkGfm, remarkDirective],
});
export function parseTree(source: string): LessonNode {
  return processor.parse(source) as unknown as LessonNode;
}
export function range(node: Pick<LessonNode, 'position'>): Range {
  if (!node.position)
    throw new Error(
      'Bronpositie ontbreekt. Open de broncode om verder te bewerken.',
    );
  return { from: node.position.start.offset, to: node.position.end.offset };
}
export function replaceRange(source: string, r: Range, text: string): string {
  if (r.from < 0 || r.to < r.from || r.to > source.length)
    throw new Error('De bron is gewijzigd; open het blok opnieuw.');
  return source.slice(0, r.from) + text + source.slice(r.to);
}
export function textContent(node: LessonNode): string {
  return node.value ?? node.children?.map(textContent).join('') ?? '';
}
export function importsFrom(tree: LessonNode): Record<string, string> {
  const result: Record<string, string> = {};
  for (const node of tree.children ?? []) {
    if (node.type !== 'mdxjsEsm') continue;
    const program = parse(node.value ?? '', {
      ecmaVersion: 'latest',
      sourceType: 'module',
    });
    for (const statement of program.body) {
      if (statement.type !== 'ImportDeclaration') {
        const declaration =
          statement.type === 'ExportNamedDeclaration' ||
          statement.type === 'ExportDefaultDeclaration'
            ? statement.declaration
            : statement;
        if (declaration?.type === 'VariableDeclaration') {
          for (const binding of declaration.declarations) {
            for (const name of bindingNames(binding.id)) result[name] = '';
          }
        } else if (
          declaration &&
          (declaration.type === 'FunctionDeclaration' ||
            declaration.type === 'ClassDeclaration') &&
          declaration.id
        )
          result[declaration.id.name] = '';
        continue;
      }
      for (const spec of statement.specifiers) {
        // Only a default binding identifies the registered default component.
        result[spec.local.name] =
          spec.type === 'ImportDefaultSpecifier'
            ? String(statement.source.value)
            : '';
      }
    }
  }
  return result;
}

function bindingNames(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const node = value as {
    type: string;
    name?: string;
    properties?: unknown[];
    elements?: unknown[];
    argument?: unknown;
    left?: unknown;
    value?: unknown;
  };
  if (node.type === 'Identifier') return node.name ? [node.name] : [];
  if (node.type === 'ObjectPattern')
    return (node.properties ?? []).flatMap(bindingNames);
  if (node.type === 'ArrayPattern')
    return (node.elements ?? []).flatMap(bindingNames);
  return bindingNames(node.argument ?? node.left ?? node.value);
}

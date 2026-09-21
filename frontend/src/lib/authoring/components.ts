import { parseExpressionAt } from 'acorn';
import {
  importsFrom,
  parseTree,
  range,
  replaceRange,
  type Attribute,
  type LessonNode,
  type Range,
} from './syntax';

type Literal = string | number | boolean | string[];
export interface ComponentField {
  value: Literal;
  editable: boolean;
  range?: Range;
  prop?: string;
}
export interface ComponentModel {
  name: string;
  label: string;
  fields: Record<string, ComponentField>;
}
export const componentRegistry = [
  {
    name: 'CodeExercise',
    site: 'python',
    label: 'Python-oefening',
    module: '@site/src/components/CodeExercise',
    global: false,
  },
  {
    name: 'PyRunner',
    site: 'algorithms',
    label: 'Python uitvoeren',
    module: '@site/src/components/PyRunner',
    global: true,
  },
  {
    name: 'TryButton',
    site: 'play',
    label: 'Probeer in browser',
    module: '@site/src/components/CodeRunner/TryButton',
    global: false,
  },
];
export function literal(expression: string): Literal | undefined {
  try {
    const node = parseExpressionAt(expression, 0, { ecmaVersion: 'latest' });
    if (expression.slice(node.end).trim()) return undefined;
    if (
      node.type === 'Literal' &&
      ['string', 'number', 'boolean'].includes(typeof node.value)
    )
      return node.value as Literal;
    if (node.type === 'TemplateLiteral' && node.expressions.length === 0)
      return node.quasis[0].value.cooked ?? undefined;
    if (node.type === 'ArrayExpression') {
      const values = node.elements.map((e) =>
        e?.type === 'Literal' && typeof e.value === 'string'
          ? e.value
          : undefined,
      );
      if (values.every((v): v is string => v !== undefined)) return values;
    }
  } catch {
    /* Dynamic/invalid expressions stay in source. */
  }
  return undefined;
}
export function componentModel(
  node: LessonNode,
  site: string,
  imports: Record<string, string>,
): ComponentModel | null {
  const entry = componentRegistry.find(
    (c) =>
      c.site === site &&
      (Object.hasOwn(imports, node.name ?? '')
        ? imports[node.name!] === c.module
        : node.name === c.name && c.global),
  );
  if (!entry || !node.type.startsWith('mdxJsx')) return null;
  const attrs = Array.isArray(node.attributes) ? node.attributes : [];
  const spread = attrs.some((a) => a.type !== 'mdxJsxAttribute');
  const read = (prop: string, fallback: Literal): ComponentField => {
    const matches = attrs.filter((a) => a.name === prop);
    const attr = matches[0];
    const value = !attr
      ? fallback
      : attr.value === null
        ? true
        : typeof attr.value === 'string'
          ? attr.value
          : literal(attr.value?.value ?? '');
    const sameType = Array.isArray(fallback)
      ? Array.isArray(value)
      : typeof value === typeof fallback;
    return {
      value: value ?? fallback,
      editable: !spread && matches.length <= 1 && sameType,
      prop,
      range: attr ? range(attr) : undefined,
    };
  };
  const childCode = (): ComponentField => {
    const children = node.children ?? [];
    const child = children[0];
    const value =
      children.length === 1 &&
      ['mdxFlowExpression', 'mdxTextExpression'].includes(child.type)
        ? literal(child.value ?? '')
        : undefined;
    return {
      value: value ?? '',
      editable: !spread && typeof value === 'string',
      range: child ? range(child) : undefined,
    };
  };
  const fields: Record<string, ComponentField> = {};
  if (entry.name === 'CodeExercise')
    fields.code = node.children?.length ? childCode() : read('children', '');
  if (entry.name === 'TryButton') {
    fields.code = read('code', '');
    fields.mode = read('mode', '');
  }
  if (entry.name === 'PyRunner') {
    fields.code = attrs.some((a) => a.name === 'initialCode')
      ? read('initialCode', '')
      : node.children?.length
        ? childCode()
        : read(
            attrs.some((a) => a.name === 'children')
              ? 'children'
              : 'initialCode',
            '',
          );
    fields.editable = read('editable', true);
    fields.rows = read('rows', 10);
    fields.packages = read('packages', []);
  }
  return { name: entry.name, label: entry.label, fields };
}
export function updateComponent(
  source: string,
  node: LessonNode,
  model: ComponentModel,
  name: string,
  value: Literal,
): string {
  const field = model.fields[name];
  if (!field?.editable)
    throw new Error(
      'Deze waarde bevat broncode en kan niet met dit formulier worden gewijzigd.',
    );
  const expression = `{${JSON.stringify(value)}}`;
  const text = field.prop ? `${field.prop}=${expression}` : expression;
  if (field.range) return replaceRange(source, field.range, text);
  const pos = range(node).from + 1 + (node.name?.length ?? 0);
  return replaceRange(source, { from: pos, to: pos }, ` ${text}`);
}
export function insertComponent(
  source: string,
  site: string,
  name: string,
  position: number,
): string {
  const entry = componentRegistry.find(
    (c) => c.site === site && c.name === name,
  );
  if (!entry)
    throw new Error('Dit onderdeel is niet beschikbaar in deze cursus.');
  const tree = parseTree(source);
  const imports = importsFrom(tree);
  let localName = Object.keys(imports).find(
    (key) => imports[key] === entry.module,
  );
  let importText = '';
  if (!localName) {
    localName = name;
    let suffix = 2;
    while (
      Object.hasOwn(imports, localName) ||
      new RegExp(`\\b${localName}\\b`).test(source)
    )
      localName = `${name}${suffix++}`;
    if (!entry.global || localName !== name)
      importText = `import ${localName} from '${entry.module}';\n\n`;
  }
  const block =
    name === 'CodeExercise'
      ? `<${localName}>{${JSON.stringify('# Schrijf hier je code')}}</${localName}>`
      : `<${localName} ${name === 'PyRunner' ? 'initialCode' : 'code'}={${JSON.stringify('print("Hallo!")')}} />`;
  const pos = Math.max(0, Math.min(position, source.length));
  return (
    importText +
    replaceRange(source, { from: pos, to: pos }, `\n\n${block}\n\n`)
  );
}
export function attributes(node: LessonNode): Attribute[] {
  return Array.isArray(node.attributes) ? node.attributes : [];
}

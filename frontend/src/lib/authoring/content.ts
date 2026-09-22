import { literal } from './components';
import {
  importsFrom,
  parseTree,
  range,
  replaceRange,
  type LessonNode,
  type Range,
} from './syntax';

const titlePattern = /(?:^|\s)title=("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/;
const highlightPattern = /(?:^|\s)\{([\d,\s-]+)\}/;
const numbersPattern = /(?:^|\s)showLineNumbers(?:=(\d+))?(?=\s|$)/;
export interface CodeModel {
  language: string;
  title: string;
  highlights: string;
  lineNumbers: boolean;
  lineNumberStart: number;
  code: string;
}
export function codeModel(node: LessonNode, source: string): CodeModel | null {
  if (
    node.type !== 'code' ||
    !/^ {0,3}(`{3,}|~{3,})/.test(source.slice(range(node).from, range(node).to))
  )
    return null;
  const meta = node.meta ?? '';
  const quoted = meta.match(titlePattern)?.[1];
  return {
    language: node.lang ?? '',
    title: quoted ? quoted.slice(1, -1).replace(/\\([\\'"])/g, '$1') : '',
    highlights: meta.match(highlightPattern)?.[1] ?? '',
    lineNumbers: numbersPattern.test(meta),
    lineNumberStart: Number(meta.match(numbersPattern)?.[1] ?? 1),
    code: node.value ?? '',
  };
}
export function updateCode(
  source: string,
  node: LessonNode,
  changes: Partial<CodeModel>,
): string {
  const model = codeModel(node, source);
  if (!model)
    throw new Error('Dit codeblok kan alleen in de bron worden bewerkt.');
  const next = { ...model, ...changes };
  if (!/^[\w+.#-]*$/.test(next.language))
    throw new Error('Gebruik een taalnaam zonder spaties.');
  if (
    next.highlights &&
    !/^\d+(?:-\d+)?(?:\s*,\s*\d+(?:-\d+)?)*$/.test(next.highlights)
  )
    throw new Error('Gebruik regelnummers zoals 1,3-5.');
  if (!Number.isInteger(next.lineNumberStart) || next.lineNumberStart < 1)
    throw new Error('Het eerste regelnummer moet positief zijn.');
  if (/[\r\n]/.test(next.title))
    throw new Error('De codetitel moet op één regel staan.');
  let meta = node.meta ?? '';
  const patch = (pattern: RegExp, text: string) => {
    if (pattern.test(meta))
      meta = meta.replace(
        pattern,
        (match) => (match.startsWith(' ') ? ' ' : '') + text,
      );
    else if (text) meta += `${meta ? ' ' : ''}${text}`;
  };
  if (changes.title !== undefined)
    patch(
      titlePattern,
      next.title ? `title=${JSON.stringify(next.title)}` : '',
    );
  if (changes.highlights !== undefined)
    patch(highlightPattern, next.highlights ? `{${next.highlights}}` : '');
  if (
    changes.lineNumbers !== undefined ||
    changes.lineNumberStart !== undefined
  )
    patch(
      numbersPattern,
      next.lineNumbers
        ? `showLineNumbers${next.lineNumberStart === 1 ? '' : `=${next.lineNumberStart}`}`
        : '',
    );
  const raw = source.slice(range(node).from, range(node).to);
  const original = raw.match(/^ {0,3}(`{3,}|~{3,})/)![1];
  const char = original[0];
  let length = original.length;
  for (const match of next.code.matchAll(
    new RegExp(`^ {0,3}(${char}{3,})`, 'gm'),
  ))
    length = Math.max(length, match[1].length + 1);
  const fence = char.repeat(length);
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  return replaceRange(
    source,
    range(node),
    `${fence}${next.language}${meta.trim() ? ` ${meta.trim()}` : ''}${eol}${next.code.replace(/\r?\n/g, eol)}${eol}${fence}`,
  );
}
export interface HeadingModel {
  title: string;
  id: string;
  depth: number;
  marker: 'classic' | 'comment';
}
export function headingModel(
  node: LessonNode,
  source: string,
): HeadingModel | null {
  if (node.type !== 'heading') return null;
  const raw = source.slice(range(node).from, range(node).to);
  const match = raw.match(/^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+[ \t]*)?$/);
  if (!match) return null; // Setext and multiline headings remain intact in source.
  const tail = match[2].match(/\s+\\?\{#([^\s{}]+)\}\s*$/);
  const comment = match[2].match(/\s+\{\/\*\s*#([^\s{}]+)\s*\*\/\}\s*$/);
  const id = tail ?? comment;
  return {
    title: id ? match[2].slice(0, id.index) : match[2],
    id: id?.[1] ?? '',
    depth: match[1].length,
    marker: comment ? 'comment' : 'classic',
  };
}
export function updateHeading(
  source: string,
  node: LessonNode,
  changes: Partial<HeadingModel>,
): string {
  const model = headingModel(node, source);
  if (!model) throw new Error('Deze kop blijft in de bron bewerkbaar.');
  const next = { ...model, ...changes };
  if (
    !Number.isInteger(next.depth) ||
    next.depth < 1 ||
    next.depth > 6 ||
    /[\r\n]/.test(next.title) ||
    /[\s{}]/.test(next.id)
  )
    throw new Error(
      'Gebruik kopniveau 1–6 en een ID zonder spaties of accolades.',
    );
  const suffix = next.id
    ? next.marker === 'comment'
      ? ` {/* #${next.id} */}`
      : ` {#${next.id}}`
    : '';
  return replaceRange(
    source,
    range(node),
    `${'#'.repeat(next.depth)} ${next.title}${suffix}`,
  );
}

export interface TabField {
  value: string | boolean | null;
  editable: boolean;
}
export interface TabItemModel {
  node: LessonNode;
  value: TabField;
  label: TabField;
  default: TabField;
  body?: Range;
}
export interface TabsModel {
  node: LessonNode;
  groupId: TabField;
  defaultValue: TabField;
  lazy: TabField;
  queryString: TabField;
  items: TabItemModel[];
  itemName: string;
  canChangeItems: boolean;
}
function readTabProperty(
  node: LessonNode,
  name: string,
  fallback: string | boolean | null,
): TabField {
  const attrs = Array.isArray(node.attributes) ? node.attributes : [];
  const matches = attrs.filter((attr) => attr.name === name);
  const attr = matches[0];
  const value = !attr
    ? fallback
    : attr.value === null
      ? true
      : typeof attr.value === 'string'
        ? attr.value
        : attr.value?.value.trim() === 'null'
          ? null
          : literal(attr.value?.value ?? '');
  return {
    value:
      typeof value === 'string' || typeof value === 'boolean' || value === null
        ? value
        : fallback,
    editable:
      !attrs.some((a) => a.type !== 'mdxJsxAttribute') &&
      matches.length <= 1 &&
      (typeof value === 'string' ||
        typeof value === 'boolean' ||
        value === null),
  };
}
export function tabsModel(
  node: LessonNode,
  source: string,
  imports: Record<string, string>,
): TabsModel | null {
  if (node.type === 'paragraph' && node.children?.length === 1)
    return tabsModel(node.children[0], source, imports);
  if (
    !node.type.startsWith('mdxJsx') ||
    imports[node.name ?? ''] !== '@theme/Tabs'
  )
    return null;
  const itemName = Object.keys(imports).find(
    (name) => imports[name] === '@theme/TabItem',
  );
  if (!itemName) return null;
  const items: TabItemModel[] = [];
  let unknown = false;
  for (const child of node.children ?? []) {
    if (imports[child.name ?? ''] !== '@theme/TabItem') {
      if (child.type !== 'text' || child.value?.trim()) unknown = true;
      continue;
    }
    const r = range(child);
    const close = source.lastIndexOf(`</${child.name}>`, r.to);
    // Use the first child's source range; scanning for '>' would mistake a
    // comparison operator in a preserved expression for the opening tag end.
    const first = child.children?.[0];
    const last = child.children?.at(-1);
    const body =
      first && last
        ? { from: range(first).from, to: range(last).to }
        : close >= r.from
          ? { from: close, to: close }
          : undefined;
    items.push({
      node: child,
      value: readTabProperty(child, 'value', ''),
      label: readTabProperty(child, 'label', ''),
      default: readTabProperty(child, 'default', false),
      body,
    });
  }
  const attrs = Array.isArray(node.attributes) ? node.attributes : [];
  return {
    node,
    groupId: readTabProperty(node, 'groupId', ''),
    defaultValue: readTabProperty(node, 'defaultValue', ''),
    lazy: readTabProperty(node, 'lazy', false),
    queryString: readTabProperty(node, 'queryString', false),
    items,
    itemName,
    canChangeItems:
      !unknown &&
      !attrs.some((a) => a.type !== 'mdxJsxAttribute' || a.name === 'values'),
  };
}
export function updateTabProperty(
  source: string,
  node: LessonNode,
  name: string,
  value: string | boolean | null | undefined,
): string {
  if (
    ![
      'groupId',
      'defaultValue',
      'lazy',
      'queryString',
      'value',
      'label',
      'default',
    ].includes(name) ||
    !readTabProperty(node, name, '').editable
  )
    throw new Error('Dynamische eigenschappen blijven bewerkbaar in de bron.');
  if (
    (name === 'queryString' &&
      value === true &&
      !readTabProperty(node, 'groupId', '').value) ||
    (name === 'groupId' &&
      !value &&
      readTabProperty(node, 'queryString', false).value === true)
  )
    throw new Error(
      'Vul eerst een tabgroep-ID (groupId) in voor een automatische URL-parameter.',
    );
  const attrs = Array.isArray(node.attributes) ? node.attributes : [];
  const attr = attrs.find((entry) => entry.name === name);
  const text = value === undefined ? '' : `${name}={${JSON.stringify(value)}}`;
  if (attr) return replaceRange(source, range(attr), text);
  if (!text) return source;
  const pos = range(node).from + 1 + node.name!.length;
  return replaceRange(source, { from: pos, to: pos }, ` ${text}`);
}
export function insertTabs(source: string, position: number): string {
  const imports = importsFrom(parseTree(source));
  let prefix = '';
  const binding = (module: string, preferred: string) => {
    const existing = Object.keys(imports).find(
      (key) => imports[key] === module,
    );
    if (existing) return existing;
    let name = preferred;
    let suffix = 2;
    while (Object.hasOwn(imports, name)) name = `${preferred}${suffix++}`;
    imports[name] = module;
    prefix += `import ${name} from '${module}';\n`;
    return name;
  };
  const group = binding('@theme/Tabs', 'Tabs');
  const item = binding('@theme/TabItem', 'TabItem');
  const block = `<${group}>\n<${item} value="tab-1" label="Tabblad 1" default>\n\nNieuwe tekst\n\n</${item}>\n<${item} value="tab-2" label="Tabblad 2">\n\nNieuwe tekst\n\n</${item}>\n</${group}>`;
  return (
    prefix +
    (prefix ? '\n' : '') +
    replaceRange(source, { from: position, to: position }, `\n\n${block}\n\n`)
  );
}
export function insertTab(source: string, model: TabsModel): string {
  if (!model.canChangeItems)
    throw new Error(
      'Deze tabgroep heeft dynamische of onbekende kinderen; gebruik de bron.',
    );
  const taken = new Set(model.items.map((item) => item.value.value));
  let i = model.items.length + 1;
  while (taken.has(`tab-${i}`)) i++;
  const pos = source.lastIndexOf(`</${model.node.name}>`, range(model.node).to);
  if (pos < range(model.node).from)
    throw new Error('De tabgroep heeft geen sluiting.');
  return replaceRange(
    source,
    { from: pos, to: pos },
    `\n<${model.itemName} value="tab-${i}" label="Nieuw tabblad">\n\nNieuwe tekst\n\n</${model.itemName}>\n`,
  );
}
export function removeTab(
  source: string,
  model: TabsModel,
  index: number,
): string {
  if (!model.canChangeItems || !model.items[index] || model.items.length < 2)
    throw new Error('Behoud minstens één tabblad.');
  if (model.defaultValue.value === model.items[index].value.value)
    throw new Error('Kies eerst een ander standaardtabblad.');
  return replaceRange(source, range(model.items[index].node), '');
}

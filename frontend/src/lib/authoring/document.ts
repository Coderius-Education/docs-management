import { componentModel } from './components';
import { codeModel, headingModel, tabsModel } from './content';
import {
  importsFrom,
  parseTree,
  range,
  replaceRange,
  textContent,
  type LessonNode,
  type Range,
} from './syntax';
export { replaceRange } from './syntax';
export type { LessonNode, Range } from './syntax';
export interface Container {
  type: string;
  title: string;
  body: Range;
  titleRange?: Range;
  header?: Range;
}
export interface LessonBlock extends Range {
  kind:
    | 'markdown'
    | 'container'
    | 'component'
    | 'source'
    | 'imports'
    | 'code'
    | 'heading'
    | 'tabs';
  node: LessonNode;
  container?: Container;
}
export const calloutTypes = [
  'note',
  'tip',
  'info',
  'warning',
  'caution',
  'danger',
];
const plainTypes = new Set([
  'text',
  'paragraph',
  'heading',
  'strong',
  'emphasis',
  'delete',
  'inlineCode',
  'code',
  'break',
  'thematicBreak',
  'blockquote',
  'list',
  'listItem',
  'link',
  'image',
  'table',
  'tableRow',
  'tableCell',
]);
function plain(node: LessonNode): boolean {
  return (
    plainTypes.has(node.type) &&
    !node.meta &&
    !node.children?.some((n) => !plain(n))
  );
}
export function containerOf(
  node: LessonNode,
  source: string,
): Container | undefined {
  const r = range(node);
  if (
    node.type === 'containerDirective' &&
    calloutTypes.includes(node.name ?? '') &&
    Object.keys(node.attributes ?? {}).length === 0
  ) {
    const label = node.children?.find((n) => n.data?.directiveLabel);
    if (label?.children?.some((n) => n.type !== 'text')) return undefined;
    const start = source.indexOf('\n', r.from) + 1;
    const end = source.lastIndexOf('\n', r.to - 1);
    if (start <= 0 || end < start) return undefined;
    const fence = source.slice(r.from, start).match(/^:+/)?.[0];
    if (
      !fence ||
      !new RegExp(`^:{${fence.length},}\\s*$`).test(source.slice(end + 1, r.to))
    )
      return undefined;
    return {
      type: node.name!,
      title: label ? textContent(label) : '',
      body: { from: start, to: end },
      header: { from: r.from, to: start - 1 },
    };
  }
  if (node.name === 'details' && node.type === 'mdxJsxFlowElement') {
    const first = node.children?.[0];
    const summary =
      first?.name === 'summary'
        ? first
        : first?.children?.length === 1 && first.children[0].name === 'summary'
          ? first.children[0]
          : undefined;
    if (!summary || summary.children?.some((n) => n.type !== 'text'))
      return undefined;
    const sr = range(summary);
    const closing = source.lastIndexOf('</summary>', sr.to);
    const opening = summary.children?.length
      ? range(summary.children[0]).from
      : closing;
    const end = source.lastIndexOf('</details>', r.to);
    if (opening === 0 || closing < opening || end < sr.to) return undefined;
    return {
      type: 'details',
      title: textContent(summary),
      titleRange: { from: opening, to: closing },
      body: { from: sr.to, to: end },
    };
  }
  return undefined;
}
export function updateContainer(
  source: string,
  block: LessonBlock,
  body: string,
): string {
  const container = block.container;
  if (!container) throw new Error('Dit blok is geen bewerkbare container.');
  if (container.type === 'details')
    return replaceRange(source, container.body, `\n\n${body.trim()}\n\n`);
  const header = source.slice(container.header!.from, container.header!.to);
  const openingLength = header.match(/^:+/)![0].length;
  let fenceLength = openingLength;
  const visit = (node: LessonNode) => {
    if (node.type === 'containerDirective') {
      const length = body.slice(range(node).from).match(/^:+/)?.[0].length ?? 0;
      fenceLength = Math.max(fenceLength, length + 1);
    }
    node.children?.forEach(visit);
  };
  visit(parseTree(body));
  const fence = ':'.repeat(fenceLength);
  const closing = source
    .slice(container.body.to + 1, block.to)
    .replace(/^:+/, fence);
  return replaceRange(
    source,
    block,
    `${fence}${header.slice(openingLength)}\n${body.trim()}\n${closing}`,
  );
}
export function parseLesson(source: string, site: string) {
  try {
    const tree = parseTree(source);
    const imports = importsFrom(tree);
    const blocks: LessonBlock[] = [];
    for (const node of tree.children ?? []) {
      const r = range(node);
      const container = containerOf(node, source);
      const kind =
        node.type === 'mdxjsEsm'
          ? 'imports'
          : codeModel(node, source)
            ? 'code'
            : headingModel(node, source)?.id
              ? 'heading'
              : tabsModel(node, source, imports)
                ? 'tabs'
                : container
                  ? 'container'
                  : componentModel(node, site, imports)
                    ? 'component'
                    : plain(node)
                      ? 'markdown'
                      : 'source';
      const previous = blocks.at(-1);
      if (kind === 'markdown' && previous?.kind === 'markdown')
        previous.to = r.to;
      else blocks.push({ ...r, kind, node, container });
    }
    return { tree, blocks, imports, error: undefined as string | undefined };
  } catch (error) {
    return {
      tree: { type: 'root', children: [] } as LessonNode,
      blocks: [] as LessonBlock[],
      imports: {} as Record<string, string>,
      error: String(error),
    };
  }
}

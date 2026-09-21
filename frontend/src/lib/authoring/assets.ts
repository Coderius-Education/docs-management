import { parseTree, type LessonNode } from './syntax';
import { attributes, literal } from './components';
export interface AssetContext {
  site?: string;
  domain?: string;
  path?: string;
  branch?: string;
  previewOrigin?: string;
}
export function persistentImage(url: string): boolean {
  const value = url.trim();
  return (
    !!value &&
    !/[\u0000-\u0020\\]/.test(value) &&
    !value.startsWith('//') &&
    (!/^[a-z][a-z\d+.-]*:/i.test(value) || /^https?:\/\//i.test(value))
  );
}
export function resolveAsset(
  url: string,
  context: AssetContext,
): string | undefined {
  if (!persistentImage(url)) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (
    context.site &&
    context.path &&
    !url.startsWith('/') &&
    !url.startsWith('@')
  ) {
    try {
      // Source-relative raster images can be read directly from the selected branch.
      const base = new URL(
        context.path.split('/').map(encodeURIComponent).join('/'),
        'https://lesson.invalid/',
      );
      const target = new URL(url, base);
      if (
        target.origin === base.origin &&
        /\.(png|jpe?g|gif|webp)$/i.test(target.pathname)
      ) {
        return `/api/sites/${encodeURIComponent(context.site)}/assets?${new URLSearchParams(
          {
            path: decodeURIComponent(target.pathname.slice(1)),
            ref: context.branch ?? 'main',
          },
        )}`;
      }
    } catch {
      return undefined;
    }
  }
  const origin =
    context.branch && context.branch !== 'main'
      ? context.previewOrigin
      : context.domain
        ? `https://${context.domain}`
        : undefined;
  if (!origin) return undefined;
  if (url.startsWith('@site/static/'))
    return new URL(url.slice('@site/static'.length), origin).href;
  if (url.startsWith('/')) return new URL(url, origin).href;
  // Relative source assets are transformed by Docusaurus; guessing a build URL is misleading.
  return undefined;
}

export function imageProblems(source: string): string[] {
  try {
    const tree = parseTree(source);
    const issues: string[] = [];
    const definitions = new Map(
      (tree.children ?? [])
        .filter((n) => n.type === 'definition')
        .map((n) => [n.identifier, n.url]),
    );
    function visit(node: LessonNode) {
      let url: unknown =
        node.type === 'image'
          ? node.url
          : node.type === 'imageReference'
            ? definitions.get(node.identifier)
            : undefined;
      if (node.name === 'img') {
        const value = attributes(node).find((a) => a.name === 'src')?.value;
        url =
          typeof value === 'string'
            ? value
            : value && typeof value === 'object'
              ? literal(value.value)
              : undefined;
      }
      if (typeof url === 'string' && !persistentImage(url)) issues.push(url);
      node.children?.forEach(visit);
    }
    visit(tree);
    return issues;
  } catch {
    return [];
  }
}

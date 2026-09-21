import type { TreeItem } from '../../api/types';
export function newPageDetails(
  title: string,
  directory: string,
  tree: TreeItem[],
) {
  const slug = title
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const prefix = directory ? `${directory}/` : '';
  const siblings = tree.filter(
    (t) =>
      t.type === 'blob' &&
      t.path.startsWith(prefix) &&
      !t.path.slice(prefix.length).includes('/'),
  );
  const position =
    1 +
    Math.max(
      0,
      ...siblings.map((t) =>
        Number(t.path.slice(prefix.length).match(/^(\d+)-/)?.[1] ?? 0),
      ),
    );
  const path = `${prefix}${String(position).padStart(2, '0')}-${slug}.mdx`;
  return {
    path,
    position,
    error:
      !title.trim() || !slug
        ? 'Vul een titel met letters of cijfers in.'
        : tree.some((t) => t.path === path)
          ? 'Er bestaat al een pagina met deze naam.'
          : '',
  };
}

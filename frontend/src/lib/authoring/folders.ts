import type { TreeItem } from '../../api/types';

export function friendlyName(path: string) {
  const name = path.split('/').at(-1) ?? path;
  const words = name
    .replace(/\.(mdx?|json|ya?ml)$/i, '')
    .replace(/^\d+[-_]/, '')
    .replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function folderLabel(path: string) {
  return path ? path.split('/').map(friendlyName).join(' / ') : 'Alle lessen';
}

export function folderOptions(tree: TreeItem[], root = 'Alle lessen') {
  return [
    { value: '', label: root },
    ...tree
      .filter((item) => item.type === 'tree')
      .map((item) => ({ value: item.path, label: folderLabel(item.path) })),
  ];
}

export function categoryContent(label: string) {
  return (
    JSON.stringify(
      { label, collapsed: true, link: { type: 'generated-index' } },
      null,
      2,
    ) + '\n'
  );
}

export function newFolderDetails(
  name: string,
  parent: string,
  tree: TreeItem[],
) {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const folder = [parent, slug].filter(Boolean).join('/');
  return {
    folder,
    path: `${folder}/_category_.json`,
    content: categoryContent(name.trim()),
    error: !slug
      ? 'Vul een naam met letters of cijfers in.'
      : /[/\\%\u0000-\u001f]/.test(name) || name.includes('..')
        ? 'Gebruik een mapnaam, zonder pad of schuine strepen.'
        : parent &&
            (!tree.some(
              (item) => item.type === 'tree' && item.path === parent,
            ) ||
              parent
                .split('/')
                .some((part) => !part || part === '.' || part === '..') ||
              /[\\%\u0000-\u001f]/.test(parent))
          ? 'Kies een bestaande bovenliggende map.'
          : tree.some(
                (item) =>
                  item.path === folder || item.path.startsWith(`${folder}/`),
              )
            ? 'Er bestaat al een map met deze naam. Kies die map of gebruik een andere naam.'
            : '',
  };
}

// The shared Docusaurus config always adds these links to every course
// (integrations/docusaurus/files/packages/shared/config/index.js). They are shown, but not
// written to the overrides: the build would add them again anyway.
export type LinkItem = Record<string, unknown>;
const HOME = 'https://coderius.nl';

const isItem = (value: unknown): value is LinkItem =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function isSharedNavItem(item: LinkItem) {
  return (
    item.to === '/docenten' ||
    (item.type === 'dropdown' && item.label === 'Cursussen')
  );
}

export function isSharedFooterGroup(group: LinkItem) {
  const items = Array.isArray(group.items) ? group.items.filter(isItem) : [];
  return (
    items.length > 0 &&
    items.every(
      (item) =>
        String(item.href ?? '').replace(/\/$/, '') === HOME ||
        item.to === '/privacy',
    )
  );
}

export type LinkKind = 'navbar' | 'footer';
const shared = (kind: LinkKind) =>
  kind === 'navbar' ? isSharedNavItem : isSharedFooterGroup;

/** Whether a value is a list the visual link editor understands. */
export function isLinkList(value: unknown): value is LinkItem[] {
  return Array.isArray(value) && value.every(isItem);
}

export function splitLinks(value: unknown, kind: LinkKind) {
  const items = isLinkList(value) ? value : [];
  return {
    own: items.filter((item) => !shared(kind)(item)),
    shared: items.filter(shared(kind)),
  };
}

/** Links as the course will show them: the editable ones, then the shared ones. */
export function displayLinks(
  current: unknown,
  inherited: unknown,
  kind: LinkKind,
): LinkItem[] {
  const own = splitLinks(current, kind);
  const fromBuild = splitLinks(inherited, kind).shared;
  return [...own.own, ...(own.shared.length ? own.shared : fromBuild)];
}

/** Footer links may be flat items or titled columns; the editor always uses columns. */
export function asFooterColumns(links: LinkItem[]): LinkItem[] {
  if (!links.length || links.some((link) => 'items' in link)) return links;
  return [{ title: 'Links', items: links }];
}

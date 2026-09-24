import {
  Alert,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useEffect, useRef } from 'react';
import {
  isLinkList,
  type LinkItem as Item,
} from '../../lib/authoring/navigation';

const typeLabels: Record<string, string> = {
  link: 'Pagina of website',
  doc: 'Document',
  docSidebar: 'Zijmenu',
  dropdown: 'Uitklapmenu',
  html: 'HTML',
};
export function NavigationLinks({
  value,
  onChange,
  navbar = false,
  depth = 0,
  highlight,
}: {
  value: unknown;
  onChange: (v: Item[]) => void;
  navbar?: boolean;
  depth?: number;
  /** Index of the link selected on the page, scrolled into view. */
  highlight?: number;
}) {
  const highlighted = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const link = highlighted.current;
    if (!link) return;
    // Scroll only the panel, not the page with the course canvas.
    const panel = link.closest<HTMLElement>(
      '.homepage-panel, .mantine-Drawer-body',
    );
    if (panel)
      panel.scrollTop +=
        link.getBoundingClientRect().top -
        panel.getBoundingClientRect().top -
        48;
    link.querySelector('input')?.focus({ preventScroll: true });
  }, [highlight]);
  if (value !== undefined && !isLinkList(value))
    return (
      <Alert color="orange">
        Deze links hebben een vorm die hier niet te bewerken is. Pas ze aan via
        Site → Broncode.
      </Alert>
    );
  const items = (value ?? []) as Item[];
  const update = (index: number, next: Item) =>
    onChange(items.map((v, i) => (i === index ? next : v)));
  const set = (index: number, key: string, v: unknown) => {
    const next = { ...items[index] };
    if (v === undefined) delete next[key];
    else next[key] = v;
    update(index, next);
  };
  const swap = (a: number, b: number) => {
    const next = [...items];
    [next[a], next[b]] = [next[b], next[a]];
    onChange(next);
  };
  return (
    <Stack gap="xs">
      {items.map((item, index) => {
        const type = typeof item.type === 'string' ? item.type : 'link';
        const known = type in typeLabels;
        return (
          <Paper
            withBorder
            p="xs"
            key={index}
            ref={index === highlight ? highlighted : undefined}
            className={
              index === highlight ? 'studio-link is-highlighted' : 'studio-link'
            }
          >
            <Stack gap="xs">
              <Group grow align="flex-start">
                <TextInput
                  label={`Link ${index + 1} — tekst`}
                  value={String(item.label ?? '')}
                  onChange={(e) => set(index, 'label', e.currentTarget.value)}
                />
                {navbar && depth === 0 && (
                  <Select
                    label="Positie"
                    placeholder="Links"
                    data={[
                      { value: 'left', label: 'Links' },
                      { value: 'right', label: 'Rechts' },
                    ]}
                    value={
                      typeof item.position === 'string' ? item.position : null
                    }
                    onChange={(v) => set(index, 'position', v ?? undefined)}
                  />
                )}
              </Group>
              {navbar && (
                <Select
                  label="Linktype"
                  data={[
                    ...Object.entries(typeLabels)
                      .filter(([v]) => depth === 0 || v !== 'dropdown')
                      .map(([value, label]) => ({ value, label })),
                    ...(!known ? [{ value: type, label: type }] : []),
                  ]}
                  value={type}
                  onChange={(v) => {
                    if (!v || v === type) return;
                    const next = { ...item };
                    for (const key of [
                      'href',
                      'to',
                      'docId',
                      'sidebarId',
                      'items',
                      'value',
                    ])
                      delete next[key];
                    if (v === 'link') {
                      delete next.type;
                      next.to = '/';
                    } else next.type = v;
                    if (v === 'dropdown') next.items = [];
                    update(index, next);
                  }}
                />
              )}
              {type === 'doc' ? (
                <TextInput
                  label="Document-ID"
                  description="Het pad van de les zonder extensie, bijvoorbeeld intro/welkom"
                  value={String(item.docId ?? '')}
                  onChange={(e) => set(index, 'docId', e.currentTarget.value)}
                />
              ) : type === 'docSidebar' ? (
                <TextInput
                  label="Zijmenu-ID"
                  description="De naam van het zijmenu uit sidebars, bijvoorbeeld tutorialSidebar"
                  value={String(item.sidebarId ?? '')}
                  onChange={(e) =>
                    set(index, 'sidebarId', e.currentTarget.value)
                  }
                />
              ) : type === 'html' ? (
                <Textarea
                  label="HTML-inhoud"
                  value={String(item.value ?? '')}
                  onChange={(e) => set(index, 'value', e.currentTarget.value)}
                />
              ) : type === 'dropdown' ? (
                <div className="studio-nested-links">
                  <Text size="xs" fw={600} mb={4}>
                    Links in dit uitklapmenu
                  </Text>
                  <NavigationLinks
                    value={item.items}
                    navbar={navbar}
                    depth={depth + 1}
                    onChange={(v) => set(index, 'items', v)}
                  />
                </div>
              ) : type === 'link' ? (
                <TextInput
                  label={`Link ${index + 1} — bestemming`}
                  placeholder="/docs/intro of https://…"
                  value={String(item.href ?? item.to ?? '')}
                  onChange={(e) => {
                    const text = e.currentTarget.value,
                      next = { ...item };
                    delete next.href;
                    delete next.to;
                    next[/^[a-z]+:|^\/\//i.test(text) ? 'href' : 'to'] = text;
                    update(index, next);
                  }}
                />
              ) : (
                <Text size="xs" c="dimmed">
                  Docusaurus vult dit onderdeel zelf in.
                </Text>
              )}
              <Group gap="xs">
                <Button
                  size="compact-xs"
                  variant="subtle"
                  disabled={index === 0}
                  onClick={() => swap(index - 1, index)}
                >
                  Omhoog
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  disabled={index === items.length - 1}
                  onClick={() => swap(index, index + 1)}
                >
                  Omlaag
                </Button>
                <Button
                  size="compact-xs"
                  color="red"
                  variant="subtle"
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                >
                  Link verwijderen
                </Button>
              </Group>
            </Stack>
          </Paper>
        );
      })}
      <Group>
        <Button
          size="xs"
          variant="light"
          onClick={() =>
            onChange([...items, { label: 'Nieuwe link', to: '/' }])
          }
        >
          Link toevoegen
        </Button>
      </Group>
    </Stack>
  );
}
export function FooterLinks({
  value,
  onChange,
}: {
  value: Item[];
  onChange: (v: Item[]) => void;
}) {
  const groups = value;
  return (
    <Stack>
      {groups.map((group, index) => (
        <Paper key={index} withBorder p="xs">
          <Stack>
            <TextInput
              label={`Voettekstkolom ${index + 1}`}
              value={String(group.title ?? '')}
              onChange={(e) =>
                onChange(
                  groups.map((g, i) =>
                    i === index ? { ...g, title: e.currentTarget.value } : g,
                  ),
                )
              }
            />
            <NavigationLinks
              value={group.items ?? []}
              onChange={(v) =>
                onChange(
                  groups.map((g, i) => (i === index ? { ...g, items: v } : g)),
                )
              }
            />
            <Button
              size="xs"
              color="red"
              variant="subtle"
              onClick={() => onChange(groups.filter((_, i) => i !== index))}
            >
              Kolom verwijderen
            </Button>
          </Stack>
        </Paper>
      ))}
      <Group>
        <Button
          size="xs"
          variant="light"
          onClick={() =>
            onChange([...groups, { title: 'Nieuwe kolom', items: [] }])
          }
        >
          Kolom toevoegen
        </Button>
      </Group>
    </Stack>
  );
}

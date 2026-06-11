import { Button, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import type { TreeItem } from '../api/types';
import { newPageTemplate } from './editor/snippets';

function kebab(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Volgend nummer-prefix en sidebar_position op basis van de bestaande broertjes. */
function nextInDirectory(items: TreeItem[], directory: string) {
  const prefix = directory ? `${directory}/` : '';
  const siblings = items.filter(
    (item) =>
      item.type === 'blob' &&
      item.path.startsWith(prefix) &&
      !item.path.slice(prefix.length).includes('/') &&
      /\.(md|mdx)$/.test(item.path),
  );
  let maxNum = 0;
  for (const sibling of siblings) {
    const name = sibling.path.slice(prefix.length);
    const match = name.match(/^(\d+)-/);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return { fileNum: maxNum + 1, sidebarPosition: maxNum + 1 };
}

export function NewPageModal({
  opened,
  onClose,
  site,
  tree,
  ref,
}: {
  opened: boolean;
  onClose: () => void;
  site: string;
  tree: TreeItem[];
  ref: string;
}) {
  const navigate = useNavigate();
  const [directory, setDirectory] = useState<string | null>('');
  const [title, setTitle] = useState('');

  const directories = useMemo(
    () => [
      { value: '', label: '(hoofdmap)' },
      ...tree
        .filter((item) => item.type === 'tree')
        .map((item) => ({ value: item.path, label: item.path })),
    ],
    [tree],
  );

  const { fileNum, sidebarPosition } = useMemo(
    () => nextInDirectory(tree, directory ?? ''),
    [tree, directory],
  );

  const filename = title
    ? `${String(fileNum).padStart(2, '0')}-${kebab(title)}.mdx`
    : '';
  const fullPath = directory ? `${directory}/${filename}` : filename;

  function handleCreate() {
    if (!filename) return;
    sessionStorage.setItem(
      `nieuw:${site}:${fullPath}`,
      newPageTemplate(title, sidebarPosition),
    );
    onClose();
    navigate(
      `/sites/${site}/edit?path=${encodeURIComponent(fullPath)}&ref=${ref}&nieuw=1`,
    );
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Nieuwe pagina">
      <Stack>
        <Select label="Map" data={directories} value={directory} onChange={setDirectory} searchable />
        <TextInput
          label="Titel"
          placeholder="bijv. 3.2 Herhalen met for"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
        />
        {filename && (
          <Text size="xs" c="dimmed">
            Bestand: <code>{fullPath}</code> · sidebar_position: {sidebarPosition}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Annuleren
          </Button>
          <Button onClick={handleCreate} disabled={!filename}>
            Openen in editor
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

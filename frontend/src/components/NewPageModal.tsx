import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { TreeItem } from '../api/types';
import { newPageDetails } from '../lib/authoring/newPage';
import { newPageTemplate } from './editor/snippets';
export function NewPageModal({
  opened,
  onClose,
  site,
  tree,
  branch,
}: {
  opened: boolean;
  onClose: () => void;
  site: string;
  tree: TreeItem[];
  branch: string;
}) {
  const navigate = useNavigate();
  const [directory, setDirectory] = useState<string | null>('');
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<string | null>('blank');
  const [error, setError] = useState('');
  useEffect(() => {
    if (opened) {
      setTitle('');
      setDirectory('');
      setError('');
      setTemplate('blank');
    }
  }, [opened, site]);
  const directories = useMemo(
    () => [
      { value: '', label: 'Hoofdmap' },
      ...tree
        .filter((item) => item.type === 'tree')
        .map((item) => ({ value: item.path, label: item.path })),
    ],
    [tree],
  );
  const details = newPageDetails(title, directory ?? '', tree);
  function create() {
    if (details.error) return;
    const safeTitle = title.trim().replace(/[\\*_[\]<>`{}]/g, '\\$&');
    const exercise =
      '\n## Leerdoel\n\nBeschrijf wat de leerling leert.\n\n## Opdracht\n\nBeschrijf wat de leerling maakt.\n\n<details>\n<summary>Klik hier voor een tip</summary>\n\nSchrijf hier je tip.\n\n</details>\n';
    try {
      sessionStorage.setItem(
        `nieuw:${site}:${details.path}`,
        newPageTemplate(safeTitle, details.position) +
          (template === 'exercise' ? exercise : ''),
      );
    } catch {
      setError(
        'Je browser kan het concept niet bewaren. Maak opslagruimte vrij of sta browseropslag toe.',
      );
      return;
    }
    onClose();
    navigate(
      `/sites/${site}/edit?${new URLSearchParams({ path: details.path, ref: branch, nieuw: '1' })}`,
    );
  }
  return (
    <Modal opened={opened} onClose={onClose} title="Nieuwe lespagina">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <Stack>
          {error && <Alert color="red">{error}</Alert>}
          <TextInput
            label="Titel van de les"
            placeholder="Bijvoorbeeld: Herhalen met for"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            autoFocus
            required
            error={title && details.error ? details.error : undefined}
          />
          <Select
            label="Map in de cursus"
            data={directories}
            value={directory}
            onChange={setDirectory}
            searchable
          />
          <Select
            label="Begin met"
            value={template}
            onChange={setTemplate}
            data={[
              { value: 'blank', label: 'Lege lespagina' },
              { value: 'exercise', label: 'Opdracht met leerdoel en tip' },
            ]}
          />
          {title && !details.error && (
            <Text size="xs" c="dimmed">
              Bestand: {details.path} · plek in menu: {details.position}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Annuleren
            </Button>
            <Button type="submit" disabled={!!details.error}>
              Openen in editor
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

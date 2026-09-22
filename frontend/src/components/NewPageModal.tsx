import {
  Alert,
  Button,
  Group,
  Modal,
  Paper,
  Radio,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { scopedKey, type ContentScope, type TreeItem } from '../api/types';
import { newPageDetails } from '../lib/authoring/newPage';
import { folderOptions } from '../lib/authoring/folders';
import { newPageTemplate } from './editor/snippets';
export function NewPageModal({
  opened,
  onClose,
  site,
  tree,
  branch,
  scope = 'docs',
  initialDirectory = '',
}: {
  opened: boolean;
  onClose: () => void;
  site: string;
  tree: TreeItem[];
  branch: string;
  scope?: ContentScope;
  initialDirectory?: string;
}) {
  const navigate = useNavigate();
  const [directory, setDirectory] = useState<string | null>('');
  const [title, setTitle] = useState('');
  const [template, setTemplate] = useState<string | null>('blank');
  const [error, setError] = useState('');
  useEffect(() => {
    if (opened) {
      setTitle('');
      setDirectory(initialDirectory);
      setError('');
      setTemplate('blank');
    }
  }, [opened, site, initialDirectory]);
  const directories = useMemo(
    () =>
      folderOptions(tree, scope === 'docs' ? 'Alle lessen' : "Alle pagina's"),
    [tree, scope],
  );
  const details = newPageDetails(title, directory ?? '', tree);
  function create() {
    if (details.error) return;
    const safeTitle = title.trim().replace(/[\\*_[\]<>`{}]/g, '\\$&');
    const exercise =
      '\n## Leerdoel\n\nBeschrijf wat de leerling leert.\n\n## Opdracht\n\nBeschrijf wat de leerling maakt.\n\n<details>\n<summary>Klik hier voor een tip</summary>\n\nSchrijf hier je tip.\n\n</details>\n';
    try {
      sessionStorage.setItem(
        `nieuw:${site}:${scopedKey(scope, details.path)}`,
        (scope === 'docs'
          ? newPageTemplate(safeTitle, details.position)
          : `# ${safeTitle}\n\n`) + (template === 'exercise' ? exercise : ''),
      );
    } catch {
      setError(
        'Je browser kan het concept niet bewaren. Maak opslagruimte vrij of sta browseropslag toe.',
      );
      return;
    }
    onClose();
    navigate(
      `/sites/${site}/edit?${new URLSearchParams({ path: details.path, ref: branch, scope, nieuw: '1' })}`,
    );
  }
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={scope === 'docs' ? 'Nieuwe les' : 'Nieuwe pagina'}
      size="lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <Stack>
          {error && <Alert color="red">{error}</Alert>}
          <TextInput
            label={
              scope === 'docs' ? 'Titel van de les' : 'Titel van de pagina'
            }
            placeholder="Bijvoorbeeld: Herhalen met for"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            autoFocus
            required
            error={title && details.error ? details.error : undefined}
          />
          <Select
            label={scope === 'docs' ? 'Map in de cursus' : 'Map'}
            data={directories}
            value={directory}
            onChange={setDirectory}
            searchable
            allowDeselect={false}
          />
          <Radio.Group
            label="Begin met"
            value={template ?? 'blank'}
            onChange={setTemplate}
          >
            <Stack gap="xs" mt="xs">
              <Paper
                withBorder
                p="md"
                bg={
                  template === 'blank'
                    ? 'var(--mantine-primary-color-light)'
                    : undefined
                }
              >
                <Radio
                  value="blank"
                  label={scope === 'docs' ? 'Lege lespagina' : 'Lege pagina'}
                  description="Begin met een titel en voeg zelf tekst, afbeeldingen en blokken toe."
                />
              </Paper>
              <Paper
                withBorder
                p="md"
                bg={
                  template === 'exercise'
                    ? 'var(--mantine-primary-color-light)'
                    : undefined
                }
              >
                <Radio
                  value="exercise"
                  label="Opdracht met leerdoel en tip"
                  description="Een startpunt met een leerdoel, opdracht en uitklapbare tip."
                />
              </Paper>
            </Stack>
          </Radio.Group>
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

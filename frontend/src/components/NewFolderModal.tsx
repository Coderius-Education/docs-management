import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import type { TreeItem } from '../api/types';
import { folderOptions, newFolderDetails } from '../lib/authoring/folders';
import { SaveModal } from './SaveModal';

export function NewFolderModal({
  opened,
  onClose,
  site,
  branch,
  tree,
  initialDirectory,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  site: string;
  branch: string;
  tree: TreeItem[];
  initialDirectory: string;
  onCreated: (folder: string, branch: string) => void;
}) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [snapshot, setSnapshot] = useState<
    (ReturnType<typeof newFolderDetails> & { branch: string }) | null
  >(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (opened) {
      setName('');
      setParent(initialDirectory);
      setSnapshot(null);
      setSaved(false);
    }
    // Capture the selected folder when opening; keep the form stable while saving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);
  const details = newFolderDetails(name, parent, tree);
  if (snapshot)
    return (
      <SaveModal
        opened={opened}
        onClose={() => {
          if (saved) onClose();
          else setSnapshot(null);
        }}
        site={site}
        path={snapshot.path}
        scope="metadata"
        originalContent=""
        newContent={snapshot.content}
        sha={null}
        currentBranch={snapshot.branch}
        title="Nieuwe map opslaan"
        summary={`Maak de map ‘${name.trim()}’ aan in je concept. De map krijgt automatisch een overzichtspagina voor de lessen die je toevoegt.`}
        continueLabel="Verder naar map"
        onSaved={(result) => {
          setSaved(true);
          onCreated(snapshot.folder, result.branch);
        }}
      />
    );
  return (
    <Modal opened={opened} onClose={onClose} title="Nieuwe map" size="md">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!details.error) setSnapshot({ ...details, branch });
        }}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Groepeer lessen in een hoofdstuk of onderwerp. Deze map verschijnt
            als categorie in het cursusmenu.
          </Text>
          <TextInput
            label="Naam van de map"
            placeholder="Bijvoorbeeld: Werken met lijsten"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
            autoFocus
            error={name && details.error ? details.error : undefined}
          />
          <Select
            label="Bovenliggende map"
            data={folderOptions(tree)}
            value={parent}
            onChange={(value) => setParent(value ?? '')}
            searchable
            allowDeselect={false}
          />
          {name && !details.error && (
            <div>
              <Text size="xs" c="dimmed">
                Wordt opgeslagen als
              </Text>
              <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>
                {details.path}
              </Text>
            </div>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Annuleren
            </Button>
            <Button type="submit" disabled={!!details.error}>
              Map aanmaken
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

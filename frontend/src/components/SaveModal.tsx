import {
  Alert,
  Button,
  Code,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createTwoFilesPatch } from 'diff';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { useBranches, useCreateBranch, useCreatePr, useSavePage } from '../api/git';

export function SaveModal({
  opened,
  onClose,
  site,
  path,
  originalContent,
  newContent,
  sha,
  currentBranch,
}: {
  opened: boolean;
  onClose: () => void;
  site: string;
  path: string;
  originalContent: string;
  newContent: string;
  sha: string | null;
  currentBranch: string;
}) {
  const navigate = useNavigate();
  const { data: branches } = useBranches();
  const createBranch = useCreateBranch();
  const savePage = useSavePage(site);
  const createPr = useCreatePr();

  const onFeatureBranch = currentBranch !== 'main';
  const [branchMode, setBranchMode] = useState<'bestaand' | 'nieuw'>(
    onFeatureBranch ? 'bestaand' : 'nieuw',
  );
  const [branch, setBranch] = useState<string | null>(onFeatureBranch ? currentBranch : null);
  const [newBranch, setNewBranch] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedToBranch, setSavedToBranch] = useState<string | null>(null);
  const [prTitle, setPrTitle] = useState('');

  const diff = useMemo(
    () => createTwoFilesPatch(path, path, originalContent, newContent, 'voor', 'na'),
    [path, originalContent, newContent],
  );

  const targetBranch = branchMode === 'nieuw' ? newBranch.trim() : (branch ?? '');

  async function handleSave() {
    if (!targetBranch || !message.trim()) return;
    setSaving(true);
    try {
      if (branchMode === 'nieuw') {
        await createBranch.mutateAsync(targetBranch);
      }
      // sha gaat altijd mee voor een bestaand bestand: GitHub eist 'm bij een update
      // en geeft 409 als het bestand op de doelbranch intussen afwijkt.
      await savePage.mutateAsync({
        path,
        branch: targetBranch,
        content: newContent,
        message: message.trim(),
        sha,
      });
      notifications.show({ message: `Opgeslagen op ${targetBranch}`, color: 'green' });
      setSavedToBranch(targetBranch);
      setPrTitle(message.trim());
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreatePr() {
    if (!savedToBranch) return;
    try {
      const pr = await createPr.mutateAsync({ branch: savedToBranch, title: prTitle });
      notifications.show({ message: `PR #${pr.number} geopend`, color: 'green' });
      onClose();
      navigate(`/prs/${pr.number}`);
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Wijzigingen opslaan" size="xl">
      {savedToBranch === null ? (
        <Stack>
          <ScrollArea h={260}>
            <Code block style={{ fontSize: 12, whiteSpace: 'pre' }}>
              {diff}
            </Code>
          </ScrollArea>

          <Tabs
            value={branchMode}
            onChange={(v) => setBranchMode((v as 'bestaand' | 'nieuw') ?? 'bestaand')}
          >
            <Tabs.List>
              <Tabs.Tab value="bestaand">Bestaande branch</Tabs.Tab>
              <Tabs.Tab value="nieuw">Nieuwe branch</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="bestaand" pt="xs">
              <Select
                placeholder="Kies branch"
                data={(branches ?? [])
                  .filter((b) => b.name !== 'main')
                  .map((b) => ({ value: b.name, label: b.name }))}
                value={branch}
                onChange={setBranch}
                searchable
              />
            </Tabs.Panel>
            <Tabs.Panel value="nieuw" pt="xs">
              <TextInput
                placeholder="bijv. docs/python-les-3-update"
                value={newBranch}
                onChange={(e) => setNewBranch(e.currentTarget.value)}
                description="Nieuwe branch wordt aangemaakt vanaf main"
              />
            </Tabs.Panel>
          </Tabs>

          <TextInput
            label="Commit-bericht"
            placeholder="Wat heb je veranderd?"
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            required
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Annuleren
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={!targetBranch || !message}>
              Opslaan op branch
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack>
          <Alert color="green">
            Opgeslagen op <Code>{savedToBranch}</Code>. Open een pull request om de wijziging te
            laten bouwen (preview) en daarna te kunnen mergen.
          </Alert>
          <TextInput
            label="PR-titel"
            value={prTitle}
            onChange={(e) => setPrTitle(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Later
            </Button>
            <Button onClick={handleCreatePr} loading={createPr.isPending} disabled={!prTitle}>
              PR openen
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

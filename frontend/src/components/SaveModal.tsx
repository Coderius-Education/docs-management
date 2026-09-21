import {
  Alert,
  Button,
  Code,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { createTwoFilesPatch } from 'diff';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  useBranches,
  useCreateBranch,
  useCreatePr,
  useSavePage,
} from '../api/git';
import { ApiError } from '../api/client';
import { DiffView } from './DiffView';
export interface SavedPage {
  content: string;
  branch: string;
  sha: string;
}
export function SaveModal({
  opened,
  onClose,
  site,
  path,
  originalContent,
  newContent,
  sha,
  currentBranch,
  onSaved,
}: {
  opened: boolean;
  onClose: () => void;
  site: string;
  path: string;
  originalContent: string;
  newContent: string;
  sha: string | null;
  currentBranch: string;
  onSaved: (result: SavedPage) => void;
}) {
  const navigate = useNavigate();
  const { data: branches } = useBranches();
  const createBranch = useCreateBranch();
  const savePage = useSavePage(site);
  const createPr = useCreatePr();
  const [selection, setSelection] = useState<string | null>(
    currentBranch === 'main' ? '__new__' : currentBranch,
  );
  const [newBranch, setNewBranch] = useState(
    `docs/${site}-${Date.now().toString(36)}`,
  );
  const [message, setMessage] = useState(`Lesmateriaal bijwerken: ${path}`);
  const [saving, setSaving] = useState(false);
  const [savedToBranch, setSavedToBranch] = useState<string | null>(null);
  const [error, setError] = useState('');
  const created = useRef(new Set<string>());
  const diff = useMemo(
    () =>
      createTwoFilesPatch(
        path,
        path,
        originalContent,
        newContent,
        'voor',
        'na',
      ),
    [path, originalContent, newContent],
  );
  const target = selection === '__new__' ? newBranch.trim() : (selection ?? '');
  async function save() {
    if (!target || !message.trim() || saving) return;
    const snapshot = newContent;
    setSaving(true);
    setError('');
    try {
      if (selection === '__new__' && !created.current.has(target)) {
        await createBranch.mutateAsync({
          name: target,
          from_branch: currentBranch,
        });
        created.current.add(target);
      }
      const result = await savePage.mutateAsync({
        path,
        branch: target,
        content: snapshot,
        message: message.trim(),
        sha,
      });
      onSaved({ content: snapshot, branch: target, sha: result.content_sha });
      setSavedToBranch(target);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'Deze pagina is op de server gewijzigd. Je eigen tekst blijft bewaard. Vergelijk de nieuwste versie voordat je opnieuw opslaat.'
          : String(err),
      );
    } finally {
      setSaving(false);
    }
  }
  async function review() {
    if (!savedToBranch) return;
    try {
      const pr = await createPr.mutateAsync({
        branch: savedToBranch,
        title: message.trim(),
      });
      onClose();
      navigate(`/prs/${pr.number}`);
    } catch (err) {
      setError(String(err));
    }
  }
  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!saving && !createPr.isPending) onClose();
      }}
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      title="Lesmateriaal opslaan"
      size="xl"
    >
      <Stack>
        {error && (
          <Alert color="red" title="Opslaan niet afgerond">
            {error}
          </Alert>
        )}
        {savedToBranch ? (
          <>
            <Alert color="green">
              Je concept is opgeslagen op <Code>{savedToBranch}</Code>. Het is
              nog niet gepubliceerd.
            </Alert>
            <Text size="sm">
              Vraag een controle aan om het cursusvoorbeeld te laten bouwen en
              daarna te publiceren.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Verder bewerken
              </Button>
              <Button onClick={review} loading={createPr.isPending}>
                Controle aanvragen
              </Button>
            </Group>
          </>
        ) : (
          <>
            <Text size="sm">
              Sla eerst een concept op. Publiceren gebeurt later via een pull
              request.
            </Text>
            <DiffView patch={diff} maxHeight={220} />
            <Select
              label="Conceptversie (branch)"
              value={selection}
              onChange={setSelection}
              disabled={saving}
              data={[
                { value: '__new__', label: 'Nieuw concept maken' },
                ...Array.from(
                  new Set([
                    currentBranch,
                    ...(branches ?? []).map((b) => b.name),
                  ]),
                )
                  .filter((b) => b !== 'main')
                  .map((b) => ({ value: b, label: b })),
              ]}
            />
            {selection === '__new__' && (
              <TextInput
                label="Naam conceptversie"
                description={`Gebaseerd op ${currentBranch}`}
                value={newBranch}
                onChange={(e) => setNewBranch(e.currentTarget.value)}
                disabled={saving}
              />
            )}
            <TextInput
              label="Wat heb je veranderd?"
              value={message}
              onChange={(e) => setMessage(e.currentTarget.value)}
              required
              disabled={saving}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose} disabled={saving}>
                Annuleren
              </Button>
              <Button
                onClick={save}
                loading={saving}
                disabled={!target || !message.trim()}
              >
                Concept opslaan
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}

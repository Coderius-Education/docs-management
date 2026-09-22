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
import { useCreateBranch, useCreatePr, useSavePage } from '../api/git';
import { ApiError } from '../api/client';
import type { ContentScope } from '../api/types';
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
  scope = 'docs',
  originalContent,
  newContent,
  sha,
  currentBranch,
  onSaved,
  saveResource,
  title = 'Lesmateriaal opslaan',
  summary = 'Sla eerst een concept op. Publiceren gebeurt later via een pull request.',
  continueLabel = 'Verder bewerken',
}: {
  opened: boolean;
  onClose: () => void;
  site: string;
  path: string;
  scope?: ContentScope;
  originalContent: string;
  newContent: string;
  sha: string | null;
  currentBranch: string;
  onSaved: (result: SavedPage) => void;
  saveResource?: (branch: string, snapshot: string) => Promise<string>;
  title?: string;
  summary?: string;
  continueLabel?: string;
}) {
  const navigate = useNavigate();
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
      const result = saveResource
        ? { content_sha: await saveResource(target, snapshot) }
        : await savePage.mutateAsync({
            path,
            scope,
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
      title={title}
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
                {continueLabel}
              </Button>
              <Button onClick={review} loading={createPr.isPending}>
                Controle aanvragen
              </Button>
            </Group>
          </>
        ) : (
          <>
            <Text size="sm">{summary}</Text>
            <DiffView patch={diff} maxHeight={220} />
            <Select
              label="Conceptversie (branch)"
              description="Bewaar in dit concept of maak er een kopie van, inclusief afbeeldingen."
              value={selection}
              onChange={setSelection}
              disabled={saving}
              data={[
                { value: '__new__', label: 'Nieuw concept maken' },
                ...[currentBranch]
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

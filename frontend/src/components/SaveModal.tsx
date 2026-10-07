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
import { createTwoFilesPatch } from 'diff';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  type Concept,
  type ConflictChoice,
  type SaveConflict,
  useConcepts,
  useCreateConcept,
  useSavePage,
} from '../api/git';
import { ApiError } from '../api/client';
import type { ContentScope } from '../api/types';
import { applyChoices } from '../lib/concepts';
import { allChosen, ConflictResolver } from './ConflictResolver';
import { DiffView } from './DiffView';

export interface SavedPage {
  content: string;
  branch: string;
  sha: string;
  /** The server merged in someone else's save: `content` replaces the editor text. */
  merged?: boolean;
}

const NEW = '__nieuw__';

/**
 * Saves into a concept. A concept is created on first save with the title the
 * teacher typed; publishing happens later from the concept page.
 */
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
  files,
  defaultMessage,
  title = 'Lesmateriaal opslaan',
  summary = 'Je wijziging komt in een concept. Publiceren doe je later, na de controle.',
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
  /** Internal ref the editor loaded from ("main" for the published version). */
  currentBranch: string;
  onSaved: (result: SavedPage) => void;
  saveResource?: (
    branch: string,
    snapshot: string,
    message: string,
  ) => Promise<string>;
  /** One diff per file, for resources that span several files. */
  files?: { path: string; before: string; after: string }[];
  defaultMessage?: string;
  title?: string;
  summary?: string;
  continueLabel?: string;
}) {
  const navigate = useNavigate();
  const { data: concepts } = useConcepts('open', false);
  const createConcept = useCreateConcept();
  const savePage = useSavePage(site);
  const [selection, setSelection] = useState<string | null>(
    currentBranch === 'main' ? NEW : currentBranch,
  );
  const [conceptTitle, setConceptTitle] = useState('');
  const [message, setMessage] = useState(
    defaultMessage ?? `Lesmateriaal bijwerken: ${path}`,
  );
  const [saving, setSaving] = useState(false);
  const [savedTo, setSavedTo] = useState<Concept | null>(null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<
    (SaveConflict & { branch: string; mine: string }) | null
  >(null);
  const [choices, setChoices] = useState<Record<string, ConflictChoice>>({});
  // A concept created in this dialog is reused when saving again after an error.
  const created = useRef<Concept | null>(null);

  const diff = useMemo(
    () =>
      (files ?? [{ path, before: originalContent, after: newContent }])
        .filter((file) => file.before !== file.after)
        .map((file) =>
          createTwoFilesPatch(
            file.path,
            file.path,
            file.before,
            file.after,
            'voor',
            'na',
          ),
        )
        .join('\n'),
    [files, path, originalContent, newContent],
  );

  const options = useMemo(() => {
    const own = (concepts ?? []).filter(
      (c) => c.site === site || c.branch === currentBranch,
    );
    const list = own.map((c) => ({ value: c.branch, label: c.title }));
    if (
      currentBranch !== 'main' &&
      !list.some((option) => option.value === currentBranch)
    )
      list.unshift({ value: currentBranch, label: 'Huidig concept' });
    return [{ value: NEW, label: 'Nieuw concept' }, ...list];
  }, [concepts, site, currentBranch]);

  const isNew = selection === NEW;
  const ready =
    !!selection && !!message.trim() && (!isNew || !!conceptTitle.trim());

  function conceptFor(branch: string): Concept | null {
    return (
      (created.current?.branch === branch ? created.current : null) ??
      concepts?.find((c) => c.branch === branch) ??
      null
    );
  }

  async function targetBranch(): Promise<string> {
    if (!isNew) return selection ?? '';
    if (!created.current)
      created.current = await createConcept.mutateAsync({
        site,
        title: conceptTitle.trim(),
      });
    return created.current.branch;
  }

  async function write(
    branch: string,
    snapshot: string,
    pageSha: string | null,
    baseText: string | null,
  ) {
    if (saveResource)
      return {
        content: snapshot,
        sha: await saveResource(branch, snapshot, message.trim()),
        merged: false,
      };
    const result = await savePage.mutateAsync({
      path,
      scope,
      branch,
      content: snapshot,
      message: message.trim(),
      sha: pageSha,
      base_text: baseText,
    });
    return {
      content: result.merged && result.content !== undefined ? result.content : snapshot,
      sha: result.content_sha,
      merged: !!result.merged,
    };
  }

  function finish(branch: string, saved: { content: string; sha: string; merged: boolean }) {
    onSaved({ branch, ...saved });
    setSavedTo(
      conceptFor(branch) ?? {
        number: 0,
        title: '',
        branch,
        site,
        author_login: '',
        state: 'open',
        head_sha: '',
        html_url: '',
        updated_at: '',
      },
    );
  }

  async function save() {
    if (!ready || saving) return;
    const snapshot = newContent;
    setSaving(true);
    setError('');
    let branch = '';
    try {
      branch = await targetBranch();
      // Send the loaded text along, so a parallel save can be merged for us.
      finish(branch, await write(branch, snapshot, sha, sha ? originalContent : null));
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? (err.detail as { conflict?: SaveConflict } | undefined)
          : undefined;
      if (err instanceof ApiError && err.status === 409 && detail?.conflict) {
        setConflict({ ...detail.conflict, branch, mine: snapshot });
        setChoices({});
      } else {
        setError(
          err instanceof ApiError && err.status === 409
            ? 'Deze pagina is op de server gewijzigd. Je eigen tekst blijft bewaard. Vergelijk de nieuwste versie voordat je opnieuw opslaat.'
            : String(err),
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveResolved() {
    if (!conflict) return;
    const resolved = applyChoices(conflict.segments, choices);
    if (resolved === undefined) return;
    setSaving(true);
    setError('');
    try {
      const saved = await write(
        conflict.branch,
        resolved,
        conflict.current_sha,
        conflict.current_content,
      );
      setConflict(null);
      finish(conflict.branch, { ...saved, merged: true });
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || createConcept.isPending;
  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!busy) onClose();
      }}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      title={title}
      size="xl"
    >
      <Stack>
        {error && (
          <Alert color="red" title="Opslaan niet afgerond">
            {error}
          </Alert>
        )}
        {savedTo ? (
          <>
            <Alert color="green">
              {savedTo.title
                ? `Opgeslagen in concept '${savedTo.title}'.`
                : 'Opgeslagen in het concept.'}{' '}
              Nog niet gepubliceerd; het voorbeeld wordt gebouwd.
            </Alert>
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                {continueLabel}
              </Button>
              {savedTo.number > 0 && (
                <Button
                  onClick={() => {
                    onClose();
                    navigate(`/concepten/${savedTo.number}`);
                  }}
                >
                  Concept bekijken
                </Button>
              )}
            </Group>
          </>
        ) : conflict ? (
          <>
            <Alert color="orange" title="Iemand anders heeft deze pagina ook gewijzigd">
              De wijzigingen die niet overlappen zijn al samengevoegd. Kies per
              blok welke tekst blijft.
            </Alert>
            <ConflictResolver
              hunks={conflict.hunks}
              choices={choices}
              onChange={setChoices}
              theirsLabel="Versie in het concept"
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose} disabled={saving}>
                Annuleren
              </Button>
              <Button
                onClick={saveResolved}
                loading={saving}
                disabled={!allChosen(conflict.hunks, choices)}
              >
                Samengevoegde versie opslaan
              </Button>
            </Group>
          </>
        ) : (
          <>
            <Text size="sm">{summary}</Text>
            <DiffView patch={diff} maxHeight={220} />
            <Select
              label="Concept"
              description="Kies een bestaand concept of begin een nieuw concept."
              value={selection}
              onChange={setSelection}
              disabled={busy}
              allowDeselect={false}
              data={options}
            />
            {isNew && (
              <TextInput
                label="Waar gaat dit over?"
                description="De titel van het concept, bv. 'Uitleg over lussen verbeterd'."
                value={conceptTitle}
                onChange={(e) => setConceptTitle(e.currentTarget.value)}
                required
                disabled={busy}
                data-autofocus
              />
            )}
            <TextInput
              label="Wat heb je veranderd?"
              value={message}
              onChange={(e) => setMessage(e.currentTarget.value)}
              required
              disabled={busy}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose} disabled={busy}>
                Annuleren
              </Button>
              <Button onClick={save} loading={busy} disabled={!ready}>
                Concept opslaan
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}

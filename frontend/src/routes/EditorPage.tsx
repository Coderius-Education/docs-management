import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import { useMe, usePage, useSites, usePreviews } from '../api/hooks';
import { uploadImage, useCreateBranch } from '../api/git';
import { FrontmatterForm } from '../components/editor/FrontmatterForm';
import { LessonEditor } from '../components/editor/LessonEditor';
import { RawEditor } from '../components/editor/RawEditor';
import { SaveModal, type SavedPage } from '../components/SaveModal';
import { joinFrontmatter, splitFrontmatter } from '../lib/frontmatter';
import { MdxPreview } from '../lib/mdx-preview/MdxPreview';
import {
  readRecovery,
  recoveryKey,
  writeRecovery,
  clearRecovery,
} from '../lib/authoring/session';
import { imageProblems } from '../lib/authoring/assets';
import { parseLesson } from '../lib/authoring/document';

export function EditorPage() {
  const { site = '' } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const path = params.get('path') ?? '';
  const branch = params.get('ref') ?? 'main';
  const isNew = params.get('nieuw') === '1';
  const {
    data: page,
    isLoading,
    error,
    refetch,
  } = usePage(site, isNew || !path ? null : path, branch);
  const { data: me } = useMe();
  if (!path)
    return <Alert color="orange">Kies eerst een pagina om te bewerken.</Alert>;
  if (!isNew && isLoading) return <Loader aria-label="Pagina laden" />;
  if (!isNew && (!page || error))
    return (
      <Alert color="red" title="Pagina niet geladen">
        <Text>{String(error ?? 'Pagina niet gevonden.')}</Text>
        <Button onClick={() => void refetch()}>Opnieuw proberen</Button>
      </Alert>
    );
  let template = '';
  if (isNew) {
    try {
      template = sessionStorage.getItem(`nieuw:${site}:${path}`) ?? '';
    } catch {
      return (
        <Alert color="orange">
          Het nieuwe concept kon niet worden geladen. Open de pagina opnieuw
          vanuit Nieuwe pagina.
        </Alert>
      );
    }
  }
  const identity =
    location.state?.editorSession ??
    JSON.stringify([site, path, branch, isNew]);
  return (
    <EditorSession
      key={identity}
      identity={identity}
      user={me?.login ?? 'unknown'}
      site={site}
      path={path}
      initialBranch={branch}
      initialContent={isNew ? template : page!.content}
      initialSha={isNew ? null : page!.sha}
      isNew={isNew}
    />
  );
}
function EditorSession({
  identity,
  user,
  site,
  path,
  initialBranch,
  initialContent,
  initialSha,
  isNew,
}: {
  identity: string;
  user: string;
  site: string;
  path: string;
  initialBranch: string;
  initialContent: string;
  initialSha: string | null;
  isNew: boolean;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: sites } = useSites();
  const { data: previews } = usePreviews();
  const [content, setContent] = useState(initialContent);
  const current = useRef(content);
  current.current = content;
  const [baseline, setBaseline] = useState({
    content: isNew ? '' : initialContent,
    sha: initialSha,
    branch: initialBranch,
  });
  const [saveOpen, setSaveOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageBranch = useRef<string | null>(null);
  const createBranch = useCreateBranch();
  const [mode, setMode] = useState('visual');
  const [storageError, setStorageError] = useState('');
  const key = recoveryKey(user, site, baseline.branch, path);
  const [recovery, setRecovery] = useState(() => {
    try {
      const saved = readRecovery(localStorage, key);
      return saved?.content !== initialContent ? saved : null;
    } catch {
      return null;
    }
  });
  const split = useMemo(() => splitFrontmatter(content), [content]);
  const parseError = useMemo(
    () => split.error ?? parseLesson(split.body, site).error,
    [split.body, split.error, site],
  );
  const dirty = content !== baseline.content;
  const imagesInvalid = useMemo(
    () => imageProblems(split.body).length > 0,
    [split.body],
  );
  const adoptedBranch = useRef<string | null>(null);
  const blocker = useBlocker(({ nextLocation }) => {
    const params = new URLSearchParams(nextLocation.search);
    return (
      (dirty || uploading) &&
      !(
        nextLocation.state?.editorSession === identity &&
        params.get('ref') === adoptedBranch.current &&
        params.get('path') === path
      )
    );
  });
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (dirty || uploading) {
        event.preventDefault();
        event.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, uploading]);
  useEffect(() => {
    if (recovery) return;
    try {
      if (dirty) writeRecovery(localStorage, key, content, baseline.sha);
      else clearRecovery(localStorage, key, content);
      setStorageError('');
    } catch {
      setStorageError(
        'Automatisch herstel opslaan lukt niet in deze browser. Bewaar je wijzigingen met Opslaan.',
      );
    }
  }, [key, content, dirty, baseline.sha, recovery]);
  async function upload(file: File) {
    setUploading(true);
    try {
      let branch = baseline.branch;
      if (branch === 'main') {
        if (!imageBranch.current) {
          const created = await createBranch.mutateAsync({
            name: `docs/${site}-${crypto.randomUUID()}`,
            from_branch: 'main',
          });
          imageBranch.current = created.name;
        }
        branch = imageBranch.current;
      }
      const result = await uploadImage(site, branch, path, file);
      if (branch !== baseline.branch) {
        try {
          writeRecovery(
            localStorage,
            recoveryKey(user, site, branch, path),
            current.current,
            baseline.sha,
          );
          clearRecovery(localStorage, key, current.current);
        } catch {
          setStorageError(
            'De afbeelding is opgeslagen, maar de lokale herstelkopie kon niet worden bijgewerkt.',
          );
        }
        setBaseline((previous) => ({ ...previous, branch }));
        qc.setQueryData(['page', site, path, branch], {
          content: baseline.content,
          sha: baseline.sha,
          path,
          ref: branch,
        });
        adoptedBranch.current = branch;
        const params = new URLSearchParams({ path, ref: branch });
        if (baseline.sha === null) params.set('nieuw', '1');
        navigate(
          { pathname: `/sites/${site}/edit`, search: `?${params}` },
          { replace: true, state: { editorSession: identity } },
        );
      }
      return result.url;
    } finally {
      setUploading(false);
    }
  }
  function saved(result: SavedPage) {
    const newKey = recoveryKey(user, site, result.branch, path);
    try {
      if (current.current !== result.content)
        writeRecovery(localStorage, newKey, current.current, result.sha);
      else clearRecovery(localStorage, newKey, result.content);
      if (newKey !== key) {
        clearRecovery(localStorage, key, current.current);
        clearRecovery(localStorage, key, result.content);
      }
      sessionStorage.removeItem(`nieuw:${site}:${path}`);
    } catch {
      setStorageError(
        'Het concept is opgeslagen, maar de lokale herstelkopie kon niet worden bijgewerkt.',
      );
    }
    setBaseline(result);
    qc.setQueryData(['page', site, path, result.branch], {
      content: result.content,
      sha: result.sha,
      path,
      ref: result.branch,
    });
    adoptedBranch.current = result.branch;
    navigate(
      {
        pathname: `/sites/${site}/edit`,
        search: `?${new URLSearchParams({ path, ref: result.branch })}`,
      },
      { replace: true, state: { editorSession: identity } },
    );
  }
  const siteInfo = sites?.find((s) => s.slug === site);
  const previewOrigin = previews?.find(
    (p) => p.site === site && p.branch === baseline.branch,
  )?.url;
  const preview = split.error ? (
    <Alert color="orange">{split.error}</Alert>
  ) : (
    <MdxPreview
      body={split.body}
      site={site}
      domain={siteInfo?.domain}
      path={path}
      branch={baseline.branch}
      previewOrigin={previewOrigin}
      title={
        typeof split.frontmatter.title === 'string'
          ? split.frontmatter.title
          : undefined
      }
    />
  );
  return (
    <Stack gap="md" className="editor-page">
      <Group justify="space-between" className="editor-toolbar">
        <div>
          <Title order={3}>Lesmateriaal bewerken</Title>
          <Text size="xs" c="dimmed" className="editor-path">
            {siteInfo?.display_name ?? site} / {path}
          </Text>
        </div>
        <Group gap="xs">
          {previewOrigin && (
            <Button
              size="xs"
              variant="subtle"
              component="a"
              href={previewOrigin}
              target="_blank"
              rel="noopener noreferrer"
            >
              Cursusvoorbeeld
            </Button>
          )}
          <Badge variant="light">{baseline.branch}</Badge>
          <Text size="sm" role="status">
            {dirty ? 'Niet opgeslagen' : 'Opgeslagen'}
          </Text>
          <Button
            disabled={!dirty || !!recovery || imagesInvalid || uploading}
            onClick={() => setSaveOpen(true)}
          >
            Opslaan…
          </Button>
        </Group>
      </Group>
      {imagesInvalid && (
        <Alert color="orange">
          Een afbeelding gebruikt een tijdelijke of ongeldige URL. Vervang deze
          via Broncode door een bestaande cursusafbeelding of HTTPS-URL voordat
          je opslaat.
        </Alert>
      )}
      {storageError && <Alert color="orange">{storageError}</Alert>}
      {recovery && (
        <Alert color="blue" title="Er is een herstelkopie beschikbaar">
          <Text size="sm">
            {recovery.baseSha !== initialSha
              ? 'De opgeslagen pagina is intussen gewijzigd. Controleer je herstelkopie voor je opslaat.'
              : 'Wil je verdergaan met je niet-opgeslagen wijzigingen?'}
          </Text>
          <Group mt="xs">
            <Button
              size="xs"
              onClick={() => {
                setContent(recovery.content);
                setRecovery(null);
              }}
            >
              Concept herstellen
            </Button>
            <Button
              size="xs"
              variant="default"
              onClick={() => {
                try {
                  clearRecovery(localStorage, key, recovery.content);
                } catch {
                  setStorageError('Herstelkopie kon niet worden verwijderd.');
                }
                setRecovery(null);
              }}
            >
              Opgeslagen versie gebruiken
            </Button>
          </Group>
        </Alert>
      )}
      {!split.error && (
        <Paper withBorder p="sm">
          <FrontmatterForm
            value={split.frontmatter}
            onChange={(fm) =>
              setContent(joinFrontmatter(split, fm, split.body))
            }
          />
        </Paper>
      )}
      <SegmentedControl
        disabled={uploading}
        aria-label="Editorweergave"
        value={mode}
        onChange={setMode}
        data={[
          { value: 'visual', label: 'Bewerken' },
          { value: 'preview', label: 'Voorbeeld' },
          { value: 'raw', label: 'Broncode' },
        ]}
      />
      {!recovery && (
        <div className={mode === 'preview' ? '' : 'editor-workspace'}>
          <Paper withBorder className="editor-pane">
            {mode === 'preview' ? (
              preview
            ) : mode === 'raw' ? (
              <RawEditor value={content} onChange={setContent} />
            ) : parseError ? (
              <Alert
                color="orange"
                title="Open de broncode om deze pagina te corrigeren"
              >
                <Text size="sm">{parseError}</Text>
                <Button size="xs" mt="xs" onClick={() => setMode('raw')}>
                  Broncode openen
                </Button>
              </Alert>
            ) : (
              <LessonEditor
                onUploadImage={upload}
                assetContext={{
                  site,
                  domain: siteInfo?.domain,
                  path,
                  branch: baseline.branch,
                  previewOrigin,
                }}
                site={site}
                value={split.body}
                onChange={(body) =>
                  setContent(joinFrontmatter(split, split.frontmatter, body))
                }
              />
            )}
          </Paper>
          {mode !== 'preview' && (
            <Paper withBorder className="editor-pane editor-preview-secondary">
              {preview}
            </Paper>
          )}
        </div>
      )}
      {saveOpen && (
        <SaveModal
          opened
          onClose={() => setSaveOpen(false)}
          site={site}
          path={path}
          originalContent={baseline.content}
          newContent={content}
          sha={baseline.sha}
          currentBranch={baseline.branch}
          onSaved={saved}
        />
      )}
      <Modal
        opened={blocker.state === 'blocked'}
        onClose={() => blocker.state === 'blocked' && blocker.reset()}
        title="Niet-opgeslagen wijzigingen"
      >
        <Stack>
          <Text>
            Je wijzigingen zijn nog niet op de server opgeslagen.
            {!storageError &&
              ' Een herstelkopie blijft in deze browser beschikbaar.'}
          </Text>
          <Group>
            <Button
              variant="default"
              onClick={() => blocker.state === 'blocked' && blocker.reset()}
            >
              Verder bewerken
            </Button>
            <Button
              color="orange"
              disabled={uploading}
              onClick={() => blocker.state === 'blocked' && blocker.proceed()}
            >
              Pagina verlaten
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

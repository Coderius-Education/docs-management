import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import { api } from '../api/client';
import { useMe, usePreviews } from '../api/hooks';
import { SaveModal } from '../components/SaveModal';
import { ThemeForm } from '../components/editor/ThemeForm';
import { ThemeWorkspace } from '../components/editor/ThemeWorkspace';
import { RawEditor } from '../components/editor/RawEditor';
import {
  ResourceRecovery,
  useResourceDraft,
} from '../components/editor/ResourceRecovery';
import { parseSettings, type SiteSettings } from '../lib/authoring/settings';
interface SettingsResult {
  settings: SiteSettings;
  head_sha: string;
  effective?: {
    commit: string;
    settings: Record<string, unknown>;
    unresolved: string[];
  };
}
export function SettingsPage() {
  const location = useLocation();
  const { site = '' } = useParams();
  const [params] = useSearchParams();
  const branch = params.get('ref') ?? 'main';
  const { data: me } = useMe();
  const result = useQuery({
    queryKey: ['settings', site, branch],
    queryFn: () =>
      api<SettingsResult>(`/api/sites/${site}/settings`, {
        params: { ref: branch },
      }),
    enabled: site !== 'home',
  });
  if (site === 'home')
    return (
      <Alert>
        Deze instellingen zijn alleen beschikbaar voor Docusaurus-cursussen.
      </Alert>
    );
  if (result.isLoading) return <Loader aria-label="Vormgeving laden" />;
  if (!result.data)
    return (
      <Alert color="red">
        Instellingen laden mislukt: {String(result.error)}
      </Alert>
    );
  return (
    <SettingsSession
      identity={location.state?.settingsSession ?? `${site}:${branch}`}
      key={location.state?.settingsSession ?? `${site}:${branch}`}
      site={site}
      branch={branch}
      initial={result.data}
      user={me?.login ?? 'unknown'}
    />
  );
}
function SettingsSession({
  site,
  branch,
  initial,
  user,
  identity,
}: {
  site: string;
  branch: string;
  initial: SettingsResult;
  user: string;
  identity: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const draft = useResourceDraft(
    user,
    site,
    branch,
    'settings:site-settings.json',
    JSON.stringify(initial.settings, null, 2),
    initial.head_sha,
  );
  useEffect(() => {
    if (draft.base.branch !== branch && !draft.dirty) {
      qc.setQueryData(['settings', site, draft.base.branch], {
        settings: parseSettings(draft.base.content),
        head_sha: draft.base.sha,
      });
      navigate(
        `/sites/${site}/settings?${new URLSearchParams({ ref: draft.base.branch })}`,
        { replace: true, state: { settingsSession: identity } },
      );
    }
  }, [draft.base.branch, draft.dirty, branch]);
  const [mode, setMode] = useState('form'),
    [saveOpen, setSaveOpen] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({});
  const { data: previews } = usePreviews();
  const { data: capabilities } = useQuery({
    queryKey: ['capabilities', site, draft.base.branch],
    queryFn: () =>
      api<{ settings_runtime: boolean }>(`/api/sites/${site}/capabilities`, {
        params: { ref: draft.base.branch },
      }),
  });
  const parsed = useMemo(() => {
    try {
      return { settings: parseSettings(draft.content), error: '' };
    } catch (e) {
      return { settings: null, error: String(e) };
    }
  }, [draft.content]);
  const previewUrl = previews?.find(
    (p) => p.site === site && p.branch === draft.base.branch,
  )?.url;
  const inherited =
    initial.effective?.commit === draft.base.sha
      ? initial.effective.settings
      : undefined;
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Vormgeving</Title>
        <Group>
          <Badge>{draft.base.branch}</Badge>
          <Text role="status">
            {draft.dirty ? 'Niet opgeslagen' : 'Opgeslagen'}
          </Text>
          <Button
            disabled={
              !draft.dirty ||
              !!parsed.error ||
              !!draft.recovery ||
              Object.values(errors).some(Boolean)
            }
            onClick={() => setSaveOpen(true)}
          >
            Opslaan…
          </Button>
        </Group>
      </Group>
      <ResourceRecovery draft={draft} />
      {capabilities && !capabilities.settings_runtime && (
        <Alert color="orange">
          Deze branch heeft de Docusaurus-beheerintegratie nog niet. Installeer
          eerst de bijbehorende runtimewijzigingen; anders worden instellingen
          nog niet toegepast in de build.
        </Alert>
      )}
      <Text size="xs" c="dimmed">
        {inherited
          ? 'Overgenomen instellingen uit de passende cursusbuild. Eigen aanpassingen zie je direct.'
          : 'Geen passende build beschikbaar. Overgenomen waarden kunnen afwijken; controleer ze in een cursusvoorbeeld.'}
      </Text>
      {parsed.error && <Alert color="red">{parsed.error}</Alert>}
      <ThemeWorkspace
        site={site}
        branch={draft.base.branch}
        value={parsed.settings ?? parseSettings(draft.base.content)}
        savedValue={parseSettings(draft.base.content)}
        inherited={inherited}
        disabled={!!parsed.error}
        onChange={(value) => draft.setContent(JSON.stringify(value, null, 2))}
        previewUrl={previewUrl}
        advanced={
          <Stack>
            {parsed.error && <Alert color="red">{parsed.error}</Alert>}
            <SegmentedControl
              aria-label="Geavanceerde instellingenweergave"
              value={mode}
              onChange={setMode}
              data={[
                { value: 'form', label: 'Alle instellingen' },
                { value: 'raw', label: 'JSON-bron' },
              ]}
            />
            <div hidden={mode !== 'form'}>
              {parsed.settings && (
                <ThemeForm
                  value={parsed.settings}
                  onChange={(value) =>
                    draft.setContent(JSON.stringify(value, null, 2))
                  }
                  onValidationChange={setErrors}
                />
              )}
            </div>
            {mode === 'raw' && (
              <RawEditor value={draft.content} onChange={draft.setContent} />
            )}
            {inherited && (
              <details>
                <summary>Overgenomen instellingen uit de cursusbuild</summary>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    maxHeight: 300,
                    overflow: 'auto',
                  }}
                >
                  {JSON.stringify(inherited, null, 2)}
                </pre>
              </details>
            )}
          </Stack>
        }
      />
      {saveOpen && (
        <SaveModal
          opened
          onClose={() => setSaveOpen(false)}
          site={site}
          path="site-settings.json"
          originalContent={draft.base.content}
          newContent={draft.content}
          sha={draft.base.sha}
          currentBranch={draft.base.branch}
          saveResource={async (target, snapshot) => {
            const result = await api<{ head_sha: string }>(
              `/api/sites/${site}/settings`,
              {
                method: 'PUT',
                body: {
                  branch: target,
                  expected_head: draft.base.sha,
                  settings: parseSettings(snapshot),
                  message: 'Cursusvormgeving bijwerken',
                },
              },
            );
            return result.head_sha;
          }}
          onSaved={(saved) => {
            qc.setQueryData(['settings', site, saved.branch], {
              settings: parseSettings(saved.content),
              head_sha: saved.sha,
            });
            draft.setBase(saved);
          }}
        />
      )}
    </Stack>
  );
}

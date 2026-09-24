import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api } from '../api/client';
import { uploadImage, useCreateBranch } from '../api/git';
import { useMe, usePreviews, useSites } from '../api/hooks';
import { SaveModal } from '../components/SaveModal';
import { FrontmatterForm } from '../components/editor/FrontmatterForm';
import {
  HomepageEditor,
  type StudioPanel,
} from '../components/editor/HomepageEditor';
import {
  ResourceRecovery,
  useResourceDraft,
} from '../components/editor/ResourceRecovery';
import { SettingsProvider } from '../components/editor/studio/fields';
import {
  AnnouncementPanel,
  FooterPanel,
  NavbarPanel,
  StylePanel,
} from '../components/editor/studio/panels';
import { SitePanel } from '../components/editor/studio/SitePanel';
import { previewSettings } from '../lib/authoring/appearance';
import { imageProblems } from '../lib/authoring/assets';
import { displayLinks } from '../lib/authoring/navigation';
import { validateProperties } from '../lib/authoring/properties';
import {
  changeSetting,
  parseSettings,
  readSetting,
  type SiteSettings,
} from '../lib/authoring/settings';
import { settingsErrors } from '../lib/authoring/settingsValidation';
import { joinFrontmatter, splitFrontmatter } from '../lib/frontmatter';

interface Effective {
  commit: string;
  settings: Record<string, unknown>;
  stale?: boolean;
  built_at?: string | null;
}
export interface HomepageResult {
  head_sha: string;
  page: { content: string; sha: string } | null;
  settings: Record<string, unknown>;
  settings_error?: string;
  effective?: Effective;
}
export const homepageKey = (site: string, branch: string) => [
  'homepage',
  site,
  branch,
];
const PAGE_PATH = 'src/content/homepage.mdx';
const SETTINGS_PATH = 'site-settings.json';
const PANELS: StudioPanel[] = [
  'navbar',
  'footer',
  'announcement',
  'style',
  'site',
];

/** One saved snapshot of everything this editor changes. */
interface Snapshot {
  page: string;
  settings: Record<string, unknown>;
}
const serialize = (value: Snapshot) => JSON.stringify(value);
function normalized(raw: Record<string, unknown>): {
  settings: SiteSettings;
  error?: string;
} {
  try {
    return { settings: parseSettings(JSON.stringify(raw)) };
  } catch (e) {
    return {
      settings: parseSettings('{"version":1}'),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
const settingsText = (value: Record<string, unknown>) =>
  `${JSON.stringify(value, null, 2)}\n`;

export function HomepageStudio({
  site,
  branch,
  panel,
}: {
  site: string;
  branch: string;
  panel: string | null;
}) {
  const location = useLocation();
  const { data: me } = useMe();
  const result = useQuery({
    queryKey: homepageKey(site, branch),
    queryFn: () =>
      api<HomepageResult>(`/api/sites/${site}/homepage`, {
        params: { ref: branch },
      }),
    enabled: site !== 'home',
  });
  if (site === 'home')
    return (
      <Alert>
        De startpagina en vormgeving zijn alleen beschikbaar voor
        Docusaurus-cursussen.
      </Alert>
    );
  if (result.isLoading)
    return <Loader aria-label="Startpagina en vormgeving laden" />;
  if (!result.data)
    return (
      <Alert color="red" title="Startpagina niet geladen">
        <Text size="sm">{String(result.error ?? 'Onbekende fout')}</Text>
        <Button size="xs" mt="xs" onClick={() => void result.refetch()}>
          Opnieuw proberen
        </Button>
      </Alert>
    );
  const identity = location.state?.studioSession ?? `${site}:${branch}`;
  return (
    <StudioSession
      key={identity}
      identity={identity}
      site={site}
      branch={branch}
      initial={result.data}
      user={me?.login ?? 'unknown'}
      initialPanel={
        PANELS.includes(panel as StudioPanel) ? (panel as StudioPanel) : null
      }
    />
  );
}

function StudioSession({
  identity,
  site,
  branch,
  initial,
  user,
  initialPanel,
}: {
  identity: string;
  site: string;
  branch: string;
  initial: HomepageResult;
  user: string;
  initialPanel: StudioPanel | null;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: sites } = useSites();
  const { data: previews } = usePreviews();
  const createBranch = useCreateBranch();
  const draft = useResourceDraft(
    user,
    site,
    branch,
    'homepage-studio',
    serialize({
      page: initial.page?.content ?? '',
      settings: initial.settings,
    }),
    initial.head_sha,
  );
  const state = useMemo(
    () => JSON.parse(draft.content) as Snapshot,
    [draft.content],
  );
  const base = useMemo(
    () => JSON.parse(draft.base.content) as Snapshot,
    [draft.base.content],
  );
  const latest = useRef(state);
  latest.current = state;
  const [effective, setEffective] = useState(initial.effective);
  const inherited = effective?.settings;
  const current = useMemo(() => normalized(state.settings), [state.settings]);
  const saved = useMemo(() => normalized(base.settings), [base.settings]);
  const merged = useMemo(
    () => previewSettings(inherited, current.settings, saved.settings),
    [inherited, current.settings, saved.settings],
  );
  // The canvas shows the links the build adds for every course too.
  const display = useMemo(() => {
    let value = merged.settings;
    for (const [path, kind] of [
      ['themeConfig.navbar.items', 'navbar'],
      ['themeConfig.footer.links', 'footer'],
    ] as const)
      value = changeSetting(
        value,
        path,
        displayLinks(
          readSetting(value, path),
          inherited && readSetting(inherited, path),
          kind,
        ),
      );
    return value;
  }, [merged.settings, inherited]);
  const errors = useMemo(() => {
    const result = settingsErrors(current.settings);
    if (current.error) result.settings = current.error;
    else if (
      initial.settings_error &&
      serialize({ page: '', settings: state.settings }) ===
        serialize({ page: '', settings: initial.settings })
    )
      result.settings = initial.settings_error;
    return result;
  }, [current, initial, state.settings]);

  const split = useMemo(() => splitFrontmatter(state.page), [state.page]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const pageProblems = useMemo(() => {
    const problems: string[] = [];
    if (split.error) problems.push(split.error);
    if (split.frontmatter.draft === true || split.frontmatter.unlisted === true)
      problems.push(
        'Concept en niet-vermelden worden alleen voor gewone pagina’s ondersteund.',
      );
    if (split.frontmatter.slug !== undefined && split.frontmatter.slug !== '/')
      problems.push('De startpagina gebruikt altijd het adres /.');
    if (
      Object.keys(validateProperties(split.frontmatter, 'pages')).length ||
      Object.keys(formErrors).length
    )
      problems.push('Controleer de instellingen onder Site → Deze pagina.');
    if (imageProblems(split.body).length)
      problems.push(
        'Een afbeelding gebruikt een tijdelijke of ongeldige URL. Vervang deze door een cursusafbeelding of HTTPS-URL.',
      );
    return problems;
  }, [split, formErrors]);

  const setPage = (page: string) =>
    draft.setContent(serialize({ ...latest.current, page }));
  const setSettings = (settings: SiteSettings) =>
    draft.setContent(serialize({ ...latest.current, settings }));
  const [saveOpen, setSaveOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [siteSection, setSiteSection] = useState<string | null>(
    errors.settings ? 'source' : 'site',
  );

  // Follow the branch a save or upload moved to, once nothing is pending.
  useEffect(() => {
    if (draft.base.branch !== branch && !draft.dirty) {
      qc.setQueryData(homepageKey(site, draft.base.branch), {
        head_sha: draft.base.sha,
        page: { content: base.page, sha: '' },
        settings: base.settings,
        effective,
      } satisfies HomepageResult);
      navigate(
        `/sites/${site}/edit?${new URLSearchParams({ scope: 'homepage', path: 'homepage.mdx', ref: draft.base.branch })}`,
        { replace: true, state: { studioSession: identity } },
      );
    }
  }, [draft.base.branch, draft.dirty, branch]);

  async function upload(file: File) {
    setUploading(true);
    try {
      let target = draft.base.branch;
      if (target === 'main') {
        const created = await createBranch.mutateAsync({
          name: `docs/${site}-${crypto.randomUUID()}`,
          from_branch: 'main',
        });
        target = created.name;
      }
      const result = await uploadImage(
        site,
        target,
        'homepage.mdx',
        file,
        'homepage',
      );
      // The upload is its own commit; the next save builds on top of it.
      if (result.commit_sha || target !== draft.base.branch)
        draft.setBase({
          ...draft.base,
          branch: target,
          sha: result.commit_sha ?? draft.base.sha,
        });
      return result.url;
    } finally {
      setUploading(false);
    }
  }

  const siteInfo = sites?.find((s) => s.slug === site);
  const previewOrigin = previews?.find(
    (p) => p.site === site && p.branch === draft.base.branch,
  )?.url;
  const settingsChanged =
    serialize({ page: '', settings: state.settings }) !==
    serialize({ page: '', settings: base.settings });
  const pageChanged = state.page !== base.page;
  const blocked =
    !draft.dirty ||
    !!draft.recovery ||
    uploading ||
    pageProblems.length > 0 ||
    Object.keys(errors).length > 0;
  const status = effective ? (
    <Badge
      variant="light"
      color={effective.stale ? 'orange' : 'green'}
      title={
        effective.stale
          ? 'Overgenomen waarden komen uit een eerdere cursusbuild en kunnen verouderd zijn.'
          : 'Overgenomen waarden komen uit de build van deze versie.'
      }
    >
      {effective.stale
        ? `Cursusbuild${effective.built_at ? ` van ${new Date(effective.built_at).toLocaleDateString('nl-NL')}` : ''} · mogelijk verouderd`
        : 'Cursusbuild actueel'}
    </Badge>
  ) : (
    <Badge
      variant="light"
      color="gray"
      title="Er is nog geen cursusbuild. Overgenomen waarden zijn onbekend."
    >
      Geen cursusbuild
    </Badge>
  );
  const pageSettings = (
    <Stack gap="sm">
      <FrontmatterForm
        kind="pages"
        allowedKeys={['title', 'description', 'keywords', 'image']}
        onValidationChange={setFormErrors}
        rawFrontmatter={split.rawFrontmatter}
        value={split.frontmatter}
        onChange={(fm) => setPage(joinFrontmatter(split, fm, split.body))}
      />
      {[
        ['noFooter', 'Voettekst verbergen op deze pagina'],
        ['fullscreen', 'Volledige schermhoogte'],
      ].map(([key, label]) => (
        <Checkbox
          key={key}
          label={label}
          checked={split.frontmatter[key] === true}
          onChange={(e) =>
            setPage(
              joinFrontmatter(
                split,
                { ...split.frontmatter, [key]: e.currentTarget.checked },
                split.body,
              ),
            )
          }
        />
      ))}
    </Stack>
  );

  return (
    <Stack gap="md" className="editor-page">
      <Group justify="space-between" className="editor-toolbar">
        <div>
          <Title order={3}>Startpagina en vormgeving</Title>
          <Text size="xs" c="dimmed" className="editor-path">
            {siteInfo?.display_name ?? site}
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
              Cursusvoorbeeld ↗
            </Button>
          )}
          <Badge variant="light">{draft.base.branch}</Badge>
          <Text size="sm" role="status">
            {draft.dirty ? 'Niet opgeslagen' : 'Opgeslagen'}
          </Text>
          <Button disabled={blocked} onClick={() => setSaveOpen(true)}>
            Opslaan…
          </Button>
        </Group>
      </Group>
      <ResourceRecovery draft={draft} />
      {pageProblems.map((problem) => (
        <Alert color="orange" key={problem}>
          {problem}
        </Alert>
      ))}
      {errors.settings && (
        <Alert color="red" title="De vormgeving bevat een fout">
          {errors.settings} Herstel dit onder Site → Broncode.
        </Alert>
      )}
      {!initial.page && !pageChanged && (
        <Alert>
          Deze cursus heeft nog geen startpagina. Voeg een sectie toe om te
          beginnen.
        </Alert>
      )}
      {!draft.recovery && (
        <SettingsProvider
          value={{
            value: current.settings,
            merged: merged.settings,
            inherited,
            errors,
            onChange: setSettings,
          }}
        >
          <HomepageEditor
            site={site}
            value={split.body}
            onChange={(body) =>
              setPage(joinFrontmatter(split, split.frontmatter, body))
            }
            onUploadImage={upload}
            assetContext={{
              site,
              scope: 'homepage',
              domain: siteInfo?.domain,
              path: 'homepage.mdx',
              branch: draft.base.branch,
              previewOrigin,
            }}
            settings={display}
            title={String(readSetting(display, 'site.title') ?? site)}
            tagline={String(readSetting(display, 'site.tagline') ?? '')}
            initialPanel={errors.settings ? 'site' : initialPanel}
            status={status}
            renderPanel={(panel, context) =>
              panel === 'navbar' ? (
                <NavbarPanel
                  highlight={context.navItem}
                  onAnnouncement={() => context.open('announcement')}
                />
              ) : panel === 'footer' ? (
                <FooterPanel />
              ) : panel === 'announcement' ? (
                <AnnouncementPanel />
              ) : panel === 'style' ? (
                <StylePanel
                  colorMode={context.colorMode}
                  onColorMode={context.setColorMode}
                />
              ) : (
                <SitePanel
                  page={pageSettings}
                  section={siteSection}
                  onSection={setSiteSection}
                />
              )
            }
          />
        </SettingsProvider>
      )}
      {merged.needsBuild && (
        <Text size="xs" c="dimmed">
          Een opgeslagen aanpassing is teruggezet. Maak een nieuw
          cursusvoorbeeld om de overgenomen waarde te zien.
        </Text>
      )}
      {saveOpen && (
        <SaveModal
          opened
          onClose={() => setSaveOpen(false)}
          site={site}
          scope="homepage"
          path="homepage.mdx"
          title="Startpagina en vormgeving opslaan"
          defaultMessage={
            pageChanged && settingsChanged
              ? 'Startpagina en vormgeving bijwerken'
              : pageChanged
                ? 'Startpagina bijwerken'
                : 'Cursusvormgeving bijwerken'
          }
          originalContent={draft.base.content}
          newContent={draft.content}
          files={[
            { path: PAGE_PATH, before: base.page, after: state.page },
            {
              path: SETTINGS_PATH,
              before: settingsText(base.settings),
              after: settingsText(state.settings),
            },
          ]}
          sha={draft.base.sha}
          currentBranch={draft.base.branch}
          saveResource={async (target, snapshot, message) => {
            const next = JSON.parse(snapshot) as Snapshot;
            const result = await api<{ head_sha: string }>(
              `/api/sites/${site}/homepage`,
              {
                method: 'PUT',
                body: {
                  branch: target,
                  expected_head: draft.base.sha,
                  message,
                  ...(next.page !== base.page ? { content: next.page } : {}),
                  ...(serialize({ page: '', settings: next.settings }) !==
                  serialize({ page: '', settings: base.settings })
                    ? { settings: next.settings }
                    : {}),
                },
              },
            );
            return result.head_sha;
          }}
          onSaved={(result) => {
            draft.setBase(result);
            // Keep showing inherited values; they now describe an older build.
            const next = effective && { ...effective, stale: true };
            setEffective(next);
            const snapshot = JSON.parse(result.content) as Snapshot;
            // Returning to this editor must start from the saved head, not a cached older one.
            qc.setQueryData(homepageKey(site, result.branch), {
              head_sha: result.sha,
              page: { content: snapshot.page, sha: '' },
              settings: snapshot.settings,
              effective: next,
            } satisfies HomepageResult);
          }}
        />
      )}
    </Stack>
  );
}

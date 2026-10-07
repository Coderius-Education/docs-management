import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  ColorInput,
  FileButton,
  Grid,
  Group,
  Loader,
  Menu,
  MultiSelect,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowDown,
  IconArrowUp,
  IconCopy,
  IconPlus,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';

import { api } from '../api/client';
import { useConceptTitle, useCreateConcept } from '../api/git';
import { useMe, usePreviews, useSites, useSubjects } from '../api/hooks';
import type { SiteInfo } from '../api/types';
import { SaveModal } from '../components/SaveModal';
import { ResourceRecovery, useResourceDraft } from '../components/editor/ResourceRecovery';
import { type CanvasContext, VakCanvas } from '../components/editor/vakpagina/VakCanvas';
import {
  BLOK_NAMEN,
  BLOK_TYPES,
  type Blok,
  type BlokProps,
  type BlokType,
  contrast,
  dupliceerBlok,
  isHex,
  magKind,
  nieuwBlok,
  ouderVan,
  problemen,
  standaardDocument,
  type Vakpagina,
  verplaatsBlok,
  verwijderBlok,
  vindBlok,
  voegToe,
  zetMeta,
  zetProp,
  zetTekst,
  zetThema,
} from '../lib/authoring/vakpagina';

interface VakpaginaResult {
  head_sha: string;
  document: Vakpagina | null;
  document_error?: string;
}

const vakpaginaKey = (vak: string, branch: string) => ['vakpagina', vak, branch];
const tekstVan = (doc: Vakpagina | null) => (doc ? `${JSON.stringify(doc, null, 2)}\n` : '');

export function VakpaginaStudio() {
  const vak = useParams().vak ?? '';
  const [params] = useSearchParams();
  const branch = params.get('ref') ?? 'main';
  const location = useLocation();
  const { data: me } = useMe();
  const { data: subjects } = useSubjects();
  const result = useQuery({
    queryKey: vakpaginaKey(vak, branch),
    queryFn: () => api<VakpaginaResult>(`/api/subjects/${vak}/pagina`, { params: { ref: branch } }),
  });
  const vakInfo = subjects?.find((s) => s.slug === vak);

  if (subjects && !vakInfo) return <Alert color="red">Onbekend vak.</Alert>;
  if (result.isLoading || !subjects) return <Loader aria-label="Vakpagina laden" />;
  if (!result.data)
    return (
      <Alert color="red" title="Vakpagina niet geladen">
        <Text size="sm">{String(result.error ?? 'Onbekende fout')}</Text>
        <Button size="xs" mt="xs" onClick={() => void result.refetch()}>
          Opnieuw proberen
        </Button>
      </Alert>
    );
  const identity = location.state?.studioSession ?? `${vak}:${branch}`;
  return (
    <Studio
      key={identity}
      identity={identity}
      vak={vak}
      vakNaam={vakInfo?.display_name ?? vak}
      domein={vakInfo?.domain ?? ''}
      branch={branch}
      initial={result.data}
      user={me?.login ?? 'unknown'}
    />
  );
}

function Studio({
  identity,
  vak,
  vakNaam,
  domein,
  branch,
  initial,
  user,
}: {
  identity: string;
  vak: string;
  vakNaam: string;
  domein: string;
  branch: string;
  initial: VakpaginaResult;
  user: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: sites } = useSites();
  const { data: previews } = usePreviews();
  const createConcept = useCreateConcept();
  // The draft is the document as JSON text; '' means "no file: default page".
  const draft = useResourceDraft(
    user,
    'home',
    branch,
    `vakpagina-${vak}`,
    tekstVan(initial.document),
    initial.head_sha,
  );
  const doc = useMemo<Vakpagina | null>(
    () => (draft.content ? (JSON.parse(draft.content) as Vakpagina) : null),
    [draft.content],
  );
  const latest = useRef(doc);
  latest.current = doc;
  const zet = (next: Vakpagina) => draft.setContent(tekstVan(next));

  const [gekozen, setGekozen] = useState<string | null>(null);
  const [tab, setTab] = useState<string | null>('blok');
  const [modus, setModus] = useState<'licht' | 'donker'>('licht');
  const [apparaat, setApparaat] = useState<'desktop' | 'mobiel'>('desktop');
  const [saveOpen, setSaveOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const vakSites = useMemo(() => (sites ?? []).filter((s) => s.subject === vak), [sites, vak]);
  const conceptTitle = useConceptTitle(draft.base.branch);
  const preview = previews?.find((p) => p.site === 'home' && p.branch === draft.base.branch)?.url;
  // Home serves every vak; point the preview at this vak's host.
  const previewUrl = preview?.replace(/--[a-z0-9-]+\./, `--${vak}.`);

  // Follow the branch a save or upload moved to, once nothing is pending.
  useEffect(() => {
    if (draft.base.branch !== branch && !draft.dirty) {
      qc.setQueryData(vakpaginaKey(vak, draft.base.branch), {
        head_sha: draft.base.sha,
        document: draft.base.content ? JSON.parse(draft.base.content) : null,
      } satisfies VakpaginaResult);
      navigate(`/vakken/${vak}/pagina?${new URLSearchParams({ ref: draft.base.branch })}`, {
        replace: true,
        state: { studioSession: identity },
      });
    }
  }, [draft.base.branch, draft.dirty, branch]);

  /**
   * Uploads an image and applies its URL to the *current* document: the upload
   * can take seconds, and edits made meanwhile must not be overwritten.
   */
  async function upload(
    file: File,
    toepassen: (doc: Vakpagina, url: string) => Vakpagina,
  ): Promise<void> {
    setUploading(true);
    try {
      let target = draft.base.branch;
      if (target === 'main') {
        const created = await createConcept.mutateAsync({ site: 'home', title: `Vakpagina ${vakNaam}` });
        target = created.branch;
      }
      const body = new FormData();
      body.set('branch', target);
      body.set('file', file);
      const result = await api<{ url: string; commit_sha: string | null }>(
        `/api/subjects/${vak}/pagina/afbeeldingen`,
        { method: 'POST', body },
      );
      if (result.commit_sha || target !== draft.base.branch)
        draft.setBase({ ...draft.base, branch: target, sha: result.commit_sha ?? draft.base.sha });
      const huidig = latest.current;
      if (huidig) zet(toepassen(huidig, result.url));
    } catch (e) {
      notifications.show({ color: 'red', message: (e as Error).message });
    } finally {
      setUploading(false);
    }
  }

  const ctx: CanvasContext = {
    vakNaam,
    sites: vakSites,
    gekozen,
    kies: (id) => {
      setGekozen(id);
      setTab('blok');
    },
    afbeelding: (src) => {
      const eigen = `/vakpaginas/${vak}/`;
      if (src.startsWith(eigen))
        return `/api/subjects/${vak}/pagina/afbeeldingen/${encodeURIComponent(src.slice(eigen.length))}?ref=${encodeURIComponent(draft.base.branch)}`;
      if (src.startsWith('/')) return `https://${domein}${src}`;
      return src;
    },
  };

  const lijst = doc ? problemen(doc) : [];
  const blocked = !draft.dirty || !!draft.recovery || uploading || lijst.length > 0 || !doc;
  const pad = `src/lib/vakpaginas/${vak}.json`;

  return (
    <Stack gap="md" className="editor-page">
      <Group justify="space-between" className="editor-toolbar">
        <div>
          <Title order={3}>Vakpagina {vakNaam}</Title>
          <Text size="xs" c="dimmed">
            De startpagina van {domein}
          </Text>
        </div>
        <Group gap="xs">
          {previewUrl && (
            <Button size="xs" variant="subtle" component="a" href={previewUrl} target="_blank" rel="noopener noreferrer">
              Voorbeeld ↗
            </Button>
          )}
          <Badge variant="light" maw={260} title={conceptTitle}>
            {conceptTitle}
          </Badge>
          <Text size="sm" role="status">
            {draft.dirty ? 'Niet opgeslagen' : 'Opgeslagen'}
          </Text>
          <Button disabled={blocked} onClick={() => setSaveOpen(true)}>
            Opslaan…
          </Button>
        </Group>
      </Group>
      <ResourceRecovery draft={draft} />
      {initial.document_error && draft.content === tekstVan(initial.document) && (
        <Alert color="red" title="Het opgeslagen ontwerp bevat een fout">
          {initial.document_error} Pas het aan en sla opnieuw op.
        </Alert>
      )}
      {lijst.map((probleem) => (
        <Alert color="orange" key={probleem}>
          {probleem}
        </Alert>
      ))}

      {!doc ? (
        <Paper withBorder p="lg">
          <Title order={4} mb="xs">
            {vakNaam} gebruikt de standaardpagina
          </Title>
          <Text size="sm" mb="md" maw={640}>
            Bovenaan de kop en het overzicht van alle cursussen van dit vak met filters, daaronder
            Lesmateriaal en Visie. Begin vanaf die pagina om hem aan te passen: blokken toevoegen,
            kleuren en letters kiezen, cursussen uitlichten.
          </Text>
          <Button onClick={() => zet(standaardDocument(vak))}>Ontwerp de vakpagina</Button>
        </Paper>
      ) : (
        !draft.recovery && (
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, lg: 8 }}>
              <Group justify="space-between" mb="xs">
                <SegmentedControl
                  size="xs"
                  value={apparaat}
                  onChange={(v) => setApparaat(v as 'desktop' | 'mobiel')}
                  data={[
                    { value: 'desktop', label: 'Computer' },
                    { value: 'mobiel', label: 'Telefoon' },
                  ]}
                />
                <SegmentedControl
                  size="xs"
                  value={modus}
                  onChange={(v) => setModus(v as 'licht' | 'donker')}
                  data={[
                    { value: 'licht', label: 'Licht' },
                    { value: 'donker', label: 'Donker' },
                  ]}
                />
              </Group>
              <VakCanvas doc={doc} ctx={ctx} modus={modus} apparaat={apparaat} />
              <Group mt="sm">
                <BlokMenu
                  label="Blok toevoegen"
                  ouder={null}
                  voegToe={(type) => {
                    const blok = nieuwBlok(doc, type);
                    zet(voegToe(doc, blok));
                    setGekozen(blok.id);
                    setTab('blok');
                  }}
                />
              </Group>
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 4 }}>
              <Paper withBorder p="md" pos="sticky" top={72}>
                <Tabs value={tab} onChange={setTab}>
                  <Tabs.List mb="md">
                    <Tabs.Tab value="blok">Blok</Tabs.Tab>
                    <Tabs.Tab value="thema">Thema</Tabs.Tab>
                    <Tabs.Tab value="pagina">Pagina</Tabs.Tab>
                  </Tabs.List>
                  <Tabs.Panel value="blok">
                    <BlokInspector
                      doc={doc}
                      id={gekozen}
                      zet={zet}
                      kies={setGekozen}
                      sites={vakSites}
                      upload={upload}
                      uploading={uploading}
                    />
                  </Tabs.Panel>
                  <Tabs.Panel value="thema">
                    <ThemaPaneel doc={doc} zet={zet} modus={modus} setModus={setModus} upload={upload} uploading={uploading} />
                  </Tabs.Panel>
                  <Tabs.Panel value="pagina">
                    <PaginaPaneel doc={doc} zet={zet} vakNaam={vakNaam} upload={upload} uploading={uploading} />
                  </Tabs.Panel>
                </Tabs>
              </Paper>
            </Grid.Col>
          </Grid>
        )
      )}

      {saveOpen && doc && (
        <SaveModal
          opened
          onClose={() => setSaveOpen(false)}
          site="home"
          scope="homepage"
          path={pad}
          title="Vakpagina opslaan"
          summary="Je ontwerp komt in een concept. Na de controle bekijk je het voorbeeld en publiceer je het."
          defaultMessage={`Vakpagina ${vakNaam} bijwerken`}
          originalContent={draft.base.content}
          newContent={draft.content}
          files={[{ path: `sites/home/${pad}`, before: draft.base.content, after: draft.content }]}
          sha={draft.base.sha}
          currentBranch={draft.base.branch}
          saveResource={async (target, snapshot, message) => {
            const result = await api<{ head_sha: string }>(`/api/subjects/${vak}/pagina`, {
              method: 'PUT',
              body: {
                branch: target,
                expected_head: draft.base.sha,
                message,
                document: JSON.parse(snapshot),
              },
            });
            return result.head_sha;
          }}
          onSaved={(result) => {
            draft.setBase(result);
            qc.setQueryData(vakpaginaKey(vak, result.branch), {
              head_sha: result.sha,
              document: result.content ? JSON.parse(result.content) : null,
            } satisfies VakpaginaResult);
          }}
        />
      )}
    </Stack>
  );
}

function BlokMenu({
  label,
  ouder,
  voegToe: kies,
  compact = false,
}: {
  label: string;
  ouder: BlokType | null;
  voegToe: (type: BlokType) => void;
  compact?: boolean;
}) {
  return (
    <Menu>
      <Menu.Target>
        <Button
          size={compact ? 'compact-sm' : 'sm'}
          variant={compact ? 'subtle' : 'light'}
          leftSection={<IconPlus size={14} />}
        >
          {label}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {BLOK_TYPES.filter((type) => magKind(ouder, type)).map((type) => (
          <Menu.Item key={type} onClick={() => kies(type)}>
            {BLOK_NAMEN[type]}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

const BREEDTES = [
  { value: 'full', label: 'Volle breedte' },
  { value: 'wide', label: 'Breed' },
  { value: 'normal', label: 'Normaal' },
  { value: 'narrow', label: 'Smal' },
];
const RUIMTES = [
  { value: 'none', label: 'Geen' },
  { value: 'small', label: 'Klein' },
  { value: 'normal', label: 'Normaal' },
  { value: 'large', label: 'Groot' },
];
const UITLIJNINGEN = [
  { value: 'left', label: 'Links' },
  { value: 'center', label: 'Midden' },
  { value: 'right', label: 'Rechts' },
];
const ACHTERGRONDEN = [
  { value: 'transparent', label: 'Geen' },
  { value: 'muted', label: 'Grijs' },
  { value: 'primary', label: 'Hoofdkleur' },
];

function BlokInspector({
  doc,
  id,
  zet,
  kies,
  sites,
  upload,
  uploading,
}: {
  doc: Vakpagina;
  id: string | null;
  zet: (doc: Vakpagina) => void;
  kies: (id: string | null) => void;
  sites: SiteInfo[];
  upload: (file: File, toepassen: (doc: Vakpagina, url: string) => Vakpagina) => Promise<void>;
  uploading: boolean;
}) {
  const blok = id ? vindBlok(doc.blokken, id) : null;
  if (!blok)
    return (
      <Text size="sm" c="dimmed">
        Klik op een blok in het voorbeeld om het aan te passen.
      </Text>
    );
  const p = blok.props;
  const prop = <K extends keyof BlokProps>(sleutel: K, waarde: BlokProps[K] | '' | undefined) =>
    zet(zetProp(doc, blok.id, sleutel, waarde));
  const tekstveld = (label: string, sleutel: keyof BlokProps, beschrijving?: string) => (
    <TextInput
      label={label}
      description={beschrijving}
      value={(p[sleutel] as string | undefined) ?? ''}
      onChange={(e) => prop(sleutel, e.currentTarget.value)}
      maxLength={300}
    />
  );
  const ouder = ouderVan(doc.blokken, blok.id) ?? null;
  const broers = ouder ? (ouder.kinderen ?? []) : doc.blokken;
  const index = broers.findIndex((b) => b.id === blok.id);
  const siteOpties = sites.map((s) => ({ value: s.slug, label: s.display_name }));

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text fw={700}>{BLOK_NAMEN[blok.type]}</Text>
        <Group gap={4}>
          <Tooltip label="Omhoog">
            <ActionIcon variant="subtle" aria-label="Blok omhoog" disabled={index === 0} onClick={() => zet(verplaatsBlok(doc, blok.id, -1))}>
              <IconArrowUp size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Omlaag">
            <ActionIcon variant="subtle" aria-label="Blok omlaag" disabled={index === broers.length - 1} onClick={() => zet(verplaatsBlok(doc, blok.id, 1))}>
              <IconArrowDown size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Dupliceren">
            <ActionIcon variant="subtle" aria-label="Blok dupliceren" onClick={() => zet(dupliceerBlok(doc, blok.id))}>
              <IconCopy size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Verwijderen">
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label="Blok verwijderen"
              onClick={() => {
                zet(verwijderBlok(doc, blok.id));
                kies(ouder?.id ?? null);
              }}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      {ouder && (
        <Button size="compact-xs" variant="subtle" onClick={() => kies(ouder.id)} style={{ alignSelf: 'flex-start' }}>
          ← {BLOK_NAMEN[ouder.type]}
        </Button>
      )}

      {blok.type === 'Hero' && (
        <>
          {tekstveld('Kop', 'title')}
          {tekstveld('Ondertitel', 'tagline')}
          <Select
            label="Indeling"
            data={[
              { value: 'default', label: 'Groot, in de hoofdkleur' },
              { value: 'compact', label: 'Compact, in de hoofdkleur' },
              { value: 'plain', label: 'Zonder achtergrond' },
            ]}
            value={p.variant ?? 'default'}
            onChange={(v) => prop('variant', v === 'default' ? undefined : (v as BlokProps['variant']))}
            allowDeselect={false}
          />
        </>
      )}
      {blok.type === 'Section' && (
        <>
          {tekstveld('Titel', 'title')}
          {tekstveld('Ondertitel', 'subtitle')}
        </>
      )}
      {blok.type === 'Card' && (
        <>
          {tekstveld('Titel', 'title')}
          {tekstveld('Klein label', 'info', 'Boven de titel, bijvoorbeeld “Nieuw”.')}
          {tekstveld('Link', 'href', 'https://…, of een pad als /python/ of /docent.')}
        </>
      )}
      {blok.type === 'Button' && (
        <>
          <TextInput
            label="Tekst op de knop"
            value={blok.tekst ?? ''}
            onChange={(e) => zet(zetTekst(doc, blok.id, e.currentTarget.value))}
            maxLength={100}
          />
          {tekstveld('Link', 'href', 'https://…, of een pad als /python/.')}
          <Select
            label="Stijl"
            data={[
              { value: 'primary', label: 'Opvallend' },
              { value: 'secondary', label: 'Rustig' },
            ]}
            value={p.variant ?? 'primary'}
            onChange={(v) => prop('variant', v === 'primary' ? undefined : (v as BlokProps['variant']))}
            allowDeselect={false}
          />
          <Select
            label="Grootte"
            data={[
              { value: 'sm', label: 'Klein' },
              { value: 'normaal', label: 'Normaal' },
              { value: 'lg', label: 'Groot' },
            ]}
            value={p.size ?? 'normaal'}
            onChange={(v) => prop('size', v === 'normaal' ? undefined : (v as BlokProps['size']))}
            allowDeselect={false}
          />
        </>
      )}
      {blok.type === 'Picture' && (
        <>
          <FileButton
            onChange={async (file) => {
              if (!file) return;
              await upload(file, (huidig, url) => zetProp(huidig, blok.id, 'src', url));
            }}
            accept="image/png,image/jpeg,image/gif,image/webp"
          >
            {(props) => (
              <Button {...props} variant="light" leftSection={<IconUpload size={14} />} loading={uploading}>
                Afbeelding uploaden
              </Button>
            )}
          </FileButton>
          {tekstveld('Adres van de afbeelding', 'src')}
          {tekstveld('Beschrijving', 'alt', 'Voor wie de afbeelding niet ziet. Verplicht.')}
          {tekstveld('Onderschrift', 'caption')}
        </>
      )}
      {blok.type === 'Columns' && (
        <div>
          <Text size="sm" fw={500} mb={4}>
            Aantal kolommen
          </Text>
          <SegmentedControl
            data={['1', '2', '3', '4']}
            value={String(p.count ?? 3)}
            onChange={(v) => prop('count', Number(v))}
          />
        </div>
      )}
      {blok.type === 'Courses' && (
        <>
          <Switch
            label="Kop en inleiding van het vak erboven"
            checked={!!p.automatischeKop}
            onChange={(e) => prop('automatischeKop', e.currentTarget.checked || undefined)}
          />
          {!p.automatischeKop && tekstveld('Titel', 'title')}
          <Switch
            label="Filters tonen (vak, niveau, thema)"
            checked={p.filters !== false}
            onChange={(e) => prop('filters', e.currentTarget.checked)}
          />
          <MultiSelect
            label="Niveau vooraf gekozen"
            data={[
              { value: 'Beginner', label: 'Beginner' },
              { value: 'Medium', label: 'Gevorderd' },
            ]}
            value={p.niveaus ?? []}
            onChange={(v) => prop('niveaus', v)}
          />
          <MultiSelect
            label="Uitgelicht"
            description="Deze cursussen staan vooraan, in deze volgorde."
            data={siteOpties}
            value={p.uitgelicht ?? []}
            onChange={(v) => prop('uitgelicht', v)}
          />
          <MultiSelect
            label="Alleen deze cursussen"
            description="Leeg = alle cursussen."
            data={siteOpties}
            value={p.alleen ?? []}
            onChange={(v) => prop('alleen', v)}
          />
        </>
      )}

      {['Hero', 'Section', 'Card'].includes(blok.type) && (
        <Textarea
          label="Tekst"
          description="**vet**, *schuin*, [link](https://…) en lijstjes met - werken."
          autosize
          minRows={3}
          maxLength={5000}
          value={blok.tekst ?? ''}
          onChange={(e) => zet(zetTekst(doc, blok.id, e.currentTarget.value))}
        />
      )}

      {blok.type !== 'Button' && blok.type !== 'Divider' && (
        <Paper withBorder p="xs">
          <Text size="xs" fw={700} c="dimmed" mb={6}>
            OPMAAK
          </Text>
          <Stack gap={6}>
            {!ouder && (
              <>
                <Select size="xs" label="Breedte" data={BREEDTES} value={p.width ?? 'wide'} onChange={(v) => prop('width', v === 'wide' ? undefined : (v as BlokProps['width']))} allowDeselect={false} />
                <Select size="xs" label="Ruimte boven en onder" data={RUIMTES} value={p.spacing ?? 'normal'} onChange={(v) => prop('spacing', v === 'normal' ? undefined : (v as BlokProps['spacing']))} allowDeselect={false} />
              </>
            )}
            <Select size="xs" label="Uitlijning" data={UITLIJNINGEN} value={p.align ?? (blok.type === 'Hero' ? 'center' : 'left')} onChange={(v) => prop('align', v as BlokProps['align'])} allowDeselect={false} />
            {blok.type !== 'Buttons' && blok.type !== 'Hero' && (
              <Select size="xs" label="Achtergrond" data={ACHTERGRONDEN} value={p.background ?? 'transparent'} onChange={(v) => prop('background', v === 'transparent' ? undefined : (v as BlokProps['background']))} allowDeselect={false} />
            )}
          </Stack>
        </Paper>
      )}

      {blok.type in { Hero: 1, Section: 1, Columns: 1, Buttons: 1 } && (
        <Stack gap={4}>
          <Text size="xs" fw={700} c="dimmed">
            INHOUD
          </Text>
          {(blok.kinderen ?? []).map((kind: Blok) => (
            <Button key={kind.id} size="compact-sm" variant="default" justify="flex-start" onClick={() => kies(kind.id)}>
              {BLOK_NAMEN[kind.type]}
              {kind.props.title ? `: ${kind.props.title}` : kind.tekst && kind.type === 'Button' ? `: ${kind.tekst}` : ''}
            </Button>
          ))}
          <BlokMenu
            compact
            label="Toevoegen"
            ouder={blok.type}
            voegToe={(type) => {
              const nieuw = nieuwBlok(doc, type);
              zet(voegToe(doc, nieuw, blok.id));
              kies(nieuw.id);
            }}
          />
        </Stack>
      )}
    </Stack>
  );
}

function ThemaPaneel({
  doc,
  zet,
  modus,
  setModus,
  upload,
  uploading,
}: {
  doc: Vakpagina;
  zet: (doc: Vakpagina) => void;
  modus: 'licht' | 'donker';
  setModus: (modus: 'licht' | 'donker') => void;
  upload: (file: File, toepassen: (doc: Vakpagina, url: string) => Vakpagina) => Promise<void>;
  uploading: boolean;
}) {
  const thema = doc.thema ?? {};
  const kleuren = thema[modus] ?? {};
  const zetKleur = (sleutel: 'primary' | 'primaryForeground', waarde: string) =>
    zet(zetThema(doc, { ...thema, [modus]: { ...kleuren, [sleutel]: waarde } }));
  const ratio =
    isHex(kleuren.primary) && isHex(kleuren.primaryForeground)
      ? contrast(kleuren.primary!, kleuren.primaryForeground!)
      : null;
  const zetLogo = (sleutel: 'licht' | 'donker', waarde: string) =>
    zet(zetThema(doc, { ...thema, logo: { ...thema.logo, [sleutel]: waarde } }));

  return (
    <Stack gap="sm">
      <SegmentedControl
        value={modus}
        onChange={(v) => setModus(v as 'licht' | 'donker')}
        data={[
          { value: 'licht', label: 'Licht thema' },
          { value: 'donker', label: 'Donker thema' },
        ]}
      />
      <ColorInput
        label="Hoofdkleur"
        description="Leeg = het Coderius-groen."
        format="hex"
        value={kleuren.primary ?? ''}
        onChange={(v) => zetKleur('primary', v)}
        swatches={['#007e57', '#1d4ed8', '#7c3aed', '#b91c1c', '#c2410c', '#0f766e']}
      />
      <ColorInput
        label="Tekst op de hoofdkleur"
        format="hex"
        value={kleuren.primaryForeground ?? ''}
        onChange={(v) => zetKleur('primaryForeground', v)}
        swatches={['#ffffff', '#111815']}
      />
      {ratio !== null && (
        <Badge color={ratio >= 4.5 ? 'green' : 'red'} variant="light">
          Contrast {ratio.toFixed(1)}:1 {ratio >= 4.5 ? '· goed leesbaar' : '· te laag, minstens 4,5:1'}
        </Badge>
      )}
      <Select
        label="Letter van de koppen"
        data={[
          { value: 'literata', label: 'Literata (standaard)' },
          { value: 'atkinson', label: 'Atkinson Hyperlegible' },
          { value: 'mono', label: 'Atkinson Mono' },
        ]}
        value={thema.kopletter ?? 'literata'}
        onChange={(v) => zet(zetThema(doc, { ...thema, kopletter: v === 'literata' ? undefined : (v as 'atkinson' | 'mono') }))}
        allowDeselect={false}
      />
      {(['licht', 'donker'] as const).map((sleutel) => (
        <Group key={sleutel} align="flex-end" gap="xs" wrap="nowrap">
          <TextInput
            style={{ flex: 1 }}
            label={sleutel === 'licht' ? 'Logo in de kop' : 'Logo in donker thema'}
            description={sleutel === 'licht' ? 'Vervangt het Coderius-woordmerk op dit vak.' : 'Leeg = hetzelfde logo.'}
            value={thema.logo?.[sleutel] ?? ''}
            onChange={(e) => zetLogo(sleutel, e.currentTarget.value)}
          />
          <FileButton
            onChange={async (file) => {
              if (!file) return;
              await upload(file, (huidig, url) => {
                const t = huidig.thema ?? {};
                return zetThema(huidig, { ...t, logo: { ...t.logo, [sleutel]: url } });
              });
            }}
            accept="image/png,image/jpeg,image/gif,image/webp"
          >
            {(props) => (
              <ActionIcon {...props} size="lg" variant="light" loading={uploading} aria-label="Logo uploaden">
                <IconUpload size={16} />
              </ActionIcon>
            )}
          </FileButton>
        </Group>
      ))}
    </Stack>
  );
}

function PaginaPaneel({
  doc,
  zet,
  vakNaam,
  upload,
  uploading,
}: {
  doc: Vakpagina;
  zet: (doc: Vakpagina) => void;
  vakNaam: string;
  upload: (file: File, toepassen: (doc: Vakpagina, url: string) => Vakpagina) => Promise<void>;
  uploading: boolean;
}) {
  const meta = doc.meta ?? {};
  const zetVeld = (sleutel: keyof typeof meta, waarde: string) =>
    zet(zetMeta(doc, { ...meta, [sleutel]: waarde }));
  return (
    <Stack gap="sm">
      <TextInput
        label="Titel in het tabblad"
        placeholder={`${vakNaam} — Coderius`}
        value={meta.titel ?? ''}
        onChange={(e) => zetVeld('titel', e.currentTarget.value)}
        maxLength={300}
      />
      <Textarea
        label="Omschrijving voor zoekmachines"
        autosize
        minRows={2}
        value={meta.omschrijving ?? ''}
        onChange={(e) => zetVeld('omschrijving', e.currentTarget.value)}
        maxLength={300}
      />
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <TextInput
          style={{ flex: 1 }}
          label="Afbeelding bij delen"
          description="Getoond als iemand de link deelt."
          value={meta.afbeelding ?? ''}
          onChange={(e) => zetVeld('afbeelding', e.currentTarget.value)}
        />
        <FileButton
          onChange={async (file) => {
            if (!file) return;
            await upload(file, (huidig, url) => zetMeta(huidig, { ...huidig.meta, afbeelding: url }));
          }}
          accept="image/png,image/jpeg,image/gif,image/webp"
        >
          {(props) => (
            <ActionIcon {...props} size="lg" variant="light" loading={uploading} aria-label="Afbeelding uploaden">
              <IconUpload size={16} />
            </ActionIcon>
          )}
        </FileButton>
      </Group>
      <Button variant="default" color="red" onClick={() => zet(standaardDocument(doc.vak))}>
        Terug naar de standaardpagina
      </Button>
    </Stack>
  );
}

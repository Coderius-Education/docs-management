import {
  Alert,
  Button,
  Anchor,
  Breadcrumbs,
  Code,
  Grid,
  Group,
  Loader,
  Paper,
  ScrollArea,
  SegmentedControl,
  Text,
  TextInput,
  Title,
  Stack,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconFolderPlus,
  IconPencil,
  IconPlus,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { usePage, useSites, useTree } from '../api/hooks';
import { contentScope, scopedKey } from '../api/types';
import { categoryContent, friendlyName } from '../lib/authoring/folders';
import { NewFolderModal } from '../components/NewFolderModal';
import { NewMetadataModal } from '../components/NewMetadataModal';
import { NewPageModal } from '../components/NewPageModal';
import { PageTree } from '../components/PageTree';

export function SiteBrowser() {
  const { site = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [ref, setRef] = useState(searchParams.get('ref') ?? 'main');
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [actionError, setActionError] = useState('');

  const scope = contentScope(searchParams.get('scope'));
  const selectedPath = searchParams.get('path');
  useEffect(() => {
    setRef(searchParams.get('ref') ?? 'main');
  }, [searchParams]);
  const { data: sites } = useSites();
  const {
    data: tree,
    isLoading: treeLoading,
    error: treeError,
  } = useTree(site, ref, scope);
  const {
    data: metadataTree,
    isLoading: metadataLoading,
    error: metadataError,
  } = useTree(site, ref, 'metadata');
  const requestedFolder =
    searchParams.get('folder') ??
    selectedPath?.split('/').slice(0, -1).join('/') ??
    '';
  const selectedFolder = tree?.some(
    (item) => item.type === 'tree' && item.path === requestedFolder,
  )
    ? requestedFolder
    : '';
  const { data: page, isLoading: pageLoading } = usePage(
    site,
    selectedPath,
    ref,
    scope,
  );

  const siteInfo = sites?.find((s) => s.slug === site);
  const rootLabel =
    scope === 'pages'
      ? "Alle pagina's"
      : scope === 'metadata'
        ? 'Alle instellingen'
        : 'Alle lessen';
  function selectFolder(folder: string) {
    setSearchParams({ ref, scope, ...(folder ? { folder } : {}) });
  }
  function folderSettings(folder: string) {
    const existing = metadataTree?.find(
      (item) =>
        item.type === 'blob' &&
        item.path.startsWith(`${folder}/`) &&
        /^_category_\.(json|ya?ml)$/.test(item.path.slice(folder.length + 1)),
    );
    const path = existing?.path ?? `${folder}/_category_.json`;
    if (!existing) {
      try {
        sessionStorage.setItem(
          `nieuw:${site}:${scopedKey('metadata', path)}`,
          categoryContent(friendlyName(folder)),
        );
      } catch {
        setActionError(
          'Je browser kan het concept niet bewaren. Sta browseropslag toe en probeer opnieuw.',
        );
        return;
      }
    }
    navigate(
      `/sites/${site}/metadata?${new URLSearchParams({ path, ref, scope: 'metadata', ...(!existing ? { nieuw: '1' } : {}) })}`,
    );
  }

  return (
    <>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={3}>{siteInfo?.display_name ?? site}</Title>
          <Text size="sm" c="dimmed">
            {siteInfo?.domain}
          </Text>
        </div>
        <Group align="flex-end" gap="xs">
          <TextInput
            label="Conceptversie (branch)"
            value={ref}
            onChange={(e) => setRef(e.currentTarget.value)}
            w={220}
            size="xs"
          />
          {scope === 'docs' && (
            <Button
              size="xs"
              variant="light"
              leftSection={<IconFolderPlus size={14} />}
              disabled={treeLoading || !!treeError || !tree}
              onClick={() => setNewFolderOpen(true)}
            >
              Nieuwe map
            </Button>
          )}
          <Button
            size="xs"
            leftSection={<IconPlus size={14} />}
            disabled={treeLoading || !!treeError || !tree}
            onClick={() => setNewPageOpen(true)}
          >
            {scope === 'docs'
              ? 'Nieuwe les'
              : scope === 'metadata'
                ? 'Instellingen toevoegen'
                : 'Nieuwe pagina'}
          </Button>
        </Group>
      </Group>

      <NewFolderModal
        opened={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        site={site}
        branch={ref}
        tree={tree ?? []}
        initialDirectory={selectedFolder}
        onCreated={(folder, branch) => {
          setRef(branch);
          setSearchParams({ ref: branch, scope: 'docs', folder });
        }}
      />

      {scope === 'metadata' ? (
        <NewMetadataModal
          opened={newPageOpen}
          onClose={() => setNewPageOpen(false)}
          site={site}
          branch={ref}
          tree={tree ?? []}
        />
      ) : (
        <NewPageModal
          opened={newPageOpen}
          onClose={() => setNewPageOpen(false)}
          site={site}
          tree={tree ?? []}
          branch={ref}
          scope={scope}
          initialDirectory={selectedFolder}
        />
      )}

      <Group mb="md">
        <SegmentedControl
          aria-label="Inhoudstype"
          value={scope}
          onChange={(next) => setSearchParams({ ref, scope: next })}
          data={[
            { value: 'docs', label: 'Lessen' },
            { value: 'pages', label: "Pagina's" },
            { value: 'metadata', label: 'Geavanceerd' },
          ]}
        />
        {site !== 'home' && (
          <>
            <Button
              variant="light"
              onClick={() =>
                navigate(
                  `/sites/${site}/edit?${new URLSearchParams({ scope: 'homepage', path: 'homepage.mdx', ref })}`,
                )
              }
            >
              Homepage
            </Button>
            <Button
              variant="light"
              onClick={() =>
                navigate(
                  `/sites/${site}/settings?${new URLSearchParams({ ref })}`,
                )
              }
            >
              Vormgeving
            </Button>
          </>
        )}
      </Group>
      {scope === 'metadata' && (
        <Alert mb="md" color="blue">
          Mappen beheer je bij Lessen. Hier kun je de onderliggende
          categorie-instellingen en tags aanpassen.
        </Alert>
      )}
      {actionError && (
        <Alert color="red" mb="md">
          {actionError}
        </Alert>
      )}
      {treeError && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" mb="md">
          Kon de bestandsboom niet laden: {String(treeError)}
        </Alert>
      )}

      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="xs">
            <Button
              variant={selectedFolder ? 'subtle' : 'light'}
              fullWidth
              justify="flex-start"
              mb="xs"
              onClick={() => selectFolder('')}
            >
              {rootLabel}
            </Button>
            <ScrollArea h="70vh">
              {treeLoading ? (
                <Loader size="sm" m="md" />
              ) : (
                <PageTree
                  items={tree ?? []}
                  selected={selectedPath}
                  onSelect={(path) => setSearchParams({ path, ref, scope })}
                  metadata={scope === 'metadata'}
                  selectedFolder={selectedFolder}
                  onFolderSelect={selectFolder}
                  onFolderSettings={
                    scope === 'docs' &&
                    !metadataLoading &&
                    !metadataError &&
                    metadataTree
                      ? folderSettings
                      : undefined
                  }
                />
              )}
            </ScrollArea>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Paper withBorder p="md">
            <Breadcrumbs
              aria-label="Huidige map"
              mb="md"
              style={{ flexWrap: 'wrap' }}
            >
              <Anchor
                component="button"
                size="sm"
                onClick={() => selectFolder('')}
              >
                {rootLabel}
              </Anchor>
              {selectedFolder
                .split('/')
                .filter(Boolean)
                .map((part, index, parts) => (
                  <Anchor
                    component="button"
                    size="sm"
                    key={index}
                    onClick={() =>
                      selectFolder(parts.slice(0, index + 1).join('/'))
                    }
                  >
                    {friendlyName(part)}
                  </Anchor>
                ))}
            </Breadcrumbs>
            {!selectedPath && (
              <Stack gap="sm">
                <Title order={4}>
                  {selectedFolder
                    ? friendlyName(selectedFolder)
                    : scope === 'metadata'
                      ? 'Categorie-instellingen en tags'
                      : 'Bouw je cursus stap voor stap'}
                </Title>
                <Text c="dimmed">
                  {scope === 'docs'
                    ? 'Maak een map voor een hoofdstuk of onderwerp. Voeg daarna lessen toe aan de gekozen map, of open een bestaande les links.'
                    : 'Kies links een bestand om het te openen, of voeg nieuwe inhoud toe.'}
                </Text>
                {scope === 'docs' && (
                  <Text size="sm" c="dimmed">
                    Nieuwe mappen en lessen komen in{' '}
                    {selectedFolder
                      ? `‘${friendlyName(selectedFolder)}’`
                      : 'de hoofdmap'}
                    .
                  </Text>
                )}
              </Stack>
            )}
            {pageLoading && <Loader size="sm" />}
            {page && (
              <>
                <Group justify="space-between" mb="sm">
                  <div>
                    <Text fw={600}>{friendlyName(page.path)}</Text>
                    <Text size="xs" c="dimmed">
                      {page.path}
                    </Text>
                  </div>
                  <Button
                    size="xs"
                    leftSection={<IconPencil size={14} />}
                    onClick={() =>
                      navigate(
                        `/sites/${site}/${scope === 'metadata' ? 'metadata' : 'edit'}?path=${encodeURIComponent(page.path)}&ref=${encodeURIComponent(ref)}&scope=${scope}`,
                      )
                    }
                  >
                    Bewerken
                  </Button>
                </Group>
                <ScrollArea h="62vh">
                  <Code block>{page.content}</Code>
                </ScrollArea>
              </>
            )}
          </Paper>
        </Grid.Col>
      </Grid>
    </>
  );
}

import {
  Accordion,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Table,
  Tabs,
  Text,
  Timeline,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconFileDiff,
  IconPackage,
  IconPencil,
  IconRefresh,
  IconRocket,
  IconSparkles,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';

import { ApiError } from '../api/client';
import {
  type ConceptActivityEvent,
  type ConceptDetail as ConceptData,
  type ConceptFile,
  type ConflictChoice,
  type UpdateResult,
  useConcept,
  useConceptActivity,
  useConceptFiles,
  useDiscardConcept,
  usePublishConcept,
  useResolveConflicts,
  useUpdateConcept,
} from '../api/git';
import { allChosen, ConflictResolver } from '../components/ConflictResolver';
import { DiffView } from '../components/DiffView';
import {
  checkLabel,
  conceptFileStatus,
  STATUS_COLOR,
  STATUS_LABEL,
} from '../lib/concepts';

type Conflicts = Extract<UpdateResult, { status: 'conflicten' }>;

function checkBadge(status: string, conclusion: string | null) {
  if (status !== 'completed')
    return (
      <Badge color="yellow" variant="light">
        bezig
      </Badge>
    );
  if (conclusion === 'success')
    return (
      <Badge color="green" variant="light">
        geslaagd
      </Badge>
    );
  if (conclusion === 'skipped' || conclusion === 'neutral')
    return (
      <Badge color="gray" variant="light">
        niet nodig
      </Badge>
    );
  return (
    <Badge color="red" variant="light">
      mislukt
    </Badge>
  );
}

const FILE_STATUS_COLOR: Record<string, string> = {
  added: 'green',
  removed: 'red',
  modified: 'yellow',
  renamed: 'blue',
};

function fmtTime(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('nl-NL');
}

export function ConceptDetail() {
  const { number = '0' } = useParams();
  const conceptNumber = parseInt(number, 10);
  const { data: concept, isLoading } = useConcept(conceptNumber);
  const { data: files } = useConceptFiles(conceptNumber);
  const { data: activity } = useConceptActivity(conceptNumber);
  const publish = usePublishConcept(conceptNumber);
  const discard = useDiscardConcept(conceptNumber);
  const update = useUpdateConcept(conceptNumber);
  const resolve = useResolveConflicts(conceptNumber);
  const [conflicts, setConflicts] = useState<Conflicts | null>(null);
  const [choices, setChoices] = useState<
    Record<string, Record<string, ConflictChoice>>
  >({});
  const autoUpdated = useRef(false);

  function handleUpdate(result: UpdateResult) {
    if (result.status === 'conflicten') {
      setConflicts(result);
      setChoices({});
    } else {
      setConflicts(null);
      if (result.status === 'bijgewerkt')
        notifications.show({
          message: 'Het concept is bijgewerkt met de gepubliceerde versie.',
          color: 'green',
        });
    }
  }

  async function runUpdate() {
    try {
      handleUpdate(await update.mutateAsync());
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    }
  }

  // When the published version moved on, bring it into the concept right away.
  useEffect(() => {
    if (
      concept &&
      concept.state === 'open' &&
      concept.behind_by > 0 &&
      !autoUpdated.current
    ) {
      autoUpdated.current = true;
      void runUpdate();
    }
  }, [concept]);

  if (isLoading || !concept) return <Loader />;

  const additions = (files ?? []).reduce((n, f) => n + f.additions, 0);
  const deletions = (files ?? []).reduce((n, f) => n + f.deletions, 0);
  const blocked = conflicts
    ? 'Eerst conflicten oplossen.'
    : concept.publish_blocked;

  async function handlePublish() {
    try {
      await publish.mutateAsync();
      notifications.show({
        message: 'Gepubliceerd. De site wordt opnieuw gebouwd.',
        color: 'green',
      });
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    }
  }

  async function handleResolve() {
    if (!conflicts) return;
    try {
      handleUpdate(
        await resolve.mutateAsync({
          choices,
          expected_head: conflicts.branch_sha,
          expected_main: conflicts.main_sha,
        }),
      );
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? (err.detail as { conflicts?: Conflicts } | undefined)
          : undefined;
      if (detail?.conflicts) handleUpdate(detail.conflicts);
      else {
        notifications.show({ message: String(err), color: 'red' });
        void runUpdate();
      }
    }
  }

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={3}>{concept.title}</Title>
          <Group gap="xs" mt={4}>
            <Badge color={STATUS_COLOR[concept.status]} variant="light">
              {STATUS_LABEL[concept.status]}
            </Badge>
            <Text size="sm" c="dimmed">
              Concept van {concept.author_login}
            </Text>
          </Group>
        </div>
        {concept.state === 'open' && (
          <Stack gap={4} align="flex-end">
            <Group>
              <Button
                variant="default"
                leftSection={<IconX size={14} />}
                onClick={() => discard.mutate()}
                loading={discard.isPending}
              >
                Verwerpen
              </Button>
              <Button
                leftSection={<IconRocket size={14} />}
                color="green"
                onClick={handlePublish}
                loading={publish.isPending}
                disabled={!!blocked}
              >
                Publiceren
              </Button>
            </Group>
            {blocked && (
              <Text size="xs" c="dimmed" role="status">
                {blocked}
              </Text>
            )}
          </Stack>
        )}
      </Group>

      {concept.state === 'open' && (concept.behind_by > 0 || conflicts) && (
        <Card withBorder>
          <Group justify="space-between" mb={conflicts ? 'sm' : 0}>
            <div>
              <Title order={5}>Gepubliceerde versie is veranderd</Title>
              <Text size="sm" c="dimmed">
                {conflicts
                  ? 'Een paar blokken zijn in beide versies veranderd. Kies per blok wat blijft; de rest is al samengevoegd.'
                  : 'Haal de nieuwste gepubliceerde versie binnen in dit concept.'}
              </Text>
            </div>
            <Button
              variant="light"
              leftSection={<IconRefresh size={14} />}
              onClick={runUpdate}
              loading={update.isPending}
            >
              Bijwerken met gepubliceerde versie
            </Button>
          </Group>
          {conflicts && (
            <Stack>
              {conflicts.files.map((file) => (
                <ConflictResolver
                  key={file.file}
                  file={file.file}
                  hunks={file.hunks}
                  binary={file.binary}
                  wholeFile={file.whole_file}
                  choices={choices[file.file] ?? {}}
                  onChange={(next) =>
                    setChoices((all) => ({ ...all, [file.file]: next }))
                  }
                />
              ))}
              <Group justify="flex-end">
                <Button
                  onClick={handleResolve}
                  loading={resolve.isPending}
                  disabled={
                    !conflicts.files.every((file) =>
                      allChosen(file.hunks, choices[file.file] ?? {}),
                    )
                  }
                >
                  Samenvoegen
                </Button>
              </Group>
            </Stack>
          )}
        </Card>
      )}

      <Tabs defaultValue="overzicht">
        <Tabs.List>
          <Tabs.Tab value="overzicht">Overzicht</Tabs.Tab>
          <Tabs.Tab value="bestanden" leftSection={<IconFileDiff size={14} />}>
            Wijzigingen{files ? ` (${files.length})` : ''}
          </Tabs.Tab>
          <Tabs.Tab value="activiteit">Activiteit</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overzicht" pt="md">
          <Overview
            concept={concept}
            stats={{ files: files?.length ?? 0, additions, deletions }}
          />
        </Tabs.Panel>

        <Tabs.Panel value="bestanden" pt="md">
          <FilesTab files={files} />
        </Tabs.Panel>

        <Tabs.Panel value="activiteit" pt="md">
          <ActivityTab events={activity} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function Overview({
  concept,
  stats,
}: {
  concept: ConceptData;
  stats: { files: number; additions: number; deletions: number };
}) {
  return (
    <Stack>
      <Group gap="lg">
        <Text size="sm">
          <strong>{stats.files}</strong> bestanden
        </Text>
        <Text size="sm" c="green">
          +{stats.additions}
        </Text>
        <Text size="sm" c="red">
          −{stats.deletions}
        </Text>
      </Group>

      <Card withBorder>
        <Title order={5} mb="xs">
          Controle
        </Title>
        {concept.checks.length === 0 && (
          <Text c="dimmed" size="sm">
            De controle is nog niet gestart.
          </Text>
        )}
        <Table>
          <Table.Tbody>
            {concept.checks.map((check) => (
              <Table.Tr key={check.id || check.name}>
                <Table.Td>{checkLabel(check.name)}</Table.Td>
                <Table.Td>{checkBadge(check.status, check.conclusion)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <Card withBorder>
        <Title order={5} mb="xs">
          Voorbeelden
        </Title>
        {concept.previews.length > 0 ? (
          <Group gap="xs">
            {concept.previews.map((preview) => (
              <Button
                key={preview.site}
                component="a"
                href={preview.url}
                target="_blank"
                variant="light"
                size="xs"
                leftSection={<IconCheck size={12} />}
              >
                {preview.site}
              </Button>
            ))}
          </Group>
        ) : (
          <Text c="dimmed" size="sm">
            Het voorbeeld wordt nog gebouwd. Zodra de controle klaar is, staat het
            op {concept.expected_previews[0]?.url.replace('https://', '')}.
          </Text>
        )}
      </Card>
    </Stack>
  );
}

function FilesTab({ files }: { files: ConceptFile[] | undefined }) {
  if (!files) return <Loader />;
  if (files.length === 0)
    return (
      <Text c="dimmed" size="sm">
        Nog geen wijzigingen.
      </Text>
    );
  return (
    <Accordion variant="separated" multiple>
      {files.map((f) => (
        <Accordion.Item key={f.filename} value={f.filename}>
          <Accordion.Control>
            <Group gap="xs" wrap="nowrap">
              <Badge color={FILE_STATUS_COLOR[f.status] ?? 'gray'} variant="light" size="sm">
                {conceptFileStatus(f.status)}
              </Badge>
              <Text size="sm" style={{ fontFamily: 'var(--mantine-font-family-monospace)' }}>
                {f.filename}
              </Text>
              <Text size="xs" c="green">
                +{f.additions}
              </Text>
              <Text size="xs" c="red">
                −{f.deletions}
              </Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            {f.patch ? (
              <DiffView patch={f.patch} />
            ) : (
              <Text c="dimmed" size="sm">
                Geen tekstvergelijking beschikbaar (afbeelding of groot bestand).
              </Text>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

function activityVisual(e: ConceptActivityEvent): {
  color: string;
  icon: React.ReactNode;
  title: string;
} {
  switch (e.type) {
    case 'commit':
      return {
        color: 'blue',
        icon: <IconPencil size={14} />,
        title: `Opgeslagen: ${e.message ?? ''}`,
      };
    case 'build':
      return {
        color: e.status === 'ready' ? 'green' : e.status === 'failed' ? 'red' : 'gray',
        icon: <IconPackage size={14} />,
        title: `Voorbeeld ${e.site}: ${
          e.status === 'ready' ? 'klaar' : e.status === 'failed' ? 'mislukt' : 'bezig'
        }`,
      };
    case 'opened':
      return { color: 'teal', icon: <IconSparkles size={14} />, title: 'Concept gemaakt' };
    case 'merged':
      return { color: 'grape', icon: <IconRocket size={14} />, title: 'Gepubliceerd' };
    case 'closed':
      return { color: 'gray', icon: <IconX size={14} />, title: 'Verworpen' };
  }
}

function ActivityTab({ events }: { events: ConceptActivityEvent[] | undefined }) {
  if (!events) return <Loader />;
  if (events.length === 0)
    return (
      <Text c="dimmed" size="sm">
        Nog geen activiteit.
      </Text>
    );
  return (
    <Timeline active={-1} bulletSize={24} lineWidth={2}>
      {events.map((e, i) => {
        const v = activityVisual(e);
        return (
          <Timeline.Item
            // biome-ignore lint/suspicious/noArrayIndexKey: events hebben geen stabiele id
            key={i}
            color={v.color}
            bullet={v.icon}
            title={<Text size="sm">{v.title}</Text>}
          >
            <Text size="xs" c="dimmed">
              {[e.author, fmtTime(e.ts)].filter(Boolean).join(' · ')}
            </Text>
          </Timeline.Item>
        );
      })}
    </Timeline>
  );
}


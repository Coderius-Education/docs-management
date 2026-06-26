import {
  Accordion,
  Anchor,
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
  IconExternalLink,
  IconFileDiff,
  IconGitCommit,
  IconGitMerge,
  IconGitPullRequest,
  IconPackage,
  IconX,
} from '@tabler/icons-react';
import { useParams } from 'react-router';

import {
  type PrActivityEvent,
  type PrDetail as PrData,
  type PrFile,
  useClosePr,
  useMergePr,
  usePr,
  usePrActivity,
  usePrCommits,
  usePrFiles,
} from '../api/git';
import { DiffView } from '../components/DiffView';

function checkBadge(status: string, conclusion: string | null) {
  if (status !== 'completed') return <Badge color="yellow" variant="light">{status}</Badge>;
  if (conclusion === 'success') return <Badge color="green" variant="light">geslaagd</Badge>;
  return <Badge color="red" variant="light">{conclusion}</Badge>;
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

export function PrDetail() {
  const { number = '0' } = useParams();
  const prNumber = parseInt(number, 10);
  const { data: pr, isLoading } = usePr(prNumber);
  const { data: files } = usePrFiles(prNumber);
  const { data: commits } = usePrCommits(prNumber);
  const { data: activity } = usePrActivity(prNumber);
  const mergePr = useMergePr(prNumber);
  const closePr = useClosePr(prNumber);

  if (isLoading || !pr) return <Loader />;

  const checksOk =
    pr.checks.length > 0 && pr.checks.every((c) => c.conclusion === 'success');

  const additions = (files ?? []).reduce((n, f) => n + f.additions, 0);
  const deletions = (files ?? []).reduce((n, f) => n + f.deletions, 0);

  async function handleMerge() {
    try {
      await mergePr.mutateAsync();
      notifications.show({ message: 'PR gemerged — de site wordt opnieuw gebouwd', color: 'green' });
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    }
  }

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={3}>
            #{pr.number} {pr.title}{' '}
            <Anchor href={pr.html_url} target="_blank">
              <IconExternalLink size={16} />
            </Anchor>
          </Title>
          <Text size="sm" c="dimmed">
            <code>{pr.branch}</code> → main · door {pr.author_login}
          </Text>
        </div>
        <Group>
          {pr.state === 'open' && (
            <>
              <Button
                variant="default"
                leftSection={<IconX size={14} />}
                onClick={() => closePr.mutate()}
                loading={closePr.isPending}
              >
                Sluiten
              </Button>
              <Button
                leftSection={<IconGitMerge size={14} />}
                color={checksOk ? 'green' : 'yellow'}
                onClick={handleMerge}
                loading={mergePr.isPending}
              >
                {checksOk ? 'Mergen' : 'Mergen (checks niet groen)'}
              </Button>
            </>
          )}
          {pr.merged && <Badge color="grape">gemerged</Badge>}
        </Group>
      </Group>

      <Tabs defaultValue="overzicht">
        <Tabs.List>
          <Tabs.Tab value="overzicht">Overzicht</Tabs.Tab>
          <Tabs.Tab value="bestanden" leftSection={<IconFileDiff size={14} />}>
            Bestanden{files ? ` (${files.length})` : ''}
          </Tabs.Tab>
          <Tabs.Tab value="activiteit">Activiteit</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overzicht" pt="md">
          <Overview
            pr={pr}
            stats={{
              files: files?.length ?? 0,
              additions,
              deletions,
              commits: commits?.length ?? 0,
            }}
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
  pr,
  stats,
}: {
  pr: PrData;
  stats: { files: number; additions: number; deletions: number; commits: number };
}) {
  return (
    <Stack>
      <Group gap="lg">
        <Text size="sm">
          <strong>{stats.commits}</strong> commits
        </Text>
        <Text size="sm">
          <strong>{stats.files}</strong> bestanden
        </Text>
        <Text size="sm" c="green">
          +{stats.additions}
        </Text>
        <Text size="sm" c="red">
          −{stats.deletions}
        </Text>
        {pr.mergeable === false && (
          <Badge color="red" variant="light">
            merge-conflict
          </Badge>
        )}
      </Group>

      {pr.body && (
        <Card withBorder>
          <Title order={5} mb="xs">
            Omschrijving
          </Title>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {pr.body}
          </Text>
        </Card>
      )}

      <Card withBorder>
        <Title order={5} mb="xs">
          Checks
        </Title>
        {pr.checks.length === 0 && <Text c="dimmed" size="sm">Nog geen checks gestart.</Text>}
        <Table>
          <Table.Tbody>
            {pr.checks.map((check) => (
              <Table.Tr key={check.name}>
                <Table.Td>{check.name}</Table.Td>
                <Table.Td>{checkBadge(check.status, check.conclusion)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <Card withBorder>
        <Title order={5} mb="xs">
          Previews
        </Title>
        {pr.previews.length > 0 ? (
          <Group gap="xs">
            {pr.previews.map((preview) => (
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
            Nog geen builds binnen voor deze branch. Zodra CI klaar is verschijnen hier de
            preview-links ({pr.expected_previews[0]?.url.replace('https://', '')} …).
          </Text>
        )}
      </Card>
    </Stack>
  );
}

function FilesTab({ files }: { files: PrFile[] | undefined }) {
  if (!files) return <Loader />;
  if (files.length === 0) return <Text c="dimmed" size="sm">Geen gewijzigde bestanden.</Text>;
  return (
    <Accordion variant="separated" multiple>
      {files.map((f) => (
        <Accordion.Item key={f.filename} value={f.filename}>
          <Accordion.Control>
            <Group gap="xs" wrap="nowrap">
              <Badge color={FILE_STATUS_COLOR[f.status] ?? 'gray'} variant="light" size="sm">
                {f.status}
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
                Geen tekst-diff beschikbaar (binair of te groot bestand).
              </Text>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

function activityVisual(e: PrActivityEvent): { color: string; icon: React.ReactNode; title: string } {
  switch (e.type) {
    case 'commit':
      return {
        color: 'blue',
        icon: <IconGitCommit size={14} />,
        title: `${e.message ?? 'Commit'} (${e.sha ?? ''})`,
      };
    case 'build':
      return {
        color: e.status === 'ready' ? 'green' : e.status === 'failed' ? 'red' : 'gray',
        icon: <IconPackage size={14} />,
        title: `Build ${e.site}: ${e.status}`,
      };
    case 'opened':
      return { color: 'teal', icon: <IconGitPullRequest size={14} />, title: 'PR geopend' };
    case 'merged':
      return { color: 'grape', icon: <IconGitMerge size={14} />, title: 'PR gemerged' };
    case 'closed':
      return { color: 'gray', icon: <IconX size={14} />, title: 'PR gesloten' };
  }
}

function ActivityTab({ events }: { events: PrActivityEvent[] | undefined }) {
  if (!events) return <Loader />;
  if (events.length === 0) return <Text c="dimmed" size="sm">Nog geen activiteit.</Text>;
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

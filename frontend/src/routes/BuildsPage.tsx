import {
  Accordion,
  Anchor,
  Badge,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { api } from '../api/client';
import { useConcepts } from '../api/git';

interface BuildRow {
  id: number;
  site: string;
  branch: string;
  branch_slug: string;
  head_sha: string;
  status: string;
  commit_message: string | null;
  size_bytes: number | null;
  created_at: string;
}

interface PreviewRow {
  site: string;
  branch: string;
  url: string;
  pr_number: number | null;
  pr_title: string | null;
  created_at: string;
}

const statusLabel: Record<string, string> = {
  ready: 'klaar',
  pending: 'wacht',
  downloading: 'ophalen',
  failed: 'mislukt',
  pruned: 'opgeruimd',
};

const statusColor: Record<string, string> = {
  ready: 'green',
  pending: 'yellow',
  downloading: 'yellow',
  failed: 'red',
  pruned: 'gray',
};

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} kB`;
}

/** Groups rows by branch, keeping the order in which branches first appear. */
function groupByBranch<T extends { branch: string }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.branch);
    if (group) group.push(row);
    else groups.set(row.branch, [row]);
  }
  return [...groups.entries()];
}

export function BuildsPage() {
  const { data: previews, isLoading: loadingPreviews } = useQuery({
    queryKey: ['previews'],
    queryFn: () => api<PreviewRow[]>('/api/previews'),
    refetchInterval: 30_000,
  });
  const { data: builds, isLoading: loadingBuilds } = useQuery({
    queryKey: ['builds'],
    queryFn: () => api<BuildRow[]>('/api/builds'),
    refetchInterval: 30_000,
  });
  const { data: concepts } = useConcepts('all', false);
  const versionName = (ref: string) =>
    ref === 'main'
      ? 'Gepubliceerde versie'
      : (concepts?.find((c) => c.branch === ref)?.title ?? 'Concept');

  return (
    <Stack>
      <Title order={3}>Voorbeelden van concepten</Title>
      {loadingPreviews ? (
        <Loader m="md" />
      ) : (previews?.length ?? 0) === 0 ? (
        <Paper withBorder>
          <Text c="dimmed" p="md">
            Nog geen voorbeelden. Een voorbeeld verschijnt zodra de controle van een concept klaar
            is.
          </Text>
        </Paper>
      ) : (
        <Accordion variant="separated" multiple>
          {groupByBranch(previews ?? []).map(([branch, rows]) => {
            const pr = rows.find((p) => p.pr_number);
            return (
              <Accordion.Item key={branch} value={branch}>
                <Accordion.Control>
                  <Group gap="xs" wrap="nowrap">
                    <Text size="sm" fw={500} truncate>
                      {pr?.pr_title ?? versionName(branch)}
                    </Text>
                    <Badge variant="light" color="gray" size="sm">
                      {rows.length} {rows.length === 1 ? 'site' : 'sites'}
                    </Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  {pr && (
                    <Anchor component={Link} to={`/concepten/${pr.pr_number}`} size="sm">
                      Concept bekijken
                    </Anchor>
                  )}
                  <Table highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Site</Table.Th>
                        <Table.Th>Voorbeeld</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {rows.map((preview) => (
                        <Table.Tr key={preview.site}>
                          <Table.Td>{preview.site}</Table.Td>
                          <Table.Td>
                            <Anchor href={preview.url} target="_blank" size="sm">
                              {preview.url.replace('https://', '')}
                            </Anchor>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}

      <Title order={3}>Recent gebouwd</Title>
      {loadingBuilds ? (
        <Loader m="md" />
      ) : (
        <Accordion variant="separated" multiple>
          {groupByBranch(builds ?? []).map(([branch, rows]) => {
            const latest = rows[0];
            return (
              <Accordion.Item key={branch} value={branch}>
                <Accordion.Control>
                  <Group gap="xs" wrap="nowrap">
                    <Text size="sm" fw={500} truncate>
                      {versionName(branch)}
                    </Text>
                    <Badge color={statusColor[latest.status] ?? 'gray'} variant="light" size="sm">
                      {statusLabel[latest.status] ?? latest.status}
                    </Badge>
                    <Badge variant="light" color="gray" size="sm">
                      {rows.length} {rows.length === 1 ? 'build' : 'builds'}
                    </Badge>
                    <Text size="xs" c="dimmed">
                      {new Date(latest.created_at).toLocaleString('nl-NL')}
                    </Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Table highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Site</Table.Th>
                        <Table.Th>Wijziging</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Grootte</Table.Th>
                        <Table.Th>Wanneer</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {rows.map((build) => (
                        <Table.Tr key={build.id}>
                          <Table.Td>{build.site}</Table.Td>
                          <Table.Td>
                            <Text size="sm" truncate maw={300}>
                              {build.commit_message ?? build.head_sha}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge color={statusColor[build.status] ?? 'gray'} variant="light">
                              {statusLabel[build.status] ?? build.status}
                            </Badge>
                          </Table.Td>
                          <Table.Td>{formatSize(build.size_bytes)}</Table.Td>
                          <Table.Td>
                            <Text size="xs" c="dimmed">
                              {new Date(build.created_at).toLocaleString('nl-NL')}
                            </Text>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}
    </Stack>
  );
}

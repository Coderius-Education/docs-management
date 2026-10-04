import {
  Anchor,
  Badge,
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
      <Paper withBorder>
        {loadingPreviews ? (
          <Loader m="md" />
        ) : (previews?.length ?? 0) === 0 ? (
          <Text c="dimmed" p="md">
            Nog geen voorbeelden. Een voorbeeld verschijnt zodra de controle van
            een concept klaar is.
          </Text>
        ) : (
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Site</Table.Th>
                <Table.Th>Concept</Table.Th>
                <Table.Th>Voorbeeld</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {previews?.map((preview) => (
                <Table.Tr key={`${preview.site}-${preview.branch}`}>
                  <Table.Td>{preview.site}</Table.Td>
                  <Table.Td>
                    {preview.pr_number ? (
                      <Anchor component={Link} to={`/concepten/${preview.pr_number}`} size="sm">
                        {preview.pr_title}
                      </Anchor>
                    ) : (
                      <Text size="sm">{versionName(preview.branch)}</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Anchor href={preview.url} target="_blank" size="sm">
                      {preview.url.replace('https://', '')}
                    </Anchor>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <Title order={3}>Recent gebouwd</Title>
      <Paper withBorder>
        {loadingBuilds ? (
          <Loader m="md" />
        ) : (
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Site</Table.Th>
                <Table.Th>Versie</Table.Th>
                <Table.Th>Wijziging</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Grootte</Table.Th>
                <Table.Th>Wanneer</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {builds?.map((build) => (
                <Table.Tr key={build.id}>
                  <Table.Td>{build.site}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{versionName(build.branch)}</Text>
                  </Table.Td>
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
        )}
      </Paper>
    </Stack>
  );
}

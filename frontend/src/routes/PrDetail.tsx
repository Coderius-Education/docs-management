import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconExternalLink, IconGitMerge, IconX } from '@tabler/icons-react';
import { useParams } from 'react-router';

import { useClosePr, useMergePr, usePr } from '../api/git';

function checkBadge(status: string, conclusion: string | null) {
  if (status !== 'completed') return <Badge color="yellow" variant="light">{status}</Badge>;
  if (conclusion === 'success') return <Badge color="green" variant="light">geslaagd</Badge>;
  return <Badge color="red" variant="light">{conclusion}</Badge>;
}

export function PrDetail() {
  const { number = '0' } = useParams();
  const prNumber = parseInt(number, 10);
  const { data: pr, isLoading } = usePr(prNumber);
  const mergePr = useMergePr(prNumber);
  const closePr = useClosePr(prNumber);

  if (isLoading || !pr) return <Loader />;

  const checksOk =
    pr.checks.length > 0 && pr.checks.every((c) => c.conclusion === 'success');

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

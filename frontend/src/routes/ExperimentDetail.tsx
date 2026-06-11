import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Menu,
  Progress,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconChevronDown,
  IconFlagCheck,
  IconPlayerPause,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { useParams } from 'react-router';

import {
  type VariantStats,
  useExperimentResults,
  useExperiments,
  usePatchExperiment,
} from '../api/experiments';

function VariantCard({ label, stats, accent }: { label: string; stats: VariantStats; accent: string }) {
  return (
    <Card withBorder>
      <Group justify="space-between" mb="xs">
        <Title order={4}>Variant {label}</Title>
        <Badge color={accent}>{stats.exposed} bezoekers</Badge>
      </Group>
      <Stack gap="xs">
        <div>
          <Text size="sm" c="dimmed">
            Gemiddelde leestijd
          </Text>
          <Text fw={600}>{stats.avg_time_seconds}s</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            Gemiddelde scroll-diepte
          </Text>
          <Text fw={600}>{stats.avg_scroll_pct != null ? `${stats.avg_scroll_pct}%` : '—'}</Text>
        </div>
        <div>
          <Text size="sm" c="dimmed">
            Betrokken (≥ 60s leestijd)
          </Text>
          <Group gap="xs">
            <Progress value={stats.engaged_pct} w={160} color={accent} />
            <Text fw={600}>
              {stats.engaged_pct}% ({stats.engaged})
            </Text>
          </Group>
        </div>
      </Stack>
    </Card>
  );
}

export function ExperimentDetail() {
  const { id = '0' } = useParams();
  const experimentId = parseInt(id, 10);
  const { data: experiments } = useExperiments();
  const { data: results, isLoading } = useExperimentResults(experimentId);
  const patch = usePatchExperiment(experimentId);

  const experiment = experiments?.find((e) => e.id === experimentId);

  async function action(payload: { action: 'start' | 'pause' | 'conclude'; winner?: string }) {
    try {
      await patch.mutateAsync(payload);
      notifications.show({ message: 'Bijgewerkt', color: 'green' });
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    }
  }

  if (!experiment || isLoading || !results) return <Loader />;

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={3}>{experiment.name}</Title>
          <Text size="sm" c="dimmed">
            {experiment.site} · <code>{experiment.page_path}</code> · variant:{' '}
            <code>{experiment.variant_branch}</code> ({experiment.split_pct}% naar B)
          </Text>
          {experiment.hypothesis && (
            <Text size="sm" mt={4}>
              Hypothese: {experiment.hypothesis}
            </Text>
          )}
        </div>
        <Group>
          <Badge size="lg" color={experiment.status === 'running' ? 'green' : 'gray'}>
            {experiment.status}
            {experiment.winner ? ` · winnaar ${experiment.winner}` : ''}
          </Badge>
          {experiment.status !== 'concluded' && (
            <Group gap="xs">
              {experiment.status !== 'running' ? (
                <Button
                  size="xs"
                  leftSection={<IconPlayerPlay size={14} />}
                  onClick={() => action({ action: 'start' })}
                >
                  Start
                </Button>
              ) : (
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<IconPlayerPause size={14} />}
                  onClick={() => action({ action: 'pause' })}
                >
                  Pauzeer
                </Button>
              )}
              <Menu>
                <Menu.Target>
                  <Button
                    size="xs"
                    color="blue"
                    leftSection={<IconFlagCheck size={14} />}
                    rightSection={<IconChevronDown size={12} />}
                  >
                    Afronden
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item onClick={() => action({ action: 'conclude', winner: 'A' })}>
                    Winnaar: A (origineel)
                  </Menu.Item>
                  <Menu.Item onClick={() => action({ action: 'conclude', winner: 'B' })}>
                    Winnaar: B (variant)
                  </Menu.Item>
                  <Menu.Item onClick={() => action({ action: 'conclude', winner: 'none' })}>
                    Geen winnaar
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          )}
        </Group>
      </Group>

      {experiment.status === 'concluded' && (
        <Alert color="blue">
          Dit experiment is afgerond; alle bezoekers zien weer de hoofdversie.
          {experiment.winner === 'B' &&
            ' Winnaar B: merge de variant-branch via een PR om de wijziging permanent te maken.'}
        </Alert>
      )}

      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <VariantCard label="A (origineel)" stats={results.variants.A} accent="gray" />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <VariantCard label="B (variant)" stats={results.variants.B} accent="teal" />
        </Grid.Col>
      </Grid>

      <Card withBorder>
        <Title order={5} mb="xs">
          Statistische toets (betrokkenheid)
        </Title>
        {results.z_test.z == null ? (
          <Text c="dimmed" size="sm">
            Nog te weinig data voor een uitspraak{results.z_test.note ? ` (${results.z_test.note})` : ''}.
          </Text>
        ) : (
          <Text size="sm">
            z = {results.z_test.z}, p = {results.z_test.p_value} —{' '}
            {results.z_test.significant ? (
              <Text span fw={700} c="teal">
                significant verschil
              </Text>
            ) : (
              <Text span c="dimmed">
                (nog) geen significant verschil
              </Text>
            )}
            {results.z_test.z != null && results.z_test.significant && (
              <> · {results.z_test.z > 0 ? 'variant B doet het beter' : 'origineel A doet het beter'}</>
            )}
          </Text>
        )}
      </Card>
    </Stack>
  );
}

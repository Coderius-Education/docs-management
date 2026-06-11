import {
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { useBranches, usePrs } from '../api/git';
import { useSites } from '../api/hooks';
import { useCreateExperiment, useExperiments } from '../api/experiments';

const statusColor: Record<string, string> = {
  draft: 'gray',
  running: 'green',
  paused: 'yellow',
  concluded: 'blue',
};

export function ExperimentsPage() {
  const { data: experiments, isLoading } = useExperiments();
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Experimenten</Title>
        <Button leftSection={<IconPlus size={14} />} onClick={() => setWizardOpen(true)}>
          Nieuw experiment
        </Button>
      </Group>

      <NewExperimentModal opened={wizardOpen} onClose={() => setWizardOpen(false)} />

      <Paper withBorder>
        {isLoading ? (
          <Loader m="md" />
        ) : (experiments?.length ?? 0) === 0 ? (
          <Text c="dimmed" p="md">
            Nog geen experimenten. Maak een variant-branch met een aangepaste pagina,
            wacht op de build en start hier een A/B-test.
          </Text>
        ) : (
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Naam</Table.Th>
                <Table.Th>Site</Table.Th>
                <Table.Th>Pagina</Table.Th>
                <Table.Th>Variant-branch</Table.Th>
                <Table.Th>Split</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {experiments?.map((experiment) => (
                <Table.Tr key={experiment.id}>
                  <Table.Td>
                    <Anchor component={Link} to={`/experiments/${experiment.id}`}>
                      {experiment.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{experiment.site}</Table.Td>
                  <Table.Td>
                    <code>{experiment.page_path}</code>
                  </Table.Td>
                  <Table.Td>
                    <code>{experiment.variant_branch}</code>
                  </Table.Td>
                  <Table.Td>{experiment.split_pct}% B</Table.Td>
                  <Table.Td>
                    <Badge color={statusColor[experiment.status]} variant="light">
                      {experiment.status}
                      {experiment.winner ? ` · winnaar ${experiment.winner}` : ''}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </>
  );
}

function NewExperimentModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { data: sites } = useSites();
  const { data: branches } = useBranches();
  const { data: prs } = usePrs('open');
  const createExperiment = useCreateExperiment();

  const [site, setSite] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [pagePath, setPagePath] = useState('');
  const [variantBranch, setVariantBranch] = useState<string | null>(null);
  const [splitPct, setSplitPct] = useState<number>(50);

  const branchOptions = useMemo(() => {
    const withPr = new Set(prs?.map((pr) => pr.branch));
    return (branches ?? [])
      .filter((branch) => branch.name !== 'main')
      .map((branch) => ({
        value: branch.name,
        label: withPr.has(branch.name) ? `${branch.name} (open PR)` : branch.name,
      }));
  }, [branches, prs]);

  async function handleCreate() {
    if (!site || !name || !pagePath || !variantBranch) return;
    try {
      await createExperiment.mutateAsync({
        site,
        name,
        hypothesis,
        page_path: pagePath,
        variant_branch: variantBranch,
        split_pct: splitPct,
      });
      notifications.show({ message: 'Experiment aangemaakt (status: draft)', color: 'green' });
      onClose();
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Nieuw experiment" size="lg">
      <Stack>
        <TextInput
          label="Naam"
          placeholder="bijv. Intro met voorbeeld-eerst"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          required
        />
        <Textarea
          label="Hypothese"
          placeholder="Wat verwacht je dat de variant beter doet, en waarom?"
          value={hypothesis}
          onChange={(e) => setHypothesis(e.currentTarget.value)}
          autosize
          minRows={2}
        />
        <Select
          label="Site"
          data={sites?.map((s) => ({ value: s.slug, label: s.display_name })) ?? []}
          value={site}
          onChange={setSite}
          required
          searchable
        />
        <TextInput
          label="Pagina-pad"
          placeholder="/docs/basis/intro/"
          description="Het URL-pad van de pagina waarop bezoekers worden toegewezen"
          value={pagePath}
          onChange={(e) => setPagePath(e.currentTarget.value)}
          required
        />
        <Select
          label="Variant-branch (B)"
          description="De branch met de aangepaste pagina; er moet een afgeronde build zijn"
          data={branchOptions}
          value={variantBranch}
          onChange={setVariantBranch}
          required
          searchable
        />
        <NumberInput
          label="Percentage bezoekers naar variant B"
          value={splitPct}
          onChange={(v) => setSplitPct(Number(v) || 50)}
          min={1}
          max={100}
          suffix="%"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Annuleren
          </Button>
          <Button
            onClick={handleCreate}
            loading={createExperiment.isPending}
            disabled={!site || !name || !pagePath || !variantBranch}
          >
            Aanmaken
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

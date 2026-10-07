import {
  Anchor,
  Badge,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';

import { useConcepts } from '../api/git';
import { useSites } from '../api/hooks';
import { STATUS_COLOR, STATUS_LABEL } from '../lib/concepts';

function fmtTime(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString('nl-NL');
}

export function ConceptList() {
  const [state, setState] = useState('open');
  const { data: concepts, isLoading } = useConcepts(state);
  const { data: sites } = useSites();
  const siteName = (slug: string | null) =>
    sites?.find((s) => s.slug === slug)?.display_name ?? slug ?? '';

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Concepten</Title>
        <SegmentedControl
          size="xs"
          value={state}
          onChange={setState}
          data={[
            { label: 'Open', value: 'open' },
            { label: 'Afgerond', value: 'closed' },
          ]}
        />
      </Group>
      <Paper withBorder>
        {isLoading ? (
          <Loader m="md" />
        ) : (
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Titel</Table.Th>
                <Table.Th>Site</Table.Th>
                <Table.Th>Auteur</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Laatste wijziging</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {concepts?.map((concept) => (
                <Table.Tr key={concept.number}>
                  <Table.Td>
                    <Anchor component={Link} to={`/concepten/${concept.number}`}>
                      {concept.title}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{siteName(concept.site)}</Table.Td>
                  <Table.Td>{concept.author_login}</Table.Td>
                  <Table.Td>
                    {concept.status && (
                      <Badge color={STATUS_COLOR[concept.status]} variant="light">
                        {STATUS_LABEL[concept.status]}
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      {fmtTime(concept.updated_at)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
              {concepts?.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={5} c="dimmed">
                    Geen concepten.
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </>
  );
}

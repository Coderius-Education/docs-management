import { Anchor, Badge, Group, Loader, Paper, SegmentedControl, Table, Title } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';

import { usePrs } from '../api/git';

export function PrList() {
  const [state, setState] = useState('open');
  const { data: prs, isLoading } = usePrs(state);

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Pull requests</Title>
        <SegmentedControl
          size="xs"
          value={state}
          onChange={setState}
          data={[
            { label: 'Open', value: 'open' },
            { label: 'Gesloten', value: 'closed' },
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
                <Table.Th>#</Table.Th>
                <Table.Th>Titel</Table.Th>
                <Table.Th>Branch</Table.Th>
                <Table.Th>Auteur</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {prs?.map((pr) => (
                <Table.Tr key={pr.number}>
                  <Table.Td>{pr.number}</Table.Td>
                  <Table.Td>
                    <Anchor component={Link} to={`/prs/${pr.number}`}>
                      {pr.title}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <code>{pr.branch}</code>
                  </Table.Td>
                  <Table.Td>{pr.author_login}</Table.Td>
                  <Table.Td>
                    <Badge color={pr.state === 'open' ? 'green' : 'gray'} variant="light">
                      {pr.state}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
              {prs?.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={5} c="dimmed">
                    Geen pull requests.
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

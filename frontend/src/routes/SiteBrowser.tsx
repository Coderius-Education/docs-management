import {
  Alert,
  Button,
  Code,
  Grid,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconAlertCircle, IconPencil } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { usePage, useSites, useTree } from '../api/hooks';
import { PageTree } from '../components/PageTree';

export function SiteBrowser() {
  const { site = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [ref, setRef] = useState(searchParams.get('ref') ?? 'main');

  const selectedPath = searchParams.get('path');
  const { data: sites } = useSites();
  const { data: tree, isLoading: treeLoading, error: treeError } = useTree(site, ref);
  const { data: page, isLoading: pageLoading } = usePage(site, selectedPath, ref);

  const siteInfo = sites?.find((s) => s.slug === site);

  return (
    <>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={3}>{siteInfo?.display_name ?? site}</Title>
          <Text size="sm" c="dimmed">
            {siteInfo?.domain}
          </Text>
        </div>
        <TextInput
          label="Branch"
          value={ref}
          onChange={(e) => setRef(e.currentTarget.value)}
          w={220}
          size="xs"
        />
      </Group>

      {treeError && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" mb="md">
          Kon de bestandsboom niet laden: {String(treeError)}
        </Alert>
      )}

      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Paper withBorder p="xs">
            <ScrollArea h="70vh">
              {treeLoading ? (
                <Loader size="sm" m="md" />
              ) : (
                <PageTree
                  items={tree ?? []}
                  selected={selectedPath}
                  onSelect={(path) => setSearchParams({ path, ref })}
                />
              )}
            </ScrollArea>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Paper withBorder p="md">
            {!selectedPath && <Text c="dimmed">Kies links een pagina.</Text>}
            {pageLoading && <Loader size="sm" />}
            {page && (
              <>
                <Group justify="space-between" mb="sm">
                  <Text fw={600}>{page.path}</Text>
                  <Button
                    size="xs"
                    leftSection={<IconPencil size={14} />}
                    onClick={() =>
                      navigate(
                        `/sites/${site}/edit?path=${encodeURIComponent(page.path)}&ref=${ref}`,
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

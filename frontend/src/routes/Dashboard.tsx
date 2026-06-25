import { Anchor, Button, Card, Grid, Group, Text, Title } from '@mantine/core';
import { IconExternalLink, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { useSites } from '../api/hooks';
import { NewSiteModal } from '../components/NewSiteModal';

export function Dashboard() {
  const { data: sites } = useSites();
  const [newSiteOpen, setNewSiteOpen] = useState(false);

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Sites</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setNewSiteOpen(true)}>
          Nieuwe site
        </Button>
      </Group>
      <NewSiteModal opened={newSiteOpen} onClose={() => setNewSiteOpen(false)} />
      <Grid>
        {sites?.map((site) => (
          <Grid.Col key={site.slug} span={{ base: 12, sm: 6, lg: 3 }}>
            <Card withBorder padding="md">
              <Group justify="space-between">
                <Anchor component={Link} to={`/sites/${site.slug}`} fw={600}>
                  {site.display_name}
                </Anchor>
                <Anchor href={`https://${site.domain}`} target="_blank" size="xs">
                  <IconExternalLink size={14} />
                </Anchor>
              </Group>
              <Text size="xs" c="dimmed">
                {site.domain}
              </Text>
            </Card>
          </Grid.Col>
        ))}
      </Grid>
    </>
  );
}

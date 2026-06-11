import { Anchor, Card, Grid, Group, Text, Title } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { Link } from 'react-router';

import { useSites } from '../api/hooks';

export function Dashboard() {
  const { data: sites } = useSites();

  return (
    <>
      <Title order={3} mb="md">
        Sites
      </Title>
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

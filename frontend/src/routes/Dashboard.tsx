import { Anchor, Button, Card, Grid, Group, Stack, Text, Title } from '@mantine/core';
import { IconExternalLink, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { useSites, useSubjects } from '../api/hooks';
import type { SiteInfo } from '../api/types';
import { NewSiteModal } from '../components/NewSiteModal';

function SiteCard({ site }: { site: SiteInfo }) {
  const url = site.url ?? `https://${site.domain}`;
  return (
    <Card withBorder padding="md">
      <Group justify="space-between">
        <Anchor component={Link} to={`/sites/${site.slug}`} fw={600}>
          {site.display_name}
        </Anchor>
        <Anchor href={url} target="_blank" size="xs" aria-label={`${site.display_name} openen`}>
          <IconExternalLink size={14} />
        </Anchor>
      </Group>
      <Text size="xs" c="dimmed">
        {url.replace(/^https?:\/\//, '')}
      </Text>
    </Card>
  );
}

/** Site cards, one section per Vak; the main site (no Vak) comes last. */
export function Dashboard() {
  const { data: sites } = useSites();
  const { data: subjects } = useSubjects();
  const [newSiteOpen, setNewSiteOpen] = useState(false);

  const known = new Set((subjects ?? []).map((s) => s.slug));
  const groups = [
    ...(subjects ?? []).map((subject) => ({
      key: subject.slug,
      title: subject.display_name,
      domain: subject.domain,
      sites: (sites ?? []).filter((site) => site.subject === subject.slug),
    })),
    {
      key: '__overig',
      title: 'Hoofdsite en overig',
      domain: undefined as string | undefined,
      sites: (sites ?? []).filter((site) => !site.subject || !known.has(site.subject)),
    },
  ].filter((group) => group.sites.length > 0);

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Sites</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setNewSiteOpen(true)}>
          Nieuwe site
        </Button>
      </Group>
      <NewSiteModal opened={newSiteOpen} onClose={() => setNewSiteOpen(false)} />
      <Stack gap="xl">
        {groups.map((group) => (
          <section key={group.key} aria-label={group.title}>
            <Group gap="xs" mb="xs" align="baseline">
              <Title order={4}>{group.title}</Title>
              {group.domain && (
                <Text size="sm" c="dimmed">
                  {group.domain}
                </Text>
              )}
            </Group>
            <Grid>
              {group.sites.map((site) => (
                <Grid.Col key={site.slug} span={{ base: 12, sm: 6, lg: 3 }}>
                  <SiteCard site={site} />
                </Grid.Col>
              ))}
            </Grid>
          </section>
        ))}
      </Stack>
    </>
  );
}

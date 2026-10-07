import {
  Anchor,
  Badge,
  Button,
  Card,
  CloseButton,
  Collapse,
  Grid,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  IconChevronRight,
  IconExternalLink,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { useSites, useSubjects } from '../api/hooks';
import type { SiteInfo } from '../api/types';
import { NewSiteModal } from '../components/NewSiteModal';
import {
  DASHBOARD_CLOSED_KEY,
  filterSites,
  groupSitesBySubject,
} from '../lib/subjectGroups';
import { useClosedSubjects } from '../lib/useClosedSubjects';

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

/**
 * Site cards, one foldable section per Vak; the main site (no Vak) comes last.
 * Searching shows every Vak with a match opened, without touching the remembered state.
 */
export function Dashboard() {
  const { data: sites } = useSites();
  const { data: subjects } = useSubjects();
  const [newSiteOpen, setNewSiteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const sections = useClosedSubjects(DASHBOARD_CLOSED_KEY);

  const searching = query.trim() !== '';
  const allGroups = groupSitesBySubject(sites, subjects);
  const groups = allGroups
    .map((group) => ({ ...group, sites: filterSites(group.sites, query) }))
    .filter((group) => group.sites.length > 0);
  const keys = allGroups.map((group) => group.key);

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={3}>Sites</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setNewSiteOpen(true)}>
          Nieuwe site
        </Button>
      </Group>
      <NewSiteModal opened={newSiteOpen} onClose={() => setNewSiteOpen(false)} />
      <Group mb="lg" gap="xs" wrap="wrap">
        <TextInput
          style={{ flex: '1 1 240px' }}
          placeholder="Zoek een site…"
          aria-label="Zoek een site"
          leftSection={<IconSearch size={16} />}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          rightSection={
            searching && (
              <CloseButton aria-label="Zoekopdracht wissen" onClick={() => setQuery('')} />
            )
          }
        />
        {!searching && (
          <Group gap="xs">
            <Button variant="default" onClick={() => sections.setAll(keys, true)}>
              Alles openen
            </Button>
            <Button variant="default" onClick={() => sections.setAll(keys, false)}>
              Alles sluiten
            </Button>
          </Group>
        )}
      </Group>
      {searching && groups.length === 0 && (
        <Text c="dimmed">Geen sites gevonden voor “{query.trim()}”.</Text>
      )}
      <Stack gap="lg">
        {groups.map((group) => {
          const open = searching || sections.isOpen(group.key);
          const panelId = `vak-${group.key}`;
          return (
            <section key={group.key} aria-label={group.title}>
              <UnstyledButton
                onClick={() => sections.toggle(group.key)}
                disabled={searching}
                aria-expanded={open}
                aria-controls={panelId}
                mb="xs"
                style={{ cursor: searching ? 'default' : 'pointer' }}
              >
                <Group gap="xs" align="center" wrap="nowrap">
                  <IconChevronRight
                    size={18}
                    aria-hidden
                    style={{
                      transform: open ? 'rotate(90deg)' : undefined,
                      transition: 'transform 150ms ease',
                      opacity: searching ? 0.4 : 1,
                    }}
                  />
                  <Title order={4}>{group.title}</Title>
                  <Badge variant="light" radius="sm">
                    {group.sites.length}
                  </Badge>
                  {group.domain && (
                    <Text size="sm" c="dimmed" visibleFrom="sm">
                      {group.domain}
                    </Text>
                  )}
                </Group>
              </UnstyledButton>
              <Collapse in={open} id={panelId}>
                <Grid>
                  {group.sites.map((site) => (
                    <Grid.Col key={site.slug} span={{ base: 12, sm: 6, lg: 3 }}>
                      <SiteCard site={site} />
                    </Grid.Col>
                  ))}
                </Grid>
              </Collapse>
            </section>
          );
        })}
      </Stack>
    </>
  );
}

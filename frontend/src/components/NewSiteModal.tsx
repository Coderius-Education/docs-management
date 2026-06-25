import {
  Anchor,
  Button,
  Code,
  Divider,
  Group,
  List,
  Modal,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';

import { useCreateSite } from '../api/hooks';
import type { CreateSiteResult } from '../api/types';

function kebab(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const SLUG_RE = /^[a-z][a-z0-9-]*$/;

export function NewSiteModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const createSite = useCreateSite();
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [domain, setDomain] = useState('');
  const [domainEdited, setDomainEdited] = useState(false);
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [result, setResult] = useState<CreateSiteResult | null>(null);

  // Slug en domein volgen de weergavenaam tot de gebruiker ze zelf aanpast.
  const effectiveSlug = slugEdited ? slug : kebab(displayName);
  const effectiveDomain = domainEdited
    ? domain
    : effectiveSlug
      ? `${effectiveSlug}.coderius.nl`
      : '';

  const slugValid = SLUG_RE.test(effectiveSlug);
  const domainValid = effectiveDomain.includes('.');
  const valid = slugValid && domainValid && title.trim() !== '' && displayName.trim() !== '';

  function reset() {
    setDisplayName('');
    setSlug('');
    setSlugEdited(false);
    setDomain('');
    setDomainEdited(false);
    setTitle('');
    setTagline('');
    setResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleCreate() {
    if (!valid) return;
    try {
      const res = await createSite.mutateAsync({
        slug: effectiveSlug,
        display_name: displayName.trim(),
        domain: effectiveDomain.trim(),
        title: title.trim(),
        tagline: tagline.trim(),
      });
      setResult(res);
      notifications.show({ message: `Site '${res.slug}' aangemaakt — 2 PR's geopend`, color: 'green' });
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    }
  }

  return (
    <Modal opened={opened} onClose={handleClose} title="Nieuwe site" size="lg">
      {result ? (
        <Stack>
          <Text size="sm">
            De site staat klaar in twee pull requests. Rond daarna de handmatige stappen af.
          </Text>
          <Group>
            {result.docs_pr && (
              <Anchor href={result.docs_pr} target="_blank">
                docs-PR openen
              </Anchor>
            )}
            {result.management_pr && (
              <Anchor href={result.management_pr} target="_blank">
                docs-management-PR openen
              </Anchor>
            )}
          </Group>
          <Divider label="Nog te doen" labelPosition="left" />
          <List size="sm" spacing="xs">
            {result.manual_steps.map((step) => (
              <List.Item key={step}>{step}</List.Item>
            ))}
          </List>
          <Group justify="flex-end">
            <Button onClick={handleClose}>Klaar</Button>
          </Group>
        </Stack>
      ) : (
        <Stack>
          <TextInput
            label="Weergavenaam"
            placeholder="bijv. Datavisualisatie"
            value={displayName}
            onChange={(e) => setDisplayName(e.currentTarget.value)}
            data-autofocus
          />
          <TextInput
            label="Slug"
            description="Mapnaam onder sites/ — kleine letters, cijfers en koppeltekens"
            value={effectiveSlug}
            error={effectiveSlug && !slugValid ? 'Ongeldige slug' : undefined}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.currentTarget.value);
            }}
          />
          <TextInput
            label="Domein"
            value={effectiveDomain}
            error={effectiveDomain && !domainValid ? 'Ongeldig domein' : undefined}
            onChange={(e) => {
              setDomainEdited(true);
              setDomain(e.currentTarget.value);
            }}
          />
          <TextInput
            label="Titel"
            description="De <title> en navbar-titel van de site"
            placeholder="bijv. Datavisualisatie Leren — Coderius"
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
          />
          <TextInput
            label="Tagline"
            placeholder="korte ondertitel op de homepage"
            value={tagline}
            onChange={(e) => setTagline(e.currentTarget.value)}
          />
          <Text size="xs" c="dimmed">
            Maakt <Code>sites/{effectiveSlug || '<slug>'}</Code> aan en opent een PR in beide repos.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              Annuleren
            </Button>
            <Button onClick={handleCreate} loading={createSite.isPending} disabled={!valid}>
              Site aanmaken
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

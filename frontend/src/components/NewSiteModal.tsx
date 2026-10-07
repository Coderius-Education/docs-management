import {
  Anchor,
  Button,
  Code,
  Divider,
  Group,
  List,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';

import { useCreateSite, useSubjects } from '../api/hooks';
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

const NEW_SUBJECT = '__nieuw__';

export function NewSiteModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const createSite = useCreateSite();
  const { data: subjects } = useSubjects();
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [path, setPath] = useState('');
  const [pathEdited, setPathEdited] = useState(false);
  const [subject, setSubject] = useState<string | null>('informatica');
  const [subjectName, setSubjectName] = useState('');
  const [subjectSlug, setSubjectSlug] = useState('');
  const [subjectDomain, setSubjectDomain] = useState('');
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [result, setResult] = useState<CreateSiteResult | null>(null);

  // Slug en pad volgen de weergavenaam tot de gebruiker ze zelf aanpast.
  const effectiveSlug = slugEdited ? slug : kebab(displayName);
  const effectivePath = pathEdited ? path : effectiveSlug;
  const isNewSubject = subject === NEW_SUBJECT;
  const effectiveSubjectSlug = subjectSlug || kebab(subjectName);
  const effectiveSubjectDomain =
    subjectDomain || (effectiveSubjectSlug ? `${effectiveSubjectSlug}.coderius.nl` : '');
  const subjectSlugValue = isNewSubject ? effectiveSubjectSlug : (subject ?? '');
  const subjectDomainValue = isNewSubject
    ? effectiveSubjectDomain
    : (subjects?.find((s) => s.slug === subject)?.domain ?? '');

  const slugValid = SLUG_RE.test(effectiveSlug);
  const pathValid = SLUG_RE.test(effectivePath);
  const subjectValid = isNewSubject
    ? SLUG_RE.test(effectiveSubjectSlug) &&
      subjectName.trim() !== '' &&
      effectiveSubjectDomain.includes('.')
    : !!subject;
  const valid =
    slugValid &&
    pathValid &&
    subjectValid &&
    title.trim() !== '' &&
    displayName.trim() !== '';

  function reset() {
    setDisplayName('');
    setSlug('');
    setSlugEdited(false);
    setPath('');
    setPathEdited(false);
    setSubject('informatica');
    setSubjectName('');
    setSubjectSlug('');
    setSubjectDomain('');
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
        title: title.trim(),
        tagline: tagline.trim(),
        subject: subjectSlugValue,
        path: effectivePath,
        new_subject: isNewSubject
          ? {
              slug: effectiveSubjectSlug,
              display_name: subjectName.trim(),
              domain: effectiveSubjectDomain.trim(),
            }
          : null,
      });
      setResult(res);
      notifications.show({
        message: `Site '${res.slug}' aangemaakt. Twee voorstellen staan klaar.`,
        color: 'green',
      });
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    }
  }

  return (
    <Modal opened={opened} onClose={handleClose} title="Nieuwe site" size="lg">
      {result ? (
        <Stack>
          <Text size="sm">
            De site staat klaar in twee voorstellen op GitHub. Rond daarna de handmatige
            stappen af. Daarna staat de site op <Code>{result.url}</Code>.
          </Text>
          <Group>
            {result.docs_pr && (
              <Anchor href={result.docs_pr} target="_blank">
                Voorstel in docs openen
              </Anchor>
            )}
            {result.management_pr && (
              <Anchor href={result.management_pr} target="_blank">
                Voorstel in docs-management openen
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
          <Select
            label="Vak"
            description="Het vak bepaalt het domein, bv. informatica.coderius.nl"
            value={subject}
            onChange={setSubject}
            allowDeselect={false}
            data={[
              ...(subjects ?? []).map((s) => ({ value: s.slug, label: s.display_name })),
              { value: NEW_SUBJECT, label: 'Nieuw vak…' },
            ]}
          />
          {isNewSubject && (
            <Group grow align="flex-start">
              <TextInput
                label="Naam van het vak"
                placeholder="bijv. Techniek"
                value={subjectName}
                onChange={(e) => setSubjectName(e.currentTarget.value)}
              />
              <TextInput
                label="Korte naam"
                value={effectiveSubjectSlug}
                error={
                  effectiveSubjectSlug && !SLUG_RE.test(effectiveSubjectSlug)
                    ? 'Alleen kleine letters, cijfers en koppeltekens'
                    : undefined
                }
                onChange={(e) => setSubjectSlug(e.currentTarget.value)}
              />
              <TextInput
                label="Domein"
                value={effectiveSubjectDomain}
                onChange={(e) => setSubjectDomain(e.currentTarget.value)}
              />
            </Group>
          )}
          <TextInput
            label="Mapnaam"
            description="Kleine letters, cijfers en koppeltekens"
            value={effectiveSlug}
            error={effectiveSlug && !slugValid ? 'Ongeldige mapnaam' : undefined}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.currentTarget.value);
            }}
          />
          <TextInput
            label="Adres"
            description={`De site komt op https://${subjectDomainValue || '<vak>'}/${effectivePath || '<adres>'}/`}
            value={effectivePath}
            error={effectivePath && !pathValid ? 'Ongeldig adres' : undefined}
            onChange={(e) => {
              setPathEdited(true);
              setPath(e.currentTarget.value);
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
            Maakt <Code>sites/{subjectSlugValue || '<vak>'}/{effectiveSlug || '<map>'}</Code>{' '}
            aan en zet in beide repositories een voorstel klaar.
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

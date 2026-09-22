import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  Alert,
  Button,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import YAML from 'yaml';
import { extractFrontmatterYaml } from '../../lib/frontmatter';
import {
  isPropertyObject,
  parsePropertyYaml,
  propertySchema,
  validateProperties,
  type PropertyField,
  type PropertyGroup,
  type PropertyKind,
} from '../../lib/authoring/properties';

export type Frontmatter = Record<string, unknown>;
const groups: [PropertyGroup, string][] = [
  ['basic', 'Basisgegevens'],
  ['navigation', 'Menu en navigatie'],
  ['display', 'Weergave'],
  ['publication', 'Publicatie en SEO'],
  ['advanced', 'Geavanceerd'],
];

export function FrontmatterForm({
  value,
  onChange,
  kind = 'docs',
  onValidationChange,
  allowedKeys,
  rawFrontmatter,
}: {
  value: Frontmatter;
  onChange: (fm: Frontmatter) => void;
  kind?: PropertyKind;
  onValidationChange?: (errors: Record<string, string>) => void;
  allowedKeys?: string[];
  rawFrontmatter?: string;
}) {
  const [yamlErrors, setYamlErrors] = useState<Record<string, string>>({});
  const errors = useMemo(
    () => ({ ...validateProperties(value, kind), ...yamlErrors }),
    [value, kind, yamlErrors],
  );
  const errorKey = JSON.stringify(errors);
  useEffect(() => {
    onValidationChange?.(JSON.parse(errorKey) as Record<string, string>);
  }, [errorKey, onValidationChange]);
  const setYamlError = (key: string, message?: string) =>
    setYamlErrors((previous) => {
      const next = { ...previous };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  const set = (key: string, item: unknown) => {
    const next = { ...value };
    if (item === undefined) delete next[key];
    else next[key] = item;
    onChange(next);
  };
  const control = (entry: PropertyField) => {
    const item = value[entry.key];
    const common = {
      label: entry.label,
      description: entry.help,
      size: 'xs' as const,
      error: errors[entry.key],
    };
    const reset = item !== undefined && (
      <Button
        size="compact-xs"
        variant="subtle"
        onClick={() => set(entry.key, undefined)}
      >
        Overnemen
      </Button>
    );
    let input;
    switch (entry.type) {
      case 'boolean':
        input = (
          <Select
            {...common}
            value={
              item === undefined
                ? 'inherit'
                : item === true
                  ? 'true'
                  : item === false
                    ? 'false'
                    : null
            }
            placeholder="Ongeldige waarde — kies opnieuw"
            data={[
              { value: 'inherit', label: 'Overnemen (automatisch)' },
              { value: 'true', label: 'Ja' },
              { value: 'false', label: 'Nee' },
            ]}
            onChange={(selected) =>
              set(
                entry.key,
                selected === 'inherit' ? undefined : selected === 'true',
              )
            }
          />
        );
        break;
      case 'link':
        input = (
          <Stack gap="xs">
            <Select
              {...common}
              value={
                item === undefined
                  ? 'inherit'
                  : item === null
                    ? 'disabled'
                    : 'custom'
              }
              data={[
                { value: 'inherit', label: 'Automatisch' },
                { value: 'custom', label: 'Aangepast' },
                { value: 'disabled', label: 'Uitgeschakeld' },
              ]}
              onChange={(selected) =>
                set(
                  entry.key,
                  selected === 'inherit'
                    ? undefined
                    : selected === 'disabled'
                      ? null
                      : '',
                )
              }
            />
            {item !== undefined && item !== null && (
              <TextInput
                size="xs"
                label={`${entry.label}: waarde`}
                value={typeof item === 'string' ? item : ''}
                onChange={(event) => set(entry.key, event.currentTarget.value)}
              />
            )}
          </Stack>
        );
        break;
      case 'number':
        input = (
          <NumberInput
            {...common}
            value={typeof item === 'number' ? item : ''}
            min={entry.heading ? 2 : undefined}
            max={entry.heading ? 6 : undefined}
            allowDecimal={!entry.heading}
            clampBehavior="none"
            onChange={(next) =>
              set(entry.key, next === '' ? undefined : Number(next))
            }
          />
        );
        break;
      case 'keywords':
        input = (
          <TagsInput
            {...common}
            value={
              Array.isArray(item)
                ? item.filter(
                    (word): word is string => typeof word === 'string',
                  )
                : []
            }
            onChange={(next) => set(entry.key, next)}
          />
        );
        break;
      case 'tags':
        input = (
          <Stack gap="xs">
            <Text size="xs" fw={500}>
              {entry.label}
            </Text>
            <Text size="xs" c="dimmed">
              {entry.help}
            </Text>
            {errors.tags && (
              <Text c="red" size="xs">
                {errors.tags}
              </Text>
            )}
            {Array.isArray(item) &&
              item.map((tag, index) => {
                const update = (next: unknown) =>
                  set(
                    'tags',
                    item.map((existing, i) => (i === index ? next : existing)),
                  );
                return (
                  <Group key={index} align="flex-end" grow>
                    {typeof tag === 'string' ? (
                      <TextInput
                        size="xs"
                        label={`Tag ${index + 1}`}
                        value={tag}
                        onChange={(event) => update(event.currentTarget.value)}
                      />
                    ) : isPropertyObject(tag) ? (
                      <Stack gap="xs">
                        <TextInput
                          size="xs"
                          label={`Tag ${index + 1}: label`}
                          value={typeof tag.label === 'string' ? tag.label : ''}
                          onChange={(event) =>
                            update({ ...tag, label: event.currentTarget.value })
                          }
                        />
                        <TextInput
                          size="xs"
                          label={`Tag ${index + 1}: permalink`}
                          value={
                            typeof tag.permalink === 'string'
                              ? tag.permalink
                              : ''
                          }
                          onChange={(event) =>
                            update({
                              ...tag,
                              permalink: event.currentTarget.value,
                            })
                          }
                        />
                      </Stack>
                    ) : (
                      <Text size="xs" c="red">
                        Ongeldige tag; herstel in YAML.
                      </Text>
                    )}
                    <Button
                      variant="subtle"
                      size="compact-xs"
                      onClick={() =>
                        set(
                          'tags',
                          item.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Verwijderen
                    </Button>
                  </Group>
                );
              })}
            <Group>
              <Button
                size="compact-xs"
                variant="light"
                onClick={() =>
                  set('tags', [...(Array.isArray(item) ? item : []), ''])
                }
              >
                Tag toevoegen
              </Button>
              <Button
                size="compact-xs"
                variant="light"
                onClick={() =>
                  set('tags', [
                    ...(Array.isArray(item) ? item : []),
                    { label: '', permalink: '' },
                  ])
                }
              >
                Tag met link
              </Button>
            </Group>
          </Stack>
        );
        break;
      case 'object':
        input = (
          <YamlControl
            {...common}
            value={isPropertyObject(item) ? item : {}}
            onChange={(next) => set(entry.key, next)}
            onError={(message) => setYamlError(entry.key, message)}
          />
        );
        break;
      case 'last_update': {
        const current = isPropertyObject(item) ? item : {};
        const update = (key: string, next: string) => {
          const updated = { ...current };
          if (next === '') delete updated[key];
          else updated[key] = next;
          set('last_update', Object.keys(updated).length ? updated : undefined);
        };
        input = (
          <Stack gap="xs">
            <Text size="xs" fw={500}>
              {entry.label}
            </Text>
            <Text size="xs" c="dimmed">
              {entry.help}
            </Text>
            {errors.last_update && (
              <Text size="xs" c="red">
                {errors.last_update}
              </Text>
            )}
            <TextInput
              size="xs"
              label="Auteur laatste wijziging"
              value={typeof current.author === 'string' ? current.author : ''}
              error={errors['last_update.author']}
              onChange={(event) => update('author', event.currentTarget.value)}
            />
            <TextInput
              size="xs"
              label="Datum laatste wijziging"
              placeholder="2026-09-22"
              value={
                typeof current.date === 'string' ||
                typeof current.date === 'number'
                  ? String(current.date)
                  : ''
              }
              error={errors['last_update.date']}
              onChange={(event) => update('date', event.currentTarget.value)}
            />
          </Stack>
        );
        break;
      }
      default:
        input = (
          <TextInput
            {...common}
            value={typeof item === 'string' ? item : ''}
            placeholder="Automatisch"
            onChange={(event) =>
              set(
                entry.key,
                event.currentTarget.value === '' && !entry.allowEmpty
                  ? undefined
                  : event.currentTarget.value,
              )
            }
          />
        );
    }
    return (
      <Stack gap={2} key={entry.key}>
        {input}
        {entry.type !== 'boolean' && entry.type !== 'link' && reset}
      </Stack>
    );
  };
  return (
    <Stack gap="xs">
      {Object.keys(errors).length > 0 && (
        <Alert color="red" title="Controleer de pagina-instellingen">
          Corrigeer de gemarkeerde velden voordat je opslaat.
        </Alert>
      )}
      <Accordion multiple defaultValue={['basic']} variant="contained">
        {groups.map(([key, label]) => {
          const entries = propertySchema(kind).filter(
            (entry) =>
              entry.group === key &&
              (!allowedKeys || allowedKeys.includes(entry.key)),
          );
          if (!entries.length && key !== 'advanced') return null;
          return (
            <Accordion.Item value={key} key={key}>
              <Accordion.Control>{label}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    {entries.map(control)}
                  </SimpleGrid>
                  {key === 'advanced' && (
                    <YamlControl
                      label="Alle eigenschappen als YAML"
                      rawYaml={
                        rawFrontmatter === undefined
                          ? undefined
                          : extractFrontmatterYaml(rawFrontmatter)
                      }
                      description="Ook eigen eigenschappen blijven behouden. Alleen bekende velden voor dit paginatype worden gevalideerd. Verwijder een sleutel om de standaard te herstellen."
                      value={value}
                      onChange={onChange}
                      error={errors.yaml}
                      onError={(message) => setYamlError('yaml', message)}
                    />
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    </Stack>
  );
}

function YamlControl({
  value,
  onChange,
  onError,
  label,
  description,
  error,
  rawYaml,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  onError: (error?: string) => void;
  label: string;
  description?: string;
  error?: string;
  rawYaml?: string;
}) {
  const serialized = YAML.stringify(value);
  const [source, setSource] = useState(rawYaml ?? serialized);
  const [invalid, setInvalid] = useState(false);
  const emitted = useRef<string | null>(null);
  const emittedSource = useRef<string | null>(null);
  // Retain malformed input for repair while other controls are edited.
  useEffect(() => {
    if (invalid) return;
    if (rawYaml !== undefined) {
      // Own edits already live in the textarea. The outer serializer may append
      // a delimiter newline, which must not move the caret while typing.
      if (
        emittedSource.current !== null &&
        [
          emittedSource.current,
          `${emittedSource.current}\n`,
          `${emittedSource.current}\r\n`,
        ].includes(rawYaml)
      )
        return;
      setSource(rawYaml);
    } else if (serialized !== emitted.current) setSource(serialized);
  }, [rawYaml, serialized, invalid]);
  return (
    <Textarea
      label={label}
      description={description}
      size="xs"
      autosize
      minRows={5}
      maxRows={24}
      styles={{ input: { fontFamily: 'monospace' } }}
      value={source}
      error={error}
      onChange={(event) => {
        const text = event.currentTarget.value;
        setSource(text);
        try {
          const parsed = parsePropertyYaml(text);
          emitted.current = YAML.stringify(parsed);
          emittedSource.current = text;
          setInvalid(false);
          onError(undefined);
          onChange(parsed);
        } catch (cause) {
          setInvalid(true);
          onError(cause instanceof Error ? cause.message : 'Ongeldige YAML');
        }
      }}
    />
  );
}

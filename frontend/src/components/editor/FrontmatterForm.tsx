import { Checkbox, Group, NumberInput, TextInput } from '@mantine/core';

export type Frontmatter = Record<string, unknown>;

/**
 * Bekende frontmatter-velden als formulier; onbekende velden blijven onaangetast
 * in het object staan en gaan ongewijzigd mee bij opslaan.
 */
export function FrontmatterForm({
  value,
  onChange,
}: {
  value: Frontmatter;
  onChange: (fm: Frontmatter) => void;
}) {
  const set = (key: string, v: unknown) => {
    const next = { ...value };
    if (v === '' || v === undefined || v === null) delete next[key];
    else next[key] = v;
    onChange(next);
  };

  return (
    <Group gap="sm" align="flex-end">
      <NumberInput
        label="Volgorde in menu"
        size="xs"
        w={130}
        value={
          typeof value.sidebar_position === 'number'
            ? value.sidebar_position
            : ''
        }
        onChange={(v) =>
          set('sidebar_position', v === '' ? undefined : Number(v))
        }
      />
      <TextInput
        label="Naam in menu"
        size="xs"
        w={180}
        value={
          typeof value.sidebar_label === 'string' ? value.sidebar_label : ''
        }
        onChange={(e) => set('sidebar_label', e.currentTarget.value)}
      />
      <TextInput
        label="Korte beschrijving"
        size="xs"
        style={{ flex: '1 1 220px' }}
        value={typeof value.description === 'string' ? value.description : ''}
        onChange={(e) => set('description', e.currentTarget.value)}
      />
      <Checkbox
        label="Inhoudsopgave verbergen"
        size="xs"
        checked={Boolean(value.hide_table_of_contents)}
        onChange={(e) =>
          set('hide_table_of_contents', e.currentTarget.checked || undefined)
        }
      />
    </Group>
  );
}

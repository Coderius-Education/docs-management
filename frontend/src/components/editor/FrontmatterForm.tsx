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
        label="sidebar_position"
        size="xs"
        w={130}
        value={(value.sidebar_position as number) ?? ''}
        onChange={(v) => set('sidebar_position', v === '' ? undefined : Number(v))}
      />
      <TextInput
        label="sidebar_label"
        size="xs"
        w={180}
        value={(value.sidebar_label as string) ?? ''}
        onChange={(e) => set('sidebar_label', e.currentTarget.value)}
      />
      <TextInput
        label="description"
        size="xs"
        style={{ flex: 1 }}
        value={(value.description as string) ?? ''}
        onChange={(e) => set('description', e.currentTarget.value)}
      />
      <Checkbox
        label="hide_table_of_contents"
        size="xs"
        checked={Boolean(value.hide_table_of_contents)}
        onChange={(e) => set('hide_table_of_contents', e.currentTarget.checked || undefined)}
      />
    </Group>
  );
}

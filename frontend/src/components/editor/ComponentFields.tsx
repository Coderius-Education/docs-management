import {
  Checkbox,
  NumberInput,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import type { ComponentModel } from '../../lib/authoring/components';
const labels: Record<string, string> = {
  code: 'Python-code',
  editable: 'Leerlingen mogen code aanpassen',
  rows: 'Aantal regels',
  packages: 'Extra Python-pakketten',
  mode: 'Uitvoermodus',
};
export function ComponentFields({
  model,
  onChange,
}: {
  model: ComponentModel;
  onChange: (name: string, value: string | number | boolean | string[]) => void;
}) {
  return (
    <Stack gap="xs">
      {Object.entries(model.fields).map(([name, field]) => (
        <div key={name}>
          {name === 'code' ? (
            <Textarea
              label={labels[name]}
              value={String(field.value)}
              autosize
              minRows={3}
              maxRows={18}
              styles={{ input: { fontFamily: 'monospace' } }}
              disabled={!field.editable}
              onChange={(e) => onChange(name, e.currentTarget.value)}
            />
          ) : typeof field.value === 'boolean' ? (
            <Checkbox
              label={labels[name]}
              checked={field.value}
              disabled={!field.editable}
              onChange={(e) => onChange(name, e.currentTarget.checked)}
            />
          ) : typeof field.value === 'number' ? (
            <NumberInput
              label={labels[name]}
              min={1}
              max={100}
              value={field.value}
              disabled={!field.editable}
              onChange={(value) => {
                if (typeof value === 'number') onChange(name, value);
              }}
            />
          ) : name === 'packages' && Array.isArray(field.value) ? (
            <PackagesInput
              value={field.value}
              disabled={!field.editable}
              onChange={(value) => onChange(name, value)}
            />
          ) : (
            <TextInput
              label={labels[name]}
              description={
                name === 'packages' ? 'Komma’s tussen pakketnamen' : undefined
              }
              value={
                Array.isArray(field.value)
                  ? field.value.join(', ')
                  : String(field.value)
              }
              disabled={!field.editable}
              onChange={(e) =>
                onChange(
                  name,
                  name === 'packages'
                    ? e.currentTarget.value
                        .split(',')
                        .map((v) => v.trim())
                        .filter(Boolean)
                    : e.currentTarget.value,
                )
              }
            />
          )}
          {!field.editable && (
            <Text size="xs" c="dimmed">
              Deze waarde gebruikt broncode. Die blijft ongewijzigd; bewerk haar
              via Broncode.
            </Text>
          )}
        </div>
      ))}
    </Stack>
  );
}

function PackagesInput({
  value,
  disabled,
  onChange,
}: {
  value: string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const text = value.join(', ');
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  return (
    <TextInput
      label="Extra Python-pakketten"
      description="Komma’s tussen pakketnamen"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={() =>
        onChange(
          draft
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        )
      }
    />
  );
}

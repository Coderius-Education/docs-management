import {
  Alert,
  Checkbox,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useState } from 'react';
import {
  codeModel,
  headingModel,
  updateCode,
  updateHeading,
} from '../../lib/authoring/content';
import type { LessonNode } from '../../lib/authoring/syntax';

export function CodeFields({
  source,
  node,
  onChange,
}: {
  source: string;
  node: LessonNode;
  onChange: (source: string) => void;
}) {
  const model = codeModel(node, source)!;
  const [error, setError] = useState('');
  const change = (changes: Parameters<typeof updateCode>[2]) => {
    try {
      onChange(updateCode(source, node, changes));
      setError('');
    } catch (cause) {
      setError(String(cause));
    }
  };
  return (
    <Stack gap="xs">
      <Group grow>
        <TextInput
          size="xs"
          label="Code-taal"
          value={model.language}
          onChange={(event) => change({ language: event.currentTarget.value })}
        />
        <TextInput
          size="xs"
          label="Titel van codevoorbeeld"
          value={model.title}
          onChange={(event) => change({ title: event.currentTarget.value })}
        />
      </Group>
      <TextInput
        size="xs"
        label="Gemarkeerde regels"
        placeholder="1,3-5"
        defaultValue={model.highlights}
        key={`${node.position?.start.offset}:${model.highlights}`}
        onBlur={(event) => change({ highlights: event.currentTarget.value })}
        description="Bijvoorbeeld 1,3-5. De wijziging wordt toegepast zodra je dit veld verlaat."
      />
      <Group>
        <Checkbox
          label="Regelnummers tonen"
          checked={model.lineNumbers}
          onChange={(event) =>
            change({ lineNumbers: event.currentTarget.checked })
          }
        />
        {model.lineNumbers && (
          <NumberInput
            size="xs"
            label="Eerste regelnummer"
            min={1}
            allowDecimal={false}
            value={model.lineNumberStart}
            onChange={(value) => {
              if (typeof value === 'number') change({ lineNumberStart: value });
            }}
          />
        )}
      </Group>
      <Textarea
        label="Code"
        autosize
        minRows={4}
        maxRows={30}
        value={model.code}
        styles={{ input: { fontFamily: 'monospace' } }}
        onChange={(event) => change({ code: event.currentTarget.value })}
      />
      {error && <Alert color="red">{error}</Alert>}
      <Text size="xs" c="dimmed">
        Overige code-instellingen blijven in de bron behouden.
      </Text>
    </Stack>
  );
}
export function HeadingFields({
  source,
  node,
  onChange,
}: {
  source: string;
  node: LessonNode;
  onChange: (source: string) => void;
}) {
  const model = headingModel(node, source)!;
  const [error, setError] = useState('');
  const change = (changes: Parameters<typeof updateHeading>[2]) => {
    try {
      onChange(updateHeading(source, node, changes));
      setError('');
    } catch (cause) {
      setError(String(cause));
    }
  };
  return (
    <Stack gap="xs">
      <Group grow>
        <TextInput
          label="Koptekst"
          size="xs"
          value={model.title}
          onChange={(event) => change({ title: event.currentTarget.value })}
        />
        <Select
          label="Kopniveau"
          size="xs"
          value={String(model.depth)}
          data={['1', '2', '3', '4', '5', '6']}
          onChange={(value) => {
            if (value) change({ depth: Number(value) });
          }}
        />
      </Group>
      <TextInput
        size="xs"
        label="Vast kop-ID"
        description="Voor directe links naar deze kop; leeg betekent automatisch."
        value={model.id}
        onChange={(event) => change({ id: event.currentTarget.value })}
      />
      {error && <Alert color="red">{error}</Alert>}
    </Stack>
  );
}

import {
  Badge,
  Card,
  Code,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';

import type { ConflictChoice, ConflictHunk } from '../api/git';
import { chosenText } from '../lib/concepts';

/**
 * One card per block where two versions changed the same lines. The teacher
 * picks "Jouw versie", the other version, or both, and can edit the result.
 */
export function ConflictResolver({
  file,
  hunks,
  choices,
  onChange,
  binary = false,
  wholeFile = false,
  oursLabel = 'Jouw versie',
  theirsLabel = 'Gepubliceerde versie',
}: {
  file?: string;
  hunks: ConflictHunk[];
  choices: Record<string, ConflictChoice>;
  onChange: (choices: Record<string, ConflictChoice>) => void;
  binary?: boolean;
  wholeFile?: boolean;
  oursLabel?: string;
  theirsLabel?: string;
}) {
  function choose(id: string, choice: ConflictChoice) {
    onChange({ ...choices, [id]: choice });
  }
  const options = [
    { value: 'ours', label: oursLabel },
    { value: 'theirs', label: theirsLabel },
    ...(wholeFile ? [] : [{ value: 'both', label: 'Beide' }]),
  ];

  return (
    <Stack gap="sm">
      {file && (
        <Text size="sm" fw={600}>
          {file}
        </Text>
      )}
      {hunks.map((hunk, index) => {
        const choice = choices[hunk.id];
        const segment = { ours: hunk.ours ?? '', theirs: hunk.theirs ?? '' };
        const result = chosenText(segment, choice);
        const mode = typeof choice === 'object' ? 'custom' : choice;
        return (
          <Card
            key={hunk.id}
            withBorder
            data-testid="conflict-block"
            aria-label={`Blok ${index + 1} van ${hunks.length}`}
          >
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={600}>
                Blok {index + 1} van {hunks.length}
              </Text>
              {choice === undefined ? (
                <Badge color="orange" variant="light">
                  Nog kiezen
                </Badge>
              ) : (
                <Badge color="green" variant="light">
                  Gekozen
                </Badge>
              )}
            </Group>
            {hunk.context_before && (
              <Code block c="dimmed" mb="xs">
                {hunk.context_before}
              </Code>
            )}
            {binary ? (
              <Text size="sm" mb="xs">
                Dit bestand is aan beide kanten veranderd en kan niet regel voor
                regel worden samengevoegd. Kies welke versie blijft.
              </Text>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2 }} mb="xs">
                <VersionBox
                  label={oursLabel}
                  text={hunk.ours}
                  deleted={hunk.ours_deleted}
                />
                <VersionBox
                  label={theirsLabel}
                  text={hunk.theirs}
                  deleted={hunk.theirs_deleted}
                />
              </SimpleGrid>
            )}
            <SegmentedControl
              aria-label={`Keuze voor blok ${index + 1}`}
              fullWidth
              value={mode === 'custom' ? '' : (mode ?? '')}
              onChange={(value) => choose(hunk.id, value as ConflictChoice)}
              data={options}
            />
            {!binary && choice !== undefined && (
              <Textarea
                mt="xs"
                label="Resultaat"
                description="Pas de tekst gerust nog aan."
                autosize
                minRows={2}
                maxRows={14}
                styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
                value={result ?? ''}
                onChange={(e) => choose(hunk.id, { custom: e.currentTarget.value })}
              />
            )}
            {hunk.context_after && (
              <Code block c="dimmed" mt="xs">
                {hunk.context_after}
              </Code>
            )}
          </Card>
        );
      })}
    </Stack>
  );
}

function VersionBox({
  label,
  text,
  deleted,
}: {
  label: string;
  text: string | null;
  deleted?: boolean;
}) {
  return (
    <div>
      <Text size="xs" c="dimmed" mb={4}>
        {label}
      </Text>
      {deleted ? (
        <Text size="sm" fs="italic">
          (verwijderd)
        </Text>
      ) : (
        <Code block style={{ whiteSpace: 'pre-wrap' }}>
          {text || ' '}
        </Code>
      )}
    </div>
  );
}

export function allChosen(
  hunks: { id: string }[],
  choices: Record<string, ConflictChoice>,
): boolean {
  return hunks.every((hunk) => choices[hunk.id] !== undefined);
}

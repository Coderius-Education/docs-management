import {
  Badge,
  Button,
  Group,
  SegmentedControl,
  Text,
  Title,
} from '@mantine/core';
import { IconMaximize, IconMinimize } from '@tabler/icons-react';
import { BlockMenu, type BlockKind } from './BlockMenu';

/** Plakt bovenaan de editor: alle knoppen voor indeling, weergave en opslaan. */
export function EditorToolbar({
  title,
  location,
  previewOrigin,
  conceptTitle,
  dirty,
  saveDisabled,
  onSave,
  mode,
  onModeChange,
  modeDisabled,
  blocks,
  focus,
  onToggleFocus,
}: {
  title: string;
  location: string;
  previewOrigin?: string;
  conceptTitle: string;
  dirty: boolean;
  saveDisabled: boolean;
  onSave: () => void;
  mode: string;
  onModeChange: (mode: string) => void;
  modeDisabled: boolean;
  /** Het menu 'Blok toevoegen'; weg als de pagina niet visueel te bewerken is. */
  blocks?: { site: string; disabled: boolean; onPick: (kind: BlockKind) => void };
  focus: boolean;
  onToggleFocus: () => void;
}) {
  return (
    <div className="editor-session-toolbar">
      <Group justify="space-between" gap="xs">
        <div>
          <Title order={focus ? 5 : 3}>{title}</Title>
          <Text size="xs" c="dimmed" className="editor-path">
            {location}
          </Text>
        </div>
        <Group gap="xs">
          {previewOrigin && (
            <Button
              size="xs"
              variant="subtle"
              component="a"
              href={previewOrigin}
              target="_blank"
              rel="noopener noreferrer"
            >
              Cursusvoorbeeld
            </Button>
          )}
          <Badge variant="light" maw={260} title={conceptTitle}>
            {conceptTitle}
          </Badge>
          <Text size="sm" role="status">
            {dirty ? 'Niet opgeslagen' : 'Opgeslagen'}
          </Text>
          <Button disabled={saveDisabled} onClick={onSave}>
            Opslaan…
          </Button>
        </Group>
      </Group>
      <Group justify="space-between" gap="xs" mt="xs">
        <Group gap="xs">
          <SegmentedControl
            size="xs"
            disabled={modeDisabled}
            aria-label="Editorweergave"
            value={mode}
            onChange={onModeChange}
            data={[
              { value: 'visual', label: 'Bewerken' },
              { value: 'preview', label: 'Voorbeeld' },
              { value: 'raw', label: 'Broncode' },
            ]}
          />
          {blocks && (
            <BlockMenu
              site={blocks.site}
              disabled={blocks.disabled}
              onPick={blocks.onPick}
            />
          )}
          {blocks && !blocks.disabled && (
            <Text size="xs" c="dimmed" visibleFrom="md">
              Selecteer tekst voor opmaak · / voor tekstblokken
            </Text>
          )}
        </Group>
        <Button
          size="xs"
          variant="default"
          leftSection={
            focus ? <IconMinimize size={14} /> : <IconMaximize size={14} />
          }
          onClick={onToggleFocus}
        >
          {focus ? 'Volledig scherm sluiten' : 'Volledig scherm'}
        </Button>
      </Group>
    </div>
  );
}

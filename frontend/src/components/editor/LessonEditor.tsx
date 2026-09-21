import {
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useMemo, useRef, useState } from 'react';
import {
  calloutTypes,
  parseLesson,
  replaceRange,
  updateContainer,
  type LessonBlock,
} from '../../lib/authoring/document';
import {
  componentModel,
  componentRegistry,
  insertComponent,
  updateComponent,
} from '../../lib/authoring/components';
import { persistentImage, type AssetContext } from '../../lib/authoring/assets';
import { WysiwygEditor, type MarkdownHandle } from './WysiwygEditor';
import { RawEditor } from './RawEditor';
import { ComponentFields } from './ComponentFields';
import './LessonEditor.css';
const calloutLabels: Record<string, string> = {
  tip: 'Tip',
  info: 'Informatie',
  note: 'Notitie',
  warning: 'Waarschuwing',
  caution: 'Let op',
  danger: 'Belangrijk',
};
const escapeText = (value: string) =>
  value.replace(/[\\*_[\]<>`{}]/g, '\\$&').replace(/\r?\n/g, ' ');

export function LessonEditor({
  value,
  site,
  onChange,
  inheritedImports = {},
  nested = false,
  onInsertComponent,
  assetContext = {},
}: {
  value: string;
  site: string;
  onChange: (value: string) => void;
  inheritedImports?: Record<string, string>;
  nested?: boolean;
  onInsertComponent?: (name: string, offset: number) => void;
  assetContext?: AssetContext;
}) {
  const doc = useMemo(() => parseLesson(value, site), [value, site]);
  const imports = { ...inheritedImports, ...doc.imports };
  const active = useRef<number | null>(null);
  const editors = useRef(new Map<number, MarkdownHandle>());
  const [sourceIndex, setSourceIndex] = useState<number | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [failure, setFailure] = useState('');
  function edit(block: LessonBlock, text: string) {
    onChange(replaceRange(value, block, text));
  }
  function position() {
    return active.current === null
      ? value.length
      : (doc.blocks[active.current]?.to ?? value.length);
  }
  function insertText(text: string, inline = false) {
    const editor =
      active.current === null ? undefined : editors.current.get(active.current);
    if (inline && editor) editor.insert(text);
    else {
      const pos = position();
      onChange(replaceRange(value, { from: pos, to: pos }, `\n\n${text}\n\n`));
    }
  }
  function addComponent(name: string) {
    try {
      if (onInsertComponent) onInsertComponent(name, position());
      else onChange(insertComponent(value, site, name, position()));
      setFailure('');
    } catch (err) {
      setFailure(String(err));
    }
  }
  const sourceBlock =
    sourceIndex === null ? undefined : doc.blocks[sourceIndex];
  return (
    <Stack
      gap="sm"
      className={
        nested ? 'lesson-editor lesson-editor-nested' : 'lesson-editor'
      }
    >
      {doc.error ? (
        <Alert color="orange" title="Deze bron heeft aandacht nodig">
          {doc.error}
          <Text size="sm">
            Je tekst blijft bewaard. Corrigeer de broncode om visueel verder te
            werken.
          </Text>
        </Alert>
      ) : (
        <>
          <Group justify="space-between">
            <Menu withinPortal>
              <Menu.Target>
                <Button size="xs" variant="light">
                  Blok toevoegen
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => insertText('Nieuwe tekst', true)}>
                  Tekst
                </Menu.Item>
                <Menu.Item onClick={() => insertText('## Nieuwe kop', true)}>
                  Kop
                </Menu.Item>
                <Menu.Item
                  onClick={() =>
                    insertText('```python\nprint("Hallo!")\n```', true)
                  }
                >
                  Codevoorbeeld
                </Menu.Item>
                <Menu.Item
                  onClick={() =>
                    insertText(
                      '| Kolom 1 | Kolom 2 |\n| --- | --- |\n| Inhoud | Inhoud |',
                      true,
                    )
                  }
                >
                  Tabel
                </Menu.Item>
                <Menu.Item
                  onClick={() =>
                    insertText(':::tip\nSchrijf hier je tip.\n:::')
                  }
                >
                  Tip (callout)
                </Menu.Item>
                <Menu.Item
                  onClick={() =>
                    insertText(':::info\nSchrijf hier je uitleg.\n:::')
                  }
                >
                  Informatie (callout)
                </Menu.Item>
                <Menu.Item
                  onClick={() =>
                    insertText(
                      '<details>\n<summary>Klik hier voor een tip</summary>\n\nSchrijf hier je tip.\n\n</details>',
                    )
                  }
                >
                  Uitklapbare tip
                </Menu.Item>
                <Menu.Item
                  onClick={() =>
                    insertText(
                      '<details>\n<summary>Klik hier voor de oplossing</summary>\n\n```python\n# Oplossing\n```\n\n</details>',
                    )
                  }
                >
                  Uitklapbare oplossing
                </Menu.Item>
                {componentRegistry
                  .filter((c) => c.site === site)
                  .map((c) => (
                    <Menu.Item
                      key={c.name}
                      onClick={() => addComponent(c.name)}
                    >
                      {c.label}
                    </Menu.Item>
                  ))}
                <Menu.Item onClick={() => setImageOpen(true)}>
                  Afbeelding via URL
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
            {!nested && (
              <Text size="xs" c="dimmed">
                Selecteer tekst voor opmaak · / voor tekstblokken
              </Text>
            )}
          </Group>
          {failure && <Alert color="red">{failure}</Alert>}
          {!doc.blocks.length && (
            <WysiwygEditor
              assetContext={assetContext}
              value={value}
              onChange={onChange}
            />
          )}
          {doc.blocks.map((block, index) => {
            const raw = value.slice(block.from, block.to);
            const model = componentModel(block.node, site, imports);
            const c = block.container;
            return (
              <div
                key={`${index}:${block.kind}:${block.node.name ?? ''}`}
                onFocusCapture={() => {
                  active.current = index;
                }}
              >
                {block.kind === 'markdown' ? (
                  <WysiwygEditor
                    assetContext={assetContext}
                    ref={(editor) => {
                      if (editor) editors.current.set(index, editor);
                      else editors.current.delete(index);
                    }}
                    value={raw}
                    onChange={(text) => edit(block, text)}
                  />
                ) : (
                  <Paper
                    withBorder
                    p="sm"
                    className={`lesson-block ${c ? `lesson-block-${c.type}` : ''}`}
                  >
                    <Group justify="space-between" mb="xs">
                      <Text fw={600} size="sm">
                        {model?.label ??
                          (c
                            ? c.type === 'details'
                              ? 'Uitklapbaar blok'
                              : calloutLabels[c.type]
                            : block.kind === 'imports'
                              ? 'Componentkoppelingen'
                              : (block.node.name ?? 'Bronblok'))}
                      </Text>
                      <Group gap="xs">
                        <Badge size="xs" variant="light">
                          {c || model ? 'Visueel' : 'Bron behouden'}
                        </Badge>
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          onClick={() => setSourceIndex(index)}
                        >
                          Bron bewerken
                        </Button>
                      </Group>
                    </Group>
                    {model ? (
                      <ComponentFields
                        model={model}
                        onChange={(name, next) =>
                          onChange(
                            updateComponent(
                              value,
                              block.node,
                              model,
                              name,
                              next,
                            ),
                          )
                        }
                      />
                    ) : c ? (
                      <Stack gap="xs">
                        {c.header && (
                          <Select
                            label="Soort blok"
                            value={c.type}
                            data={calloutTypes.map((type) => ({
                              value: type,
                              label: calloutLabels[type],
                            }))}
                            onChange={(type) => {
                              if (type)
                                onChange(
                                  replaceRange(
                                    value,
                                    c.header!,
                                    `${value.slice(c.header!.from, c.header!.to).match(/^:+/)?.[0] ?? ':::'}${type}${c.title ? `[${escapeText(c.title)}]` : ''}`,
                                  ),
                                );
                            }}
                          />
                        )}
                        <TextInput
                          label={
                            c.type === 'details'
                              ? 'Uitklaptitel'
                              : 'Titel (optioneel)'
                          }
                          value={c.title}
                          onChange={(e) => {
                            const title = escapeText(e.currentTarget.value);
                            onChange(
                              c.titleRange
                                ? replaceRange(value, c.titleRange, title)
                                : replaceRange(
                                    value,
                                    c.header!,
                                    `${value.slice(c.header!.from, c.header!.to).match(/^:+/)?.[0] ?? ':::'}${c.type}${title ? `[${title}]` : ''}`,
                                  ),
                            );
                          }}
                        />
                        <LessonEditor
                          nested
                          assetContext={assetContext}
                          onInsertComponent={(name, offset) => {
                            if (onInsertComponent)
                              onInsertComponent(name, c.body.from + offset);
                            else
                              onChange(
                                insertComponent(
                                  value,
                                  site,
                                  name,
                                  c.body.from + offset,
                                ),
                              );
                          }}
                          site={site}
                          value={value.slice(c.body.from, c.body.to)}
                          inheritedImports={imports}
                          onChange={(text) => {
                            onChange(updateContainer(value, block, text));
                          }}
                        />
                      </Stack>
                    ) : (
                      <Text size="sm" c="dimmed">
                        {block.kind === 'imports'
                          ? 'De bestaande imports blijven behouden. Nieuwe ondersteunde onderdelen worden automatisch gekoppeld.'
                          : 'Dit onderdeel blijft ongewijzigd. Je kunt de tekst eromheen visueel bewerken.'}
                      </Text>
                    )}
                  </Paper>
                )}
              </div>
            );
          })}
        </>
      )}
      <Modal
        opened={sourceBlock !== undefined}
        onClose={() => setSourceIndex(null)}
        title="Bron van dit blok"
        size="xl"
      >
        {sourceBlock && (
          <SourceBlock
            key={`${sourceIndex}:${sourceBlock.from}`}
            source={value.slice(sourceBlock.from, sourceBlock.to)}
            onApply={(text) => {
              edit(sourceBlock, text);
              setSourceIndex(null);
            }}
          />
        )}
      </Modal>
      <Modal
        opened={imageOpen}
        onClose={() => setImageOpen(false)}
        title="Afbeelding toevoegen"
      >
        <Stack>
          <Text size="sm">
            Gebruik een bestaande afbeelding op de cursuswebsite of een openbare
            HTTPS-URL. Lokale bestanden uploaden is nog niet beschikbaar.
          </Text>
          <TextInput
            label="Afbeeldings-URL"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.currentTarget.value)}
            placeholder="/img/voorbeeld.png"
          />
          <TextInput
            label="Alternatieve tekst"
            value={imageAlt}
            onChange={(e) => setImageAlt(e.currentTarget.value)}
          />
          <Button
            disabled={!persistentImage(imageUrl) || !imageAlt.trim()}
            onClick={() => {
              insertText(
                `![${escapeText(imageAlt)}](<${imageUrl.trim().replace(/[<>]/g, encodeURIComponent)}>)`,
                true,
              );
              setImageOpen(false);
            }}
          >
            Afbeelding invoegen
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
function SourceBlock({
  source,
  onApply,
}: {
  source: string;
  onApply: (value: string) => void;
}) {
  const [draft, setDraft] = useState(source);
  return (
    <Stack>
      <RawEditor value={draft} onChange={setDraft} />
      <Button onClick={() => onApply(draft)}>Wijzigingen toepassen</Button>
    </Stack>
  );
}

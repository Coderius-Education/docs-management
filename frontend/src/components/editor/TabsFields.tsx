import {
  Alert,
  Button,
  Checkbox,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  insertTab,
  removeTab,
  updateTabProperty,
  type TabsModel,
  type TabItemModel,
} from '../../lib/authoring/content';
import type { LessonNode } from '../../lib/authoring/syntax';

export function TabsFields({
  source,
  model,
  onChange,
  renderBody,
}: {
  source: string;
  model: TabsModel;
  onChange: (source: string) => void;
  renderBody: (item: TabItemModel) => ReactNode;
}) {
  const [error, setError] = useState('');
  const edit = (
    node: LessonNode,
    name: string,
    value: string | boolean | null | undefined,
  ) => {
    try {
      onChange(updateTabProperty(source, node, name, value));
      setError('');
    } catch (cause) {
      setError(String(cause));
    }
  };
  const dynamic =
    !model.groupId.editable ||
    !model.defaultValue.editable ||
    model.items.some((item) => !item.label.editable);
  const defaultValue = model.defaultValue.value;
  const choices = model.items
    .filter((item) => typeof item.value.value === 'string' && item.value.value)
    .map((item) => ({
      value: `tab:${item.value.value}`,
      label: String(item.label.value || item.value.value),
    }));
  return (
    <Stack gap="sm">
      {dynamic && (
        <Alert color="orange">
          Dynamische eigenschappen blijven in de bron behouden. De bijbehorende
          velden zijn vergrendeld.
        </Alert>
      )}
      {!model.canChangeItems && (
        <Alert color="orange">
          Deze groep heeft aanvullende kinderen of een eigen lijst met
          tabwaarden. Voeg tabbladen toe of verwijder ze via de bron.
        </Alert>
      )}
      <Group grow>
        <TextInput
          size="xs"
          label="Tabgroep-ID"
          description="Gelijke groepen onthouden samen de gekozen tab."
          disabled={!model.groupId.editable}
          value={
            typeof model.groupId.value === 'string' ? model.groupId.value : ''
          }
          onChange={(event) =>
            edit(model.node, 'groupId', event.currentTarget.value || undefined)
          }
        />
        <Select
          size="xs"
          label="Standaardtabblad"
          disabled={!model.defaultValue.editable}
          value={
            defaultValue === null
              ? 'none'
              : defaultValue
                ? `tab:${defaultValue}`
                : 'auto'
          }
          data={[
            { value: 'auto', label: 'Automatisch (bestaande standaard)' },
            { value: 'none', label: 'Geen tabblad geselecteerd' },
            ...choices.filter(
              (choice, index) =>
                choices.findIndex((other) => other.value === choice.value) ===
                index,
            ),
          ]}
          onChange={(value) =>
            edit(
              model.node,
              'defaultValue',
              value === 'auto'
                ? undefined
                : value === 'none'
                  ? null
                  : value?.slice(4),
            )
          }
        />
      </Group>
      <Checkbox
        label="Alleen het actieve tabblad laden (lazy)"
        checked={model.lazy.value === true}
        disabled={!model.lazy.editable}
        onChange={(event) =>
          edit(model.node, 'lazy', event.currentTarget.checked)
        }
      />
      <Group grow>
        <Select
          size="xs"
          label="Tabkeuze in URL"
          disabled={!model.queryString.editable}
          value={
            typeof model.queryString.value === 'string'
              ? 'custom'
              : model.queryString.value
                ? 'auto'
                : 'off'
          }
          data={[
            { value: 'off', label: 'Uit' },
            { value: 'auto', label: 'Automatische parameter' },
            { value: 'custom', label: 'Eigen parameter' },
          ]}
          onChange={(value) =>
            edit(
              model.node,
              'queryString',
              value === 'custom' ? 'tab' : value === 'auto',
            )
          }
        />
        {typeof model.queryString.value === 'string' && (
          <TextInput
            size="xs"
            label="URL-parameter"
            value={model.queryString.value}
            onChange={(event) =>
              edit(model.node, 'queryString', event.currentTarget.value)
            }
          />
        )}
      </Group>
      {model.items.map((item, index) => (
        <Stack
          key={`${index}:${String(item.value.value)}`}
          gap="xs"
          p="sm"
          style={{
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 6,
          }}
        >
          <Group justify="space-between">
            <Text size="sm" fw={600}>
              Tabblad {index + 1} · {String(item.value.value)}
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              color="red"
              disabled={
                !model.canChangeItems ||
                model.items.length < 2 ||
                model.defaultValue.value === item.value.value
              }
              onClick={() => {
                try {
                  onChange(removeTab(source, model, index));
                } catch (cause) {
                  setError(String(cause));
                }
              }}
            >
              Tabblad verwijderen
            </Button>
          </Group>
          <TextInput
            size="xs"
            label={`Label tabblad ${index + 1}`}
            disabled={!item.label.editable || !model.canChangeItems}
            value={typeof item.label.value === 'string' ? item.label.value : ''}
            onChange={(event) =>
              edit(item.node, 'label', event.currentTarget.value)
            }
          />
          {item.default.value === true && (
            <Text size="xs" c="dimmed">
              Bestaand standaardtabblad
            </Text>
          )}
          {item.body ? (
            renderBody(item)
          ) : (
            <Text size="xs" c="dimmed">
              Dit tabblad heeft geen bewerkbare inhoud; gebruik de bron.
            </Text>
          )}
        </Stack>
      ))}
      <Button
        size="xs"
        variant="light"
        disabled={!model.canChangeItems}
        onClick={() => {
          try {
            onChange(insertTab(source, model));
          } catch (cause) {
            setError(String(cause));
          }
        }}
      >
        Tabblad toevoegen
      </Button>
      {error && <Alert color="red">{error}</Alert>}
    </Stack>
  );
}

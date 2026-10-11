import { Button, Menu } from '@mantine/core';
import { componentRegistry } from '../../lib/authoring/components';

export type BlockKind =
  | 'text'
  | 'heading'
  | 'heading-id'
  | 'code'
  | 'tabs'
  | 'table'
  | 'tip'
  | 'info'
  | 'details-tip'
  | 'details-solution'
  | 'image'
  | { component: string };

const items: [BlockKind, string][] = [
  ['text', 'Tekst'],
  ['heading', 'Kop'],
  ['heading-id', 'Kop met vast ID'],
  ['code', 'Codevoorbeeld'],
  ['tabs', 'Tabbladen'],
  ['table', 'Tabel'],
  ['tip', 'Tip (callout)'],
  ['info', 'Informatie (callout)'],
  ['details-tip', 'Uitklapbare tip'],
  ['details-solution', 'Uitklapbare oplossing'],
];

export function BlockMenu({
  site,
  disabled,
  onPick,
}: {
  site: string;
  disabled?: boolean;
  onPick: (kind: BlockKind) => void;
}) {
  return (
    <Menu withinPortal>
      <Menu.Target>
        <Button size="xs" variant="light" disabled={disabled}>
          Blok toevoegen
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {items.map(([kind, label]) => (
          <Menu.Item key={label} onClick={() => onPick(kind)}>
            {label}
          </Menu.Item>
        ))}
        {componentRegistry
          .filter((c) => c.site === site)
          .map((c) => (
            <Menu.Item
              key={c.name}
              onClick={() => onPick({ component: c.name })}
            >
              {c.label}
            </Menu.Item>
          ))}
        <Menu.Item onClick={() => onPick('image')}>Afbeelding</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

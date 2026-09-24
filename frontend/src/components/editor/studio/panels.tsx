import {
  Alert,
  Button,
  Group,
  SegmentedControl,
  Stack,
  Text,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { readSetting } from '../../../lib/authoring/settings';
import {
  asFooterColumns,
  isLinkList,
  splitLinks,
  type LinkKind,
} from '../../../lib/authoring/navigation';
import { FooterLinks, NavigationLinks } from '../NavigationLinks';
import {
  ColorSetting,
  Origin,
  RangeSetting,
  SelectSetting,
  SwitchSetting,
  TextSetting,
  palettes,
  useSettings,
} from './fields';

// The panel header already names the panel; this explains what it changes.
function Heading({ hint }: { hint: string }) {
  return (
    <Text size="sm" c="dimmed">
      {hint}
    </Text>
  );
}

function LinksSetting({
  path,
  kind,
  label,
  highlight,
}: {
  path: string;
  kind: LinkKind;
  label: string;
  highlight?: number;
}) {
  const { merged, inherited, overridden, set } = useSettings();
  const current = readSetting(merged, path);
  const { own, shared } = splitLinks(current, kind);
  const change = (next: unknown[]) => set(path, next);
  return (
    <Origin path={path} label={label}>
      <Stack gap="xs">
        <Text size="sm" fw={500}>
          {label}
        </Text>
        {!inherited && !overridden(path) && (
          <Alert color="orange" p="xs">
            <Text size="xs">
              Er is nog geen cursusvoorbeeld, dus de huidige links zijn hier
              niet zichtbaar. Links die je hier toevoegt vervangen alle
              bestaande links van de cursus.
            </Text>
          </Alert>
        )}
        {current !== undefined && !isLinkList(current) ? (
          <NavigationLinks value={current} onChange={change} />
        ) : kind === 'navbar' ? (
          <NavigationLinks
            navbar
            value={own}
            highlight={highlight}
            onChange={change}
          />
        ) : (
          <FooterLinks value={asFooterColumns(own)} onChange={change} />
        )}
        {shared.length > 0 && (
          <Text size="xs" c="dimmed">
            Automatisch toegevoegd door Coderius:{' '}
            {shared
              .map((item) => String(item.label ?? item.title ?? ''))
              .join(', ')}
            .
          </Text>
        )}
      </Stack>
    </Origin>
  );
}

export function NavbarPanel({
  highlight,
  onAnnouncement,
}: {
  highlight?: number;
  onAnnouncement: () => void;
}) {
  const { current } = useSettings();
  return (
    <Stack gap="md">
      <Heading hint="De balk bovenaan elke pagina van de cursus." />
      <TextSetting path="themeConfig.navbar.title" label="Navigatietitel" />
      <TextSetting
        path="themeConfig.navbar.logo.src"
        label="Logo"
        placeholder="img/logo.svg"
        description="Een afbeelding uit de map static van de cursus, of een https-adres."
      />
      <TextSetting
        path="themeConfig.navbar.logo.srcDark"
        label="Logo in donkere weergave"
        placeholder="Zelfde als het logo"
      />
      <TextSetting
        path="themeConfig.navbar.logo.alt"
        label="Beschrijving van het logo"
      />
      <SelectSetting
        path="themeConfig.navbar.style"
        label="Stijl"
        placeholder="Licht (standaard)"
        data={[
          { value: 'primary', label: 'Cursuskleur' },
          { value: 'dark', label: 'Donker' },
        ]}
      />
      <SwitchSetting
        path="themeConfig.navbar.hideOnScroll"
        label="Verbergen tijdens scrollen"
      />
      <LinksSetting
        path="themeConfig.navbar.items"
        kind="navbar"
        label="Menu"
        highlight={highlight}
      />
      {!current('themeConfig.announcementBar.content') && (
        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={onAnnouncement}
        >
          Mededeling boven de koptekst
        </Button>
      )}
    </Stack>
  );
}

export function FooterPanel() {
  return (
    <Stack gap="md">
      <Heading hint="De balk onderaan elke pagina." />
      <SelectSetting
        path="themeConfig.footer.style"
        label="Stijl"
        data={[
          { value: 'light', label: 'Licht' },
          { value: 'dark', label: 'Donker' },
        ]}
      />
      <TextSetting
        path="themeConfig.footer.copyright"
        label="Copyrighttekst"
        multiline
      />
      <LinksSetting
        path="themeConfig.footer.links"
        kind="footer"
        label="Kolommen en links"
      />
    </Stack>
  );
}

export function AnnouncementPanel() {
  const { set, overridden } = useSettings();
  const path = 'themeConfig.announcementBar';
  return (
    <Stack gap="md">
      <Heading hint="Een balk boven de koptekst, bijvoorbeeld voor een nieuwe les of een deadline." />
      <TextSetting
        path={`${path}.content`}
        label="Tekst"
        placeholder="Nieuw: les 5 over recursie!"
        description="Eenvoudige HTML zoals <a href=…> mag."
        multiline
      />
      <ColorSetting path={`${path}.backgroundColor`} label="Achtergrondkleur" />
      <ColorSetting path={`${path}.textColor`} label="Tekstkleur" />
      <SwitchSetting
        path={`${path}.isCloseable`}
        label="Leerlingen mogen hem sluiten"
      />
      <TextSetting
        path={`${path}.id`}
        label="Kenmerk"
        placeholder="announcement-bar"
        description="Verander dit om een gesloten mededeling opnieuw te tonen."
      />
      {overridden(path) && (
        <Button
          color="red"
          variant="subtle"
          onClick={() => set(path, undefined)}
        >
          Eigen mededeling verwijderen
        </Button>
      )}
    </Stack>
  );
}

const fonts = [
  { value: 'system-ui, sans-serif', label: 'Systeemlettertype' },
  { value: 'Arial, sans-serif', label: 'Arial — helder' },
  { value: 'Verdana, sans-serif', label: 'Verdana — ruim' },
  { value: 'Georgia, serif', label: 'Georgia — klassiek' },
  { value: 'monospace', label: 'Monospace — technisch' },
];

export function StylePanel({
  colorMode,
  onColorMode,
}: {
  colorMode: 'light' | 'dark';
  onColorMode: (mode: 'light' | 'dark') => void;
}) {
  const { set } = useSettings();
  const token = (name: string) => `tokens.${colorMode}.${name}`;
  return (
    <Stack gap="md">
      <Heading hint="Kleuren en letters van de hele cursus." />
      <SegmentedControl
        aria-label="Weergave om aan te passen"
        value={colorMode}
        onChange={(next) => onColorMode(next as 'light' | 'dark')}
        data={[
          { value: 'light', label: 'Lichte weergave' },
          { value: 'dark', label: 'Donkere weergave' },
        ]}
      />
      <ColorSetting
        path={token('--ifm-color-primary')}
        label="Cursuskleur"
        fallback="#3578e5"
      />
      <Group gap={10} aria-label="Kleurkeuzes" role="group">
        {palettes.map((color) => (
          <button
            key={color}
            type="button"
            className="studio-swatch"
            aria-label={`Cursuskleur ${color}`}
            title={color}
            style={{ background: color }}
            onClick={() => set(token('--ifm-color-primary'), color)}
          />
        ))}
      </Group>
      <ColorSetting
        path={token('--ifm-background-color')}
        label="Pagina-achtergrond"
        fallback={colorMode === 'light' ? '#ffffff' : '#1b1b1d'}
      />
      <ColorSetting
        path={token('--ifm-font-color-base')}
        label="Tekstkleur"
        fallback={colorMode === 'light' ? '#1c1e21' : '#e3e3e3'}
      />
      <SelectSetting
        path={token('--ifm-font-family-base')}
        label="Lettertype"
        data={fonts}
      />
      <RangeSetting
        path={token('--ifm-font-size-base')}
        label="Tekstgrootte"
        min={12}
        max={24}
        fallback={16}
      />
      <SelectSetting
        path={token('--ifm-font-family-monospace')}
        label="Codelettertype"
        data={['monospace', 'Consolas, monospace', 'Courier New, monospace']}
      />
      <RangeSetting
        path={token('--ifm-container-width')}
        label="Inhoudsbreedte"
        min={720}
        max={1440}
        fallback={1140}
      />
      <RangeSetting
        path={token('--ifm-global-radius')}
        label="Afronding"
        min={0}
        max={24}
        fallback={6}
      />
      <Text size="xs" c="dimmed">
        Kleuren uit de eigen CSS van de cursus zie je hier niet; controleer ze
        in het cursusvoorbeeld.
      </Text>
    </Stack>
  );
}

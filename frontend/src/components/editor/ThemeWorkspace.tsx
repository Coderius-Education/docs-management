import {
  Alert,
  Button,
  ColorInput,
  Drawer,
  Group,
  Loader,
  Select,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useMemo, useState, type ReactNode } from 'react';
import { usePage, useSites } from '../../api/hooks';
import {
  changeSetting,
  readSetting,
  type SiteSettings,
} from '../../lib/authoring/settings';
import { previewSettings } from '../../lib/authoring/appearance';
import { splitFrontmatter } from '../../lib/frontmatter';
import { CourseCanvas } from './CourseCanvas';
import './ThemeWorkspace.css';

type Category = 'colors' | 'fonts' | 'navbar' | 'footer' | 'page';
const categories: { value: Category; label: string; mark: string }[] = [
  { value: 'colors', label: 'Kleuren', mark: '◒' },
  { value: 'fonts', label: 'Lettertypen', mark: 'Aa' },
  { value: 'navbar', label: 'Koptekst', mark: '▔' },
  { value: 'footer', label: 'Voettekst', mark: '▁' },
  { value: 'page', label: 'Pagina', mark: '▤' },
];
const palettes = [
  '#225588',
  '#3578e5',
  '#256a4c',
  '#763fa6',
  '#c24835',
  '#bd7800',
];
const fonts = [
  { value: 'system-ui, sans-serif', label: 'Systeemlettertype' },
  { value: 'Arial, sans-serif', label: 'Arial — helder' },
  { value: 'Verdana, sans-serif', label: 'Verdana — ruim' },
  { value: 'Georgia, serif', label: 'Georgia — klassiek' },
  { value: 'monospace', label: 'Monospace — technisch' },
];

export function ThemeWorkspace({
  value,
  savedValue,
  inherited,
  onChange,
  site,
  branch,
  previewUrl,
  advanced,
  disabled = false,
}: {
  value: SiteSettings;
  savedValue: SiteSettings;
  inherited?: Record<string, unknown>;
  onChange: (value: SiteSettings) => void;
  site: string;
  branch: string;
  previewUrl?: string;
  advanced: ReactNode;
  disabled?: boolean;
}) {
  const [category, setCategory] = useState<Category>('page');
  const [colorMode, setColorMode] = useState<'light' | 'dark'>('light');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedVisited, setAdvancedVisited] = useState(false);
  const narrow = useMediaQuery('(max-width: 900px)');
  const homepage = usePage(site, 'homepage.mdx', branch, 'homepage');
  const { data: sites } = useSites();
  const preview = useMemo(
    () => previewSettings(inherited, value, savedValue),
    [inherited, value, savedValue],
  );
  const effective = preview.settings;
  const homepageBody = useMemo(
    () => (homepage.data ? splitFrontmatter(homepage.data.content).body : ''),
    [homepage.data?.content],
  );
  const choose = (next: Category) => {
    setCategory(next);
    setDrawerOpen(true);
  };
  const current = (path: string, fallback = '') => {
    const result =
      readSetting(effective, path) ??
      (path.startsWith('tokens.dark.')
        ? readSetting(effective, path.replace('tokens.dark.', 'tokens.light.'))
        : undefined);
    return typeof result === 'string' ? result : fallback;
  };
  const set = (path: string, next: unknown) =>
    onChange(changeSetting(value, path, next));
  const token = (name: string) => `tokens.${colorMode}.${name}`;
  function field(path: string, label: string, control: ReactNode) {
    const overridden = readSetting(value, path) !== undefined;
    return (
      <div className="theme-field" key={path}>
        {control}
        <div className="theme-field-origin">
          <span>{overridden ? 'Aangepast' : 'Overgenomen'}</span>
          {overridden && (
            <button
              type="button"
              aria-label={`${label} overnemen`}
              onClick={() => set(path, undefined)}
            >
              Overnemen ↶
            </button>
          )}
        </div>
      </div>
    );
  }
  function textField(path: string, label: string, placeholder?: string) {
    return field(
      path,
      label,
      <TextInput
        label={label}
        value={current(path)}
        placeholder={placeholder ?? 'Overnemen uit cursus'}
        onChange={(event) => set(path, event.currentTarget.value || undefined)}
      />,
    );
  }
  function colorField(name: string, label: string, fallback: string) {
    const path = token(name);
    return field(
      path,
      label,
      <ColorInput
        label={label}
        value={current(path)}
        placeholder={fallback}
        swatches={palettes}
        onChange={(next) => set(path, next || undefined)}
      />,
    );
  }
  function rangeField(
    name: string,
    label: string,
    min: number,
    max: number,
    fallback: number,
    unit = 'px',
  ) {
    const path = token(name);
    const raw = current(path);
    const numeric = raw.endsWith(unit) ? Number.parseFloat(raw) : fallback;
    const amount = Number.isFinite(numeric)
      ? Math.max(min, Math.min(max, numeric))
      : fallback;
    return field(
      path,
      label,
      <label className="theme-range">
        <span>
          {label}
          <output>{raw || `${fallback}${unit}`}</output>
        </span>
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          value={amount}
          onChange={(event) => set(path, `${event.currentTarget.value}${unit}`)}
        />
      </label>,
    );
  }
  const controls = (
    <fieldset className="theme-controls" disabled={disabled}>
      <Stack gap="md">
        <div>
          <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
            Vormgeving aanpassen
          </Text>
          <Text fw={700} size="lg">
            {categories.find((item) => item.value === category)?.label}
          </Text>
        </div>
        {category === 'colors' && (
          <>
            <Text size="sm" c="dimmed">
              Deze kleuren gelden voor de{' '}
              {colorMode === 'light' ? 'lichte' : 'donkere'} weergave.
            </Text>
            {colorField('--ifm-color-primary', 'Primaire kleur', '#3578e5')}
            <div className="theme-palette" aria-label="Kleurkeuzes">
              {palettes.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Primaire kleur ${color}`}
                  title={color}
                  style={{ background: color }}
                  onClick={() => set(token('--ifm-color-primary'), color)}
                />
              ))}
            </div>
            {colorField(
              '--ifm-background-color',
              'Pagina-achtergrond',
              colorMode === 'light' ? '#ffffff' : '#1b1b1d',
            )}
            {colorField(
              '--ifm-font-color-base',
              'Tekstkleur',
              colorMode === 'light' ? '#222222' : '#eeeeee',
            )}
          </>
        )}
        {category === 'fonts' && (
          <>
            {field(
              token('--ifm-font-family-base'),
              'Lettertype',
              <Select
                label="Lettertype"
                placeholder="Overnemen uit cursus"
                clearable
                data={
                  current(token('--ifm-font-family-base')) &&
                  !fonts.some(
                    (font) =>
                      font.value === current(token('--ifm-font-family-base')),
                  )
                    ? [
                        ...fonts,
                        {
                          value: current(token('--ifm-font-family-base')),
                          label: current(token('--ifm-font-family-base')),
                        },
                      ]
                    : fonts
                }
                value={current(token('--ifm-font-family-base')) || null}
                onChange={(next) =>
                  set(token('--ifm-font-family-base'), next ?? undefined)
                }
              />,
            )}
            {rangeField('--ifm-font-size-base', 'Tekstgrootte', 12, 24, 16)}
            {field(
              token('--ifm-font-family-monospace'),
              'Codelettertype',
              <Select
                label="Codelettertype"
                placeholder="Overnemen uit cursus"
                clearable
                data={[
                  'monospace',
                  'Consolas, monospace',
                  'Courier New, monospace',
                ]}
                value={current(token('--ifm-font-family-monospace')) || null}
                onChange={(next) =>
                  set(token('--ifm-font-family-monospace'), next ?? undefined)
                }
              />,
            )}
          </>
        )}
        {category === 'navbar' && (
          <>
            {textField('themeConfig.navbar.title', 'Navigatietitel')}
            {textField('themeConfig.navbar.logo.src', 'Logo', '/img/logo.svg')}
            {textField(
              'themeConfig.navbar.logo.alt',
              'Logo alternatieve tekst',
            )}
            {field(
              'themeConfig.navbar.style',
              'Navigatiestijl',
              <Select
                label="Navigatiestijl"
                placeholder="Overnemen"
                clearable
                data={[
                  { value: 'primary', label: 'Primaire kleur' },
                  { value: 'dark', label: 'Donker' },
                ]}
                value={current('themeConfig.navbar.style') || null}
                onChange={(next) =>
                  set('themeConfig.navbar.style', next ?? undefined)
                }
              />,
            )}
            <Text size="xs" c="dimmed">
              Navigatielinks bewerk je onder Geavanceerd → Navigatie.
            </Text>
          </>
        )}
        {category === 'footer' && (
          <>
            {textField('themeConfig.footer.copyright', 'Copyrighttekst')}
            {field(
              'themeConfig.footer.style',
              'Voettekststijl',
              <Select
                label="Voettekststijl"
                placeholder="Overnemen"
                clearable
                data={[
                  { value: 'light', label: 'Licht' },
                  { value: 'dark', label: 'Donker' },
                ]}
                value={current('themeConfig.footer.style') || null}
                onChange={(next) =>
                  set('themeConfig.footer.style', next ?? undefined)
                }
              />,
            )}
            <Text size="xs" c="dimmed">
              Kolommen en links bewerk je onder Geavanceerd → Voettekst.
            </Text>
          </>
        )}
        {category === 'page' && (
          <>
            {textField('site.title', 'Sitetitel')}
            {textField('site.tagline', 'Ondertitel')}
            <Text size="xs" c="dimmed">
              Een eigen titel in een startpaginasectie wijzig je bij
              Startpagina.
            </Text>
            {rangeField(
              '--ifm-container-width',
              'Inhoudsbreedte',
              720,
              1440,
              1140,
            )}
            {rangeField('--ifm-global-radius', 'Afronding', 0, 24, 6)}
          </>
        )}
        <div className="theme-panel-note">
          Wijzigingen verschijnen direct op de pagina. Met Overnemen verwijder
          je alleen je eigen aanpassing.
        </div>
      </Stack>
    </fieldset>
  );

  return (
    <div className="theme-workspace">
      <div className="theme-toolbar">
        <div className="theme-categories" aria-label="Vormgevingsonderdelen">
          {categories.map((item) => (
            <button
              type="button"
              key={item.value}
              aria-label={item.label}
              aria-pressed={category === item.value}
              onClick={() => choose(item.value)}
            >
              <span aria-hidden="true">{item.mark}</span>
              {item.label}
            </button>
          ))}
        </div>
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          onClick={() => {
            setAdvancedVisited(true);
            setAdvancedOpen(true);
          }}
        >
          Geavanceerd
        </Button>
      </div>
      <div className="theme-preview-toolbar">
        <Text size="sm" c="dimmed">
          Klik op de pagina om de vormgeving aan te passen
        </Text>
        <Group gap="xs">
          <SegmentedControl
            aria-label="Voorbeeldkleur"
            size="xs"
            value={colorMode}
            onChange={(next) => setColorMode(next as 'light' | 'dark')}
            data={[
              { value: 'light', label: 'Licht' },
              { value: 'dark', label: 'Donker' },
            ]}
          />
          <SegmentedControl
            aria-label="Voorbeeldformaat"
            size="xs"
            value={device}
            onChange={(next) => setDevice(next as 'desktop' | 'mobile')}
            data={[
              { value: 'desktop', label: 'Desktop' },
              { value: 'mobile', label: 'Mobiel' },
            ]}
          />
        </Group>
      </div>
      <div className="theme-stage">
        <div className="theme-page-stage" data-testid="theme-canvas">
          <div className="theme-browser-bar">
            <span aria-hidden="true">● ● ●</span>
            <span>
              {sites?.find((item) => item.slug === site)?.domain ?? site} ·
              startpagina
            </span>
          </div>
          {homepage.isLoading ? (
            <Loader aria-label="Startpagina laden" m="xl" />
          ) : homepage.data ? (
            <CourseCanvas
              body={homepageBody}
              assetContext={{
                site,
                branch,
                scope: 'homepage',
                path: 'homepage.mdx',
                previewOrigin: previewUrl,
                domain: sites?.find((item) => item.slug === site)?.domain,
              }}
              settings={effective}
              colorMode={colorMode}
              device={device}
              onSelectRegion={(region) =>
                choose(
                  region === 'hero'
                    ? 'colors'
                    : region === 'content'
                      ? 'fonts'
                      : region,
                )
              }
            />
          ) : (
            <Alert color="orange" m="md">
              Startpagina niet beschikbaar. Je kunt de vormgeving wel aanpassen;
              controleer de pagina in het cursusvoorbeeld.
            </Alert>
          )}
        </div>
        {!narrow && (
          <aside
            className="theme-control-panel"
            aria-label="Contextuele vormgeving"
          >
            {controls}
          </aside>
        )}
      </div>
      {preview.needsBuild && (
        <Text size="xs" c="dimmed" mt="sm">
          Een opgeslagen aanpassing is teruggezet. Maak een nieuw
          cursusvoorbeeld om de overgenomen waarde te zien.
        </Text>
      )}
      <div className="theme-preview-footnote">
        <Text size="xs" c="dimmed">
          Voorbeeld van de startpagina. Bestaande cursus-CSS en interactieve
          onderdelen kunnen in de build afwijken.
        </Text>
        {previewUrl && (
          <Button
            component="a"
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="subtle"
            size="xs"
          >
            Cursusvoorbeeld openen ↗
          </Button>
        )}
      </div>
      <Drawer
        opened={!!narrow && drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Vormgeving"
        position="bottom"
        size="75%"
        closeButtonProps={{ 'aria-label': 'Bediening sluiten' }}
      >
        {controls}
      </Drawer>
      <Drawer
        opened={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        title="Geavanceerde vormgeving"
        position="right"
        size="lg"
        keepMounted
        closeButtonProps={{ 'aria-label': 'Geavanceerd sluiten' }}
      >
        {advancedVisited && advanced}
      </Drawer>
    </div>
  );
}

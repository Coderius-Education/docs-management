import { Accordion, Alert, Stack, Text } from '@mantine/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { parseSettings } from '../../../lib/authoring/settings';
import { RawEditor } from '../RawEditor';
import {
  NumberSetting,
  SelectSetting,
  SwitchSetting,
  TagsSetting,
  TextSetting,
  useSettings,
} from './fields';

/** The whole site-settings.json, for values without a visual control. */
function SettingsSource() {
  const { value, onChange } = useSettings();
  const serialized = JSON.stringify(value, null, 2);
  const [text, setText] = useState(serialized);
  const [error, setError] = useState('');
  const emitted = useRef(serialized);
  // Only replace the text for changes made elsewhere, so the cursor stays put while typing.
  useEffect(() => {
    if (serialized !== emitted.current) {
      emitted.current = serialized;
      setText(serialized);
      setError('');
    }
  }, [serialized]);
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        Alleen de eigen aanpassingen van deze cursus. Wat hier ontbreekt, komt
        uit de cursusconfiguratie.
      </Text>
      <div className="studio-source">
        <RawEditor
          language="json"
          height="360px"
          value={text}
          onChange={(next) => {
            setText(next);
            try {
              const parsed = parseSettings(next);
              emitted.current = JSON.stringify(parsed, null, 2);
              setError('');
              onChange(parsed);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        />
      </div>
      {error && (
        <Alert color="red" p="xs">
          {error} Je wijziging telt pas mee als de JSON klopt.
        </Alert>
      )}
    </Stack>
  );
}

export function SitePanel({
  page,
  section,
  onSection,
}: {
  /** Settings of the homepage file itself. */
  page: ReactNode;
  section: string | null;
  onSection: (section: string | null) => void;
}) {
  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Instellingen die je niet op de pagina zelf ziet.
      </Text>
      <Accordion variant="separated" value={section} onChange={onSection}>
        <Accordion.Item value="page">
          <Accordion.Control>Deze pagina</Accordion.Control>
          <Accordion.Panel>{page}</Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="site">
          <Accordion.Control>Naam en zoekmachines</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <TextSetting path="site.title" label="Naam van de cursus" />
              <TextSetting path="site.tagline" label="Ondertitel" />
              <TextSetting
                path="site.description"
                label="Beschrijving voor zoekmachines"
                multiline
              />
              <TagsSetting path="site.keywords" label="Zoekwoorden" join />
              <TextSetting
                path="site.favicon"
                label="Tabbladicoon"
                placeholder="img/favicon.ico"
              />
              <TextSetting
                path="site.image"
                label="Afbeelding bij delen"
                placeholder="img/social-card.png"
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="colorMode">
          <Accordion.Control>Licht en donker</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <SelectSetting
                path="themeConfig.colorMode.defaultMode"
                label="Standaardweergave"
                data={[
                  { value: 'light', label: 'Licht' },
                  { value: 'dark', label: 'Donker' },
                ]}
              />
              <SwitchSetting
                path="themeConfig.colorMode.respectPrefersColorScheme"
                label="Voorkeur van het apparaat volgen"
              />
              <SwitchSetting
                path="themeConfig.colorMode.disableSwitch"
                label="Schakelaar voor licht/donker verbergen"
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="docs">
          <Accordion.Control>Lesnavigatie</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <SwitchSetting
                path="themeConfig.docs.sidebar.hideable"
                label="Zijmenu kan worden ingeklapt"
              />
              <SwitchSetting
                path="themeConfig.docs.sidebar.autoCollapseCategories"
                label="Andere hoofdstukken automatisch inklappen"
              />
              <SwitchSetting path="docs.breadcrumbs" label="Kruimelpad tonen" />
              <SwitchSetting
                path="docs.showLastUpdateTime"
                label="Datum van laatste wijziging tonen"
              />
              <SwitchSetting
                path="docs.showLastUpdateAuthor"
                label="Auteur van laatste wijziging tonen"
              />
              <NumberSetting
                path="themeConfig.tableOfContents.minHeadingLevel"
                label="Inhoudsopgave vanaf kopniveau"
                min={2}
                max={6}
              />
              <NumberSetting
                path="themeConfig.tableOfContents.maxHeadingLevel"
                label="Inhoudsopgave tot en met kopniveau"
                min={2}
                max={6}
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="code">
          <Accordion.Control>Codevoorbeelden</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <SelectSetting
                path="themeConfig.prism.theme"
                label="Codekleuren in lichte weergave"
                unknownLabel="Eigen keuze van de cursus"
                data={[
                  'github',
                  'vsLight',
                  'oneLight',
                  'duotoneLight',
                  'gruvboxMaterialLight',
                ]}
              />
              <SelectSetting
                path="themeConfig.prism.darkTheme"
                label="Codekleuren in donkere weergave"
                unknownLabel="Eigen keuze van de cursus"
                data={[
                  'dracula',
                  'vsDark',
                  'nightOwl',
                  'oneDark',
                  'duotoneDark',
                  'palenight',
                ]}
              />
              <TagsSetting
                path="themeConfig.prism.additionalLanguages"
                label="Extra programmeertalen"
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="source">
          <Accordion.Control>Broncode</Accordion.Control>
          <Accordion.Panel>
            {section === 'source' && <SettingsSource />}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}

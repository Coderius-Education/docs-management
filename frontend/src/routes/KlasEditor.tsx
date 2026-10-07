import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Checkbox,
  CopyButton,
  Grid,
  Group,
  Loader,
  Menu,
  Modal,
  NavLink,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowDown,
  IconArrowUp,
  IconBook,
  IconCheck,
  IconCopy,
  IconDots,
  IconExternalLink,
  IconFileText,
  IconLink,
  IconPlus,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { ApiError } from '../api/client';
import { useSites } from '../api/hooks';
import {
  type KlasDetail,
  type KlasInhoud,
  type KlasItem,
  type ManifestItem,
  useArchiveer,
  useBewaarKlas,
  useDupliceerKlas,
  useHoofdstukken,
  useKlas,
  useNieuweCode,
  useVerwijderKlas,
  useZetDocenten,
} from '../api/klassen';
import type { SiteInfo } from '../api/types';
import {
  herstelHoofdstukken,
  inKlasVolgorde,
  instellingVan,
  sidebarNaam,
  verdwenenHoofdstukken,
  verouderdeLessen,
  verplaatsGroep,
  verplaatsHoofdstuk,
  verplaatsItem,
  verwijderGroep,
  verwijderItem,
  voegGroepToe,
  voegItemToe,
  zetGroepTitel,
  zetItemLabel,
  zetZichtbaar,
} from '../lib/klassen';

const VERBORGEN_UITLEG =
  'Verborgen hoofdstukken zijn alleen uit de navigatie gehaald; de inhoud blijft openbaar en vindbaar via zoeken, vorige/volgende en directe links.';

export function KlasEditor() {
  const id = Number(useParams().id);
  const { data: klas, isLoading, error } = useKlas(id);

  if (isLoading) return <Loader />;
  if (error || !klas) {
    return (
      <Alert color="red" title="Klas niet gevonden">
        Deze klas bestaat niet (meer). <Anchor component={Link} to="/klassen">Naar alle klassen</Anchor>
      </Alert>
    );
  }
  // Remount the editor when another version arrives (reload after a conflict).
  return <Bewerker key={`${klas.id}:${klas.versie}`} klas={klas} />;
}

function Bewerker({ klas }: { klas: KlasDetail }) {
  const { data: sites } = useSites();
  const [naam, setNaam] = useState(klas.naam);
  const [inhoud, setInhoud] = useState<KlasInhoud>(klas.inhoud);
  const [conflict, setConflict] = useState(false);
  const bewaar = useBewaarKlas(klas.id);
  const alleenLezen = klas.rol === 'geen';
  const vakSites = useMemo(
    () => (sites ?? []).filter((s) => s.subject === klas.vak),
    [sites, klas.vak],
  );
  const gewijzigd =
    naam !== klas.naam || JSON.stringify(inhoud) !== JSON.stringify(klas.inhoud);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!gewijzigd) return undefined;
    const waarschuw = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', waarschuw);
    return () => window.removeEventListener('beforeunload', waarschuw);
  }, [gewijzigd]);

  async function opslaan() {
    try {
      await bewaar.mutateAsync({ naam: naam.trim() || klas.naam, inhoud, versie: klas.versie });
      notifications.show({ color: 'green', message: 'Opgeslagen; leerlingen zien het meteen.' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(true);
      else notifications.show({ color: 'red', message: (e as Error).message });
    }
  }

  return (
    <Stack gap="md">
      <Kop
        klas={klas}
        naam={naam}
        setNaam={setNaam}
        alleenLezen={alleenLezen}
        gewijzigd={gewijzigd}
        opslaan={opslaan}
        bezig={bewaar.isPending}
      />
      {conflict && <ConflictMelding klasId={klas.id} />}
      {alleenLezen && (
        <Alert color="blue">
          Dit is een klas van {klas.eigenaar?.name ?? klas.eigenaar?.login}. Je kunt hem bekijken
          en dupliceren; bewerken kan de eigenaar of een mededocent.
        </Alert>
      )}
      {klas.gearchiveerd && (
        <Alert color="gray">Gearchiveerd: leerlingen zien deze klas niet meer.</Alert>
      )}

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Stack gap="md">
            <Paper withBorder p="md">
              <Textarea
                label="Welkomsttekst"
                description="Staat bovenaan de klaspagina."
                placeholder="Welkom! We beginnen deze periode met Python."
                autosize
                minRows={2}
                maxLength={2000}
                value={inhoud.intro}
                onChange={(e) => setInhoud({ ...inhoud, intro: e.currentTarget.value })}
                disabled={alleenLezen}
              />
            </Paper>
            <Groepen
              inhoud={inhoud}
              setInhoud={setInhoud}
              vakSites={vakSites}
              alleenLezen={alleenLezen}
            />
            <HoofdstukkenPerCursus
              inhoud={inhoud}
              setInhoud={setInhoud}
              vakSites={vakSites}
              alleenLezen={alleenLezen}
            />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Stack gap="md">
            <Delen klas={klas} />
            <Docenten klas={klas} />
            <Voorbeeld naam={naam} inhoud={inhoud} sites={vakSites} />
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

function Kop({
  klas,
  naam,
  setNaam,
  alleenLezen,
  gewijzigd,
  opslaan,
  bezig,
}: {
  klas: KlasDetail;
  naam: string;
  setNaam: (naam: string) => void;
  alleenLezen: boolean;
  gewijzigd: boolean;
  opslaan: () => void;
  bezig: boolean;
}) {
  const navigate = useNavigate();
  const dupliceer = useDupliceerKlas();
  const archiveer = useArchiveer(klas.id);
  const verwijder = useVerwijderKlas();
  const [verwijderOpen, setVerwijderOpen] = useState(false);
  const eigenaar = klas.rol === 'eigenaar';

  async function kopie() {
    const nieuw = await dupliceer.mutateAsync(klas.id);
    navigate(`/klassen/${nieuw.id}`);
  }

  return (
    <Group justify="space-between" align="flex-end" wrap="wrap">
      <Stack gap={4} style={{ flex: 1, minWidth: 260 }}>
        <Anchor component={Link} to="/klassen" size="sm">
          ← Klassen
        </Anchor>
        {alleenLezen ? (
          <Title order={3}>{klas.naam}</Title>
        ) : (
          <TextInput
            aria-label="Naam van de klas"
            value={naam}
            onChange={(e) => setNaam(e.currentTarget.value)}
            maxLength={100}
            size="md"
            styles={{ input: { fontWeight: 700, fontSize: 20 } }}
          />
        )}
      </Stack>
      <Group gap="xs">
        {!alleenLezen && (
          <Button onClick={opslaan} loading={bezig} disabled={!gewijzigd || !naam.trim()}>
            {gewijzigd ? 'Opslaan' : 'Opgeslagen'}
          </Button>
        )}
        <Button
          variant={alleenLezen ? 'filled' : 'default'}
          leftSection={<IconCopy size={14} />}
          onClick={kopie}
          loading={dupliceer.isPending}
        >
          Dupliceren
        </Button>
        {eigenaar && (
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label="Meer acties">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => archiveer.mutate(klas.gearchiveerd)}>
                {klas.gearchiveerd ? 'Terugzetten' : 'Archiveren'}
              </Menu.Item>
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => setVerwijderOpen(true)}
              >
                Verwijderen
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
      <Modal opened={verwijderOpen} onClose={() => setVerwijderOpen(false)} title="Klas verwijderen?">
        <Text size="sm" mb="md">
          “{klas.naam}” verdwijnt voor jou en je mededocenten, en de link werkt niet meer.
          Archiveren kan ook: dan kun je hem later terugzetten.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setVerwijderOpen(false)}>
            Annuleren
          </Button>
          <Button
            color="red"
            loading={verwijder.isPending}
            onClick={async () => {
              await verwijder.mutateAsync(klas.id);
              navigate('/klassen');
            }}
          >
            Verwijderen
          </Button>
        </Group>
      </Modal>
    </Group>
  );
}

function ConflictMelding({ klasId }: { klasId: number }) {
  const { refetch, isFetching } = useKlas(klasId);
  return (
    <Alert color="orange" title="Een collega heeft deze klas gewijzigd">
      <Text size="sm" mb="xs">
        Jouw wijzigingen zijn niet opgeslagen. Laad de nieuwste versie en doe ze opnieuw.
      </Text>
      <Button
        size="xs"
        variant="light"
        leftSection={<IconRefresh size={14} />}
        loading={isFetching}
        onClick={() => refetch()}
      >
        Nieuwste versie laden
      </Button>
    </Alert>
  );
}

function siteNaam(sites: SiteInfo[], slug: string) {
  return sites.find((s) => s.slug === slug)?.display_name ?? slug;
}

function Groepen({
  inhoud,
  setInhoud,
  vakSites,
  alleenLezen,
}: {
  inhoud: KlasInhoud;
  setInhoud: (inhoud: KlasInhoud) => void;
  vakSites: SiteInfo[];
  alleenLezen: boolean;
}) {
  const [lesVoor, setLesVoor] = useState<string | null>(null);
  const [linkVoor, setLinkVoor] = useState<string | null>(null);

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="xs">
        <div>
          <Title order={5}>Snelkoppelingen</Title>
          <Text size="xs" c="dimmed">
            Cursussen, lessen en links, in groepen zoals “Periode 1” of “Deze week”.
          </Text>
        </div>
        {!alleenLezen && (
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={() => setInhoud(voegGroepToe(inhoud))}
          >
            Groep
          </Button>
        )}
      </Group>

      {inhoud.groepen.length === 0 && (
        <Text size="sm" c="dimmed">
          Nog geen groepen. Begin met een groep en zet er de cursussen van deze klas in.
        </Text>
      )}

      <Stack gap="sm">
        {inhoud.groepen.map((groep, gi) => (
          <Paper key={groep.id} withBorder p="sm" bg="var(--mantine-color-default-hover)">
            <Group gap="xs" mb="xs" wrap="nowrap">
              <TextInput
                aria-label="Titel van de groep"
                placeholder="Titel (mag leeg)"
                value={groep.titel}
                onChange={(e) => setInhoud(zetGroepTitel(inhoud, groep.id, e.currentTarget.value))}
                maxLength={100}
                disabled={alleenLezen}
                style={{ flex: 1 }}
              />
              {!alleenLezen && (
                <>
                  <ActionIcon
                    variant="subtle"
                    aria-label="Groep omhoog"
                    disabled={gi === 0}
                    onClick={() => setInhoud(verplaatsGroep(inhoud, groep.id, -1))}
                  >
                    <IconArrowUp size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    aria-label="Groep omlaag"
                    disabled={gi === inhoud.groepen.length - 1}
                    onClick={() => setInhoud(verplaatsGroep(inhoud, groep.id, 1))}
                  >
                    <IconArrowDown size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label="Groep verwijderen"
                    onClick={() => setInhoud(verwijderGroep(inhoud, groep.id))}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </>
              )}
            </Group>

            <Stack gap={6}>
              {groep.items.map((item, ii) => (
                <ItemRegel
                  key={ii}
                  item={item}
                  sites={vakSites}
                  alleenLezen={alleenLezen}
                  eerste={ii === 0}
                  laatste={ii === groep.items.length - 1}
                  zetLabel={(label) => setInhoud(zetItemLabel(inhoud, groep.id, ii, label))}
                  verplaats={(delta) => setInhoud(verplaatsItem(inhoud, groep.id, ii, delta))}
                  verwijder={() => setInhoud(verwijderItem(inhoud, groep.id, ii))}
                />
              ))}
            </Stack>

            {!alleenLezen && (
              <Group gap="xs" mt="xs">
                <Menu>
                  <Menu.Target>
                    <Button size="compact-sm" variant="subtle" leftSection={<IconBook size={14} />}>
                      Cursus
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {vakSites.map((site) => (
                      <Menu.Item
                        key={site.slug}
                        onClick={() =>
                          setInhoud(voegItemToe(inhoud, groep.id, { type: 'cursus', site: site.slug }))
                        }
                      >
                        {site.display_name}
                      </Menu.Item>
                    ))}
                  </Menu.Dropdown>
                </Menu>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  leftSection={<IconFileText size={14} />}
                  onClick={() => setLesVoor(groep.id)}
                >
                  Les
                </Button>
                <Button
                  size="compact-sm"
                  variant="subtle"
                  leftSection={<IconLink size={14} />}
                  onClick={() => setLinkVoor(groep.id)}
                >
                  Link
                </Button>
              </Group>
            )}
          </Paper>
        ))}
      </Stack>

      <LesKiezer
        opened={lesVoor !== null}
        onClose={() => setLesVoor(null)}
        sites={vakSites}
        kies={(item) => {
          if (lesVoor) setInhoud(voegItemToe(inhoud, lesVoor, item));
          setLesVoor(null);
        }}
      />
      <LinkModal
        opened={linkVoor !== null}
        onClose={() => setLinkVoor(null)}
        voegToe={(item) => {
          if (linkVoor) setInhoud(voegItemToe(inhoud, linkVoor, item));
          setLinkVoor(null);
        }}
      />
    </Paper>
  );
}

function ItemRegel({
  item,
  sites,
  alleenLezen,
  eerste,
  laatste,
  zetLabel,
  verplaats,
  verwijder,
}: {
  item: KlasItem;
  sites: SiteInfo[];
  alleenLezen: boolean;
  eerste: boolean;
  laatste: boolean;
  zetLabel: (label: string) => void;
  verplaats: (delta: number) => void;
  verwijder: () => void;
}) {
  const Icoon = item.type === 'cursus' ? IconBook : item.type === 'pagina' ? IconFileText : IconLink;
  const soort =
    item.type === 'cursus'
      ? 'Cursus'
      : item.type === 'pagina'
        ? `Les uit ${siteNaam(sites, item.site)}`
        : new URL(item.url).hostname;
  return (
    <Group gap="xs" wrap="nowrap">
      <Icoon size={16} style={{ flexShrink: 0 }} aria-hidden />
      <TextInput
        size="xs"
        aria-label="Naam van de snelkoppeling"
        style={{ flex: 1 }}
        value={item.label ?? ''}
        placeholder={item.type === 'cursus' ? siteNaam(sites, item.site) : undefined}
        onChange={(e) => zetLabel(e.currentTarget.value)}
        maxLength={100}
        disabled={alleenLezen}
        rightSectionWidth={140}
        rightSection={
          <Text size="xs" c="dimmed" truncate maw={130}>
            {soort}
          </Text>
        }
      />
      {!alleenLezen && (
        <>
          <ActionIcon size="sm" variant="subtle" aria-label="Omhoog" disabled={eerste} onClick={() => verplaats(-1)}>
            <IconArrowUp size={14} />
          </ActionIcon>
          <ActionIcon size="sm" variant="subtle" aria-label="Omlaag" disabled={laatste} onClick={() => verplaats(1)}>
            <IconArrowDown size={14} />
          </ActionIcon>
          <ActionIcon size="sm" variant="subtle" color="red" aria-label="Weghalen" onClick={verwijder}>
            <IconTrash size={14} />
          </ActionIcon>
        </>
      )}
    </Group>
  );
}

function ManifestBoom({
  items,
  kies,
}: {
  items: ManifestItem[];
  kies: (item: ManifestItem) => void;
}) {
  return (
    <>
      {items.map((item, i) =>
        item.type === 'category' ? (
          <NavLink
            key={i}
            label={item.label}
            childrenOffset={12}
          >
            <ManifestBoom items={item.items ?? []} kies={kies} />
          </NavLink>
        ) : item.type === 'doc' ? (
          <NavLink
            key={i}
            label={item.label}
            leftSection={<IconFileText size={14} />}
            onClick={() => kies(item)}
          />
        ) : null,
      )}
    </>
  );
}

function LesKiezer({
  opened,
  onClose,
  sites,
  kies,
}: {
  opened: boolean;
  onClose: () => void;
  sites: SiteInfo[];
  kies: (item: KlasItem) => void;
}) {
  const [site, setSite] = useState<string | null>(null);
  const gekozen = site ?? sites[0]?.slug ?? null;
  const { data, isLoading } = useHoofdstukken(opened ? gekozen : null);
  const sidebars = data?.manifest?.sidebars ?? {};

  return (
    <Modal opened={opened} onClose={onClose} title="Les toevoegen" size="lg">
      <Stack>
        <Select
          label="Cursus"
          data={sites.map((s) => ({ value: s.slug, label: s.display_name }))}
          value={gekozen}
          onChange={setSite}
          allowDeselect={false}
        />
        {isLoading ? (
          <Loader size="sm" />
        ) : !data?.manifest ? (
          <Alert color="yellow">
            Van deze cursus is nog geen lessenlijst. Die komt mee met de volgende publicatie van de
            cursus.
          </Alert>
        ) : (
          <ScrollArea.Autosize mah={420}>
            {Object.entries(sidebars).map(([naam, items]) => (
              <Box key={naam} mb="sm">
                {Object.keys(sidebars).length > 1 && (
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>
                    {sidebarNaam(naam)}
                  </Text>
                )}
                <ManifestBoom
                  items={items}
                  kies={(item) =>
                    gekozen &&
                    item.docId &&
                    item.href &&
                    kies({
                      type: 'pagina',
                      site: gekozen,
                      docId: item.docId,
                      pad: item.href,
                      label: item.label,
                    })
                  }
                />
              </Box>
            ))}
          </ScrollArea.Autosize>
        )}
      </Stack>
    </Modal>
  );
}

function LinkModal({
  opened,
  onClose,
  voegToe,
}: {
  opened: boolean;
  onClose: () => void;
  voegToe: (item: KlasItem) => void;
}) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const geldig = /^https:\/\/[^\s/\\]+\S*$/.test(url.trim());

  function bevestig() {
    voegToe({ type: 'link', url: url.trim(), label: label.trim() || url.trim() });
    setLabel('');
    setUrl('');
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Link toevoegen">
      <Stack>
        <TextInput
          label="Naam"
          placeholder="Opdracht inleveren"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          maxLength={100}
          data-autofocus
        />
        <TextInput
          label="Adres"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          error={url && !geldig ? 'Een link begint met https://' : undefined}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Annuleren
          </Button>
          <Button onClick={bevestig} disabled={!geldig}>
            Toevoegen
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function HoofdstukkenPerCursus({
  inhoud,
  setInhoud,
  vakSites,
  alleenLezen,
}: {
  inhoud: KlasInhoud;
  setInhoud: (inhoud: KlasInhoud) => void;
  vakSites: SiteInfo[];
  alleenLezen: boolean;
}) {
  // Courses in the class first: those are the ones a teacher usually trims.
  const inKlas = new Set(
    inhoud.groepen.flatMap((g) => g.items.filter((i) => i.type === 'cursus').map((i) => i.site)),
  );
  const volgorde = [...vakSites].sort(
    (a, b) => Number(inKlas.has(b.slug)) - Number(inKlas.has(a.slug)),
  );
  const [site, setSite] = useState<string | null>(null);
  const gekozen = site ?? volgorde[0]?.slug ?? null;
  const { data, isLoading } = useHoofdstukken(gekozen);
  const manifest = data?.manifest;
  const instelling = gekozen ? instellingVan(inhoud, gekozen) : { volgorde: [], verborgen: [] };
  const aangepast = gekozen ? gekozen in inhoud.cursussen : false;
  const verdwenen = manifest ? verdwenenHoofdstukken(instelling, manifest.sidebars) : [];
  const oud = manifest && gekozen ? verouderdeLessen(inhoud, gekozen, manifest.sidebars) : [];

  return (
    <Paper withBorder p="md">
      <Title order={5}>Hoofdstukken per cursus</Title>
      <Text size="xs" c="dimmed" mb="sm">
        Kies welke hoofdstukken leerlingen van deze klas in de navigatie van een cursus zien, en in
        welke volgorde. {VERBORGEN_UITLEG}
      </Text>
      <Group align="flex-end" mb="sm">
        <Select
          label="Cursus"
          data={volgorde.map((s) => ({
            value: s.slug,
            label: `${s.display_name}${s.slug in inhoud.cursussen ? ' • aangepast' : ''}`,
          }))}
          value={gekozen}
          onChange={setSite}
          allowDeselect={false}
          style={{ flex: 1 }}
        />
        {aangepast && !alleenLezen && gekozen && (
          <Button variant="default" onClick={() => setInhoud(herstelHoofdstukken(inhoud, gekozen))}>
            Alles tonen
          </Button>
        )}
      </Group>

      {isLoading ? (
        <Loader size="sm" />
      ) : !manifest ? (
        <Alert color="yellow">
          Van deze cursus is nog geen hoofdstukkenlijst. Die komt mee met de volgende publicatie van
          de cursus.
        </Alert>
      ) : (
        <Stack gap="xs">
          {manifest.stale && (
            <Text size="xs" c="dimmed">
              Lijst uit een eerdere publicatie; nieuwe hoofdstukken kunnen nog ontbreken.
            </Text>
          )}
          {verdwenen.length > 0 && (
            <Alert color="yellow" p="xs">
              {verdwenen.length} hoofdstuk{verdwenen.length === 1 ? '' : 'ken'} uit deze klas
              bestaa{verdwenen.length === 1 ? 't' : 'n'} niet meer in de cursus. Leerlingen merken
              er niets van; “Alles tonen” ruimt het op.
            </Alert>
          )}
          {oud.length > 0 && (
            <Alert color="yellow" p="xs">
              Deze lessen staan niet meer in de cursus: {oud.join(', ')}. Haal ze weg of kies ze
              opnieuw.
            </Alert>
          )}
          {Object.entries(manifest.sidebars).map(([naam, items]) => {
            const lijst = inKlasVolgorde(items, instelling);
            return (
              <Box key={naam}>
                {Object.keys(manifest.sidebars).length > 1 && (
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>
                    {sidebarNaam(naam)}
                  </Text>
                )}
                <Stack gap={2}>
                  {lijst.map((item, i) => {
                    const sleutel = item.key;
                    const zichtbaar = !sleutel || !instelling.verborgen.includes(sleutel);
                    return (
                      <Group key={sleutel ?? i} gap="xs" wrap="nowrap">
                        <Checkbox
                          checked={zichtbaar}
                          disabled={alleenLezen || !sleutel}
                          aria-label={`${item.label} tonen`}
                          onChange={(e) =>
                            gekozen &&
                            sleutel &&
                            setInhoud(zetZichtbaar(inhoud, gekozen, sleutel, e.currentTarget.checked))
                          }
                        />
                        <Text size="sm" style={{ flex: 1 }} c={zichtbaar ? undefined : 'dimmed'} td={zichtbaar ? undefined : 'line-through'}>
                          {item.label}
                        </Text>
                        {!alleenLezen && sleutel && gekozen && (
                          <>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              aria-label={`${item.label} omhoog`}
                              disabled={i === 0}
                              onClick={() =>
                                setInhoud(verplaatsHoofdstuk(inhoud, gekozen, items, sleutel, -1))
                              }
                            >
                              <IconArrowUp size={14} />
                            </ActionIcon>
                            <ActionIcon
                              size="sm"
                              variant="subtle"
                              aria-label={`${item.label} omlaag`}
                              disabled={i === lijst.length - 1}
                              onClick={() =>
                                setInhoud(verplaatsHoofdstuk(inhoud, gekozen, items, sleutel, 1))
                              }
                            >
                              <IconArrowDown size={14} />
                            </ActionIcon>
                          </>
                        )}
                      </Group>
                    );
                  })}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}

function Delen({ klas }: { klas: KlasDetail }) {
  const nieuweCode = useNieuweCode(klas.id);
  const [bevestig, setBevestig] = useState(false);
  const magBewerken = klas.rol !== 'geen';
  return (
    <Paper withBorder p="md">
      <Title order={5} mb={4}>
        Link voor leerlingen
      </Title>
      <Text size="xs" c="dimmed" mb="sm">
        Iedereen met deze link ziet de klas. Leerlingen hebben geen account nodig.
      </Text>
      {klas.url ? (
        <Group gap="xs" wrap="nowrap">
          <TextInput readOnly value={klas.url} style={{ flex: 1 }} aria-label="Link naar de klas" />
          <CopyButton value={klas.url}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Gekopieerd' : 'Kopiëren'}>
                <ActionIcon variant="light" size="lg" onClick={copy} aria-label="Link kopiëren">
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
          <ActionIcon
            component="a"
            href={klas.url}
            target="_blank"
            rel="noopener noreferrer"
            variant="light"
            size="lg"
            aria-label="Klaspagina openen"
          >
            <IconExternalLink size={16} />
          </ActionIcon>
        </Group>
      ) : (
        <Text size="sm">Dit vak heeft nog geen adres.</Text>
      )}
      {magBewerken && (
        <Group mt="sm" gap="xs">
          {bevestig ? (
            <>
              <Text size="xs">De oude link werkt daarna niet meer.</Text>
              <Button
                size="compact-xs"
                color="orange"
                loading={nieuweCode.isPending}
                onClick={async () => {
                  await nieuweCode.mutateAsync(undefined);
                  setBevestig(false);
                }}
              >
                Nieuwe link maken
              </Button>
              <Button size="compact-xs" variant="default" onClick={() => setBevestig(false)}>
                Annuleren
              </Button>
            </>
          ) : (
            <Button size="compact-xs" variant="subtle" onClick={() => setBevestig(true)}>
              Link uitgelekt? Maak een nieuwe
            </Button>
          )}
        </Group>
      )}
    </Paper>
  );
}

function Docenten({ klas }: { klas: KlasDetail }) {
  const zet = useZetDocenten(klas.id);
  const [logins, setLogins] = useState(klas.docenten);
  const eigenaar = klas.rol === 'eigenaar';
  const gewijzigd = JSON.stringify(logins) !== JSON.stringify(klas.docenten);

  async function bewaar() {
    try {
      const nieuw = await zet.mutateAsync(logins);
      setLogins(nieuw.docenten);
      notifications.show({ color: 'green', message: 'Mededocenten bijgewerkt' });
    } catch (e) {
      notifications.show({ color: 'red', message: (e as Error).message });
    }
  }

  return (
    <Paper withBorder p="md">
      <Title order={5} mb={4}>
        Docenten
      </Title>
      <Text size="sm" mb="xs">
        Eigenaar: {klas.eigenaar?.name ?? klas.eigenaar?.login}
      </Text>
      {eigenaar ? (
        <>
          <TagsInput
            label="Mededocenten"
            description="GitHub-namen van collega’s; zij mogen deze klas ook bewerken."
            placeholder="GitHub-naam en Enter"
            value={logins}
            onChange={setLogins}
            maxTags={20}
            clearable
          />
          {gewijzigd && (
            <Group justify="flex-end" mt="xs">
              <Button size="xs" onClick={bewaar} loading={zet.isPending}>
                Mededocenten opslaan
              </Button>
            </Group>
          )}
        </>
      ) : (
        <Group gap={6}>
          {klas.docenten.length === 0 ? (
            <Text size="sm" c="dimmed">
              Geen mededocenten.
            </Text>
          ) : (
            klas.docenten.map((login) => (
              <Badge key={login} variant="light">
                {login}
              </Badge>
            ))
          )}
        </Group>
      )}
    </Paper>
  );
}

/** Rough mirror of the class page on the vak host, so teachers see the result. */
function Voorbeeld({
  naam,
  inhoud,
  sites,
}: {
  naam: string;
  inhoud: KlasInhoud;
  sites: SiteInfo[];
}) {
  return (
    <Paper withBorder p="md">
      <Text size="xs" c="dimmed" mb="xs">
        Zo ziet de klaspagina eruit
      </Text>
      <Text size="xs" c="dimmed">
        Klas
      </Text>
      <Title order={4}>{naam || 'Naamloze klas'}</Title>
      {inhoud.intro && (
        <Text size="sm" c="dimmed" mt={4} style={{ whiteSpace: 'pre-line' }}>
          {inhoud.intro}
        </Text>
      )}
      {inhoud.groepen.map((groep) => (
        <Box key={groep.id} mt="sm">
          {groep.titel && (
            <Text fw={600} size="sm" mb={4}>
              {groep.titel}
            </Text>
          )}
          <SimpleGrid cols={2} spacing={6}>
            {groep.items.map((item, i) => (
              <Paper
                key={i}
                withBorder
                p={8}
                radius="md"
              >
                <Text size="10px" c="dimmed">
                  {item.type === 'cursus'
                    ? 'Cursus'
                    : item.type === 'pagina'
                      ? `Les uit ${siteNaam(sites, item.site)}`
                      : new URL(item.url).hostname}
                </Text>
                <Text size="xs" fw={600} lineClamp={2}>
                  {item.type === 'cursus' ? item.label || siteNaam(sites, item.site) : item.label}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Box>
      ))}
    </Paper>
  );
}

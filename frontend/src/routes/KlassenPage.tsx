import {
  Anchor,
  Avatar,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCopy, IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { useMe, useSubjects } from '../api/hooks';
import {
  type KlasSamenvatting,
  useDupliceerKlas,
  useKlassen,
  useNieuweKlas,
} from '../api/klassen';

type Tab = 'mijn' | 'gedeeld' | 'alle';

export function KlassenPage() {
  const { data: klassen, isLoading } = useKlassen();
  const { data: subjects } = useSubjects();
  const [tab, setTab] = useState<Tab>('mijn');
  const [nieuwOpen, setNieuwOpen] = useState(false);

  const lijsten = useMemo(() => {
    const alle = klassen ?? [];
    return {
      mijn: alle.filter((k) => k.rol === 'eigenaar'),
      gedeeld: alle.filter((k) => k.rol === 'docent'),
      alle,
    };
  }, [klassen]);
  const vakNaam = (slug: string) => subjects?.find((s) => s.slug === slug)?.display_name ?? slug;

  return (
    <>
      <Group justify="space-between" mb="xs">
        <Title order={3}>Klassen</Title>
        <Button leftSection={<IconPlus size={14} />} onClick={() => setNieuwOpen(true)}>
          Nieuwe klas
        </Button>
      </Group>
      <Text c="dimmed" size="sm" mb="md" maw={720}>
        Stel per klas samen wat leerlingen zien: welke cursussen, snelkoppelingen naar lessen en
        links, en welke hoofdstukken in de navigatie staan. Leerlingen openen de klas met een link;
        een account hebben ze niet nodig.
      </Text>

      <NieuweKlasModal opened={nieuwOpen} onClose={() => setNieuwOpen(false)} />

      <Tabs value={tab} onChange={(value) => setTab((value as Tab) ?? 'mijn')} mb="md">
        <Tabs.List>
          <Tabs.Tab value="mijn">Mijn klassen ({lijsten.mijn.length})</Tabs.Tab>
          <Tabs.Tab value="gedeeld">Gedeeld met mij ({lijsten.gedeeld.length})</Tabs.Tab>
          <Tabs.Tab value="alle">Alle klassen ({lijsten.alle.length})</Tabs.Tab>
        </Tabs.List>
      </Tabs>

      <Paper withBorder>
        {isLoading ? (
          <Loader m="md" />
        ) : lijsten[tab].length === 0 ? (
          <Text c="dimmed" p="md">
            {tab === 'mijn'
              ? 'Je hebt nog geen klassen. Maak er een, of dupliceer een klas van een collega.'
              : tab === 'gedeeld'
                ? 'Nog geen klassen van collega’s waarin jij mededocent bent.'
                : 'Er zijn nog geen klassen.'}
          </Text>
        ) : (
          <KlassenTabel klassen={lijsten[tab]} vakNaam={vakNaam} toonEigenaar={tab !== 'mijn'} />
        )}
      </Paper>
    </>
  );
}

function KlassenTabel({
  klassen,
  vakNaam,
  toonEigenaar,
}: {
  klassen: KlasSamenvatting[];
  vakNaam: (slug: string) => string;
  toonEigenaar: boolean;
}) {
  const dupliceer = useDupliceerKlas();
  const navigate = useNavigate();

  async function kopie(id: number) {
    try {
      const klas = await dupliceer.mutateAsync(id);
      notifications.show({ color: 'green', message: `Gedupliceerd als “${klas.naam}”` });
      navigate(`/klassen/${klas.id}`);
    } catch (e) {
      notifications.show({ color: 'red', message: (e as Error).message });
    }
  }

  return (
    <Table highlightOnHover>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Klas</Table.Th>
          <Table.Th>Vak</Table.Th>
          {toonEigenaar && <Table.Th>Eigenaar</Table.Th>}
          <Table.Th>Snelkoppelingen</Table.Th>
          <Table.Th />
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {klassen.map((klas) => (
          <Table.Tr key={klas.id}>
            <Table.Td>
              <Group gap="xs">
                <Anchor component={Link} to={`/klassen/${klas.id}`}>
                  {klas.naam}
                </Anchor>
                {klas.gearchiveerd && (
                  <Badge color="gray" variant="light">
                    Gearchiveerd
                  </Badge>
                )}
              </Group>
            </Table.Td>
            <Table.Td>{vakNaam(klas.vak)}</Table.Td>
            {toonEigenaar && (
              <Table.Td>
                <Group gap={6} wrap="nowrap">
                  <Avatar src={klas.eigenaar?.avatar_url} size="xs" radius="xl" />
                  <Text size="sm">{klas.eigenaar?.name ?? klas.eigenaar?.login}</Text>
                </Group>
              </Table.Td>
            )}
            <Table.Td>{klas.aantal_items}</Table.Td>
            <Table.Td>
              <Button
                size="compact-sm"
                variant="subtle"
                leftSection={<IconCopy size={14} />}
                loading={dupliceer.isPending && dupliceer.variables === klas.id}
                onClick={() => kopie(klas.id)}
              >
                Dupliceren
              </Button>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function NieuweKlasModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { data: subjects } = useSubjects();
  const { data: me } = useMe();
  const nieuw = useNieuweKlas();
  const navigate = useNavigate();
  const [naam, setNaam] = useState('');
  const [vak, setVak] = useState<string | null>(null);
  const gekozenVak = vak ?? subjects?.[0]?.slug ?? null;

  async function maak() {
    if (!gekozenVak || !naam.trim()) return;
    try {
      const klas = await nieuw.mutateAsync({ vak: gekozenVak, naam: naam.trim() });
      onClose();
      setNaam('');
      navigate(`/klassen/${klas.id}`);
    } catch (e) {
      notifications.show({ color: 'red', message: (e as Error).message });
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Nieuwe klas">
      <Stack>
        <TextInput
          label="Naam"
          description="Leerlingen zien deze naam bovenaan de klaspagina."
          placeholder="4H informatica"
          value={naam}
          onChange={(e) => setNaam(e.currentTarget.value)}
          maxLength={100}
          data-autofocus
        />
        <Select
          label="Vak"
          description="Een klas hoort bij één vak; de link staat op het adres van dat vak."
          data={(subjects ?? []).map((s) => ({ value: s.slug, label: s.display_name }))}
          value={gekozenVak}
          onChange={setVak}
          allowDeselect={false}
        />
        {me && (
          <Text size="xs" c="dimmed">
            Jij wordt eigenaar. Collega’s kun je daarna als mededocent toevoegen.
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Annuleren
          </Button>
          <Button onClick={maak} loading={nieuw.isPending} disabled={!naam.trim() || !gekozenVak}>
            Klas maken
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

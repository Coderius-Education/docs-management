import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Loader,
  Modal,
  Radio,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import {
  createContext,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useLinkIndex, type LinkPage, type LinkSite } from '../../api/links';
import {
  formatSiteUrl,
  parseSiteUrl,
  searchPages,
} from '../../lib/authoring/siteLinks';

export interface SiteLinkRequest {
  /** De geselecteerde tekst: de eerste zoekterm. */
  text: string;
  /** De huidige link op de selectie, om een site:-link te kunnen wijzigen. */
  href?: string;
}
export type RequestSiteLink = (request: SiteLinkRequest) => Promise<string | null>;

/** Opent de kiezer en geeft de gekozen `site:`-URL terug, of null bij annuleren. */
export const SiteLinkContext = createContext<RequestSiteLink | null>(null);

export function SiteLinkProvider({
  site,
  children,
}: {
  /** De site die je bewerkt: die komt bovenaan de resultaten. */
  site: string;
  children: ReactNode;
}) {
  const [request, setRequest] = useState<SiteLinkRequest | null>(null);
  const resolver = useRef<((url: string | null) => void) | null>(null);
  const open = useCallback<RequestSiteLink>((next) => {
    resolver.current?.(null);
    setRequest(next);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  function close(url: string | null) {
    resolver.current?.(url);
    resolver.current = null;
    setRequest(null);
  }
  return (
    <SiteLinkContext.Provider value={open}>
      {children}
      <Modal
        opened={request !== null}
        onClose={() => close(null)}
        title="Link naar pagina"
        size="lg"
      >
        {request && (
          <SiteLinkPicker current={site} request={request} onDone={close} />
        )}
      </Modal>
    </SiteLinkContext.Provider>
  );
}

function SiteLinkPicker({
  current,
  request,
  onDone,
}: {
  current: string;
  request: SiteLinkRequest;
  onDone: (url: string | null) => void;
}) {
  const { data: index, isLoading, error } = useLinkIndex();
  const existing = request.href ? parseSiteUrl(request.href) : null;
  const [query, setQuery] = useState(existing ? '' : request.text);
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const [chosen, setChosen] = useState<{ site: LinkSite; page: LinkPage } | null>(
    null,
  );
  const [anchor, setAnchor] = useState(existing?.anchor ?? '');
  const [manual, setManual] = useState(false);
  const [manualSite, setManualSite] = useState<string | null>(
    existing?.site ?? current,
  );
  const [manualRoute, setManualRoute] = useState(existing?.route ?? '/docs/');

  // Een bestaande site:-link opent op zijn eigen pagina.
  const preselected = useMemo(() => {
    if (!existing || !index) return null;
    const site = index.sites.find((s) => s.site === existing.site);
    const route = existing.route.replace(/\/+$/, '') || '/';
    const page = site?.pages.find((p) => p.path === route);
    return site && page ? { site, page } : null;
  }, [index, existing?.site, existing?.route]);
  const selection = chosen ?? preselected;

  const hits = useMemo(
    () =>
      index && query.trim()
        ? searchPages(index, query, {
            current,
            site: siteFilter ?? undefined,
          })
        : [],
    [index, query, current, siteFilter],
  );
  const siteOptions = useMemo(
    () =>
      [...(index?.sites ?? [])]
        .sort((a, b) =>
          a.site === current ? -1 : b.site === current ? 1 : a.label.localeCompare(b.label),
        )
        .map((s) => ({ value: s.site, label: s.label })),
    [index, current],
  );

  const url = manual
    ? manualSite && manualRoute.startsWith('/')
      ? formatSiteUrl({ site: manualSite, route: manualRoute, anchor: anchor || undefined })
      : null
    : selection
      ? formatSiteUrl({
          site: selection.site.site,
          route: selection.page.path,
          anchor: anchor || undefined,
        })
      : null;
  const valid = url !== null && parseSiteUrl(url) !== null;

  return (
    <Stack>
      {error && (
        <Alert color="orange">
          De paginalijst kon niet laden. Vul het pad handmatig in.
        </Alert>
      )}
      {!manual && (
        <>
          <Group grow align="flex-end">
            <TextInput
              label="Zoek een pagina"
              placeholder="Titel, pad of kop"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              data-autofocus
            />
            <Select
              label="Cursus"
              placeholder="Alle cursussen"
              clearable
              value={siteFilter}
              onChange={setSiteFilter}
              data={siteOptions}
            />
          </Group>
          {isLoading && <Loader size="sm" aria-label="Pagina's laden" />}
          {index && query.trim() && (
            <ScrollArea.Autosize mah={260} type="auto">
              <Stack gap={2} role="listbox" aria-label="Pagina's">
                {hits.length === 0 && (
                  <Text size="sm" c="dimmed">
                    Geen pagina gevonden.
                  </Text>
                )}
                {hits.map((hit) => {
                  const active =
                    selection?.site.site === hit.site.site &&
                    selection.page.path === hit.page.path;
                  return (
                    <UnstyledButton
                      key={`${hit.site.site}${hit.page.path}`}
                      role="option"
                      aria-selected={active}
                      className="site-link-hit"
                      data-active={active || undefined}
                      onClick={() => {
                        setChosen({ site: hit.site, page: hit.page });
                        setAnchor(hit.heading?.[0] ?? '');
                      }}
                    >
                      <Group gap="xs" wrap="nowrap">
                        <Badge size="xs" variant="light">
                          {hit.site.label}
                        </Badge>
                        <Text size="sm" fw={500} truncate>
                          {hit.page.title}
                        </Text>
                      </Group>
                      <Text size="xs" c="dimmed" truncate>
                        {hit.page.path}
                        {hit.heading && ` · ${hit.heading[1]}`}
                      </Text>
                    </UnstyledButton>
                  );
                })}
              </Stack>
            </ScrollArea.Autosize>
          )}
          {selection && (
            <Radio.Group
              label={`Deel van '${selection.page.title}'`}
              value={anchor}
              onChange={setAnchor}
            >
              <ScrollArea.Autosize mah={200} type="auto">
                <Stack gap={6} mt={6}>
                  <Radio value="" label="Hele pagina" />
                  {selection.page.headings.map(([id, text, level]) => (
                    <Radio
                      key={id}
                      value={id}
                      label={text}
                      ml={level > 2 ? 'lg' : 0}
                    />
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            </Radio.Group>
          )}
          {index?.sites.some((s) => s.stale) && (
            <Text size="xs" c="dimmed">
              Van sommige cursussen is de lijst ouder dan de laatste versie.
            </Text>
          )}
        </>
      )}
      {manual && (
        <>
          <Text size="sm" c="dimmed">
            Voor een pagina die nog niet gepubliceerd is. De controle bij het
            publiceren meldt het als het pad of de kop niet bestaat.
          </Text>
          <Select
            label="Cursus"
            value={manualSite}
            onChange={setManualSite}
            data={siteOptions.length ? siteOptions : [{ value: current, label: current }]}
            searchable
          />
          <TextInput
            label="Pad op die cursus"
            description="Zonder de cursusnaam ervoor, bijvoorbeeld /docs/lussen."
            value={manualRoute}
            onChange={(e) => setManualRoute(e.currentTarget.value)}
          />
          <TextInput
            label="Kop (optioneel)"
            description="Het ID van de kop, bijvoorbeeld de-for-lus."
            value={anchor}
            onChange={(e) => setAnchor(e.currentTarget.value.replace(/^#/, ''))}
          />
        </>
      )}
      <Group justify="space-between">
        <Button variant="subtle" size="xs" onClick={() => setManual((m) => !m)}>
          {manual ? 'Pagina zoeken' : 'Pad handmatig invoeren'}
        </Button>
        {url && <Code>{url}</Code>}
      </Group>
      <Group justify="flex-end">
        <Button variant="default" onClick={() => onDone(null)}>
          Annuleren
        </Button>
        <Button disabled={!valid} onClick={() => onDone(url)}>
          Link invoegen
        </Button>
      </Group>
    </Stack>
  );
}

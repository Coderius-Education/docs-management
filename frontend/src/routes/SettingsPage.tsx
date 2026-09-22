import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { api } from "../api/client";
import { useMe, usePreviews } from "../api/hooks";
import { SaveModal } from "../components/SaveModal";
import { ThemeForm } from "../components/editor/ThemeForm";
import { RawEditor } from "../components/editor/RawEditor";
import {
  ResourceRecovery,
  useResourceDraft,
} from "../components/editor/ResourceRecovery";
import {
  parseSettings,
  readSetting,
  type SiteSettings,
} from "../lib/authoring/settings";
interface SettingsResult {
  settings: SiteSettings;
  head_sha: string;
  effective?: {
    commit: string;
    settings: Record<string, unknown>;
    unresolved: string[];
  };
}
export function SettingsPage() {
  const location = useLocation();
  const { site = "" } = useParams();
  const [params] = useSearchParams();
  const branch = params.get("ref") ?? "main";
  const { data: me } = useMe();
  const result = useQuery({
    queryKey: ["settings", site, branch],
    queryFn: () =>
      api<SettingsResult>(`/api/sites/${site}/settings`, {
        params: { ref: branch },
      }),
    enabled: site !== "home",
  });
  if (site === "home")
    return (
      <Alert>
        Deze instellingen zijn alleen beschikbaar voor Docusaurus-cursussen.
      </Alert>
    );
  if (result.isLoading) return <Loader aria-label="Vormgeving laden" />;
  if (!result.data)
    return (
      <Alert color="red">
        Instellingen laden mislukt: {String(result.error)}
      </Alert>
    );
  return (
    <SettingsSession
      identity={location.state?.settingsSession ?? `${site}:${branch}`}
      key={location.state?.settingsSession ?? `${site}:${branch}`}
      site={site}
      branch={branch}
      initial={result.data}
      user={me?.login ?? "unknown"}
    />
  );
}
function SettingsSession({
  site,
  branch,
  initial,
  user,
  identity,
}: {
  site: string;
  branch: string;
  initial: SettingsResult;
  user: string;
  identity: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const draft = useResourceDraft(
    user,
    site,
    branch,
    "settings:site-settings.json",
    JSON.stringify(initial.settings, null, 2),
    initial.head_sha,
  );
  useEffect(() => {
    if (draft.base.branch !== branch && !draft.dirty) {
      qc.setQueryData(["settings", site, draft.base.branch], {
        settings: parseSettings(draft.base.content),
        head_sha: draft.base.sha,
      });
      navigate(
        `/sites/${site}/settings?${new URLSearchParams({ ref: draft.base.branch })}`,
        { replace: true, state: { settingsSession: identity } },
      );
    }
  }, [draft.base.branch, draft.dirty, branch]);
  const [mode, setMode] = useState("form"),
    [saveOpen, setSaveOpen] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({});
  const [colorMode, setColorMode] = useState("light"),
    [device, setDevice] = useState("desktop");
  const { data: previews } = usePreviews();
  const { data: capabilities } = useQuery({
    queryKey: ["capabilities", site, draft.base.branch],
    queryFn: () =>
      api<{ settings_runtime: boolean }>(`/api/sites/${site}/capabilities`, {
        params: { ref: draft.base.branch },
      }),
  });
  const parsed = useMemo(() => {
    try {
      return { settings: parseSettings(draft.content), error: "" };
    } catch (e) {
      return { settings: null, error: String(e) };
    }
  }, [draft.content]);
  const previewUrl = previews?.find(
    (p) => p.site === site && p.branch === draft.base.branch,
  )?.url;
  const vars = parsed.settings?.tokens[colorMode] as
    | Record<string, string>
    | undefined;
  const get = (path: string, fallback: string) => {
    const value = parsed.settings && readSetting(parsed.settings, path);
    return typeof value === "string" ? value : fallback;
  };
  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Vormgeving</Title>
        <Group>
          <Badge>{draft.base.branch}</Badge>
          <Text role="status">
            {draft.dirty ? "Niet opgeslagen" : "Opgeslagen"}
          </Text>
          <Button
            disabled={
              !draft.dirty ||
              !!parsed.error ||
              !!draft.recovery ||
              Object.values(errors).some(Boolean)
            }
            onClick={() => setSaveOpen(true)}
          >
            Opslaan…
          </Button>
        </Group>
      </Group>
      <ResourceRecovery draft={draft} />
      {capabilities && !capabilities.settings_runtime && (
        <Alert color="orange">
          Deze branch heeft de Docusaurus-beheerintegratie nog niet. Installeer
          eerst de bijbehorende runtimewijzigingen; anders worden instellingen
          nog niet toegepast in de build.
        </Alert>
      )}
      {initial.effective && initial.effective.commit === draft.base.sha ? (
        <details>
          <summary>Overgenomen instellingen uit de cursusbuild</summary>
          <Text size="xs">
            Build: {initial.effective.commit.slice(0, 12)} · CSS-waarden blijven
            afhankelijk van de bestaande stylesheets.
          </Text>
          <pre
            style={{ whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}
          >
            {JSON.stringify(initial.effective.settings, null, 2)}
          </pre>
        </details>
      ) : (
        <Text size="sm" c="dimmed">
          Geen passende build beschikbaar voor de overgenomen instellingen. Maak
          een cursusvoorbeeld om die te controleren.
        </Text>
      )}
      <SegmentedControl
        aria-label="Instellingenweergave"
        value={mode}
        onChange={setMode}
        data={[
          { value: "form", label: "Instellingen" },
          { value: "preview", label: "Voorbeeld" },
          { value: "raw", label: "JSON" },
        ]}
      />
      {parsed.error && <Alert color="red">{parsed.error}</Alert>}
      {mode === "raw" ? (
        <RawEditor value={draft.content} onChange={draft.setContent} />
      ) : mode === "form" && parsed.settings ? (
        <Paper withBorder p="md">
          <ThemeForm
            value={parsed.settings}
            onChange={(value) =>
              draft.setContent(JSON.stringify(value, null, 2))
            }
            onValidationChange={setErrors}
          />
        </Paper>
      ) : mode === "preview" ? (
        <Stack>
          <Group>
            <SegmentedControl
              value={colorMode}
              onChange={setColorMode}
              data={[
                { value: "light", label: "Licht" },
                { value: "dark", label: "Donker" },
              ]}
            />
            <SegmentedControl
              value={device}
              onChange={setDevice}
              data={[
                { value: "desktop", label: "Desktop" },
                { value: "mobile", label: "Mobiel" },
              ]}
            />
            {previewUrl && (
              <Button
                component="a"
                target="_blank"
                rel="noopener noreferrer"
                href={previewUrl}
              >
                Cursusvoorbeeld
              </Button>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            Stijlvoorbeeld van expliciete instellingen. Overgenomen waarden en
            interactieve onderdelen controleer je in de cursusbuild.
          </Text>
          <Paper
            withBorder
            p="lg"
            style={{
              ...vars,
              maxWidth: device === "mobile" ? 390 : 1100,
              background:
                vars?.["--ifm-background-color"] ??
                (colorMode === "dark" ? "#1b1b1d" : "white"),
              color:
                vars?.["--ifm-font-color-base"] ??
                (colorMode === "dark" ? "#eee" : "#222"),
              fontFamily: vars?.["--ifm-font-family-base"],
              fontSize: vars?.["--ifm-font-size-base"],
              borderRadius: vars?.["--ifm-global-radius"],
            }}
          >
            <Text fw={700}>
              {get("themeConfig.navbar.title", "Cursusnavigatie")}
            </Text>
            <div
              style={{
                padding: "3rem 1rem",
                textAlign: "center",
                background: vars?.["--ifm-color-primary"] ?? "#3578e5",
                color: "white",
                margin: "1rem 0",
              }}
            >
              <h1>{get("site.title", "Titel van de cursus")}</h1>
              <p>{get("site.tagline", "Leer stap voor stap")}</p>
            </div>
            <h2>Een lespagina</h2>
            <p>Zo ziet gewone tekst eruit met deze kleuren en lettertypen.</p>
            <pre style={{ fontFamily: vars?.["--ifm-font-family-monospace"] }}>
              print("Hallo wereld")
            </pre>
            <Text size="sm">
              {get("themeConfig.footer.copyright", "Voettekst van de cursus")}
            </Text>
          </Paper>
        </Stack>
      ) : null}
      {saveOpen && (
        <SaveModal
          opened
          onClose={() => setSaveOpen(false)}
          site={site}
          path="site-settings.json"
          originalContent={draft.base.content}
          newContent={draft.content}
          sha={draft.base.sha}
          currentBranch={draft.base.branch}
          saveResource={async (target, snapshot) => {
            const result = await api<{ head_sha: string }>(
              `/api/sites/${site}/settings`,
              {
                method: "PUT",
                body: {
                  branch: target,
                  expected_head: draft.base.sha,
                  settings: parseSettings(snapshot),
                  message: "Cursusvormgeving bijwerken",
                },
              },
            );
            return result.head_sha;
          }}
          onSaved={(saved) => {
            qc.setQueryData(['settings',site,saved.branch], {settings:parseSettings(saved.content),head_sha:saved.sha});
            draft.setBase(saved);
          }}
        />
      )}
    </Stack>
  );
}

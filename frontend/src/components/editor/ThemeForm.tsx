import {
  Accordion,
  ColorInput,
  NumberInput,
  Select,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { NavigationLinks, FooterLinks } from "./NavigationLinks";
import {
  changeSetting,
  readSetting,
  type SiteSettings,
} from "../../lib/authoring/settings";
type Field = [
  string,
  string,
  "text" | "number" | "boolean" | "json" | "color" | string[],
];
const groups: Record<string, Field[]> = {
  "Site en zoekmachines": [
    ["site.title", "Sitetitel", "text"],
    ["site.tagline", "Ondertitel", "text"],
    ["site.description", "Beschrijving", "text"],
    ["site.keywords", "Zoekwoorden (JSON-lijst)", "json"],
    ["site.favicon", "Favicon", "text"],
    ["themeConfig.image", "Deelafbeelding", "text"],
  ],
  "Licht en donker": [
    ["themeConfig.colorMode.defaultMode", "Standaardmodus", ["light", "dark"]],
    [
      "themeConfig.colorMode.disableSwitch",
      "Kleurschakelaar verbergen",
      "boolean",
    ],
    [
      "themeConfig.colorMode.respectPrefersColorScheme",
      "Systeemvoorkeur volgen",
      "boolean",
    ],
  ],
  Navigatie: [
    ["themeConfig.navbar.title", "Navigatietitel", "text"],
    ["themeConfig.navbar.logo.src", "Logo", "text"],
    ["themeConfig.navbar.logo.srcDark", "Logo donker", "text"],
    ["themeConfig.navbar.logo.alt", "Logo alternatieve tekst", "text"],
    ["themeConfig.navbar.logo.href", "Logo link", "text"],
    ["themeConfig.navbar.style", "Navigatiestijl", ["primary", "dark"]],
    [
      "themeConfig.navbar.hideOnScroll",
      "Verbergen tijdens scrollen",
      "boolean",
    ],
    ["themeConfig.navbar.items", "Navigatielinks (JSON)", "json"],
  ],
  Voettekst: [
    ["themeConfig.footer.style", "Voettekststijl", ["light", "dark"]],
    ["themeConfig.footer.copyright", "Copyrighttekst", "text"],
    ["themeConfig.footer.links", "Kolommen en links (JSON)", "json"],
  ],
  Mededeling: [
    ["themeConfig.announcementBar.id", "Mededeling-ID", "text"],
    ["themeConfig.announcementBar.content", "Mededeling (HTML)", "text"],
    [
      "themeConfig.announcementBar.backgroundColor",
      "Achtergrondkleur",
      "color",
    ],
    ["themeConfig.announcementBar.textColor", "Tekstkleur", "color"],
    ["themeConfig.announcementBar.isCloseable", "Sluiten toestaan", "boolean"],
  ],
  Lesnavigatie: [
    ["themeConfig.docs.sidebar.hideable", "Zijmenu verbergbaar", "boolean"],
    [
      "themeConfig.docs.sidebar.autoCollapseCategories",
      "Categorieën automatisch inklappen",
      "boolean",
    ],
    ["docs.breadcrumbs", "Kruimelpad tonen", "boolean"],
    ["docs.showLastUpdateAuthor", "Laatste auteur tonen", "boolean"],
    ["docs.showLastUpdateTime", "Laatste wijzigingsdatum tonen", "boolean"],
    [
      "themeConfig.tableOfContents.minHeadingLevel",
      "Laagste kopniveau",
      "number",
    ],
    [
      "themeConfig.tableOfContents.maxHeadingLevel",
      "Hoogste kopniveau",
      "number",
    ],
  ],
  Codevoorbeelden: [
    [
      "themeConfig.prism.theme",
      "Licht codethema",
      ["github", "vsLight", "duotoneLight"],
    ],
    [
      "themeConfig.prism.darkTheme",
      "Donker codethema",
      ["dracula", "vsDark", "nightOwl", "duotoneDark"],
    ],
    ["themeConfig.prism.additionalLanguages", "Extra talen (JSON)", "json"],
    ["themeConfig.prism.magicComments", "Markeerregels (JSON)", "json"],
  ],
};
const tokens: Field[] = [
  ["--ifm-color-primary", "Primaire kleur", "color"],
  ["--ifm-background-color", "Pagina-achtergrond", "color"],
  ["--ifm-font-color-base", "Tekstkleur", "color"],
  ["--ifm-font-family-base", "Lettertype", "text"],
  ["--ifm-font-family-monospace", "Codelettertype", "text"],
  ["--ifm-font-size-base", "Tekstgrootte (bijv. 16px)", "text"],
  ["--ifm-container-width", "Inhoudsbreedte (bijv. 1140px)", "text"],
  ["--ifm-global-radius", "Afronding (bijv. 8px)", "text"],
  ["--ifm-spacing-horizontal", "Horizontale ruimte (bijv. 1rem)", "text"],
];
function JsonField({
  label,
  value,
  onChange,
  onError,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
  onError: (error: string) => void;
}) {
  const [text, setText] = useState(
    value === undefined ? "" : JSON.stringify(value, null, 2),
  );
  const [error, setError] = useState("");
  useEffect(() => {
    setText(value === undefined ? "" : JSON.stringify(value, null, 2));
    setError("");
    onError("");
  }, [JSON.stringify(value)]);
  return (
    <Textarea
      label={label}
      autosize
      minRows={3}
      maxRows={10}
      value={text}
      error={error}
      onChange={(e) => {
        const raw = e.currentTarget.value;
        setText(raw);
        try {
          onChange(raw.trim() ? JSON.parse(raw) : undefined);
          setError("");
          onError("");
        } catch {
          setError("Ongeldige JSON");
          onError("Ongeldige JSON");
        }
      }}
    />
  );
}
export function ThemeForm({
  value,
  onChange,
  onValidationChange,
}: {
  value: SiteSettings;
  onChange: (v: SiteSettings) => void;
  onValidationChange: (e: Record<string, string>) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => onValidationChange(errors), [errors, onValidationChange]);
  function field([path, label, type]: Field) {
    const current = readSetting(value, path);
    const set = (v: unknown) => onChange(changeSetting(value, path, v));
    if (path === "site.keywords")
      return (
        <TagsInput
          key={path}
          label="Zoekwoorden"
          value={
            Array.isArray(current)
              ? current.filter((v): v is string => typeof v === "string")
              : []
          }
          onChange={(v) => set(v.length ? v : undefined)}
        />
      );
    if (
      path === "themeConfig.navbar.items" ||
      path === "themeConfig.footer.links"
    )
      return (
        <Stack key={path}>
          {path === "themeConfig.navbar.items" ? (
            <NavigationLinks navbar value={current} onChange={set} />
          ) : (
            <FooterLinks value={current} onChange={set} />
          )}
          <details>
            <summary>Geavanceerde linkinstellingen (JSON)</summary>
            <JsonField
              label={label}
              value={current}
              onChange={set}
              onError={(error) =>
                setErrors((prev) =>
                  prev[path] === error ? prev : { ...prev, [path]: error },
                )
              }
            />
          </details>
        </Stack>
      );
    if (type === "json")
      return (
        <JsonField
          key={path}
          label={label}
          value={current}
          onChange={set}
          onError={(error) =>
            setErrors((prev) =>
              prev[path] === error ? prev : { ...prev, [path]: error },
            )
          }
        />
      );
    if (type === "boolean")
      return (
        <Select
          key={path}
          label={label}
          data={[
            { value: "inherit", label: "Overnemen" },
            { value: "true", label: "Ja" },
            { value: "false", label: "Nee" },
          ]}
          value={current === undefined ? "inherit" : String(current)}
          onChange={(v) => set(v === "inherit" ? undefined : v === "true")}
        />
      );
    if (Array.isArray(type))
      return (
        <Select
          key={path}
          label={label}
          clearable
          placeholder="Overnemen"
          data={type}
          value={typeof current === "string" ? current : null}
          onChange={(v) => set(v ?? undefined)}
        />
      );
    if (type === "number")
      return (
        <NumberInput
          key={path}
          label={label}
          min={2}
          max={6}
          value={typeof current === "number" ? current : ""}
          onChange={(v) => set(v === "" ? undefined : Number(v))}
        />
      );
    const Input = type === "color" ? ColorInput : TextInput;
    return (
      <Input
        key={path}
        label={label}
        placeholder="Overnemen"
        value={typeof current === "string" ? current : ""}
        onChange={(e: string | React.ChangeEvent<HTMLInputElement>) =>
          set((typeof e === "string" ? e : e.currentTarget.value) || undefined)
        }
      />
    );
  }
  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Lege velden nemen de bestaande cursusinstellingen over. Privacy-,
        licentie- en cursuslinks worden door de gedeelde huisstijl toegevoegd.
      </Text>
      <Accordion
        multiple
        defaultValue={["Site en zoekmachines", "Licht en donker"]}
      >
        {Object.entries(groups).map(([title, fields]) => (
          <Accordion.Item key={title} value={title}>
            <Accordion.Control>{title}</Accordion.Control>
            <Accordion.Panel>
              <Stack>{fields.map(field)}</Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
        {["light", "dark"].map((mode) => (
          <Accordion.Item key={mode} value={mode}>
            <Accordion.Control>
              {mode === "light"
                ? "Kleuren en typografie — licht"
                : "Kleuren en typografie — donker"}
            </Accordion.Control>
            <Accordion.Panel>
              <Stack>
                {tokens.map(([key, label, type]) =>
                  field([`tokens.${mode}.${key}`, label, type]),
                )}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Stack>
  );
}

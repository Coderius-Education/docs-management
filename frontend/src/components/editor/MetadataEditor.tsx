import {
  Alert,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import YAML from "yaml";
import { useState } from "react";
import { changeSetting, readSetting } from "../../lib/authoring/settings";
export function readMetadata(
  content: string,
  path: string,
): Record<string, unknown> {
  const value = path.endsWith(".json")
    ? JSON.parse(content)
    : YAML.parse(content);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Gebruik een object met categorie- of taginstellingen.");
  return value;
}
export function MetadataEditor({
  value,
  path,
  onChange,
}: {
  value: string;
  path: string;
  onChange: (v: string) => void;
}) {
  const [newTag, setNewTag] = useState("");
  let data: Record<string, unknown>;
  try {
    data = readMetadata(value, path);
  } catch (e) {
    return <Alert color="red">{String(e)} — corrigeer de broncode.</Alert>;
  }
  function write(next: Record<string, unknown>) {
    if (path.endsWith(".json")) onChange(JSON.stringify(next, null, 2) + "\n");
    else {
      const doc = YAML.parseDocument(value);
      for (const key of Object.keys(data)) if (!(key in next)) doc.delete(key);
      for (const [key, v] of Object.entries(next))
        if (JSON.stringify(v) !== JSON.stringify(data[key])) doc.set(key, v);
      onChange(doc.toString());
    }
  }
  function field(
    key: string,
    label: string,
    type: "text" | "number" | "boolean" = "text",
  ) {
    const v = readSetting(data, key),
      set = (n: unknown) => write(changeSetting(data, key, n));
    return type === "number" ? (
      <NumberInput
        key={key}
        label={label}
        value={typeof v === "number" ? v : ""}
        onChange={(n) => set(n === "" ? undefined : Number(n))}
      />
    ) : type === "boolean" ? (
      <Select
        key={key}
        label={label}
        data={[
          { value: "inherit", label: "Overnemen" },
          { value: "true", label: "Ja" },
          { value: "false", label: "Nee" },
        ]}
        value={v === undefined ? "inherit" : String(v)}
        onChange={(n) => set(n === "inherit" ? undefined : n === "true")}
      />
    ) : (
      <TextInput
        key={key}
        label={label}
        value={typeof v === "string" ? v : ""}
        onChange={(e) => set(e.currentTarget.value || undefined)}
      />
    );
  }
  if (/(^|\/)tags\.ya?ml$/.test(path))
    return (
      <Stack>
        {Object.entries(data).map(([key, item]) => (
          <Stack key={key} gap="xs">
            <Group justify="space-between">
              <Text fw={600}>{key}</Text>
              <Button
                color="red"
                variant="subtle"
                onClick={() => {
                  const next = { ...data };
                  delete next[key];
                  write(next);
                }}
              >
                Tag verwijderen
              </Button>
            </Group>
            {["label", "permalink", "description"].map((prop) => (
              <TextInput
                key={prop}
                label={`${key} — ${prop}`}
                value={
                  item && typeof item === "object"
                    ? String((item as Record<string, unknown>)[prop] ?? "")
                    : ""
                }
                onChange={(e) => {
                  const next = {
                    ...(item && typeof item === "object" ? item : {}),
                    [prop]: e.currentTarget.value,
                  };
                  write({ ...data, [key]: next });
                }}
              />
            ))}
          </Stack>
        ))}
        <Group>
          <TextInput
            label="Nieuwe tag"
            value={newTag}
            onChange={(e) => setNewTag(e.currentTarget.value)}
          />
          <Button
            disabled={
              !newTag.trim() ||
              Object.hasOwn(data, newTag.trim()) ||
              ["__proto__", "constructor", "prototype"].includes(newTag.trim())
            }
            onClick={() => {
              write({ ...data, [newTag.trim()]: { label: newTag.trim() } });
              setNewTag("");
            }}
          >
            Tag toevoegen
          </Button>
        </Group>
      </Stack>
    );
  return (
    <Stack>
      {field("label", "Categorienaam")}
      {field("position", "Volgorde", "number")}
      {field("collapsible", "Inklappen toestaan", "boolean")}
      {field("collapsed", "Standaard ingeklapt", "boolean")}
      {field("className", "CSS-klasse")}
      <Select
        label="Categoriepagina"
        data={[
          { value: "auto", label: "Automatisch" },
          { value: "none", label: "Geen link" },
          { value: "doc", label: "Lespagina" },
          { value: "generated-index", label: "Gegenereerd overzicht" },
        ]}
        value={
          data.link === null
            ? "none"
            : String(readSetting(data, "link.type") ?? "auto")
        }
        onChange={(v) =>
          write(
            changeSetting(
              data,
              "link",
              v === "auto"
                ? undefined
                : v === "none"
                  ? null
                  : { type: v, ...(v === "doc" ? { id: "" } : {}) },
            ),
          )
        }
      />
      {readSetting(data, "link.type") === "doc" ? (
        field("link.id", "Document-ID")
      ) : readSetting(data, "link.type") === "generated-index" ? (
        <>
          {field("link.title", "Overzichtstitel")}
          {field("link.description", "Overzichtsbeschrijving")}
          {field("link.slug", "Overzichtspad")}
          {field("link.image", "Overzichtsafbeelding")}
        </>
      ) : null}
      <Text size="sm" c="dimmed">
        Deze instellingen gelden voor automatisch gegenereerde zijmenu’s.
        Overige eigenschappen blijven behouden en zijn beschikbaar via Broncode.
      </Text>
    </Stack>
  );
}

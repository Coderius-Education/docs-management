import {
  Alert,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
type Item = Record<string, unknown>;
const itemObject = (value: unknown): value is Item =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function NavigationLinks({
  value,
  onChange,
  navbar = false,
  depth = 0,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
  navbar?: boolean;
  depth?: number;
}) {
  if (
    value !== undefined &&
    (!Array.isArray(value) || !value.every(itemObject))
  )
    return (
      <Alert color="orange">
        Gebruik de JSON-weergave om deze linkstructuur te corrigeren.
      </Alert>
    );
  const items = (value ?? []) as Item[];
  const update = (index: number, next: Item) =>
    onChange(items.map((v, i) => (i === index ? next : v)));
  const set = (index: number, key: string, v: unknown) => {
    const next = { ...items[index] };
    if (v === undefined) delete next[key];
    else next[key] = v;
    update(index, next);
  };
  return (
    <Stack gap="xs">
      {items.map((item, index) => {
        const type = typeof item.type === "string" ? item.type : "link";
        const known = [
          "link",
          "doc",
          "docSidebar",
          "dropdown",
          "html",
        ].includes(type);
        return (
          <Paper withBorder p="xs" key={index}>
            <Stack gap="xs">
              <Group grow>
                <TextInput
                  label={`Link ${index + 1} — tekst`}
                  value={String(item.label ?? "")}
                  onChange={(e) => set(index, "label", e.currentTarget.value)}
                />
                {navbar && (
                  <Select
                    label="Positie"
                    clearable
                    placeholder="Overnemen"
                    data={["left", "right"]}
                    value={
                      typeof item.position === "string" ? item.position : null
                    }
                    onChange={(v) => set(index, "position", v ?? undefined)}
                  />
                )}
              </Group>
              {navbar && (
                <Select
                  label="Linktype"
                  data={[
                    { value: "link", label: "Pagina of website" },
                    { value: "doc", label: "Document" },
                    { value: "docSidebar", label: "Zijmenu" },
                    { value: "dropdown", label: "Uitklapmenu" },
                    { value: "html", label: "HTML" },
                    ...(!known ? [{ value: type, label: type }] : []),
                  ]}
                  value={type}
                  onChange={(v) => {
                    const next = { ...item };
                    delete next.href;
                    delete next.to;
                    delete next.docId;
                    delete next.sidebarId;
                    delete next.items;
                    delete next.value;
                    if (v === "link") delete next.type;
                    else next.type = v;
                    if (v === "dropdown") next.items = [];
                    update(index, next);
                  }}
                />
              )}
              {type === "doc" ? (
                <TextInput
                  label="Document-ID"
                  value={String(item.docId ?? "")}
                  onChange={(e) => set(index, "docId", e.currentTarget.value)}
                />
              ) : type === "docSidebar" ? (
                <TextInput
                  label="Zijmenu-ID"
                  value={String(item.sidebarId ?? "")}
                  onChange={(e) =>
                    set(index, "sidebarId", e.currentTarget.value)
                  }
                />
              ) : type === "html" ? (
                <Textarea
                  label="HTML-inhoud"
                  value={String(item.value ?? "")}
                  onChange={(e) => set(index, "value", e.currentTarget.value)}
                />
              ) : type === "dropdown" && depth < 4 ? (
                <NavigationLinks
                  value={item.items}
                  depth={depth + 1}
                  onChange={(v) => set(index, "items", v)}
                />
              ) : type === "link" ? (
                <TextInput
                  label={`Link ${index + 1} — bestemming`}
                  placeholder="/docs/intro of https://…"
                  value={String(item.href ?? item.to ?? "")}
                  onChange={(e) => {
                    const text = e.currentTarget.value,
                      next = { ...item };
                    delete next.href;
                    delete next.to;
                    next[/^[a-z]+:|^\/\//i.test(text) ? "href" : "to"] = text;
                    update(index, next);
                  }}
                />
              ) : null}
              <Group gap="xs">
                <Button
                  size="compact-xs"
                  variant="subtle"
                  disabled={index === 0}
                  onClick={() => {
                    const next = [...items];
                    [next[index - 1], next[index]] = [
                      next[index],
                      next[index - 1],
                    ];
                    onChange(next);
                  }}
                >
                  Omhoog
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  disabled={index === items.length - 1}
                  onClick={() => {
                    const next = [...items];
                    [next[index + 1], next[index]] = [
                      next[index],
                      next[index + 1],
                    ];
                    onChange(next);
                  }}
                >
                  Omlaag
                </Button>
                <Button
                  size="compact-xs"
                  color="red"
                  variant="subtle"
                  onClick={() => onChange(items.filter((_, i) => i !== index))}
                >
                  Link verwijderen
                </Button>
              </Group>
            </Stack>
          </Paper>
        );
      })}
      <Group>
        <Button
          size="xs"
          variant="light"
          onClick={() =>
            onChange([...items, { label: "Nieuwe link", to: "/" }])
          }
        >
          Link toevoegen
        </Button>
        <Button size="xs" variant="subtle" onClick={() => onChange(undefined)}>
          Links overnemen
        </Button>
      </Group>
    </Stack>
  );
}
export function FooterLinks({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (
    value !== undefined &&
    (!Array.isArray(value) || !value.every(itemObject))
  )
    return (
      <Alert color="orange">
        Corrigeer de voettekstlinks in de JSON-weergave.
      </Alert>
    );
  const groups = (value ?? []) as Item[];
  if (groups.length > 0 && !groups.some((g) => "items" in g))
    return <NavigationLinks value={groups} onChange={onChange} />;
  return (
    <Stack>
      {groups.map((group, index) => (
        <Paper key={index} withBorder p="xs">
          <Stack>
            <TextInput
              label={`Voettekstkolom ${index + 1}`}
              value={String(group.title ?? "")}
              onChange={(e) =>
                onChange(
                  groups.map((g, i) =>
                    i === index ? { ...g, title: e.currentTarget.value } : g,
                  ),
                )
              }
            />
            <NavigationLinks
              value={group.items}
              onChange={(v) =>
                onChange(
                  groups.map((g, i) =>
                    i === index ? { ...g, items: v ?? [] } : g,
                  ),
                )
              }
            />
            <Button
              size="xs"
              color="red"
              variant="subtle"
              onClick={() => onChange(groups.filter((_, i) => i !== index))}
            >
              Kolom verwijderen
            </Button>
          </Stack>
        </Paper>
      ))}
      <Group>
        <Button
          size="xs"
          variant="light"
          onClick={() =>
            onChange([...groups, { title: "Nieuwe kolom", items: [] }])
          }
        >
          Kolom toevoegen
        </Button>
        <Button size="xs" variant="subtle" onClick={() => onChange(undefined)}>
          Voettekstlinks overnemen
        </Button>
      </Group>
    </Stack>
  );
}

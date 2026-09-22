import {
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useMemo, useRef, useState } from "react";
import {
  addSection,
  insertSectionInParent,
  modelForNode,
  sectionBindings,
  sectionFields,
  sectionLabels,
} from "../../lib/authoring/homepage";
import {
  parseTree,
  range,
  replaceRange,
  type LessonNode,
} from "../../lib/authoring/syntax";
import { attributes } from "../../lib/authoring/components";
import { LessonEditor } from "./LessonEditor";
import { RawEditor } from "./RawEditor";

type Props = React.ComponentProps<typeof LessonEditor>;
const labels: Record<string, string> = {
  title: "Titel",
  tagline: "Ondertitel",
  subtitle: "Ondertitel",
  href: "Link",
  info: "Extra informatie",
  count: "Aantal kolommen",
  src: "Afbeeldings-URL",
  alt: "Alternatieve tekst",
  caption: "Bijschrift",
  variant: "Variant",
  size: "Grootte",
};
const options: Record<string, string[]> = {
  width: ["full", "wide", "normal", "narrow"],
  spacing: ["none", "small", "normal", "large"],
  align: ["left", "center", "right"],
  background: ["transparent", "muted", "primary"],
};
export function HomepageEditor(props: Props) {
  const { value, onChange } = props;
  const latest = useRef(value);
  latest.current = value;
  const [uploadError, setUploadError] = useState("");
  const [undo, setUndo] = useState<string | null>(null);
  const [sourceBlock, setSourceBlock] = useState<string | null>(null);
  const parsed = useMemo(() => {
    try {
      return { tree: parseTree(value), bindings: sectionBindings(value) };
    } catch (e) {
      return { error: String(e) };
    }
  }, [value]);
  function change(next: string) {
    setUndo(value);
    onChange(next);
  }
  if (!parsed.tree || !parsed.bindings)
    return <Alert color="orange">{parsed.error}</Alert>;
  const bindings = parsed.bindings;
  function updateProp(
    node: LessonNode,
    key: string,
    val: string | number | undefined,
  ) {
    const attr = attributes(node).find((a) => a.name === key);
    const text = val === undefined ? "" : `${key}={${JSON.stringify(val)}}`;
    if (attr) change(replaceRange(value, range(attr), text));
    else {
      const p = range(node).from + 1 + node.name!.length;
      change(replaceRange(value, { from: p, to: p }, ` ${text}`));
    }
  }
  function add(name: string, parent?: LessonNode) {
    change(parent ? insertSectionInParent(value, parent, name) : addSection(value, name));
  }
  function addMenu(parent?: LessonNode) {
    return (
      <Menu>
        <Menu.Target>
          <Button size="xs" variant="light">
            {parent ? "Onderdeel toevoegen" : "Sectie toevoegen"}
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {Object.entries(sectionLabels).map(([name, label]) => (
            <Menu.Item key={name} onClick={() => add(name, parent)}>
              {label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    );
  }
  function list(nodes: LessonNode[], depth = 0): React.ReactNode {
    const visible = nodes.filter((n) => n.type !== "mdxjsEsm");
    return visible.map((node, index) => {
      const r = range(node),
        raw = value.slice(r.from, r.to),
        model = modelForNode(node, bindings, value);
      const id = `${depth}-${r.from}`;
      const swap = (direction: -1 | 1) => {
        const other = visible[index + direction];
        if (!other) return;
        const a = range(direction < 0 ? other : node),
          b = range(direction < 0 ? node : other);
        change(
          replaceRange(
            value,
            { from: a.from, to: b.to },
            value.slice(b.from, b.to) +
              value.slice(a.to, b.from) +
              value.slice(a.from, a.to),
          ),
        );
      };
      return (
        <Paper
          withBorder
          p="sm"
          key={`${depth}-${index}`}
          className="homepage-section"
        >
          <Group justify="space-between" mb="xs">
            <Badge>
              {model ? sectionLabels[model.name] : (node.name ?? "Tekst")}
            </Badge>
            <Group gap={4}>
              <Button
                variant="subtle"
                size="compact-xs"
                aria-label={`Omhoog ${index + 1}`}
                disabled={index === 0}
                onClick={() => swap(-1)}
              >
                ↑
              </Button>
              <Button
                variant="subtle"
                size="compact-xs"
                aria-label={`Omlaag ${index + 1}`}
                disabled={index === visible.length - 1}
                onClick={() => swap(1)}
              >
                ↓
              </Button>
              <Button
                variant="subtle"
                size="compact-xs"
                onClick={() =>
                  change(
                    replaceRange(value, { from: r.to, to: r.to }, `\n\n${raw}`),
                  )
                }
              >
                Dupliceren
              </Button>
              <Button
                variant="subtle"
                size="compact-xs"
                onClick={() => setSourceBlock(sourceBlock === id ? null : id)}
              >
                Bron
              </Button>
              <Button
                variant="subtle"
                color="red"
                size="compact-xs"
                onClick={() => change(replaceRange(value, r, ""))}
              >
                Verwijderen
              </Button>
            </Group>
          </Group>
          {sourceBlock === id ? (
            <RawEditor
              value={raw}
              onChange={(next) => change(replaceRange(value, r, next))}
            />
          ) : model ? (
            <Stack gap="xs">
              <Group align="flex-start">
                {(sectionFields[model.name] ?? []).map((key) =>
                  key === "count" ? (
                    <NumberInput
                      key={key}
                      label={labels[key]}
                      min={1}
                          allowDecimal={false}
                      max={4}
                      value={
                        typeof model.props[key] === "number"
                          ? model.props[key]
                          : ""
                      }
                      disabled={
                        model.locked.includes(key) || model.locked.includes("*")
                      }
                      onChange={(v) =>
                        updateProp(node, key, v === "" ? undefined : Number(v))
                      }
                    />
                  ) : (
                    <TextInput
                      key={key}
                      label={labels[key]}
                      style={{ flex: "1 1 180px" }}
                      placeholder="Standaardwaarde"
                      value={String(model.props[key] ?? "")}
                      disabled={
                        model.locked.includes(key) || model.locked.includes("*")
                      }
                      onChange={(e) =>
                        updateProp(
                          node,
                          key,
                          e.currentTarget.value || undefined,
                        )
                      }
                    />
                  ),
                )}
              </Group>
              <Group>
                {(model.name === "Button" ? [] : Object.entries(options)).map(([key, values]) => (
                  <Select
                    size="xs"
                    w={140}
                    key={key}
                    label={
                      (
                        {
                          width: "Breedte",
                          spacing: "Ruimte",
                          align: "Uitlijning",
                          background: "Achtergrond",
                        } as Record<string, string>
                      )[key]
                    }
                    data={values}
                    clearable
                    placeholder="Standaard"
                    value={
                      typeof model.props[key] === "string"
                        ? String(model.props[key])
                        : null
                    }
                    disabled={
                      model.locked.includes(key) || model.locked.includes("*")
                    }
                    onChange={(v) => updateProp(node, key, v ?? undefined)}
                  />
                ))}
              </Group>
              {model.locked.length > 0 && (
                <Text size="xs" c="dimmed">
                  Dynamische waarden blijven behouden. Gebruik Bron om die aan
                  te passen.
                </Text>
              )}
              {model.name === "Picture" && props.onUploadImage && (
                <label>
                  Afbeelding uploaden
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={async (e) => {
                      const file = e.currentTarget.files?.[0];
                      if (file) {
                        try {
                          const url = await props.onUploadImage!(file);
                          if (latest.current === value)
                            updateProp(node, "src", url);
                          else
                            setUploadError(
                              `Afbeelding opgeslagen als ${url}. De pagina is tijdens het uploaden gewijzigd; voeg deze URL in het afbeeldingsveld in.`,
                            );
                        } catch (err) {
                          setUploadError(String(err));
                        }
                      }
                    }}
                  />
                </label>
              )}
              {node.children?.length ? list(node.children, depth + 1) : null}
              {!["Picture", "Divider", "Button"].includes(model.name) &&
                addMenu(node)}
            </Stack>
          ) : (
            <LessonEditor
              {...props}
              value={raw}
              nested
              onChange={(next) => change(replaceRange(value, r, next))}
            />
          )}
        </Paper>
      );
    });
  }
  return (
    <Stack gap="sm">
      {uploadError && <Alert color="red">{uploadError}</Alert>}
      <Group justify="space-between">
        {addMenu()}
        <Button
          variant="subtle"
          size="xs"
          disabled={undo === null}
          onClick={() => {
            if (undo !== null) {
              onChange(undo);
              setUndo(null);
            }
          }}
        >
          Ongedaan maken
        </Button>
      </Group>
      {list(parsed.tree.children ?? [])}
    </Stack>
  );
}

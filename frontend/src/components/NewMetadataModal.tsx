import { Alert, Button, Modal, Select, Stack, TextInput } from "@mantine/core";
import { useState } from "react";
import { useNavigate } from "react-router";
import { scopedKey, type TreeItem } from "../api/types";
export function NewMetadataModal({
  opened,
  onClose,
  site,
  branch,
  tree,
}: {
  opened: boolean;
  onClose: () => void;
  site: string;
  branch: string;
  tree: TreeItem[];
}) {
  const [path, setPath] = useState("_category_.json"),
    [kind, setKind] = useState("category"),
    [error, setError] = useState("");
  const navigate = useNavigate();
  const valid =
    kind === "tags"
      ? /^tags\.ya?ml$/.test(path)
      : /(^|\/)_category_\.(json|ya?ml)$/.test(path);
  const problem =
    !valid || path.includes("..") || path.startsWith("/") || path.includes("\\")
      ? "Kies een geldig pad voor categorie-instellingen of tags."
      : tree.some((t) => t.path === path)
        ? "Dit bestand bestaat al. Open het vanuit de lijst."
        : "";
  function create() {
    if (problem) return;
    try {
      sessionStorage.setItem(
        `nieuw:${site}:${scopedKey("metadata", path)}`,
        kind === "tags"
          ? "algemeen:\n  label: Algemeen\n"
          : path.endsWith(".json")
            ? "{}\n"
            : "label: Nieuwe categorie\n",
      );
      onClose();
      navigate(
        `/sites/${site}/metadata?${new URLSearchParams({ path, ref: branch, scope: "metadata", nieuw: "1" })}`,
      );
    } catch {
      setError("Browseropslag is niet beschikbaar.");
    }
  }
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Categorie of tags toevoegen"
    >
      <Stack>
        {error && <Alert color="red">{error}</Alert>}
        <Select
          label="Soort instellingen"
          value={kind}
          data={[
            { value: "category", label: "Categorie" },
            { value: "tags", label: "Tags" },
          ]}
          onChange={(v) => {
            setKind(v ?? "category");
            setPath(v === "tags" ? "tags.yml" : "_category_.json");
          }}
        />
        <TextInput
          label="Bestandspad"
          description="Bijvoorbeeld basis/_category_.json"
          value={path}
          error={problem}
          onChange={(e) => setPath(e.currentTarget.value)}
        />
        <Button disabled={!!problem} onClick={create}>
          Openen in editor
        </Button>
      </Stack>
    </Modal>
  );
}

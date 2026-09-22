import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { useBlocker } from "react-router";
import {
  clearRecovery,
  readRecovery,
  recoveryKey,
  writeRecovery,
} from "../../lib/authoring/session";
export function useResourceDraft(
  user: string,
  site: string,
  branch: string,
  resource: string,
  initial: string,
  sha: string,
) {
  const key = recoveryKey(user, site, branch, resource);
  const [content, setContent] = useState(initial),
    [base, setBase] = useState({ content: initial, sha, branch });
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(() => {
    try {
      const r = readRecovery(localStorage, key);
      return r && r.content !== initial ? r : null;
    } catch {
      return null;
    }
  });
  const dirty = content !== base.content;
  useEffect(() => {
    if (recovery) return;
    try {
      if (dirty) writeRecovery(localStorage, key, content, base.sha);
      else clearRecovery(localStorage, key, content);
    } catch {
      setError(
        "Herstelkopie opslaan lukt niet. Bewaar je wijzigingen met Opslaan.",
      );
    }
  }, [key, content, base.sha, dirty, recovery]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  const blocker = useBlocker(dirty);
  function discard() {
    try {
      if (recovery) clearRecovery(localStorage, key, recovery.content);
    } catch {
      setError("Herstelkopie verwijderen lukt niet.");
    }
    setRecovery(null);
  }
  return {
    content,
    setContent,
    base,
    setBase,
    dirty,
    error,
    recovery,
    restore: () => {
      if (recovery) setContent(recovery.content);
      setRecovery(null);
    },
    discard,
    blocker,
  };
}
export function ResourceRecovery({
  draft,
}: {
  draft: ReturnType<typeof useResourceDraft>;
}) {
  return (
    <>
      {draft.error && <Alert color="orange">{draft.error}</Alert>}
      {draft.recovery && (
        <Alert title="Herstelkopie beschikbaar">
          <Text>
            {draft.recovery.baseSha !== draft.base.sha
              ? "De serverversie is gewijzigd; vergelijk de herstelkopie voordat je opslaat."
              : "Wil je je vorige wijzigingen herstellen?"}
          </Text>
          <Group mt="sm">
            <Button onClick={draft.restore}>Concept herstellen</Button>
            <Button variant="default" onClick={draft.discard}>
              Opgeslagen versie gebruiken
            </Button>
          </Group>
        </Alert>
      )}
      <Modal
        opened={draft.blocker.state === "blocked"}
        onClose={() =>
          draft.blocker.state === "blocked" && draft.blocker.reset()
        }
        title="Niet-opgeslagen wijzigingen"
      >
        <Stack>
          <Text>Je wijzigingen zijn nog niet op de server opgeslagen.</Text>
          <Group>
            <Button
              onClick={() =>
                draft.blocker.state === "blocked" && draft.blocker.reset()
              }
            >
              Verder bewerken
            </Button>
            <Button
              color="orange"
              onClick={() =>
                draft.blocker.state === "blocked" && draft.blocker.proceed()
              }
            >
              Pagina verlaten
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

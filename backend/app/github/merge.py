"""Conflicten oplossen voor docenten: 3-weg-merge van een concept met main.

`bijwerken` haalt de gepubliceerde versie (main) binnen in een concept. Wat
niet overlapt wordt automatisch samengevoegd (merge3, regel-gebaseerd). Echte
overlap wordt per blok teruggegeven met een stabiel id; de docent kiest per blok
"ours" (jouw versie), "theirs" (gepubliceerde versie), "both" of eigen tekst.

Dezelfde motor draait bij opslaan: als iemand anders hetzelfde bestand in het
concept heeft gewijzigd, wordt base = de tekst die de editor laadde, ours = de
editortekst en theirs = de huidige versie.

Er wordt pas iets gecommit als alles opgelost is; de merge-commit heeft als
ouders [concept-head, main-head] en als tree die van main plus de samengevoegde
bestanden. Alleen de concept-ref verschuift.
"""

import base64
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import quote

from fastapi import HTTPException
from merge3 import Merge3

from app.github.client import GitHubClient, repo_path
from app.github.commits import multi_file_commit

CONTEXT_LINES = 3
Choice = str | dict  # "ours" | "theirs" | "both" | {"custom": "..."}


# --- tekst ------------------------------------------------------------------


def _lines(text: str | None) -> list[str]:
    return (text or "").splitlines(keepends=True)


def merge_text(base: str | None, ours: str, theirs: str) -> tuple[str | None, list[dict]]:
    """3-weg-merge. Geeft (samengevoegde tekst of None bij conflict, segmenten).

    Segmenten: {"type": "text", "text"} of
    {"type": "conflict", "id", "base", "ours", "theirs"}. Conflict-ids zijn de
    volgnummers ("0", "1", …) en dus stabiel zolang de drie versies gelijk blijven.
    """
    b, a, t = _lines(base), _lines(ours), _lines(theirs)
    segments: list[dict] = []

    def text(chunk: list[str]) -> None:
        if not chunk:
            return
        if segments and segments[-1]["type"] == "text":
            segments[-1]["text"] += "".join(chunk)
        else:
            segments.append({"type": "text", "text": "".join(chunk)})

    conflicts = 0
    for region in Merge3(b, a, t).merge_regions():
        kind = region[0]
        if kind == "unchanged":
            text(b[region[1] : region[2]])
        elif kind in ("a", "same"):
            text(a[region[1] : region[2]])
        elif kind == "b":
            text(t[region[1] : region[2]])
        else:  # conflict
            _, z1, z2, a1, a2, t1, t2 = region
            segments.append(
                {
                    "type": "conflict",
                    "id": str(conflicts),
                    "base": "".join(b[z1:z2]),
                    "ours": "".join(a[a1:a2]),
                    "theirs": "".join(t[t1:t2]),
                }
            )
            conflicts += 1
    if conflicts:
        return None, segments
    return "".join(s["text"] for s in segments), segments


def hunks(segments: list[dict]) -> list[dict]:
    """Conflictblokken met een paar regels context ervoor en erna."""
    out = []
    for i, seg in enumerate(segments):
        if seg["type"] != "conflict":
            continue
        before = segments[i - 1]["text"] if i > 0 and segments[i - 1]["type"] == "text" else ""
        after = (
            segments[i + 1]["text"]
            if i + 1 < len(segments) and segments[i + 1]["type"] == "text"
            else ""
        )
        out.append(
            {
                "id": seg["id"],
                "base": seg["base"],
                "ours": seg["ours"],
                "theirs": seg["theirs"],
                "context_before": "".join(before.splitlines(keepends=True)[-CONTEXT_LINES:]),
                "context_after": "".join(after.splitlines(keepends=True)[:CONTEXT_LINES]),
            }
        )
    return out


def _choose(seg: dict, choice: Choice | None) -> str:
    if isinstance(choice, dict) and isinstance(choice.get("custom"), str):
        return choice["custom"]
    if choice == "ours":
        return seg["ours"]
    if choice == "theirs":
        return seg["theirs"]
    if choice == "both":
        ours = seg["ours"]
        if ours and not ours.endswith("\n"):
            ours += "\n"
        return ours + seg["theirs"]
    raise ValueError(seg["id"])


def apply_choices(segments: list[dict], choices: dict[str, Choice]) -> str:
    """Bouwt de tekst uit segmenten; ValueError(id) als een blok geen keuze heeft."""
    parts = []
    for seg in segments:
        if seg["type"] == "text":
            parts.append(seg["text"])
        else:
            parts.append(_choose(seg, choices.get(seg["id"])))
    return "".join(parts)


# --- bestanden ----------------------------------------------------------------


@dataclass
class FileOutcome:
    path: str
    # Opgelost: bytes = nieuwe inhoud, None = verwijderen.
    content: bytes | None = None
    resolved: bool = False
    # Conflict: segmenten (tekst) of hele-bestand-keuze.
    whole_file: bool = False
    binary: bool = False
    ours_text: str | None = None
    theirs_text: str | None = None
    ours_bytes: bytes | None = None
    theirs_bytes: bytes | None = None
    segments: list[dict] = field(default_factory=list)

    def describe(self) -> dict:
        if self.whole_file:
            return {
                "file": self.path,
                "binary": self.binary,
                "whole_file": True,
                "segments": [],
                "hunks": [
                    {
                        "id": "0",
                        "base": None,
                        "ours": None if self.binary else self.ours_text,
                        "theirs": None if self.binary else self.theirs_text,
                        "ours_deleted": self.ours_bytes is None,
                        "theirs_deleted": self.theirs_bytes is None,
                        "context_before": "",
                        "context_after": "",
                    }
                ],
            }
        return {
            "file": self.path,
            "binary": False,
            "whole_file": False,
            "segments": self.segments,
            "hunks": hunks(self.segments),
        }


def _decode(data: bytes | None) -> tuple[str | None, bool]:
    """(tekst, is_tekst). None-inhoud (afwezig) telt als tekst."""
    if data is None:
        return None, True
    try:
        return data.decode("utf-8"), b"\0" not in data
    except UnicodeDecodeError:
        return None, False


def merge_file(
    path: str, base: bytes | None, ours: bytes | None, theirs: bytes | None
) -> FileOutcome:
    """3-weg op één bestand. None = bestand bestaat niet (verwijderd/nieuw)."""
    if ours == theirs:
        return FileOutcome(path, content=ours, resolved=True)
    if base == ours:
        return FileOutcome(path, content=theirs, resolved=True)
    if base == theirs:
        return FileOutcome(path, content=ours, resolved=True)
    base_t, base_ok = _decode(base)
    ours_t, ours_ok = _decode(ours)
    theirs_t, theirs_ok = _decode(theirs)
    outcome = FileOutcome(
        path, ours_text=ours_t, theirs_text=theirs_t, ours_bytes=ours, theirs_bytes=theirs
    )
    if not (base_ok and ours_ok and theirs_ok):
        outcome.whole_file = outcome.binary = True
        return outcome
    if ours is None or theirs is None:
        # Aan de ene kant verwijderd, aan de andere kant gewijzigd.
        outcome.whole_file = True
        return outcome
    merged, segments = merge_text(base_t, ours_t or "", theirs_t or "")
    if merged is not None:
        outcome.content = merged.encode("utf-8")
        outcome.resolved = True
        return outcome
    outcome.segments = segments
    return outcome


def resolve_file(outcome: FileOutcome, choices: dict[str, Choice]) -> bytes | None:
    """Past keuzes toe op een conflictbestand; ValueError als er iets ontbreekt."""
    if outcome.whole_file:
        choice = choices.get("0")
        if choice == "ours":
            return outcome.ours_bytes
        if choice == "theirs":
            return outcome.theirs_bytes
        if (
            not outcome.binary
            and isinstance(choice, dict)
            and isinstance(choice.get("custom"), str)
        ):
            return choice["custom"].encode("utf-8")
        raise ValueError("0")
    return apply_choices(outcome.segments, choices).encode("utf-8")


# --- GitHub -------------------------------------------------------------------


async def _ref(client: GitHubClient, branch: str) -> str:
    ref = await client.get(repo_path(f"/git/ref/heads/{quote(branch, safe='/')}"))
    return ref["object"]["sha"]


async def _blob(client: GitHubClient, sha: str) -> bytes:
    blob = await client.get(repo_path(f"/git/blobs/{sha}"))
    return base64.b64decode(blob["content"])


async def _file_at(client: GitHubClient, path: str, ref: str) -> bytes | None:
    data = await client.get(
        repo_path(f"/contents/{quote(path, safe='/')}"), params={"ref": ref}, expect=(200, 404)
    )
    if not isinstance(data, dict) or data.get("type") != "file" or "content" not in data:
        return None
    return base64.b64decode(data["content"])


def _changes(files: list[dict]) -> dict[str, str | None]:
    """pad -> blob-sha (None = verwijderd) uit een compare-response."""
    out: dict[str, str | None] = {}
    for f in files:
        if f.get("status") == "renamed" and f.get("previous_filename"):
            out[f["previous_filename"]] = None
        out[f["filename"]] = None if f.get("status") == "removed" else f.get("sha")
    return out


async def bijwerken(
    client: GitHubClient,
    branch: str,
    choices: dict[str, dict[str, Choice]] | None = None,
    *,
    expected_head: str | None = None,
    expected_main: str | None = None,
) -> dict[str, Any]:
    """Werk een concept bij met main.

    Retourneert {"status": "actueel"} als er niets te doen is,
    {"status": "bijgewerkt", "sha"} na een merge-commit, of
    {"status": "conflicten", "files", "branch_sha", "main_sha"} zonder commit.
    """
    branch_head = await _ref(client, branch)
    main_head = await _ref(client, "main")
    if expected_head is not None and branch_head != expected_head:
        raise HTTPException(409, "Het concept is intussen gewijzigd. Bekijk de conflicten opnieuw.")
    if expected_main is not None and main_head != expected_main:
        raise HTTPException(
            409, "De gepubliceerde versie is intussen veranderd. Bekijk de conflicten opnieuw."
        )

    compare = await client.get(repo_path(f"/compare/main...{quote(branch, safe='/')}"))
    if not compare.get("behind_by"):
        return {"status": "actueel"}
    merge_base = compare["merge_base_commit"]["sha"]
    ours = _changes(compare.get("files", []))
    theirs_compare = await client.get(repo_path(f"/compare/{merge_base}...{main_head}"))
    theirs = _changes(theirs_compare.get("files", []))

    blob_shas: dict[str, str] = {}
    add: dict[str, bytes] = {}
    delete: list[str] = []
    conflicts: list[FileOutcome] = []
    for path, our_sha in ours.items():
        if path not in theirs:
            # Alleen in het concept gewijzigd: neem de conceptversie over.
            if our_sha is None:
                delete.append(path)
            else:
                blob_shas[path] = our_sha
            continue
        their_sha = theirs[path]
        if our_sha == their_sha:
            continue  # aan beide kanten hetzelfde; main heeft het al
        outcome = merge_file(
            path,
            await _file_at(client, path, merge_base),
            await _blob(client, our_sha) if our_sha else None,
            await _blob(client, their_sha) if their_sha else None,
        )
        if not outcome.resolved:
            file_choices = (choices or {}).get(path)
            if file_choices is None:
                conflicts.append(outcome)
                continue
            try:
                outcome.content = resolve_file(outcome, file_choices)
            except ValueError:
                conflicts.append(outcome)
                continue
        if outcome.content is None:
            delete.append(path)
        else:
            add[path] = outcome.content

    if conflicts:
        return {
            "status": "conflicten",
            "files": [c.describe() for c in conflicts],
            "branch_sha": branch_head,
            "main_sha": main_head,
        }

    main_commit = await client.get(repo_path(f"/git/commits/{main_head}"))
    sha = await multi_file_commit(
        client,
        branch,
        "Bijgewerkt met de gepubliceerde versie",
        add=add,
        delete=delete,
        blob_shas=blob_shas,
        parents=[branch_head, main_head],
        base_tree=main_commit["tree"]["sha"],
        expected_head=branch_head,
    )
    return {"status": "bijgewerkt", "sha": sha}

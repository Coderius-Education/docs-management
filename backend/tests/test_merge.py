"""De merge-motor: tekst, bestanden en bijwerken tegen een gemockte GitHub."""

import base64
import json

import pytest
import respx
from fastapi import HTTPException
from httpx import Response

from app.github.client import GitHubClient
from app.github.merge import apply_choices, bijwerken, hunks, merge_file, merge_text

API = "https://api.github.com"
REPO = f"{API}/repos/Coderius-Education/docs"
BRANCH = "concept/python-abc"

BASE = "# Les\n\nIntro.\n\nUitleg.\n\nSlot.\n"


def test_non_overlapping_changes_merge_cleanly():
    ours = BASE.replace("Intro.", "Nieuwe intro.")
    theirs = BASE.replace("Slot.", "Nieuw slot.")
    merged, _ = merge_text(BASE, ours, theirs)
    assert merged == "# Les\n\nNieuwe intro.\n\nUitleg.\n\nNieuw slot.\n"


def test_overlap_gives_conflict_hunk_with_context():
    ours = BASE.replace("Uitleg.", "Mijn uitleg.")
    theirs = BASE.replace("Uitleg.", "Hun uitleg.")
    merged, segments = merge_text(BASE, ours, theirs)
    assert merged is None
    [hunk] = hunks(segments)
    assert hunk["id"] == "0"
    assert hunk["ours"] == "Mijn uitleg.\n"
    assert hunk["theirs"] == "Hun uitleg.\n"
    assert hunk["base"] == "Uitleg.\n"
    assert "Intro." in hunk["context_before"]
    assert "Slot." in hunk["context_after"]


@pytest.mark.parametrize(
    ("choice", "expected"),
    [
        ("ours", "Mijn uitleg.\n"),
        ("theirs", "Hun uitleg.\n"),
        ("both", "Mijn uitleg.\nHun uitleg.\n"),
        ({"custom": "Samen.\n"}, "Samen.\n"),
    ],
)
def test_apply_choices(choice, expected):
    ours = BASE.replace("Uitleg.", "Mijn uitleg.")
    theirs = BASE.replace("Uitleg.", "Hun uitleg.")
    _, segments = merge_text(BASE, ours, theirs)
    assert apply_choices(segments, {"0": choice}) == BASE.replace("Uitleg.\n", expected)


def test_missing_choice_raises():
    _, segments = merge_text(BASE, BASE + "a\n", BASE + "b\n")
    with pytest.raises(ValueError):
        apply_choices(segments, {})


def test_binary_changed_on_both_sides_is_whole_file_conflict():
    outcome = merge_file("img.png", b"\x89PNG\0a", b"\x89PNG\0b", b"\x89PNG\0c")
    assert not outcome.resolved
    assert outcome.binary and outcome.whole_file
    assert outcome.describe()["hunks"][0]["ours"] is None


def test_binary_changed_on_one_side_takes_that_side():
    assert merge_file("img.png", b"\x89PNG\0a", b"\x89PNG\0b", b"\x89PNG\0a").content == (
        b"\x89PNG\0b"
    )
    assert merge_file("img.png", b"\x89PNG\0a", b"\x89PNG\0a", b"\x89PNG\0c").content == (
        b"\x89PNG\0c"
    )


def test_delete_versus_modify_is_whole_file_conflict():
    outcome = merge_file("a.md", b"x\n", None, b"y\n")
    assert outcome.whole_file and not outcome.binary
    assert outcome.describe()["hunks"][0]["ours_deleted"] is True


# --- bijwerken tegen GitHub -------------------------------------------------------


def _blob(text: str | bytes) -> dict:
    data = text.encode() if isinstance(text, str) else text
    return {"content": base64.b64encode(data).decode(), "encoding": "base64"}


def _contents(text: str) -> dict:
    return {"type": "file", "sha": "x", **_blob(text)}


def _mock_repo(ours: str, theirs: str, *, behind: int = 1, branch_head: str = "bhead"):
    respx.get(f"{REPO}/git/ref/heads/{BRANCH}").mock(
        return_value=Response(200, json={"object": {"sha": branch_head}})
    )
    respx.get(f"{REPO}/git/ref/heads/main").mock(
        return_value=Response(200, json={"object": {"sha": "mhead"}})
    )
    respx.get(f"{REPO}/compare/main...{BRANCH}").mock(
        return_value=Response(
            200,
            json={
                "behind_by": behind,
                "merge_base_commit": {"sha": "basesha"},
                "files": [
                    {"filename": "sites/a.md", "status": "modified", "sha": "ours-blob"},
                    {"filename": "sites/alleen-ik.md", "status": "added", "sha": "only-ours"},
                ],
            },
        )
    )
    respx.get(f"{REPO}/compare/basesha...mhead").mock(
        return_value=Response(
            200,
            json={
                "files": [{"filename": "sites/a.md", "status": "modified", "sha": "theirs-blob"}]
            },
        )
    )
    respx.get(f"{REPO}/contents/sites/a.md", params={"ref": "basesha"}).mock(
        return_value=Response(200, json=_contents(BASE))
    )
    respx.get(f"{REPO}/git/blobs/ours-blob").mock(return_value=Response(200, json=_blob(ours)))
    respx.get(f"{REPO}/git/blobs/theirs-blob").mock(return_value=Response(200, json=_blob(theirs)))
    respx.get(f"{REPO}/git/commits/mhead").mock(
        return_value=Response(200, json={"tree": {"sha": "maintree"}})
    )
    respx.post(f"{REPO}/git/blobs").mock(return_value=Response(201, json={"sha": "merged-blob"}))
    trees = respx.post(f"{REPO}/git/trees").mock(
        return_value=Response(201, json={"sha": "newtree"})
    )
    commits = respx.post(f"{REPO}/git/commits").mock(
        return_value=Response(201, json={"sha": "mergecommit"})
    )
    refs = respx.patch(f"{REPO}/git/refs/heads/{BRANCH}").mock(
        return_value=Response(200, json={"object": {"sha": "mergecommit"}})
    )
    return trees, commits, refs


@respx.mock
async def test_bijwerken_clean_creates_merge_commit_on_main_tree():
    trees, commits, refs = _mock_repo(
        BASE.replace("Intro.", "Mijn intro."), BASE.replace("Slot.", "Hun slot.")
    )
    result = await bijwerken(GitHubClient("t"), BRANCH)
    assert result == {"status": "bijgewerkt", "sha": "mergecommit"}
    tree = json.loads(trees.calls[0].request.content)
    assert tree["base_tree"] == "maintree"
    entries = {item["path"]: item["sha"] for item in tree["tree"]}
    assert entries == {"sites/a.md": "merged-blob", "sites/alleen-ik.md": "only-ours"}
    commit = json.loads(commits.calls[0].request.content)
    assert commit["parents"] == ["bhead", "mhead"]
    assert json.loads(refs.calls[0].request.content)["force"] is False


@respx.mock
async def test_bijwerken_up_to_date_does_nothing():
    _, commits, _ = _mock_repo(BASE, BASE, behind=0)
    assert await bijwerken(GitHubClient("t"), BRANCH) == {"status": "actueel"}
    assert not commits.called


@respx.mock
async def test_bijwerken_overlap_returns_conflicts_without_commit():
    _, commits, _ = _mock_repo(
        BASE.replace("Uitleg.", "Mijn uitleg."), BASE.replace("Uitleg.", "Hun uitleg.")
    )
    result = await bijwerken(GitHubClient("t"), BRANCH)
    assert result["status"] == "conflicten"
    assert result["branch_sha"] == "bhead" and result["main_sha"] == "mhead"
    [conflict] = result["files"]
    assert conflict["file"] == "sites/a.md"
    assert conflict["hunks"][0]["ours"] == "Mijn uitleg.\n"
    assert not commits.called


@respx.mock
async def test_bijwerken_with_choices_commits_resolution():
    _, commits, _ = _mock_repo(
        BASE.replace("Uitleg.", "Mijn uitleg."), BASE.replace("Uitleg.", "Hun uitleg.")
    )
    blobs = respx.post(f"{REPO}/git/blobs").mock(
        return_value=Response(201, json={"sha": "resolved-blob"})
    )
    result = await bijwerken(
        GitHubClient("t"),
        BRANCH,
        {"sites/a.md": {"0": "both"}},
        expected_head="bhead",
        expected_main="mhead",
    )
    assert result["status"] == "bijgewerkt"
    sent = base64.b64decode(json.loads(blobs.calls[0].request.content)["content"]).decode()
    assert "Mijn uitleg.\nHun uitleg.\n" in sent
    assert commits.called


@respx.mock
async def test_bijwerken_expected_head_race_gives_409():
    _, commits, _ = _mock_repo(BASE, BASE, branch_head="iemand-anders")
    with pytest.raises(HTTPException) as exc:
        await bijwerken(
            GitHubClient("t"),
            BRANCH,
            {"sites/a.md": {"0": "ours"}},
            expected_head="bhead",
            expected_main="mhead",
        )
    assert exc.value.status_code == 409
    assert not commits.called

"""Multi-bestand-commits via de Git Data API (rename, afbeelding + pagina samen)."""

import base64

from fastapi import HTTPException

from app.github.client import GitHubClient, repo_path
from app.github.contents import validate_branch


async def multi_file_commit(
    client: GitHubClient,
    branch: str,
    message: str,
    *,
    add: dict[str, bytes] | None = None,
    delete: list[str] | None = None,
    repo: str | None = None,
    expected_head: str | None = None,
    blob_shas: dict[str, str] | None = None,
    parents: list[str] | None = None,
    base_tree: str | None = None,
) -> str:
    """Eén commit die meerdere bestanden toevoegt/wijzigt en/of verwijdert.

    `add`: pad -> inhoud (bytes). `delete`: lijst paden. `blob_shas`: pad ->
    bestaande blob-sha (zonder opnieuw te uploaden). `repo`: optioneel een ander
    repo dan het docs-repo (zie repo_path).

    Voor een merge-commit (bijwerken met main): `parents=[branch_head, main_head]`
    en `base_tree` = de tree van main. Alleen de branch-ref verschuift.
    Zonder wijzigingen ontstaat een lege commit (zelfde tree).
    Retourneert de nieuwe commit-sha.
    """
    validate_branch(branch, writing=True)
    ref = await client.get(repo_path(f"/git/ref/heads/{branch}", repo))
    head_sha = ref["object"]["sha"]
    if expected_head is not None and head_sha != expected_head:
        raise HTTPException(
            409, "Het concept is gewijzigd; laad de nieuwste versie en vergelijk uw wijzigingen"
        )
    if base_tree is None:
        head_commit = await client.get(repo_path(f"/git/commits/{head_sha}", repo))
        base_tree = head_commit["tree"]["sha"]

    tree_items: list[dict] = []
    for path, content in (add or {}).items():
        blob = await client.post(
            repo_path("/git/blobs", repo),
            json={
                "content": base64.b64encode(content).decode("ascii"),
                "encoding": "base64",
            },
            expect=(201,),
        )
        tree_items.append({"path": path, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    for path, sha in (blob_shas or {}).items():
        tree_items.append({"path": path, "mode": "100644", "type": "blob", "sha": sha})
    for path in delete or []:
        tree_items.append({"path": path, "mode": "100644", "type": "blob", "sha": None})

    if tree_items:
        new_tree = await client.post(
            repo_path("/git/trees", repo),
            json={"base_tree": base_tree, "tree": tree_items},
            expect=(201,),
        )
        tree_sha = new_tree["sha"]
    else:
        tree_sha = base_tree
    new_commit = await client.post(
        repo_path("/git/commits", repo),
        json={"message": message, "tree": tree_sha, "parents": parents or [head_sha]},
        expect=(201,),
    )
    updated = await client.patch(
        repo_path(f"/git/refs/heads/{branch}", repo),
        json={"sha": new_commit["sha"], "force": False},
        expect=(200, 409, 422),
    )
    # GitHub reports a non-fast-forward update as 422; surface it as an edit conflict.
    if isinstance(updated, dict) and "message" in updated:
        raise HTTPException(
            409, "Het concept is gewijzigd; vergelijk uw wijzigingen met de nieuwste versie"
        )
    return new_commit["sha"]

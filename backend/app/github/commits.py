"""Multi-bestand-commits via de Git Data API (rename, afbeelding + pagina samen)."""

import base64

from app.github.client import GitHubClient, repo_path


async def multi_file_commit(
    client: GitHubClient,
    branch: str,
    message: str,
    *,
    add: dict[str, bytes] | None = None,
    delete: list[str] | None = None,
    repo: str | None = None,
) -> str:
    """Eén commit die meerdere bestanden toevoegt/wijzigt en/of verwijdert.

    `add`: pad -> inhoud (bytes). `delete`: lijst paden. `repo`: optioneel een
    ander repo dan het docs-repo (zie repo_path).
    Retourneert de nieuwe commit-sha.
    """
    ref = await client.get(repo_path(f"/git/ref/heads/{branch}", repo))
    head_sha = ref["object"]["sha"]
    head_commit = await client.get(repo_path(f"/git/commits/{head_sha}", repo))

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
        tree_items.append(
            {"path": path, "mode": "100644", "type": "blob", "sha": blob["sha"]}
        )
    for path in delete or []:
        tree_items.append({"path": path, "mode": "100644", "type": "blob", "sha": None})

    new_tree = await client.post(
        repo_path("/git/trees", repo),
        json={"base_tree": head_commit["tree"]["sha"], "tree": tree_items},
        expect=(201,),
    )
    new_commit = await client.post(
        repo_path("/git/commits", repo),
        json={"message": message, "tree": new_tree["sha"], "parents": [head_sha]},
        expect=(201,),
    )
    await client.patch(
        repo_path(f"/git/refs/heads/{branch}", repo),
        json={"sha": new_commit["sha"]},
    )
    return new_commit["sha"]

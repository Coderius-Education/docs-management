"""Branches en pull requests via de GitHub API.

In de UI heet een branch + PR samen een *concept*; mergen heet *publiceren*.
Een concept heeft altijd allebei: de eerste opslag maakt de branch
`concept/<site>-<base36>` en meteen de PR (zie create_concept).
"""

import asyncio
import re
import secrets
import time

from fastapi import HTTPException

from app.config import SUBJECTS, get_settings
from app.github.client import GitHubClient, repo_path

CONCEPT_PREFIX = "concept/"
# De verplichte CI-check: de aggregerende job `build` in docs/.github/workflows/build.yml.
REQUIRED_CHECK = "build"
_OK_CONCLUSIONS = {"success", "skipped", "neutral"}


async def list_branches(client: GitHubClient) -> list[dict]:
    branches = await client.get(repo_path("/branches"), params={"per_page": 100})
    return [{"name": b["name"], "sha": b["commit"]["sha"]} for b in branches]


async def create_branch(
    client: GitHubClient, name: str, from_branch: str = "main", repo: str | None = None
) -> dict:
    ref = await client.get(repo_path(f"/git/ref/heads/{from_branch}", repo))
    base_sha = ref["object"]["sha"]
    created = await client.post(
        repo_path("/git/refs", repo),
        json={"ref": f"refs/heads/{name}", "sha": base_sha},
        expect=(201,),
    )
    return {"name": name, "sha": created["object"]["sha"]}


async def list_prs(client: GitHubClient, state: str = "open", details: bool = True) -> list[dict]:
    prs = await client.get(repo_path("/pulls"), params={"state": state, "per_page": 50})
    items = [_pr_summary(pr) for pr in prs]
    if details:
        # Status per open concept: één check-runs-call per PR, beperkt parallel.
        sem = asyncio.Semaphore(8)

        async def fill(item: dict, pr: dict) -> None:
            if item["state"] != "open":
                item["status"] = concept_status(item["state"], pr.get("merged_at") is not None)
                return
            async with sem:
                try:
                    runs = await get_check_runs(client, item["head_sha"])
                except HTTPException:
                    runs = []
            item["status"] = concept_status("open", False, None, runs, mergeable_known=False)

        await asyncio.gather(*(fill(item, pr) for item, pr in zip(items, prs, strict=True)))
    return items


async def get_check_runs(client: GitHubClient, sha: str) -> list[dict]:
    checks = await client.get(repo_path(f"/commits/{sha}/check-runs"), params={"per_page": 100})
    return [
        {
            "id": run.get("id", 0),
            "name": run["name"],
            "status": run["status"],
            "conclusion": run["conclusion"],
            "head_sha": run.get("head_sha", sha),
        }
        for run in checks.get("check_runs", [])
    ]


async def get_pr(client: GitHubClient, number: int) -> dict:
    pr = await client.get(repo_path(f"/pulls/{number}"))
    runs = await get_check_runs(client, pr["head"]["sha"])
    summary = _pr_summary(pr)
    merged = pr.get("merged", False)
    mergeable = pr.get("mergeable")
    summary.update(
        {
            "body": pr.get("body"),
            "mergeable": mergeable,
            "merged": merged,
            "checks": runs,
            "preview_branch_slug": branch_slug(pr["head"]["ref"]),
            "created_at": pr.get("created_at"),
            "merged_at": pr.get("merged_at"),
            "closed_at": pr.get("closed_at"),
            "status": concept_status(pr["state"], merged, mergeable, runs),
            "publish_blocked": publish_block_reason(
                pr["state"], merged, mergeable, pr["head"]["sha"], runs
            ),
        }
    )
    return summary


async def list_pr_files(client: GitHubClient, number: int) -> list[dict]:
    """Gewijzigde bestanden met unified-diff per bestand (GitHub levert de patch kant-en-klaar).

    GitHub pagineert op 100; we lopen door tot een lege pagina (PR's met >100
    bestanden zijn zeldzaam maar mogen niet stilletjes worden afgekapt).
    """
    files: list[dict] = []
    page = 1
    while True:
        batch = await client.get(
            repo_path(f"/pulls/{number}/files"),
            params={"per_page": 100, "page": page},
        )
        if not batch:
            break
        files.extend(
            {
                "filename": f["filename"],
                "status": f["status"],
                "additions": f.get("additions", 0),
                "deletions": f.get("deletions", 0),
                "patch": f.get("patch"),  # None bij binair / te grote bestanden
            }
            for f in batch
        )
        if len(batch) < 100:
            break
        page += 1
    return files


async def list_pr_commits(client: GitHubClient, number: int) -> list[dict]:
    commits = await client.get(repo_path(f"/pulls/{number}/commits"), params={"per_page": 100})
    return [
        {
            "sha": c["sha"],
            "message": (c.get("commit") or {}).get("message", ""),
            "author_login": (c.get("author") or {}).get("login")
            or ((c.get("commit") or {}).get("author") or {}).get("name"),
            "date": ((c.get("commit") or {}).get("author") or {}).get("date"),
        }
        for c in commits
    ]


async def create_pr(
    client: GitHubClient, branch: str, title: str, body: str = "", repo: str | None = None
) -> dict:
    pr = await client.post(
        repo_path("/pulls", repo),
        json={"title": title, "head": branch, "base": "main", "body": body, "draft": False},
        expect=(201,),
    )
    return _pr_summary(pr)


def new_concept_branch(site: str) -> str:
    """concept/<site>-<base36>: tijd in ms plus wat willekeur, nooit getoond."""
    stamp = int(time.time() * 1000) * 1296 + secrets.randbelow(1296)
    return f"{CONCEPT_PREFIX}{site}-{_base36(stamp)}"


def _base36(value: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while value:
        value, rest = divmod(value, 36)
        out = digits[rest] + out
    return out or "0"


_CONCEPT_RE = re.compile(rf"^{re.escape(CONCEPT_PREFIX)}(?P<site>[a-z][a-z0-9-]*)-[0-9a-z]+$")


def concept_site(branch: str) -> str | None:
    match = _CONCEPT_RE.match(branch)
    return match.group("site") if match else None


async def create_concept(client: GitHubClient, site: str, title: str) -> dict:
    """Branch + lege startcommit + PR in één keer.

    GitHub weigert een PR zonder verschil met main, dus de branch krijgt eerst
    een lege commit. Bij squash-publiceren verdwijnt die weer.
    """
    from app.github.commits import multi_file_commit

    branch = new_concept_branch(site)
    await create_branch(client, branch)
    await multi_file_commit(client, branch, f"Concept gestart: {title}")
    pr = await create_pr(client, branch, title, "Concept gemaakt in Coderius Docs Beheer.")
    pr["status"] = "concept"
    return pr


def build_check(runs: list[dict], head_sha: str | None = None) -> dict | None:
    """De laatste `build`-run op de huidige head (her-runs krijgen een hoger id)."""
    candidates = [
        r
        for r in runs
        if r["name"] == REQUIRED_CHECK and (head_sha is None or r.get("head_sha") == head_sha)
    ]
    return max(candidates, key=lambda r: r.get("id") or 0, default=None)


def latest_runs(runs: list[dict]) -> list[dict]:
    """Per check-naam alleen de laatste run: een geslaagde her-run vervangt een mislukte."""
    latest: dict[str, dict] = {}
    for run in runs:
        current = latest.get(run["name"])
        if current is None or (run.get("id") or 0) > (current.get("id") or 0):
            latest[run["name"]] = run
    return list(latest.values())


def concept_status(
    state: str,
    merged: bool,
    mergeable: bool | None = None,
    runs: list[dict] | None = None,
    *,
    mergeable_known: bool = True,
) -> str:
    """concept | wordt_gecontroleerd | klaar | aandacht | gepubliceerd | verworpen."""
    if merged:
        return "gepubliceerd"
    if state != "open":
        return "verworpen"
    runs = latest_runs(runs or [])
    if mergeable is False:
        return "aandacht"
    if any(r["status"] == "completed" and r["conclusion"] not in _OK_CONCLUSIONS for r in runs):
        return "aandacht"
    if not runs:
        return "concept"
    build = build_check(runs)
    if build and build["status"] == "completed" and build["conclusion"] == "success":
        if mergeable is True or not mergeable_known:
            return "klaar"
    return "wordt_gecontroleerd"


def publish_block_reason(
    state: str, merged: bool, mergeable: bool | None, head_sha: str, runs: list[dict]
) -> str | None:
    """Waarom publiceren (nog) niet kan, in gewone taal; None als het mag."""
    if merged:
        return "Dit concept is al gepubliceerd."
    if state != "open":
        return "Dit concept is verworpen."
    runs = latest_runs([r for r in runs if r.get("head_sha", head_sha) == head_sha])
    build = build_check(runs, head_sha)
    failed = [
        r["name"]
        for r in runs
        if r["status"] == "completed" and r["conclusion"] not in _OK_CONCLUSIONS
    ]
    if failed:
        return "Controle mislukt: " + ", ".join(sorted(set(failed))) + "."
    if build is None or build["status"] != "completed":
        return "Wordt nog gecontroleerd…"
    if build["conclusion"] != "success":
        return f"Controle mislukt: {REQUIRED_CHECK}."
    if mergeable is False:
        return "Eerst conflicten oplossen."
    if mergeable is None:
        return "GitHub controleert nog of het concept past. Probeer het zo opnieuw."
    return None


async def publish_concept(client: GitHubClient, number: int) -> dict:
    """Publiceer alleen als `build` groen is op de huidige head en er geen conflict is.

    Squash-merge met sha=head: is er intussen nog iets opgeslagen, dan weigert
    GitHub en publiceren we niet per ongeluk een ongecontroleerde versie.
    """
    pr = await client.get(repo_path(f"/pulls/{number}"))
    head_sha = pr["head"]["sha"]
    runs = await get_check_runs(client, head_sha)
    reason = publish_block_reason(
        pr["state"], pr.get("merged", False), pr.get("mergeable"), head_sha, runs
    )
    if reason:
        raise HTTPException(409, reason)
    result = await client.put(
        repo_path(f"/pulls/{number}/merge"),
        json={"merge_method": "squash", "sha": head_sha, "commit_title": pr["title"]},
        expect=(200, 405, 409, 422),
    )
    if not isinstance(result, dict) or not result.get("merged"):
        raise HTTPException(
            409,
            "Publiceren lukte niet: het concept is intussen gewijzigd of past niet meer. "
            "Laad de pagina opnieuw.",
        )
    return {"merged": True, "sha": result.get("sha")}


async def close_pr(client: GitHubClient, number: int) -> dict:
    pr = await client.patch(repo_path(f"/pulls/{number}"), json={"state": "closed"})
    return _pr_summary(pr)


def _pr_summary(pr: dict) -> dict:
    branch = pr["head"]["ref"]
    return {
        "number": pr["number"],
        "title": pr["title"],
        "branch": branch,
        "site": concept_site(branch),
        "author_login": pr["user"]["login"],
        "state": pr["state"],
        "head_sha": pr["head"]["sha"],
        "html_url": pr.get("html_url"),
        "updated_at": pr.get("updated_at"),
    }


def branch_slug(branch: str) -> str:
    """DNS-veilige slug voor preview-hosts: lowercase, alles buiten [a-z0-9-] wordt '-'."""
    slug = "".join(c if c.isalnum() or c == "-" else "-" for c in branch.lower())
    return slug.strip("-")[:63] or "branch"


def preview_url(branch: str, site_slug: str) -> str:
    """https://<branch>--<vak>.<preview-suffix>/<path>/ voor een site op een branch."""
    return preview_url_for_slug(branch_slug(branch), site_slug)


def preview_url_for_slug(slug: str, site_slug: str) -> str:
    from app.delivery.router import preview_host

    return f"https://{preview_host(slug, site_slug)}"


def preview_links(slug: str, site_slug: str) -> list[dict]:
    """Voorbeeldlinks van een site op een branch. Home draait op de root van elk
    vak (met per vak een eigen vakpagina), dus die krijgt één link per vak."""
    if site_slug != "home":
        return [
            {"site": site_slug, "label": site_slug, "url": preview_url_for_slug(slug, site_slug)}
        ]
    suffix = get_settings().preview_domain_suffix
    return [
        {
            "site": site_slug,
            "label": f"Vakpagina {subject['display_name']}",
            "url": f"https://{slug}--{vak}.{suffix}/",
        }
        for vak, subject in SUBJECTS.items()
    ]

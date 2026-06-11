"""Branches en pull requests via de GitHub API."""

from app.config import get_settings
from app.github.client import GitHubClient, repo_path


async def list_branches(client: GitHubClient) -> list[dict]:
    branches = await client.get(repo_path("/branches"), params={"per_page": 100})
    return [{"name": b["name"], "sha": b["commit"]["sha"]} for b in branches]


async def create_branch(client: GitHubClient, name: str, from_branch: str = "main") -> dict:
    ref = await client.get(repo_path(f"/git/ref/heads/{from_branch}"))
    base_sha = ref["object"]["sha"]
    created = await client.post(
        repo_path("/git/refs"),
        json={"ref": f"refs/heads/{name}", "sha": base_sha},
        expect=(201,),
    )
    return {"name": name, "sha": created["object"]["sha"]}


async def list_prs(client: GitHubClient, state: str = "open") -> list[dict]:
    prs = await client.get(repo_path("/pulls"), params={"state": state, "per_page": 50})
    return [_pr_summary(pr) for pr in prs]


async def get_pr(client: GitHubClient, number: int) -> dict:
    pr = await client.get(repo_path(f"/pulls/{number}"))
    checks = await client.get(
        repo_path(f"/commits/{pr['head']['sha']}/check-runs"), params={"per_page": 50}
    )
    runs = [
        {
            "name": run["name"],
            "status": run["status"],
            "conclusion": run["conclusion"],
        }
        for run in checks.get("check_runs", [])
    ]
    summary = _pr_summary(pr)
    summary.update(
        {
            "body": pr.get("body"),
            "mergeable": pr.get("mergeable"),
            "merged": pr.get("merged", False),
            "checks": runs,
            "preview_branch_slug": branch_slug(pr["head"]["ref"]),
        }
    )
    return summary


async def create_pr(client: GitHubClient, branch: str, title: str, body: str = "") -> dict:
    pr = await client.post(
        repo_path("/pulls"),
        json={"title": title, "head": branch, "base": "main", "body": body},
        expect=(201,),
    )
    return _pr_summary(pr)


async def merge_pr(client: GitHubClient, number: int, method: str = "squash") -> dict:
    result = await client.put(
        repo_path(f"/pulls/{number}/merge"),
        json={"merge_method": method},
        expect=(200,),
    )
    return {"merged": result.get("merged", False), "sha": result.get("sha")}


async def close_pr(client: GitHubClient, number: int) -> dict:
    pr = await client.patch(repo_path(f"/pulls/{number}"), json={"state": "closed"})
    return _pr_summary(pr)


def _pr_summary(pr: dict) -> dict:
    return {
        "number": pr["number"],
        "title": pr["title"],
        "branch": pr["head"]["ref"],
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
    s = get_settings()
    return f"https://{branch_slug(branch)}--{site_slug}.{s.preview_domain_suffix}"

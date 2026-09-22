"""Serializable per-course overrides and constrained generated CSS."""

import base64
import json
import math
import re
from typing import Any

from fastapi import HTTPException

from app.github.client import GitHubClient, repo_path
from app.github.commits import multi_file_commit
from app.github.contents import content_root, get_branch_head

COLOR_TOKENS = {
    f"--ifm-color-primary{suffix}"
    for suffix in ("", "-dark", "-darker", "-darkest", "-light", "-lighter", "-lightest")
}
COLOR_TOKENS |= {"--ifm-background-color", "--ifm-font-color-base"}
FONT_TOKENS = {"--ifm-font-family-base", "--ifm-font-family-monospace"}
SIZE_TOKENS = {
    "--ifm-font-size-base",
    "--ifm-container-width",
    "--ifm-container-width-xl",
    "--ifm-spacing-horizontal",
    "--ifm-global-spacing",
    "--ifm-global-radius",
    "--ifm-code-font-size",
}
SITE_FIELDS = {"title", "tagline", "favicon", "description", "keywords", "image"}
DOC_FIELDS = {
    "breadcrumbs",
    "showLastUpdateTime",
    "showLastUpdateAuthor",
    "sidebarCollapsed",
    "sidebarCollapsible",
    "editUrl",
}


def invalid(path: str, message: str) -> None:
    raise HTTPException(422, f"{path}: {message}")


def _json_value(value: Any, path: str = "settings", depth: int = 0) -> None:
    if depth > 20:
        invalid(path, "te diep genest")
    if value is None or type(value) in (str, bool, int):
        return
    if isinstance(value, float) and math.isfinite(value):
        return
    if isinstance(value, list):
        for item in value:
            _json_value(item, path, depth + 1)
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if key in ("__proto__", "prototype", "constructor"):
                invalid(path, "ongeldige sleutel")
            _json_value(item, f"{path}.{key}", depth + 1)
        return
    invalid(path, "alleen eindige JSON-waarden toegestaan")


def validate_settings(value: dict) -> dict:
    _json_value(value)
    if type(value.get("version")) is not int or value["version"] != 1:
        invalid("version", "verwacht versie 1")
    if set(value) - {"version", "site", "themeConfig", "tokens", "docs"}:
        invalid("settings", "onbekende hoofdvelden")
    result = {"version": 1}
    for section in ("site", "themeConfig", "tokens", "docs"):
        data = value.get(section, {})
        if not isinstance(data, dict):
            invalid(section, "verwacht een object")
        result[section] = data
    for key, item in result["site"].items():
        if key not in SITE_FIELDS:
            invalid(f"site.{key}", "dit veld wordt niet beheerd")
        if key == "keywords":
            if not isinstance(item, list) or not all(isinstance(v, str) for v in item):
                invalid("site.keywords", "verwacht een lijst teksten")
        elif not isinstance(item, str):
            invalid(f"site.{key}", "verwacht tekst")
    for key, item in result["docs"].items():
        if key not in DOC_FIELDS:
            invalid(f"docs.{key}", "dit veld wordt niet beheerd")
        if key == "editUrl":
            if item is not None and not isinstance(item, str):
                invalid("docs.editUrl", "verwacht tekst of null")
        elif type(item) is not bool:
            invalid(f"docs.{key}", "verwacht boolean")
    theme = result["themeConfig"]
    toc = theme.get("tableOfContents", {})
    if not isinstance(toc, dict):
        invalid("themeConfig.tableOfContents", "verwacht een object")
    for key in ("minHeadingLevel", "maxHeadingLevel"):
        if key in toc and (type(toc[key]) is not int or not 2 <= toc[key] <= 6):
            invalid(f"themeConfig.tableOfContents.{key}", "kopniveaus moeten 2–6 zijn")
    if (
        "minHeadingLevel" in toc
        and "maxHeadingLevel" in toc
        and toc["minHeadingLevel"] > toc["maxHeadingLevel"]
    ):
        invalid("themeConfig.tableOfContents", "minimum moet ≤ maximum zijn")
    for section in ("navbar", "footer", "colorMode", "announcementBar", "prism", "docs"):
        if section in theme and not isinstance(theme[section], dict):
            invalid(f"themeConfig.{section}", "verwacht een object")
    mode = theme.get("colorMode", {})
    if "defaultMode" in mode and mode["defaultMode"] not in ("light", "dark"):
        invalid("themeConfig.colorMode.defaultMode", "verwacht light of dark")
    for key in ("disableSwitch", "respectPrefersColorScheme"):
        if key in mode and type(mode[key]) is not bool:
            invalid(f"themeConfig.colorMode.{key}", "verwacht boolean")
    for mode, tokens in result["tokens"].items():
        if mode not in ("light", "dark") or not isinstance(tokens, dict):
            invalid("tokens", "verwacht light/dark objecten")
        for name, token in tokens.items():
            if not isinstance(token, str) or len(token) > 300:
                invalid(f"tokens.{mode}.{name}", "verwacht korte CSS-waarde")
            if name in COLOR_TOKENS:
                valid = re.fullmatch(
                    r"#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})"
                    r"|(?:rgb|rgba|hsl|hsla)\([0-9.,% /+-]+\)",
                    token,
                )
            elif name in FONT_TOKENS:
                valid = re.fullmatch(r"[a-zA-Z0-9 ,'\"-]+", token)
            elif name in SIZE_TOKENS:
                valid = re.fullmatch(r"(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|%)", token)
            else:
                valid = False
            if not valid:
                invalid(f"tokens.{mode}.{name}", "ongeldige of niet-toegestane CSS-waarde")
    return result


def generate_css(settings: dict) -> str:
    settings = validate_settings(settings)
    lines = ["/* Generated from site-settings.json. */"]
    for mode, selector in (("light", ":root"), ("dark", '[data-theme="dark"]')):
        tokens = dict(settings["tokens"].get(mode, {}))
        primary = tokens.get("--ifm-color-primary", "")
        if re.fullmatch(r"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})", primary):
            color = primary[1:]
            if len(color) == 3:
                color = "".join(char * 2 for char in color)
            channels = [int(color[index : index + 2], 16) for index in (0, 2, 4)]
            for suffix, factor in (
                ("dark", 0.9),
                ("darker", 0.85),
                ("darkest", 0.7),
                ("light", 1.1),
                ("lighter", 1.15),
                ("lightest", 1.3),
            ):
                shade = "#" + "".join(
                    f"{min(255, math.floor(c * factor + 0.5)):02x}" for c in channels
                )
                tokens.setdefault(f"--ifm-color-primary-{suffix}", shade)
        if tokens:
            lines.append(f"{selector} {{")
            lines.extend(f"  {name}: {value};" for name, value in sorted(tokens.items()))
            lines.append("}")
    return "\n".join(lines) + "\n"


async def read_json(client: GitHubClient, path: str, ref: str) -> dict | None:
    data = await client.get(repo_path(f"/contents/{path}"), params={"ref": ref}, expect=(200, 404))
    if not isinstance(data, dict) or data.get("type") != "file":
        return None
    try:
        result = json.loads(base64.b64decode(data["content"]).decode("utf-8"))
    except (ValueError, KeyError, UnicodeError) as exc:
        raise HTTPException(422, f"Ongeldige JSON in {path}") from exc
    if not isinstance(result, dict):
        invalid(path, "verwacht een object")
    return result


async def read_settings(client: GitHubClient, site: str, ref: str) -> dict:
    content_root(site)
    head = await get_branch_head(client, ref)
    raw = await read_json(client, f"sites/{site}/site-settings.json", head)
    return {
        "settings": validate_settings(raw if raw is not None else {"version": 1}),
        "head_sha": head,
    }


async def save_settings(
    client: GitHubClient, site: str, branch: str, expected_head: str, settings: dict, message: str
) -> dict:
    content_root(site)
    value = validate_settings(settings)
    if not expected_head:
        invalid("expected_head", "verplicht")
    sha = await multi_file_commit(
        client,
        branch,
        message,
        expected_head=expected_head,
        add={
            f"sites/{site}/site-settings.json": (
                json.dumps(value, ensure_ascii=False, indent=2) + "\n"
            ).encode(),
            f"sites/{site}/src/css/managed-theme.css": generate_css(value).encode(),
        },
    )
    return {"settings": value, "commit_sha": sha, "head_sha": sha}


async def capabilities(client: GitHubClient, site: str, ref: str) -> dict:
    result = {
        "version": 1,
        "framework": "docusaurus" if site != "home" else "unsupported",
        "ref": ref,
        "head_sha": None,
        "managed_homepage": False,
        "settings_runtime": False,
        "mermaid": False,
        "math": False,
    }
    if site == "home":
        return result
    head = await get_branch_head(client, ref)
    result["head_sha"] = head
    manifest = await read_json(client, f"sites/{site}/authoring-capabilities.json", head)
    if manifest and manifest.get("version") == 1 and manifest.get("framework") == "docusaurus":
        for key in ("managed_homepage", "settings_runtime", "mermaid", "math"):
            result[key] = manifest.get(key) is True
        fields = manifest.get("homepage_fields")
        if isinstance(fields, list) and all(isinstance(field, str) for field in fields):
            result["homepage_fields"] = fields
    return result

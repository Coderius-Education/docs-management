"""Validate managed routes and metadata without rewriting original source."""

import json
import math
import posixpath
import re

import yaml
from fastapi import HTTPException

FRONTMATTER_RE = re.compile(
    r"\A---[ \t]*\r?\n(.*?)^---[ \t]*(?:\r?\n|\Z)", re.DOTALL | re.MULTILINE
)


def validate_content(scope: str, path: str, content: str) -> None:
    if scope == "docs":
        return
    try:
        if scope == "metadata":
            value = json.loads(content) if path.endswith(".json") else yaml.safe_load(content)
        else:
            match = FRONTMATTER_RE.match(content)
            value = yaml.safe_load(match.group(1)) if match else {}
            if value is None:
                value = {}
    except (ValueError, yaml.YAMLError) as exc:
        raise HTTPException(422, "Ongeldige JSON/YAML; herstel de broncode") from exc
    if not isinstance(value, dict):
        raise HTTPException(422, "Eigenschappen moeten een object zijn")
    if scope == "homepage" and any(value.get(flag) is True for flag in ("draft", "unlisted")):
        raise HTTPException(
            422,
            "Een homepage-concept gebruikt een aparte branch; "
            "draft/unlisted worden niet ondersteund",
        )
    if scope == "homepage" and "slug" in value and value["slug"] != "/":
        raise HTTPException(422, "De homepage gebruikt altijd de route /")
    if scope == "pages" and value.get("slug") == "/":
        raise HTTPException(422, "De route / is gereserveerd voor de homepage")
    if scope != "metadata":
        return
    if posixpath.basename(path).startswith("_category_"):
        for key in ("collapsed", "collapsible"):
            if key in value and type(value[key]) is not bool:
                raise HTTPException(422, f"{key}: verwacht boolean")
        for key in ("label", "className"):
            if key in value and not isinstance(value[key], str):
                raise HTTPException(422, f"{key}: verwacht tekst")
        if "position" in value and (
            type(value["position"]) not in (int, float) or not math.isfinite(value["position"])
        ):
            raise HTTPException(422, "position: verwacht een eindig getal")
        if "link" in value and value["link"] is not None:
            link = value["link"]
            if not isinstance(link, dict) or link.get("type") not in ("doc", "generated-index"):
                raise HTTPException(422, "link: verwacht doc of generated-index")
            if link["type"] == "doc" and not isinstance(link.get("id"), str):
                raise HTTPException(422, "link.id: document-id is verplicht")
    else:
        for key, tag in value.items():
            if not isinstance(key, str) or not isinstance(tag, dict):
                raise HTTPException(422, "Tags moeten benoemde objecten zijn")
            for field in ("label", "description", "permalink"):
                if field in tag and not isinstance(tag[field], str):
                    raise HTTPException(422, f"{key}.{field}: verwacht tekst")

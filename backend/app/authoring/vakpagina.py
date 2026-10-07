"""Vakpagina's: de startpagina van een vak, als JSON-document in de home-site.

Het document staat in ``sites/home/src/lib/vakpaginas/<vak>.json`` en gaat, net
als een cursushomepage, via een concept (branch + PR + voorbeeld) naar main. De
home-site zelf blijft verder buiten de editor (``content_root("home")`` weigert);
dit module schrijft alleen het eigen bestand en afbeeldingen in
``sites/home/static/vakpaginas/<vak>/``.

De regels zijn dezelfde als ``sites/home/src/lib/vakpagina/valideer.ts`` in de
docs-repo; ``tests/fixtures/vakpagina`` bevat dezelfde voorbeeldbestanden, zodat
de twee niet uit elkaar lopen.
"""

import base64
import hashlib
import json
import posixpath
import re
from typing import Literal
from urllib.parse import quote

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.authoring.settings import read_json
from app.config import SUBJECTS
from app.github.assets import image_type
from app.github.client import GitHubClient
from app.github.commits import multi_file_commit
from app.github.contents import get_branch_head, repo_path, safe_relative_path, validate_branch

HOME_DIR = "sites/home"
MAX_BLOKKEN = 200
MAX_DIEPTE = 4
MAX_BYTES = 256 * 1024

HEX = r"^#[0-9a-fA-F]{6}$"
BLOK_ID = r"^[A-Za-z0-9_-]{1,40}$"
BlokType = Literal[
    "Hero", "Section", "Columns", "Card", "Buttons", "Button", "Picture", "Divider", "Courses"
]
# Welke blokken kinderen mogen hebben, en welke.
KINDEREN: dict[str, set[str] | None] = {
    "Hero": {"Buttons"},
    "Section": None,  # alles
    "Columns": None,
    "Buttons": {"Button"},
}


def veilige_url(url: str) -> bool:
    if len(url) > 1000 or re.search(r"[\s\\]", url):
        return False
    return bool(re.match(r"^https://[^/]", url) or re.match(r"^/(?!/)", url) or url.startswith("#"))


def contrast(a: str, b: str) -> float:
    def lum(hex_: str) -> float:
        def kanaal(i: int) -> float:
            c = int(hex_[i : i + 2], 16) / 255
            return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

        return 0.2126 * kanaal(1) + 0.7152 * kanaal(3) + 0.0722 * kanaal(5)

    hoog, laag = sorted((lum(a), lum(b)), reverse=True)
    return (hoog + 0.05) / (laag + 0.05)


class _Strikt(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _url(waarde: str | None) -> str | None:
    if waarde is not None and not veilige_url(waarde):
        raise ValueError("geen veilige url (https://, /pad of #anker)")
    return waarde


class BlokProps(_Strikt):
    width: Literal["full", "wide", "normal", "narrow"] | None = None
    spacing: Literal["none", "small", "normal", "large"] | None = None
    align: Literal["left", "center", "right"] | None = None
    background: Literal["transparent", "muted", "primary"] | None = None
    title: str | None = Field(default=None, max_length=300)
    tagline: str | None = Field(default=None, max_length=300)
    subtitle: str | None = Field(default=None, max_length=300)
    info: str | None = Field(default=None, max_length=300)
    alt: str | None = Field(default=None, max_length=300)
    caption: str | None = Field(default=None, max_length=300)
    variant: Literal["default", "compact", "plain", "primary", "secondary"] | None = None
    count: int | None = Field(default=None, ge=1, le=4)
    href: str | None = None
    src: str | None = None
    size: Literal["sm", "lg"] | None = None
    automatischeKop: bool | None = None  # noqa: N815 - naam uit het document
    filters: bool | None = None
    niveaus: list[str] | None = Field(default=None, max_length=50)
    themas: list[str] | None = Field(default=None, max_length=50)
    uitgelicht: list[str] | None = Field(default=None, max_length=50)
    alleen: list[str] | None = Field(default=None, max_length=50)

    @field_validator("href", "src")
    @classmethod
    def _urls(cls, waarde: str | None) -> str | None:
        return _url(waarde)

    @field_validator("niveaus", "themas", "uitgelicht", "alleen")
    @classmethod
    def _korte_waarden(cls, waarden: list[str] | None) -> list[str] | None:
        if waarden and any(len(w) > 50 for w in waarden):
            raise ValueError("waarde te lang")
        return waarden


class Blok(_Strikt):
    id: str = Field(pattern=BLOK_ID)
    type: BlokType
    props: BlokProps = Field(default_factory=BlokProps)
    tekst: str | None = Field(default=None, max_length=5000)
    kinderen: list["Blok"] | None = None


class Kleuren(_Strikt):
    primary: str | None = Field(default=None, pattern=HEX)
    primaryForeground: str | None = Field(default=None, pattern=HEX)  # noqa: N815


class Logo(_Strikt):
    licht: str | None = None
    donker: str | None = None

    @field_validator("licht", "donker")
    @classmethod
    def _urls(cls, waarde: str | None) -> str | None:
        return _url(waarde)


class Thema(_Strikt):
    licht: Kleuren | None = None
    donker: Kleuren | None = None
    kopletter: Literal["literata", "atkinson", "mono"] | None = None
    logo: Logo | None = None


class Meta(_Strikt):
    titel: str | None = Field(default=None, max_length=300)
    omschrijving: str | None = Field(default=None, max_length=300)
    # 300, net als de andere meta-velden in valideer.ts van home.
    afbeelding: str | None = Field(default=None, max_length=300)

    @field_validator("afbeelding")
    @classmethod
    def _urls(cls, waarde: str | None) -> str | None:
        return _url(waarde)


class Vakpagina(_Strikt):
    version: Literal[1]
    vak: str
    meta: Meta | None = None
    thema: Thema | None = None
    blokken: list[Blok]


def _fout(melding: str) -> HTTPException:
    return HTTPException(status_code=422, detail=melding)


def _controleer_blokken(blokken: list[Blok]) -> None:
    ids: set[str] = set()
    aantal = 0

    def loop(lijst: list[Blok], diepte: int, ouder: str | None) -> None:
        nonlocal aantal
        if diepte > MAX_DIEPTE:
            raise _fout("De blokken zijn te diep genest")
        for blok in lijst:
            aantal += 1
            plek = f"Blok {blok.id}"
            if blok.id in ids:
                raise _fout(f"{plek}: id komt twee keer voor")
            ids.add(blok.id)
            if ouder is not None:
                mag = KINDEREN.get(ouder, set())
                if mag is not None and blok.type not in mag:
                    raise _fout(f"{plek}: {blok.type} mag niet in {ouder}")
            if blok.type == "Button" and ouder != "Buttons":
                raise _fout(f"{plek}: een knop staat in een Knoppen-blok")
            p = blok.props
            if p.variant is not None:
                mag_variant = {
                    "Button": {"primary", "secondary"},
                    "Hero": {"default", "compact", "plain"},
                }.get(blok.type, set())
                if p.variant not in mag_variant:
                    raise _fout(f"{plek}: variant")
            if p.size is not None and blok.type != "Button":
                raise _fout(f"{plek}: size")
            if blok.type == "Picture" and (not p.src or not p.alt):
                raise _fout(f"{plek}: een afbeelding heeft src en alt")
            if blok.kinderen:
                if blok.type not in KINDEREN:
                    raise _fout(f"{plek}: {blok.type} heeft geen kinderen")
                loop(blok.kinderen, diepte + 1, blok.type)

    loop(blokken, 1, None)
    if aantal > MAX_BLOKKEN:
        raise _fout(f"Hoogstens {MAX_BLOKKEN} blokken")


def validate_vakpagina(vak: str, data: object) -> dict:
    """Gevalideerd document (zonder lege velden), of 422 met een Nederlandse melding."""
    if len(json.dumps(data, ensure_ascii=False).encode()) > MAX_BYTES:
        raise _fout("De vakpagina is te groot")
    try:
        doc = Vakpagina.model_validate(data)
    except ValidationError as exc:
        eerste = exc.errors()[0]
        plek = ".".join(str(p) for p in eerste["loc"])
        raise _fout(f"Ongeldige vakpagina bij {plek}: {eerste['msg']}") from None
    if doc.vak != vak:
        raise _fout(f"Dit document hoort bij vak '{doc.vak}', niet bij '{vak}'")
    for modus in ("licht", "donker"):
        kleuren = getattr(doc.thema, modus, None) if doc.thema else None
        if kleuren and kleuren.primary and kleuren.primaryForeground:
            if contrast(kleuren.primary, kleuren.primaryForeground) < 4.5:
                raise _fout(f"Thema {modus}: tekst op de hoofdkleur haalt geen 4,5:1 contrast")
    _controleer_blokken(doc.blokken)
    return doc.model_dump(exclude_none=True)


def _bestaand_vak(vak: str) -> str:
    if vak not in SUBJECTS:
        raise HTTPException(status_code=404, detail="Onbekend vak")
    return vak


def vakpagina_pad(vak: str) -> str:
    return f"{HOME_DIR}/src/lib/vakpaginas/{_bestaand_vak(vak)}.json"


def afbeelding_map(vak: str) -> str:
    return f"{HOME_DIR}/static/vakpaginas/{_bestaand_vak(vak)}"


async def read_vakpagina(client: GitHubClient, vak: str, ref: str) -> dict:
    pad = vakpagina_pad(vak)
    head = await get_branch_head(client, ref)
    raw = await read_json(client, pad, head)
    result: dict = {"head_sha": head, "document": raw}
    if raw is not None:
        try:
            result["document"] = validate_vakpagina(vak, raw)
        except HTTPException as exc:
            # Een met de hand bewerkt bestand moet herstelbaar blijven.
            result["document_error"] = str(exc.detail)
    return result


async def save_vakpagina(
    client: GitHubClient,
    vak: str,
    branch: str,
    expected_head: str,
    message: str,
    document: dict,
) -> dict:
    pad = vakpagina_pad(vak)
    validate_branch(branch, writing=True)
    if not expected_head:
        raise HTTPException(422, "expected_head: verplicht")
    value = validate_vakpagina(vak, document)
    inhoud = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
    sha = await multi_file_commit(
        client, branch, message, expected_head=expected_head, add={pad: inhoud}
    )
    return {"head_sha": sha, "document": value}


async def write_vak_image(
    client: GitHubClient, vak: str, branch: str, filename: str, content: bytes
) -> dict:
    """Afbeelding naar static/vakpaginas/<vak>/; de naam krijgt een inhouds-hash."""
    validate_branch(branch, writing=True)
    image_type(filename, content)
    stem, extension = posixpath.splitext(posixpath.basename(filename))
    stem = re.sub(r"[^a-z0-9-]+", "-", stem.lower()).strip("-")[:60] or "afbeelding"
    name = safe_relative_path(
        f"{stem}-{hashlib.sha256(content).hexdigest()[:16]}{extension.lower()}"
    )
    full_path = f"{afbeelding_map(vak)}/{name}"
    endpoint = repo_path(f"/contents/{quote(full_path, safe='/')}")
    existing = await client.get(endpoint, params={"ref": branch}, expect=(200, 404))
    commit_sha = None
    if not (isinstance(existing, dict) and existing.get("type") == "file"):
        result = await client.put(
            endpoint,
            json={
                "message": f"Afbeelding voor de vakpagina: {name}",
                "branch": branch,
                "content": base64.b64encode(content).decode("ascii"),
            },
        )
        commit_sha = result["commit"]["sha"]
    return {"commit_sha": commit_sha, "url": f"/vakpaginas/{vak}/{name}"}


async def read_vak_image(client: GitHubClient, vak: str, name: str, ref: str) -> tuple[bytes, str]:
    """Een afbeelding van een concept, voor het voorbeeld in de studio."""
    safe_relative_path(name)
    if "/" in name:
        raise HTTPException(400, "Ongeldig pad")
    media_type = image_type(name)
    data = await client.get(
        repo_path(f"/contents/{quote(afbeelding_map(vak) + '/' + name, safe='/')}"),
        params={"ref": ref},
    )
    if not isinstance(data, dict) or data.get("type") != "file" or not data.get("content"):
        raise HTTPException(404, "Afbeelding niet gevonden")
    content = base64.b64decode(data["content"])
    image_type(name, content)
    return content, media_type

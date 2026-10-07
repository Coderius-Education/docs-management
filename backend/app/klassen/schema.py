"""Vorm en validatie van de inhoud van een klas.

De inhoud is wat leerlingen zien: een intro, groepen met snelkoppelingen
(cursus, les of externe link) en per cursus welke hoofdstukken in de
navigatie verborgen of anders geordend zijn. Hoofdstukken heten naar hun
sleutel uit het sidebar-manifest van de cursusbuild (`cat:`, `doc:`, `link:`).
"""

import json
import re
from typing import Annotated, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.config import SITE_REGISTRY, site_subject

MAX_GROEPEN = 20
MAX_ITEMS_PER_GROEP = 50
MAX_ITEMS = 100
MAX_HOOFDSTUKKEN = 200
MAX_BYTES = 64 * 1024

HOOFDSTUK_SLEUTEL = re.compile(r"^(cat|doc|link):[^\s]{1,300}$")
DOC_ID = re.compile(r"^[A-Za-z0-9_./-]{1,300}$")
# Een lespad blijft op de eigen host: geen spaties, stuurtekens of backslashes
# (browsers halen tabs uit een URL, dus "/\t/x" zou "//x" worden).
VEILIG_PAD = re.compile(r"^/[A-Za-z0-9._~!$&'()*+,;=:@%/#?-]*$")


class _Strikt(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CursusItem(_Strikt):
    type: Literal["cursus"]
    site: str = Field(max_length=50)
    label: str | None = Field(default=None, max_length=100)


class PaginaItem(_Strikt):
    type: Literal["pagina"]
    site: str = Field(max_length=50)
    docId: str = Field(pattern=DOC_ID.pattern)
    pad: str = Field(max_length=500, pattern=VEILIG_PAD.pattern)
    label: str = Field(min_length=1, max_length=100)


class LinkItem(_Strikt):
    type: Literal["link"]
    url: str = Field(max_length=1000)
    label: str = Field(min_length=1, max_length=100)

    @field_validator("url")
    @classmethod
    def _https(cls, url: str) -> str:
        if not re.match(r"^https://[^\s/\\]+", url) or re.search(r"[\s\x00-\x1f\\]", url):
            raise ValueError("Een link moet met https:// beginnen")
        return url


Item = Annotated[CursusItem | PaginaItem | LinkItem, Field(discriminator="type")]


class Groep(_Strikt):
    id: str = Field(pattern=r"^[a-z0-9-]{1,32}$")
    titel: str = Field(default="", max_length=100)
    items: list[Item] = Field(default_factory=list, max_length=MAX_ITEMS_PER_GROEP)


class Hoofdstukken(_Strikt):
    volgorde: list[str] = Field(default_factory=list, max_length=MAX_HOOFDSTUKKEN)
    verborgen: list[str] = Field(default_factory=list, max_length=MAX_HOOFDSTUKKEN)

    @field_validator("volgorde", "verborgen")
    @classmethod
    def _sleutels(cls, keys: list[str]) -> list[str]:
        for key in keys:
            if not HOOFDSTUK_SLEUTEL.match(key):
                raise ValueError(f"Onbekende hoofdstuksleutel: {key[:60]}")
        return list(dict.fromkeys(keys))


class KlasInhoud(_Strikt):
    versie: Literal[1] = 1
    intro: str = Field(default="", max_length=2000)
    groepen: list[Groep] = Field(default_factory=list, max_length=MAX_GROEPEN)
    cursussen: dict[str, Hoofdstukken] = Field(default_factory=dict)


def lege_inhoud() -> dict:
    return KlasInhoud().model_dump()


def _site_pad(site: str) -> str:
    return SITE_REGISTRY.get(site, {}).get("path") or site


def _fout(melding: str) -> HTTPException:
    return HTTPException(status_code=422, detail=melding)


def valideer_inhoud(vak: str, data: object) -> dict:
    """Gevalideerde, genormaliseerde inhoud, of 422 met een Nederlandse melding."""
    if len(json.dumps(data, ensure_ascii=False).encode()) > MAX_BYTES:
        raise _fout("De klas is te groot; haal wat snelkoppelingen weg")
    try:
        inhoud = KlasInhoud.model_validate(data)
    except ValidationError as exc:
        eerste = exc.errors()[0]
        plek = ".".join(str(p) for p in eerste["loc"])
        raise _fout(f"Ongeldige klasinhoud bij {plek}: {eerste['msg']}") from None

    if sum(len(g.items) for g in inhoud.groepen) > MAX_ITEMS:
        raise _fout(f"Een klas heeft hoogstens {MAX_ITEMS} snelkoppelingen")
    if len({g.id for g in inhoud.groepen}) != len(inhoud.groepen):
        raise _fout("Twee groepen hebben hetzelfde id")

    def eigen_site(site: str) -> None:
        if site_subject(site) != vak:
            raise _fout(f"Cursus '{site}' hoort niet bij dit vak")

    for groep in inhoud.groepen:
        for item in groep.items:
            if isinstance(item, CursusItem | PaginaItem):
                eigen_site(item.site)
            if isinstance(item, PaginaItem) and not item.pad.startswith(
                f"/{_site_pad(item.site)}/"
            ):
                raise _fout(f"Les '{item.label}' wijst niet naar cursus '{item.site}'")
    for site in inhoud.cursussen:
        eigen_site(site)
    return inhoud.model_dump()

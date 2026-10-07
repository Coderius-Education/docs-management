"""compose.yml: één wildcard-router voor alle vak-domeinen, en de admin wint.

Welke site bij welke host hoort beslist de delivery-app (sites.json); daardoor
vraagt een nieuwe site of een nieuw vak geen compose-wijziging meer.
"""

import re
from pathlib import Path

import yaml

COMPOSE = Path(__file__).resolve().parents[2] / "compose.yml"


def _labels(service: str) -> dict[str, str]:
    data = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    labels = data["services"][service]["labels"]
    return dict(label.split("=", 1) for label in labels)


def _rule_regex(rule: str) -> re.Pattern:
    match = re.fullmatch(r"HostRegexp\(`(.+)`\)", rule)
    assert match, rule
    return re.compile(match.group(1))


def test_single_wildcard_site_router():
    labels = _labels("delivery")
    routers = {key.split(".")[3] for key in labels if key.startswith("traefik.http.routers.")}
    assert routers == {"docsite", "docspreview"}
    regex = _rule_regex(labels["traefik.http.routers.docsite.rule"])
    for host in ("coderius.nl", "informatica.coderius.nl", "wo.coderius.nl", "python.coderius.nl"):
        assert regex.match(host), host
    assert not regex.match("evilcoderius.nl")
    assert not regex.match("x--informatica.preview.coderius.nl")


def test_wildcard_cert_via_dns01():
    labels = _labels("delivery")
    assert labels["traefik.http.routers.docsite.tls.certresolver"] == "lednsresolver"
    assert labels["traefik.http.routers.docsite.tls.domains[0].main"] == "coderius.nl"
    assert labels["traefik.http.routers.docsite.tls.domains[0].sans"] == "*.coderius.nl"


def test_preview_router_matches_subject_previews():
    labels = _labels("delivery")
    regex = _rule_regex(labels["traefik.http.routers.docspreview.rule"])
    assert regex.match("concept-python-1--informatica.preview.coderius.nl")


def test_admin_router_wins_over_wildcard():
    admin = _labels("api")
    delivery = _labels("delivery")
    assert int(admin["traefik.http.routers.docsadmin.priority"]) > int(
        delivery["traefik.http.routers.docsite.priority"]
    )

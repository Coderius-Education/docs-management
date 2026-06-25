"""Tests voor de Traefik-router-mutatie bij het toevoegen van een site.

Elk domein hoort zijn eigen router (en dus eigen certificaataanvraag) te krijgen,
zodat een mislukt cert voor één domein de andere sites niet meesleurt.
"""

from app.scaffold.site_template import add_domain_to_traefik

# Compose-fixture in de nieuwe vorm: één router per domein.
COMPOSE = (
    "services:\n  delivery:\n    labels:\n"
    "      - traefik.enable=true\n"
    "      - traefik.http.routers.docsite-python-coderius-nl.rule=Host(`python.coderius.nl`)\n"
    "      - traefik.http.routers.docsite-python-coderius-nl.entrypoints=websecure\n"
    "      - traefik.http.routers.docsite-python-coderius-nl.tls.certresolver=leresolver\n"
    "      - traefik.http.routers.docsite-python-coderius-nl.service=docsdelivery\n"
    "      - traefik.http.services.docsdelivery.loadbalancer.server.port=8000\n"
)


def test_adds_separate_router_with_own_certresolver():
    out = add_domain_to_traefik(COMPOSE, "demo.coderius.nl")
    name = "docsite-demo-coderius-nl"
    assert f"traefik.http.routers.{name}.rule=Host(`demo.coderius.nl`)" in out
    assert f"traefik.http.routers.{name}.entrypoints=websecure" in out
    assert f"traefik.http.routers.{name}.tls.certresolver=leresolver" in out
    assert f"traefik.http.routers.{name}.service=docsdelivery" in out


def test_new_router_is_standalone_not_merged_into_a_shared_rule():
    out = add_domain_to_traefik(COMPOSE, "demo.coderius.nl")
    # De nieuwe regel is een losse Host()-router, niet ge-OR'd in een bestaande rule.
    assert "Host(`demo.coderius.nl`) ||" not in out
    assert "|| Host(`demo.coderius.nl`)" not in out


def test_existing_routers_are_left_untouched():
    out = add_domain_to_traefik(COMPOSE, "demo.coderius.nl")
    # De bestaande python-router blijft een eigen router met eigen certresolver.
    assert "traefik.http.routers.docsite-python-coderius-nl.rule=Host(`python.coderius.nl`)" in out
    assert "traefik.http.routers.docsite-python-coderius-nl.tls.certresolver=leresolver" in out


def test_rejects_duplicate_domain():
    import pytest

    with pytest.raises(ValueError):
        add_domain_to_traefik(COMPOSE, "python.coderius.nl")

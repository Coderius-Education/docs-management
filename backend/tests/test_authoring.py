import base64
import json

import pytest
import respx
from fastapi import HTTPException
from httpx import Response

from app.github.contents import safe_page_path
from tests.helpers import make_logged_in_user

REPO = "https://api.github.com/repos/Coderius-Education/docs"
EMPTY = {"version": 1, "site": {}, "themeConfig": {}, "tokens": {}, "docs": {}}


@pytest.mark.parametrize(
    "scope,path,want",
    [
        ("docs", "lesson.mdx", "sites/python/docs/lesson.mdx"),
        ("pages", "about.md", "sites/python/src/pages/about.md"),
        ("homepage", "homepage.mdx", "sites/python/src/content/homepage.mdx"),
        ("metadata", "unit/_category_.yaml", "sites/python/docs/unit/_category_.yaml"),
        ("metadata", "tags.yml", "sites/python/docs/tags.yml"),
    ],
)
def test_scope_resolves_only_its_content_root(scope, path, want):
    assert safe_page_path("python", path, scope) == want


@pytest.mark.parametrize(
    "scope,path",
    [
        ("pages", "../index.tsx"),
        ("pages", "index.tsx"),
        ("pages", "index.mdx"),
        ("homepage", "other.mdx"),
        ("docs", "config.js"),
        ("metadata", "package.json"),
        ("docs", "%2e%2e/secret.md"),
        ("docs", "%252e%252e/secret.md"),
        ("docs", "/absolute.md"),
        ("docs", r"..\secret.md"),
        ("docs", "foo/./bar.md"),
    ],
)
def test_scope_rejects_traversal_and_executable_paths(scope, path):
    with pytest.raises(HTTPException) as error:
        safe_page_path("python", path, scope)
    assert error.value.status_code == 400


@respx.mock
async def test_page_read_uses_scope_and_selected_branch(api_client):
    await make_logged_in_user(api_client)
    respx.get(f"{REPO}/contents/sites/python/src/pages/about.md", params={"ref": "draft"}).mock(
        return_value=Response(
            200,
            json={"type": "file", "sha": "blob", "content": base64.b64encode(b"# About").decode()},
        )
    )
    response = await api_client.get(
        "/api/sites/python/page", params={"scope": "pages", "path": "about.md", "ref": "draft"}
    )
    assert response.status_code == 200
    assert response.json()["content"] == "# About"


@respx.mock
async def test_home_has_no_course_editor(api_client):
    await make_logged_in_user(api_client)
    response = await api_client.get("/api/sites/home/page", params={"path": "test.mdx"})
    assert response.status_code == 400


@respx.mock
async def test_settings_read_pins_content_to_head(api_client):
    await make_logged_in_user(api_client)
    respx.get(f"{REPO}/git/ref/heads/draft").mock(
        return_value=Response(200, json={"object": {"sha": "oldhead"}})
    )
    respx.get(f"{REPO}/contents/sites/python/site-settings.json", params={"ref": "oldhead"}).mock(
        return_value=Response(404, json={"message": "Not Found"})
    )
    response = await api_client.get("/api/sites/python/settings", params={"ref": "draft"})
    assert response.status_code == 200
    assert response.json() == {"settings": EMPTY, "head_sha": "oldhead"}


@respx.mock
async def test_stale_settings_never_write(api_client):
    auth = await make_logged_in_user(api_client)
    respx.get(f"{REPO}/git/ref/heads/draft").mock(
        return_value=Response(200, json={"object": {"sha": "changed"}})
    )
    response = await api_client.put(
        "/api/sites/python/settings",
        json={"branch": "draft", "expected_head": "oldhead", "settings": EMPTY, "message": "Theme"},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert response.status_code == 409
    assert len(respx.calls) == 1


@pytest.mark.parametrize(
    "settings",
    [
        {**EMPTY, "version": 2},
        {**EMPTY, "tokens": {"light": {"--ifm-color-primary": "red;}body{display:none"}}},
        {**EMPTY, "tokens": {"light": {"--unknown": "#ffffff"}}},
        {**EMPTY, "themeConfig": {"tableOfContents": {"minHeadingLevel": 6, "maxHeadingLevel": 2}}},
        {**EMPTY, "site": {"title": False}},
        {**EMPTY, "site": {"url": "https://outside.example"}},
    ],
)
@respx.mock
async def test_invalid_settings_never_write(api_client, settings):
    auth = await make_logged_in_user(api_client)
    response = await api_client.put(
        "/api/sites/python/settings",
        json={"branch": "draft", "expected_head": "head", "settings": settings, "message": "Theme"},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert response.status_code == 422, response.text
    assert not respx.calls


@respx.mock
async def test_settings_save_commits_json_and_css_atomically(api_client):
    auth = await make_logged_in_user(api_client)
    settings = {
        **EMPTY,
        "themeConfig": {"navbar": {"items": []}, "hideOnScroll": False},
        "tokens": {
            "light": {"--ifm-color-primary": "#123456"},
            "dark": {"--ifm-color-primary": "#abcdef"},
        },
    }
    respx.get(f"{REPO}/git/ref/heads/draft").mock(
        return_value=Response(200, json={"object": {"sha": "head"}})
    )
    respx.get(f"{REPO}/git/commits/head").mock(
        return_value=Response(200, json={"tree": {"sha": "tree"}})
    )
    blobs = respx.post(f"{REPO}/git/blobs").mock(
        side_effect=[
            Response(201, json={"sha": "jsonblob"}),
            Response(201, json={"sha": "cssblob"}),
        ]
    )
    tree = respx.post(f"{REPO}/git/trees").mock(return_value=Response(201, json={"sha": "newtree"}))
    respx.post(f"{REPO}/git/commits").mock(return_value=Response(201, json={"sha": "newcommit"}))
    update = respx.patch(f"{REPO}/git/refs/heads/draft").mock(return_value=Response(200, json={}))
    response = await api_client.put(
        "/api/sites/python/settings",
        json={"branch": "draft", "expected_head": "head", "settings": settings, "message": "Theme"},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["head_sha"] == "newcommit"
    content = [
        base64.b64decode(json.loads(c.request.content)["content"]).decode() for c in blobs.calls
    ]
    assert json.loads(content[0]) == settings
    assert "--ifm-color-primary: #123456;" in content[1]
    assert '[data-theme="dark"]' in content[1]
    paths = [item["path"] for item in json.loads(tree.calls[0].request.content)["tree"]]
    assert paths == ["sites/python/site-settings.json", "sites/python/src/css/managed-theme.css"]
    assert json.loads(update.calls[0].request.content).get("force", False) is False


@respx.mock
async def test_capabilities_read_selected_branch_manifest(api_client):
    await make_logged_in_user(api_client)
    respx.get(f"{REPO}/git/ref/heads/draft").mock(
        return_value=Response(200, json={"object": {"sha": "head"}})
    )
    manifest = {
        "version": 1,
        "framework": "docusaurus",
        "managed_homepage": True,
        "homepage_fields": ["title", "description", "fullscreen"],
        "settings_runtime": True,
        "mermaid": False,
        "math": False,
    }
    respx.get(
        f"{REPO}/contents/sites/python/authoring-capabilities.json", params={"ref": "head"}
    ).mock(
        return_value=Response(
            200,
            json={
                "type": "file",
                "content": base64.b64encode(json.dumps(manifest).encode()).decode(),
            },
        )
    )
    response = await api_client.get("/api/sites/python/capabilities", params={"ref": "draft"})
    assert response.status_code == 200
    assert response.json() == {**manifest, "ref": "draft", "head_sha": "head"}


@pytest.mark.parametrize(
    "scope,path,content",
    [
        ("homepage", "homepage.mdx", "---\nslug: /another-route\n---\n# Home"),
        ("pages", "about.mdx", "---\nslug: /\n---\n# About"),
        ("metadata", "_category_.json", '{"position": "first"}'),
        ("metadata", "_category_.yaml", "collapsed: nope"),
        ("metadata", "tags.yml", "- not-a-mapping"),
    ],
)
@respx.mock
async def test_invalid_managed_content_never_commits(api_client, scope, path, content):
    auth = await make_logged_in_user(api_client)
    response = await api_client.put(
        "/api/sites/python/page",
        json={
            "scope": scope,
            "path": path,
            "branch": "draft",
            "content": content,
            "message": "Edit",
        },
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert response.status_code == 422
    assert not respx.calls


@respx.mock
async def test_page_tree_hides_executable_files_and_other_site(api_client):
    await make_logged_in_user(api_client)
    respx.get(f"{REPO}/git/ref/heads/draft").mock(
        return_value=Response(200, json={"object": {"sha": "head"}})
    )
    respx.get(f"{REPO}/git/trees/head").mock(
        return_value=Response(
            200,
            json={
                "tree": [
                    {"path": "sites/python/src/pages/about.md", "type": "blob", "sha": "a"},
                    {"path": "sites/python/src/pages/index.tsx", "type": "blob", "sha": "b"},
                    {"path": "sites/web/src/pages/about.md", "type": "blob", "sha": "c"},
                ]
            },
        )
    )
    response = await api_client.get(
        "/api/sites/python/tree", params={"scope": "pages", "ref": "draft"}
    )
    assert response.json() == [{"path": "about.md", "type": "blob", "sha": "a"}]


@pytest.mark.parametrize(
    "scope,root,url_prefix",
    [
        ("pages", "src/pages", "./"),
        ("homepage", "static/managed", "/managed/"),
    ],
)
@respx.mock
async def test_scoped_assets_use_publishable_paths(api_client, scope, root, url_prefix):
    from tests.test_assets import NAME, PNG

    auth = await make_logged_in_user(api_client)
    target = f"{REPO}/contents/sites/python/{root}/{NAME}"
    respx.get(target).mock(return_value=Response(404, json={"message": "Not Found"}))
    respx.put(target).mock(return_value=Response(201, json={"commit": {"sha": "image"}}))
    response = await api_client.post(
        "/api/sites/python/assets",
        data={"scope": scope, "branch": "draft"},
        files={"file": ("diagram.png", PNG, "image/png")},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["url"] == url_prefix + NAME


@pytest.mark.parametrize(
    "endpoint,payload",
    [
        ("settings", {"expected_head": "head", "settings": EMPTY, "message": "Theme"}),
        (
            "page",
            {"path": "homepage.mdx", "scope": "homepage", "content": "# Home", "message": "Home"},
        ),
    ],
)
@respx.mock
async def test_new_writes_keep_main_protected(api_client, endpoint, payload):
    auth = await make_logged_in_user(api_client)
    response = await api_client.put(
        f"/api/sites/python/{endpoint}",
        json={**payload, "branch": "main"},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert response.status_code == 400
    assert not respx.calls


def test_theme_tokens_cover_surface_text_and_spacing():
    from app.authoring.settings import generate_css

    css = generate_css(
        {
            **EMPTY,
            "tokens": {
                "dark": {
                    "--ifm-background-color": "#112233",
                    "--ifm-font-color-base": "#eeeeee",
                    "--ifm-spacing-horizontal": "1.2rem",
                }
            },
        }
    )
    assert "--ifm-background-color: #112233;" in css
    assert "--ifm-font-color-base: #eeeeee;" in css
    assert "--ifm-spacing-horizontal: 1.2rem;" in css


@pytest.mark.parametrize(
    "branch", ["draft/../main", "draft%2f..%2fmain", "/main", "draft?other=main"]
)
@respx.mock
async def test_settings_branch_cannot_address_main_through_url_normalization(api_client, branch):
    auth = await make_logged_in_user(api_client)
    response = await api_client.put(
        "/api/sites/python/settings",
        json={
            "branch": branch,
            "expected_head": "head",
            "settings": EMPTY,
            "message": "Theme",
        },
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert response.status_code == 400
    assert not respx.calls


def test_primary_generates_shades_without_replacing_explicit_shade():
    from app.authoring.settings import generate_css

    css = generate_css(
        {
            **EMPTY,
            "tokens": {
                "light": {
                    "--ifm-color-primary": "#808080",
                    "--ifm-color-primary-darkest": "#112233",
                }
            },
        }
    )
    assert "--ifm-color-primary-dark: #737373;" in css
    assert "--ifm-color-primary-light: #8d8d8d;" in css
    assert "--ifm-color-primary-darkest: #112233;" in css
    assert "--ifm-color-primary-" not in generate_css(EMPTY)


@pytest.mark.parametrize("flag", ["draft", "unlisted"])
@respx.mock
async def test_homepage_draft_flag_cannot_claim_runtime_exclusion(api_client, flag):
    auth = await make_logged_in_user(api_client)
    response = await api_client.put(
        "/api/sites/python/page",
        json={
            "scope": "homepage",
            "path": "homepage.mdx",
            "branch": "draft",
            "content": f"---\n{flag}: true\n---\n# Home",
            "message": "Home",
        },
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert response.status_code == 422
    assert "branch" in response.json()["detail"]
    assert not respx.calls


@respx.mock
async def test_branch_advancing_during_commit_returns_conflict():
    from app.github.client import GitHubClient
    from app.github.commits import multi_file_commit

    respx.get(f"{REPO}/git/ref/heads/draft").mock(
        return_value=Response(200, json={"object": {"sha": "head"}})
    )
    respx.get(f"{REPO}/git/commits/head").mock(
        return_value=Response(200, json={"tree": {"sha": "tree"}})
    )
    respx.post(f"{REPO}/git/trees").mock(return_value=Response(201, json={"sha": "newtree"}))
    respx.post(f"{REPO}/git/commits").mock(return_value=Response(201, json={"sha": "newcommit"}))
    update = respx.patch(f"{REPO}/git/refs/heads/draft").mock(
        return_value=Response(422, json={"message": "Update is not a fast forward"})
    )
    with pytest.raises(HTTPException) as error:
        await multi_file_commit(
            GitHubClient("token"),
            "draft",
            "Edit",
            delete=["sites/python/docs/a.md"],
            expected_head="head",
        )
    assert error.value.status_code == 409
    assert json.loads(update.calls[0].request.content)["force"] is False


@respx.mock
async def test_metadata_write_preserves_comments_null_and_unknown_properties(api_client):
    auth = await make_logged_in_user(api_client)
    source = (
        "# Keep this explanation\nlabel: Course\nlink: null\n"
        "customProps:\n  tracking: false\nunknown: [a, b]\n"
    )
    target = respx.put(f"{REPO}/contents/sites/python/docs/unit/_category_.yaml").mock(
        return_value=Response(200, json={"commit": {"sha": "saved"}, "content": {"sha": "blob"}})
    )
    response = await api_client.put(
        "/api/sites/python/page",
        json={
            "scope": "metadata",
            "path": "unit/_category_.yaml",
            "branch": "draft",
            "content": source,
            "sha": "old",
            "message": "Category",
        },
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert response.status_code == 200
    assert (
        base64.b64decode(json.loads(target.calls[0].request.content)["content"]).decode() == source
    )


@pytest.mark.parametrize(
    "variant,available",
    [
        ("matching", True),
        ("old-build", False),
        ("wrong-branch", False),
        ("failed", False),
        ("dirty", False),
        ("wrong-manifest-commit", False),
        ("invalid-json", False),
        ("escaped-path", False),
    ],
)
@respx.mock
async def test_settings_only_expose_effective_manifest_for_exact_clean_build(
    api_client, builds_dir, tmp_path, variant, available
):
    from sqlalchemy import select

    from app.db.models import Build, BuildStatus, Site
    from app.db.session import get_sessionmaker

    await make_logged_in_user(api_client)
    head = "a" * 40
    respx.get(f"{REPO}/git/ref/heads/draft").mock(
        return_value=Response(200, json={"object": {"sha": head}})
    )
    respx.get(f"{REPO}/contents/sites/python/site-settings.json", params={"ref": head}).mock(
        return_value=Response(404, json={"message": "Not Found"})
    )
    build_path = builds_dir / "python" / "draft" / head[:12]
    if variant == "escaped-path":
        build_path = tmp_path / "elsewhere"
    build_path.mkdir(parents=True)
    manifest = {
        "version": 1,
        "commit": head,
        "dirty": variant == "dirty",
        "settings": {**EMPTY, "site": {"title": "Inherited course"}},
        "capabilities": {"settings_runtime": True},
        "unresolved": ["inherited_css_tokens"],
        "inherited_navigation": ["/privacy"],
        "private_extra": "not an editor field",
    }
    if variant == "wrong-manifest-commit":
        manifest["commit"] = "b" * 40
    (build_path / "effective-settings.json").write_text(
        "invalid" if variant == "invalid-json" else json.dumps(manifest)
    )
    async with get_sessionmaker()() as db:
        site = await db.scalar(select(Site).where(Site.slug == "python"))
        build = Build(
            site_id=site.id,
            branch="different" if variant == "wrong-branch" else "draft",
            branch_slug="draft",
            head_sha="b" * 40 if variant == "old-build" else head,
            run_id=123,
            status=BuildStatus.failed if variant == "failed" else BuildStatus.ready,
            path=str(build_path),
        )
        db.add(build)
        await db.commit()
    response = await api_client.get("/api/sites/python/settings", params={"ref": "draft"})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["head_sha"] == head
    assert result["settings"] == EMPTY
    assert ("effective" in result) is available
    if available:
        assert result["effective"]["settings"]["site"]["title"] == "Inherited course"
        assert result["effective"]["commit"] == head
        assert result["effective"]["unresolved"] == ["inherited_css_tokens"]
        assert "private_extra" not in result["effective"]


def test_partial_toc_override_does_not_assume_inherited_heading_bounds():
    from app.authoring.settings import validate_settings

    value = {**EMPTY, "themeConfig": {"tableOfContents": {"minHeadingLevel": 4}}}
    assert validate_settings(value) == value
    with pytest.raises(HTTPException) as error:
        validate_settings(
            {
                **EMPTY,
                "themeConfig": {
                    "tableOfContents": {
                        "minHeadingLevel": 4,
                        "maxHeadingLevel": 2,
                    }
                },
            }
        )
    assert error.value.status_code == 422


@pytest.mark.parametrize("newline", ["\n", "\r\n"])
def test_empty_frontmatter_does_not_consume_body_before_later_thematic_break(newline):
    from app.authoring.content import validate_content

    # After the empty frontmatter this is page text, not a homepage route override.
    source = newline.join(["---", "---", "slug: /another-route", "---", "Body"])
    validate_content("homepage", "homepage.mdx", source)

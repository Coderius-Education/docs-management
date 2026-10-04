import json

from app.scaffold.site_template import scaffold_files


def test_new_course_scaffolds_managed_homepage_and_runtime_settings():
    files = scaffold_files(
        "course", "Course", "Tagline", "https://wo.coderius.nl", "Description", subject="wo"
    )
    base = "sites/wo/course/"
    assert base + "src/content/homepage.mdx" in files
    assert "ManagedHomepage" in files[base + "src/pages/index.tsx"].decode()
    assert "frontMatter={frontMatter}" in files[base + "src/pages/index.tsx"].decode()
    assert b"<Hero>" in files[base + "src/content/homepage.mdx"]
    assert json.loads(files[base + "site-settings.json"]) == {
        "version": 1,
        "site": {},
        "themeConfig": {},
        "tokens": {},
        "docs": {},
    }
    assert json.loads(files[base + "authoring-capabilities.json"])["managed_homepage"] is True
    assert base + "src/css/managed-theme.css" in files
    assert not any(key.endswith("src/pages/index.mdx") for key in files)


def test_scaffold_config_uses_subject_origin_and_path():
    files = scaffold_files(
        "algo", "Algo", "", "https://informatica.coderius.nl", "D", path="algoritmes"
    )
    config = files["sites/informatica/algo/docusaurus.config.ts"].decode()
    assert 'url: "https://informatica.coderius.nl"' in config
    assert 'baseUrl: "/algoritmes/"' in config
    assert "sites/informatica/algo/" in config
    assert '"extends": "../../../tsconfig.base.json"' in files[
        "sites/informatica/algo/tsconfig.json"
    ].decode()

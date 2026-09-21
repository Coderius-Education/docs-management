import base64
import hashlib
import json

import pytest
import respx
from httpx import Response

from tests.helpers import make_logged_in_user

REPO = "https://api.github.com/repos/Coderius-Education/docs"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
)
NAME = f"diagram-{hashlib.sha256(PNG).hexdigest()[:16]}.png"
BLOB_SHA = hashlib.sha1(b"blob " + str(len(PNG)).encode() + b"\0" + PNG).hexdigest()


@respx.mock
async def test_upload_commits_bytes_to_draft_without_overwriting_and_retry_reuses_file(api_client):
    auth = await make_logged_in_user(api_client)
    target = f"{REPO}/contents/sites/python/docs/01-basis/{NAME}"
    lookup = respx.get(target).mock(return_value=Response(404, json={"message": "Not Found"}))
    write = respx.put(target).mock(
        return_value=Response(
            201,
            json={
                "commit": {"sha": "image-commit"},
                "content": {"sha": BLOB_SHA},
            },
        )
    )

    async def upload():
        return await api_client.post(
            "/api/sites/python/assets",
            data={"branch": "docs/lesson", "directory": "01-basis"},
            files={"file": ("diagram.png", PNG, "image/png")},
            headers={"X-CSRF-Token": auth["csrf"]},
        )

    result = await upload()
    assert result.status_code == 200, result.text
    assert result.json()["url"] == f"./{NAME}"
    sent = json.loads(write.calls[0].request.content)
    assert base64.b64decode(sent["content"]) == PNG
    assert sent["branch"] == "docs/lesson"
    assert "sha" not in sent
    assert write.calls[0].request.headers["Authorization"] == "Bearer gho_testtoken"
    lookup.mock(return_value=Response(200, json={"type": "file", "sha": BLOB_SHA}))
    assert (await upload()).status_code == 200
    assert write.call_count == 1
    lookup.mock(return_value=Response(200, json={"type": "file", "sha": "someone-elses-image"}))
    assert (await upload()).status_code == 409
    assert write.call_count == 1


@pytest.mark.parametrize(
    "branch,directory,name,content,status",
    [
        ("main", "", "diagram.png", PNG, 400),
        ("lesson", "../../outside", "diagram.png", PNG, 400),
        ("lesson", "", "fake.png", b"<script>bad</script>", 400),
        ("lesson", "", "diagram.svg", b"<svg/>", 400),
        ("lesson", "", "empty.png", b"", 400),
        ("lesson", "", "huge.png", PNG + b"x" * (5 * 1024 * 1024), 413),
    ],
    ids=["main", "traversal", "disguised-html", "svg", "empty", "oversize"],
)
@respx.mock
async def test_invalid_upload_never_writes(api_client, branch, directory, name, content, status):
    auth = await make_logged_in_user(api_client)
    result = await api_client.post(
        "/api/sites/python/assets",
        data={"branch": branch, "directory": directory},
        files={"file": (name, content, "image/png")},
        headers={"X-CSRF-Token": auth["csrf"]},
    )
    assert result.status_code == status, result.text
    assert not respx.calls


async def test_upload_requires_login_and_csrf(api_client):
    payload = {"data": {"branch": "lesson", "directory": ""}, "files": {"file": ("a.png", PNG)}}
    assert (await api_client.post("/api/sites/python/assets", **payload)).status_code == 401
    await make_logged_in_user(api_client)
    assert (await api_client.post("/api/sites/python/assets", **payload)).status_code == 403


@respx.mock
async def test_preview_reads_branch_blob_without_waiting_for_build(api_client):
    await make_logged_in_user(api_client)
    respx.get(
        f"{REPO}/contents/sites/python/docs/01-basis/{NAME}", params={"ref": "docs/lesson"}
    ).mock(
        return_value=Response(
            200, json={"type": "file", "sha": BLOB_SHA, "size": len(PNG), "encoding": "none"}
        )
    )
    respx.get(f"{REPO}/git/blobs/{BLOB_SHA}").mock(
        return_value=Response(
            200,
            json={
                "content": base64.b64encode(PNG).decode(),
                "encoding": "base64",
            },
        )
    )
    result = await api_client.get(
        "/api/sites/python/assets", params={"path": f"01-basis/{NAME}", "ref": "docs/lesson"}
    )
    assert result.status_code == 200
    assert result.content == PNG
    assert result.headers["content-type"] == "image/png"
    assert "private" in result.headers["cache-control"]


@respx.mock
async def test_preview_restricts_path_and_file_type(api_client):
    await make_logged_in_user(api_client)
    for path in ["../../secrets.png", "lesson.mdx", "active.svg"]:
        result = await api_client.get(
            "/api/sites/python/assets", params={"path": path, "ref": "lesson"}
        )
        assert result.status_code == 400
    assert not respx.calls


@respx.mock
async def test_preview_treats_reserved_path_characters_as_filenames(api_client):
    await make_logged_in_user(api_client)
    respx.get(
        f"{REPO}/contents/sites/python/docs/part%23one/diagram.png", params={"ref": "lesson"}
    ).mock(
        return_value=Response(
            200,
            json={
                "type": "file",
                "sha": BLOB_SHA,
                "size": len(PNG),
                "encoding": "base64",
                "content": base64.b64encode(PNG).decode(),
            },
        )
    )
    result = await api_client.get(
        "/api/sites/python/assets",
        params={
            "path": "part#one/diagram.png",
            "ref": "lesson",
        },
    )
    assert result.status_code == 200
    assert result.content == PNG

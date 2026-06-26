"""GitHub-webhook: ontvangt workflow_run/pull_request/delete-events."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import PrCache, WebhookDelivery, utcnow
from app.db.session import get_db
from app.github.webhooks import verify_signature
from app.ingest import prune
from app.ingest.worker import IngestJob, enqueue

log = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

BUILD_WORKFLOW_NAME = "Build sites"


@router.post("/github")
async def github_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_github_event: Annotated[str | None, Header()] = None,
    x_github_delivery: Annotated[str | None, Header()] = None,
    x_hub_signature_256: Annotated[str | None, Header()] = None,
) -> dict:
    payload = await request.body()
    if not verify_signature(payload, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="Ongeldige webhook-signature")
    if not x_github_event or not x_github_delivery:
        raise HTTPException(status_code=400, detail="Headers ontbreken")

    # Idempotentie: elke delivery maar één keer verwerken.
    if await db.get(WebhookDelivery, x_github_delivery):
        return {"status": "duplicate"}
    db.add(WebhookDelivery(delivery_guid=x_github_delivery, event=x_github_event))
    await db.commit()

    body = await request.json()
    handled = await _dispatch(db, x_github_event, body)

    delivery = await db.get(WebhookDelivery, x_github_delivery)
    if delivery:
        delivery.processed_at = utcnow()
        await db.commit()
    return {"status": "ok" if handled else "ignored"}


async def _dispatch(db: AsyncSession, event: str, body: dict) -> bool:
    if event == "workflow_run":
        run = body.get("workflow_run", {})
        # Ook bij `failure` ingesten: de build-matrix draait met fail-fast:false,
        # dus één kapotte site mag de andere niet blokkeren. De ingest-worker pakt
        # alleen de artifacts op die GitHub daadwerkelijk uploadde — en dat zijn
        # precies de sites die wél groen bouwden. `cancelled`/`skipped`/None slaan
        # we over (geen of onbetrouwbare artifacts).
        if (
            body.get("action") == "completed"
            and run.get("conclusion") in {"success", "failure"}
            and run.get("name") == BUILD_WORKFLOW_NAME
        ):
            enqueue(
                IngestJob(
                    run_id=run["id"],
                    branch=run["head_branch"],
                    head_sha=run["head_sha"],
                    commit_message=(run.get("head_commit") or {}).get("message"),
                )
            )
            return True
        return False

    if event == "pull_request":
        pr = body.get("pull_request", {})
        number = pr.get("number")
        if number:
            cached = await db.get(PrCache, number)
            if cached:
                cached.state = pr.get("state", cached.state)
                cached.head_sha = pr.get("head", {}).get("sha", cached.head_sha)
                cached.title = pr.get("title", cached.title)
                await db.commit()
        if body.get("action") == "closed":
            branch = pr.get("head", {}).get("ref")
            if branch:
                await prune.prune_branch(db, branch)
            return True
        return True

    if event == "delete" and body.get("ref_type") == "branch":
        await prune.prune_branch(db, body.get("ref", ""))
        return True

    return False

"""FastAPI webhook server for the BirdScope GitHub App."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request

from .birds import BirdService
from .config import Settings
from .github import GitHubApp
from .handlers import BotHandler

log = logging.getLogger(__name__)

HANDLED_EVENTS = {"issue_comment", "issues"}
_DELIVERY_TTL_SECONDS = 10 * 60
_DELIVERIES: "OrderedDict[str, float]" = OrderedDict()


def verify_signature(secret: str, body: bytes, signature: str | None) -> bool:
    """Verify GitHub's X-Hub-Signature-256 header."""
    if not secret or not signature or not signature.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def _remember_delivery(delivery_id: str | None) -> bool:
    """Return False for a delivery we have already accepted."""
    if not delivery_id:
        return True
    now = time.monotonic()
    while _DELIVERIES:
        oldest_id, accepted_at = next(iter(_DELIVERIES.items()))
        if accepted_at >= now - _DELIVERY_TTL_SECONDS:
            break
        _DELIVERIES.pop(oldest_id)
    if delivery_id in _DELIVERIES:
        return False
    _DELIVERIES[delivery_id] = now
    while len(_DELIVERIES) > 500:
        _DELIVERIES.popitem(last=False)
    return True


def _reset_delivery_cache() -> None:
    """Testing helper."""
    _DELIVERIES.clear()


async def _dispatch(handler: Any, event: str, payload: dict[str, Any]) -> None:
    try:
        await handler.handle_event(event, payload)
    except Exception:
        log.exception("Unhandled error while processing %s event", event)


def create_app(
    *,
    settings: Settings | None = None,
    handler: Any | None = None,
) -> FastAPI:
    """Build the webhook app. Injecting a handler keeps tests dependency-free."""
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        if getattr(app.state, "owns_resources", False):
            await app.state.github.close()
            await app.state.birds.close()

    app = FastAPI(
        title="BirdScope bot",
        version="1.0.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )

    if handler is None:
        settings.require_runtime()
        github = GitHubApp(settings.app_id, settings.private_key)
        birds = BirdService()
        handler = BotHandler(github, birds, settings)
        app.state.github = github
        app.state.birds = birds
        app.state.owns_resources = True
    else:
        app.state.owns_resources = False

    app.state.handler = handler
    app.state.settings = settings

    @app.get("/")
    async def index() -> dict[str, Any]:
        return {
            "service": "BirdScope bot",
            "version": "1.0.0",
            "endpoints": ["/webhook", "/health"],
        }

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": "birdscope-bot"}

    @app.post("/webhook")
    async def webhook(request: Request, background_tasks: BackgroundTasks) -> dict[str, Any]:
        body = await request.body()
        signature = request.headers.get("x-hub-signature-256")
        if not verify_signature(settings.webhook_secret, body, signature):
            log.warning("Rejected webhook with an invalid signature")
            raise HTTPException(status_code=401, detail="Invalid signature")

        event = request.headers.get("x-github-event", "")
        delivery_id = request.headers.get("x-github-delivery")

        if event == "ping":
            return {"ok": True, "message": "pong"}

        if event not in HANDLED_EVENTS:
            return {"ok": True, "ignored": event or "unknown"}

        try:
            payload = json.loads(body)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="Invalid JSON payload")

        if not _remember_delivery(delivery_id):
            return {"ok": True, "duplicate": True}

        # GitHub expects a response within ten seconds. All network lookups and
        # comment posting happen after the response has been sent.
        background_tasks.add_task(_dispatch, handler, event, payload)
        return {"ok": True}

    return app

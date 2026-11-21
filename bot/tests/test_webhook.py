import hashlib
import hmac
import json

from fastapi.testclient import TestClient

from bot.app.config import Settings
from bot.app.webhook import _reset_delivery_cache, create_app


class FakeHandler:
    def __init__(self) -> None:
        self.events = []

    async def handle_event(self, event, payload):
        self.events.append((event, payload))


def make_client(handler: FakeHandler) -> TestClient:
    _reset_delivery_cache()
    settings = Settings(
        webhook_secret="test-secret",
        base_url="https://example.github.io/birdscope",
    )
    return TestClient(create_app(settings=settings, handler=handler))


def sign(body: bytes, secret: str = "test-secret") -> str:
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def comment_payload() -> dict:
    return {
        "action": "created",
        "installation": {"id": 42},
        "repository": {"full_name": "octocat/birdscope"},
        "issue": {"number": 7},
        "comment": {
            "id": 99,
            "body": "/bird Kolkata",
            "user": {"login": "octocat", "type": "User"},
        },
    }


def test_health_endpoint():
    client = make_client(FakeHandler())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ping_needs_a_valid_signature():
    handler = FakeHandler()
    client = make_client(handler)
    body = json.dumps({"zen": "Keep it logically awesome."}).encode()

    rejected = client.post(
        "/webhook",
        content=body,
        headers={"X-GitHub-Event": "ping", "X-Hub-Signature-256": "sha256=bad"},
    )
    assert rejected.status_code == 401

    accepted = client.post(
        "/webhook",
        content=body,
        headers={"X-GitHub-Event": "ping", "X-Hub-Signature-256": sign(body)},
    )
    assert accepted.status_code == 200
    assert accepted.json() == {"ok": True, "message": "pong"}
    assert handler.events == []


def test_issue_comment_is_dispatched():
    handler = FakeHandler()
    client = make_client(handler)
    body = json.dumps(comment_payload()).encode()

    response = client.post(
        "/webhook",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-GitHub-Event": "issue_comment",
            "X-GitHub-Delivery": "delivery-1",
            "X-Hub-Signature-256": sign(body),
        },
    )
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert len(handler.events) == 1
    assert handler.events[0][0] == "issue_comment"
    assert handler.events[0][1]["comment"]["body"] == "/bird Kolkata"


def test_duplicate_delivery_is_ignored():
    handler = FakeHandler()
    client = make_client(handler)
    body = json.dumps(comment_payload()).encode()
    headers = {
        "X-GitHub-Event": "issue_comment",
        "X-GitHub-Delivery": "delivery-2",
        "X-Hub-Signature-256": sign(body),
    }

    first = client.post("/webhook", content=body, headers=headers)
    second = client.post("/webhook", content=body, headers=headers)

    assert first.status_code == 200
    assert second.json() == {"ok": True, "duplicate": True}
    assert len(handler.events) == 1


def test_unhandled_event_is_ignored():
    handler = FakeHandler()
    client = make_client(handler)
    body = json.dumps({"action": "created"}).encode()

    response = client.post(
        "/webhook",
        content=body,
        headers={"X-GitHub-Event": "installation", "X-Hub-Signature-256": sign(body)},
    )
    assert response.status_code == 200
    assert response.json() == {"ok": True, "ignored": "installation"}
    assert handler.events == []

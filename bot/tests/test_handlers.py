import pytest

from bot.app.birds import Bird, BirdDataError, BirdReport, Place
from bot.app.config import Settings
from bot.app.handlers import BotHandler

BASE = "https://example.github.io/birdscope"
PLACE = Place("Kolkata, West Bengal, India", 22.56263, 88.36304)


def make_report() -> BirdReport:
    return BirdReport(
        place=PLACE,
        radius_km=25,
        species_total=283,
        birds=[
            Bird(
                taxon_id=204454,
                common_name="Common Myna",
                scientific_name="Acridotheres tristis",
                photo_url="https://example.com/myna.jpg",
                wikipedia_url=None,
                nearby_count=295,
            )
        ],
    )


class FakeAPI:
    def __init__(self, comments=None):
        self.comments = comments or []
        self.created = []
        self.reactions = []

    async def list_issue_comments(self, repo, issue_number):
        return self.comments

    async def add_reaction(self, repo, comment_id, content="eyes"):
        self.reactions.append((comment_id, content))

    async def create_comment(self, repo, issue_number, body):
        self.created.append((repo, issue_number, body))
        return {"id": len(self.created)}


class FakeGitHubApp:
    def __init__(self, api):
        self.api = api

    async def api_for_installation(self, installation_id):
        return self.api


class FakeBirds:
    def __init__(self, report=None, error=None):
        self.report = report or make_report()
        self.error = error
        self.calls = []

    async def nearby_report(self, location, radius, limit=5):
        self.calls.append((location, radius))
        if self.error:
            raise self.error
        return self.report


def make_handler(api, birds=None):
    return BotHandler(
        FakeGitHubApp(api),
        birds or FakeBirds(),
        Settings(
            base_url=BASE,
            default_location="Kolkata, West Bengal, India",
            default_radius_km=25,
        ),
    )


def comment_payload(body="/bird Kolkata"):
    return {
        "action": "created",
        "installation": {"id": 42},
        "repository": {"full_name": "octocat/birdscope"},
        "issue": {"number": 7},
        "comment": {
            "id": 99,
            "body": body,
            "user": {"login": "octocat", "type": "User"},
        },
    }


def label_payload(action="labeled", label="bird", title="Birds near Seattle", body="", extra_issue=None):
    issue = {
        "number": 7,
        "title": title,
        "body": body,
        "user": {"login": "octocat", "type": "User"},
        "labels": [{"name": label}] if action == "opened" else [],
    }
    if extra_issue:
        issue.update(extra_issue)
    return {
        "action": action,
        "label": {"name": label},
        "installation": {"id": 42},
        "repository": {"full_name": "octocat/birdscope"},
        "issue": issue,
    }


@pytest.mark.asyncio
async def test_issue_comment_replies_with_bird_list():
    api = FakeAPI()
    birds = FakeBirds()
    handler = make_handler(api, birds)

    await handler.handle_event("issue_comment", comment_payload())

    assert birds.calls == [("Kolkata", 25)]
    assert len(api.created) == 1
    repo, issue_number, body = api.created[0]
    assert (repo, issue_number) == ("octocat/birdscope", 7)
    assert "birdscope:reply:99" in body
    assert "Common Myna" in body
    assert api.reactions == [(99, "eyes")]


@pytest.mark.asyncio
async def test_issue_comment_without_location_uses_default():
    api = FakeAPI()
    birds = FakeBirds()
    handler = make_handler(api, birds)

    await handler.handle_event("issue_comment", comment_payload("/bird"))

    assert birds.calls == [("Kolkata, West Bengal, India", 25)]
    assert len(api.created) == 1


@pytest.mark.asyncio
async def test_issue_comment_ignores_bots_and_non_commands():
    api = FakeAPI()
    handler = make_handler(api)

    bot_payload = comment_payload()
    bot_payload["comment"]["user"] = {"login": "birdscope[bot]", "type": "Bot"}
    await handler.handle_event("issue_comment", bot_payload)
    await handler.handle_event("issue_comment", comment_payload("Just saying hello"))
    await handler.handle_event("issue_comment", comment_payload("/birds Kolkata"))

    assert api.created == []
    assert api.reactions == []


@pytest.mark.asyncio
async def test_issue_comment_is_idempotent():
    api = FakeAPI(comments=[{"body": "<!-- birdscope:reply:99 -->\nold reply"}])
    handler = make_handler(api)

    await handler.handle_event("issue_comment", comment_payload())

    assert api.created == []
    assert api.reactions == []


@pytest.mark.asyncio
async def test_label_event_replies_with_issue_location():
    api = FakeAPI()
    birds = FakeBirds()
    handler = make_handler(api, birds)

    await handler.handle_event("issues", label_payload())

    assert birds.calls == [("Seattle", 25)]
    assert len(api.created) == 1
    body = api.created[0][2]
    assert "birdscope:label:7" in body
    assert "tagged **bird**" in body


@pytest.mark.asyncio
async def test_opened_issue_with_bird_label_replies():
    api = FakeAPI()
    handler = make_handler(api)

    await handler.handle_event("issues", label_payload(action="opened", label="bird"))

    assert len(api.created) == 1
    assert "birdscope:label:7" in api.created[0][2]


@pytest.mark.asyncio
async def test_other_labels_and_pull_requests_are_ignored():
    api = FakeAPI()
    handler = make_handler(api)

    await handler.handle_event("issues", label_payload(label="bug"))
    await handler.handle_event(
        "issues",
        label_payload(extra_issue={"pull_request": {"url": "https://api.github.com/pulls/7"}}),
    )

    assert api.created == []


@pytest.mark.asyncio
async def test_bird_data_error_posts_a_friendly_reply():
    api = FakeAPI()
    handler = make_handler(api, FakeBirds(error=BirdDataError("I couldn't find “Atlantis”.")))

    await handler.handle_event("issue_comment", comment_payload("/bird Atlantis"))

    assert len(api.created) == 1
    body = api.created[0][2]
    assert "couldn't complete that search" in body
    assert "Atlantis" in body
    assert "birdscope:reply:99" in body

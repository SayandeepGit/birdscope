"""Event handlers for the BirdScope GitHub App."""

from __future__ import annotations

import logging
from typing import Any

from .birds import BirdDataError, BirdService
from .commands import guess_location_from_issue, parse_bird_command
from .config import Settings
from .github import GitHubAPI, GitHubApp, GitHubError
from .replies import format_error_reply, format_label_reply, format_nearby_reply

log = logging.getLogger(__name__)


def _is_bot(user: dict[str, Any]) -> bool:
    login = str(user.get("login") or "")
    return user.get("type") == "Bot" or login.endswith("[bot]")


def _context(payload: dict[str, Any]) -> tuple[str, int, int] | None:
    repo = (payload.get("repository") or {}).get("full_name")
    issue = payload.get("issue") or {}
    issue_number = issue.get("number")
    installation_id = (payload.get("installation") or {}).get("id")
    if not repo or not issue_number or not installation_id:
        return None
    return str(repo), int(issue_number), int(installation_id)


class BotHandler:
    """Turns GitHub webhook payloads into bird replies."""

    def __init__(self, github: GitHubApp, birds: BirdService, settings: Settings) -> None:
        self.github = github
        self.birds = birds
        self.settings = settings

    async def handle_event(self, event: str, payload: dict[str, Any]) -> None:
        if event == "issue_comment":
            await self.handle_issue_comment(payload)
        elif event == "issues":
            await self.handle_issues(payload)

    async def handle_issue_comment(self, payload: dict[str, Any]) -> None:
        if payload.get("action") != "created":
            return
        comment = payload.get("comment") or {}
        if _is_bot(comment.get("user") or {}):
            return

        command = parse_bird_command(comment.get("body"))
        if command is None:
            return

        context = _context(payload)
        if context is None:
            log.warning("Ignoring /bird comment without repository, issue, or installation")
            return
        repo, issue_number, installation_id = context
        comment_id = comment.get("id")
        marker = f"birdscope:reply:{comment_id}"
        api = await self.github.api_for_installation(installation_id)

        if await self._already_replied(api, repo, issue_number, marker):
            log.info("Skipping duplicate reply for %s#%s", repo, issue_number)
            return

        if comment_id:
            await api.add_reaction(repo, int(comment_id), "eyes")

        location = command.location or self.settings.default_location
        try:
            report = await self.birds.nearby_report(
                location,
                self.settings.default_radius_km,
            )
            body = format_nearby_reply(report, self.settings.base_url, marker)
            await api.create_comment(repo, issue_number, body)
            log.info(
                "Replied to /bird in %s#%s for %s (%d species)",
                repo,
                issue_number,
                report.place.name,
                len(report.birds),
            )
        except BirdDataError as exc:
            await self._post_error(api, repo, issue_number, marker, str(exc))
        except GitHubError:
            log.exception("GitHub API failed while replying to %s#%s", repo, issue_number)

    async def handle_issues(self, payload: dict[str, Any]) -> None:
        issue = payload.get("issue") or {}
        if issue.get("pull_request"):
            return

        action = payload.get("action")
        if action == "labeled":
            label = str((payload.get("label") or {}).get("name") or "").strip().lower()
            if label != "bird":
                return
        elif action == "opened":
            labels = {
                str((label or {}).get("name") or "").strip().lower()
                for label in issue.get("labels") or []
            }
            if "bird" not in labels:
                return
        else:
            return

        if _is_bot(issue.get("user") or {}):
            return

        context = _context(payload)
        if context is None:
            return
        repo, issue_number, installation_id = context
        marker = f"birdscope:label:{issue_number}"
        api = await self.github.api_for_installation(installation_id)

        if await self._already_replied(api, repo, issue_number, marker):
            log.info("Skipping duplicate label reply for %s#%s", repo, issue_number)
            return

        location, defaulted = guess_location_from_issue(
            issue.get("title"),
            issue.get("body"),
            self.settings.default_location,
        )
        try:
            report = await self.birds.nearby_report(
                location,
                self.settings.default_radius_km,
            )
            body = format_label_reply(
                report,
                self.settings.base_url,
                marker,
                defaulted=defaulted,
            )
            await api.create_comment(repo, issue_number, body)
            log.info(
                "Replied to bird label on %s#%s for %s",
                repo,
                issue_number,
                report.place.name,
            )
        except BirdDataError as exc:
            await self._post_error(api, repo, issue_number, marker, str(exc))
        except GitHubError:
            log.exception("GitHub API failed while handling label on %s#%s", repo, issue_number)

    async def _already_replied(
        self,
        api: GitHubAPI,
        repo: str,
        issue_number: int,
        marker: str,
    ) -> bool:
        try:
            comments = await api.list_issue_comments(repo, issue_number)
        except GitHubError as exc:
            log.warning("Could not check existing comments on %s#%s: %s", repo, issue_number, exc)
            return False
        return any(marker in str(comment.get("body") or "") for comment in comments)

    async def _post_error(
        self,
        api: GitHubAPI,
        repo: str,
        issue_number: int,
        marker: str,
        message: str,
    ) -> None:
        try:
            await api.create_comment(repo, issue_number, format_error_reply(message, marker))
        except GitHubError:
            log.exception("Could not post an error reply to %s#%s", repo, issue_number)

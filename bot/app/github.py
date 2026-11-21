"""Minimal GitHub REST client with GitHub App authentication."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime
from typing import Any

import httpx
import jwt

log = logging.getLogger(__name__)

API_URL = "https://api.github.com"
API_VERSION = "2022-11-28"


class GitHubError(RuntimeError):
    """Raised when a GitHub API request fails."""


def _expires_at(value: str | None) -> float:
    if not value:
        return time.time() + 3000
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return time.time() + 3000
    return parsed.timestamp()


class GitHubAPI:
    """Calls the GitHub REST API with a single token (installation or PAT)."""

    def __init__(self, token: str, http: httpx.AsyncClient, api_url: str = API_URL) -> None:
        self._token = token
        self._http = http
        self._api_url = api_url.rstrip("/")

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json: dict[str, Any] | None = None,
        expected: tuple[int, ...] = (200, 201, 204),
    ) -> Any:
        response = await self._http.request(
            method,
            f"{self._api_url}{path}",
            params=params,
            json=json,
            headers={
                "Authorization": f"Bearer {self._token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": API_VERSION,
                "User-Agent": "BirdScopeBot/1.0",
            },
        )
        if response.status_code not in expected:
            detail = response.text[:400].replace("\n", " ")
            raise GitHubError(f"{method} {path} failed with {response.status_code}: {detail}")
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

    async def list_issue_comments(
        self,
        repo: str,
        issue_number: int,
        *,
        per_page: int = 100,
    ) -> list[dict[str, Any]]:
        """Return the most recent comments first, so idempotency markers are easy to find."""
        data = await self._request(
            "GET",
            f"/repos/{repo}/issues/{issue_number}/comments",
            params={"per_page": per_page, "sort": "created", "direction": "desc"},
        )
        return data or []

    async def create_comment(self, repo: str, issue_number: int, body: str) -> dict[str, Any]:
        data = await self._request(
            "POST",
            f"/repos/{repo}/issues/{issue_number}/comments",
            json={"body": body},
        )
        return data or {}

    async def add_reaction(self, repo: str, comment_id: int, content: str = "eyes") -> None:
        """Best-effort acknowledgement. Missing reaction permission is not fatal."""
        try:
            await self._request(
                "POST",
                f"/repos/{repo}/issues/comments/{comment_id}/reactions",
                json={"content": content},
                expected=(200, 201),
            )
        except GitHubError as exc:
            log.debug("Could not add reaction to comment %s: %s", comment_id, exc)

    async def create_issue(
        self,
        repo: str,
        title: str,
        body: str,
        *,
        labels: list[str] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"title": title, "body": body}
        if labels:
            payload["labels"] = labels
        data = await self._request("POST", f"/repos/{repo}/issues", json=payload)
        return data or {}

    async def ensure_label(
        self,
        repo: str,
        name: str,
        *,
        color: str = "1f5e4b",
        description: str = "",
    ) -> None:
        """Create a label if it does not exist. Existing labels are fine."""
        try:
            await self._request(
                "POST",
                f"/repos/{repo}/labels",
                json={"name": name, "color": color, "description": description},
                expected=(201,),
            )
        except GitHubError as exc:
            if "already_exists" in str(exc) or "422" in str(exc):
                return
            log.warning("Could not create label %r: %s", name, exc)


class GitHubApp:
    """Exchanges a GitHub App JWT for short-lived installation tokens."""

    def __init__(
        self,
        app_id: str,
        private_key: str,
        *,
        http: httpx.AsyncClient | None = None,
        api_url: str = API_URL,
    ) -> None:
        self._app_id = str(app_id)
        self._private_key = private_key
        self._api_url = api_url.rstrip("/")
        self._http = http or httpx.AsyncClient(timeout=20.0)
        self._owns_http = http is None
        self._tokens: dict[int, tuple[str, float]] = {}
        self._lock = asyncio.Lock()

    def _app_jwt(self) -> str:
        now = int(time.time())
        payload = {"iat": now - 60, "exp": now + 540, "iss": self._app_id}
        try:
            return jwt.encode(payload, self._private_key, algorithm="RS256")
        except Exception as exc:  # PyJWT raises several exception types
            raise GitHubError(f"Could not sign the GitHub App JWT: {exc}") from exc

    async def installation_token(self, installation_id: int) -> str:
        cached = self._tokens.get(installation_id)
        if cached and cached[1] > time.time() + 60:
            return cached[0]

        async with self._lock:
            cached = self._tokens.get(installation_id)
            if cached and cached[1] > time.time() + 60:
                return cached[0]

            response = await self._http.post(
                f"{self._api_url}/app/installations/{installation_id}/access_tokens",
                headers={
                    "Authorization": f"Bearer {self._app_jwt()}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": API_VERSION,
                    "User-Agent": "BirdScopeBot/1.0",
                },
            )
            if response.status_code not in (200, 201):
                detail = response.text[:400].replace("\n", " ")
                raise GitHubError(
                    f"Could not create an installation token for {installation_id}: "
                    f"{response.status_code} {detail}"
                )
            data = response.json()
            token = data["token"]
            expires = _expires_at(data.get("expires_at"))
            self._tokens[installation_id] = (token, expires)
            return token

    async def api_for_installation(self, installation_id: int) -> GitHubAPI:
        token = await self.installation_token(installation_id)
        return GitHubAPI(token, self._http, self._api_url)

    async def close(self) -> None:
        if self._owns_http:
            await self._http.aclose()

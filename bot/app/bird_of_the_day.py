"""Post the daily Bird of the Day from a GitHub Actions workflow.

Run from the repository root:

    python -m bot.app.bird_of_the_day

Required environment:
    GITHUB_TOKEN          token with issues:write (Actions provides this)
    GITHUB_REPOSITORY     owner/repo
    BIRDSCOPE_BASE_URL    public site URL

Optional:
    BIRDSCOPE_BOTD_ISSUE  post a comment to this issue instead of creating one
    DEFAULT_LOCATION      defaults to Kolkata, West Bengal, India
    DEFAULT_RADIUS_KM     defaults to 25
    DRY_RUN=1             print the post instead of calling GitHub
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone

import httpx

from .birds import BirdDataError, BirdService, pick_bird_of_the_day
from .config import Settings
from .github import GitHubAPI, GitHubError
from .replies import format_bird_of_the_day

log = logging.getLogger("birdscope.bird_of_the_day")


async def run() -> int:
    settings = Settings.from_env()
    token = os.getenv("GITHUB_TOKEN", "").strip()
    repo = os.getenv("GITHUB_REPOSITORY", "").strip()
    dry_run = os.getenv("DRY_RUN", "").strip().lower() in {"1", "true", "yes"}
    issue_override = os.getenv("BIRDSCOPE_BOTD_ISSUE", "").strip()

    if not settings.base_url:
        raise SystemExit("BIRDSCOPE_BASE_URL is required")
    if not dry_run:
        if not token:
            raise SystemExit("GITHUB_TOKEN is required")
        if "/" not in repo:
            raise SystemExit("GITHUB_REPOSITORY must be in owner/repo form")

    day = datetime.now(timezone.utc).date()
    marker = f"birdscope:botd:{day.isoformat()}"
    title = f"Bird of the Day — {day:%B} {day.day}, {day.year}"

    birds = BirdService()
    try:
        place = await birds.geocode(settings.default_location)
        report = await birds.nearby_birds(place, settings.default_radius_km, limit=30)
        chosen = pick_bird_of_the_day(report.birds, day)
        chosen = await birds.enrich_bird(chosen)
        body = format_bird_of_the_day(
            chosen,
            day,
            settings.base_url,
            marker,
            place=report.place,
            radius_km=report.radius_km,
        )

        if dry_run:
            print(body)
            return 0

        async with httpx.AsyncClient(
            timeout=20.0,
            headers={"User-Agent": "BirdScopeBot/1.0"},
        ) as http:
            api = GitHubAPI(token, http)
            if issue_override:
                try:
                    issue_number = int(issue_override)
                except ValueError as exc:
                    raise SystemExit("BIRDSCOPE_BOTD_ISSUE must be an issue number") from exc
                await api.create_comment(repo, issue_number, body)
                log.info("Posted Bird of the Day to %s#%s", repo, issue_number)
            else:
                await api.ensure_label(
                    repo,
                    "bird-of-the-day",
                    color="1f5e4b",
                    description="Daily bird from BirdScope",
                )
                try:
                    issue = await api.create_issue(repo, title, body, labels=["bird-of-the-day"])
                except GitHubError:
                    log.warning("Could not create the issue with its label; retrying without it")
                    issue = await api.create_issue(repo, title, body)
                log.info(
                    "Created Bird of the Day issue %s for %s",
                    issue.get("number", "?"),
                    chosen.common_name,
                )

        print(f"Bird of the Day for {day}: {chosen.common_name} ({chosen.scientific_name})")
        return 0
    finally:
        await birds.close()


def main() -> None:
    logging.basicConfig(
        level=getattr(logging, Settings.from_env().log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    try:
        raise SystemExit(asyncio.run(run()))
    except BirdDataError as exc:
        log.error("Bird of the Day failed: %s", exc)
        raise SystemExit(1) from exc
    except GitHubError as exc:
        log.error("GitHub API failed while posting Bird of the Day: %s", exc)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()

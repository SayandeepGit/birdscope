"""Parsing `/bird` commands and issue locations."""

from __future__ import annotations

import re
from dataclasses import dataclass

# A command must start its own line. An optional @app-name suffix is accepted so
# the command still works when users type `/bird@birdscope-bot Kolkata`.
_COMMAND_RE = re.compile(r"^\s*/bird(?:@[\w.-]+)?(?:\s+(.*?))?\s*$", re.IGNORECASE)
_LOCATION_RE = re.compile(
    r"^\s*(?:location|place|where)\s*[:\-]\s*(.+?)\s*$",
    re.IGNORECASE | re.MULTILINE,
)
_NEAR_RE = re.compile(r"\bnear\s+(.+?)(?:[.!?]|$)", re.IGNORECASE)


@dataclass(frozen=True)
class BirdCommand:
    """A parsed `/bird` command. `location` is None when the default is requested."""

    location: str | None = None


def parse_bird_command(body: str | None) -> BirdCommand | None:
    for line in (body or "").splitlines():
        match = _COMMAND_RE.match(line)
        if not match:
            continue
        location = (match.group(1) or "").strip()
        return BirdCommand(location=location or None)
    return None


def guess_location_from_issue(title: str | None, body: str | None, default: str) -> tuple[str, bool]:
    """Find the most likely place in an issue.

    Returns ``(location, used_default)``. The order is: an explicit `/bird`
    command, a ``Location:`` field from the issue form, a ``near ...`` phrase in
    the title, then the configured default.
    """
    for text in (body, title):
        command = parse_bird_command(text)
        if command is not None:
            return command.location or default, command.location is None

    match = _LOCATION_RE.search(body or "")
    if match:
        location = match.group(1).strip()
        if location:
            return location, False

    match = _NEAR_RE.search(title or "")
    if match:
        location = match.group(1).strip(" -–—")
        if location:
            return location, False

    return default, True

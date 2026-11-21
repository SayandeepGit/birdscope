"""Markdown replies posted by the BirdScope bot."""

from __future__ import annotations

import html
import re
from datetime import date
from urllib.parse import quote, urlencode

from .birds import Bird, BirdReport, Place

_MD_SPECIAL = re.compile(r"([\\`*_\[\]|])")


def md_text(value: object) -> str:
    """Escape text for a Markdown table cell or inline label."""
    text = html.escape(str(value or ""), quote=False)
    return _MD_SPECIAL.sub(r"\\\1", text)


def _location_query(place: Place, radius_km: int) -> str:
    return urlencode(
        {
            "lat": f"{place.latitude:.5f}",
            "lng": f"{place.longitude:.5f}",
            "radius": radius_km,
            "name": place.name,
        },
        quote_via=quote,
    )


def explore_url(base_url: str, place: Place, radius_km: int) -> str:
    base = (base_url or "").rstrip("/")
    return f"{base}/#/explore?{_location_query(place, radius_km)}"


def species_url(base_url: str, bird: Bird, place: Place, radius_km: int) -> str:
    base = (base_url or "").rstrip("/")
    return f"{base}/#/species/{bird.taxon_id}?{_location_query(place, radius_km)}"


def _photo_cell(bird: Bird) -> str:
    if not bird.photo_url:
        return "—"
    src = html.escape(bird.photo_url, quote=True)
    alt = html.escape(bird.common_name, quote=True)
    return f'<img src="{src}" width="96" height="72" alt="{alt}">'


def _species_table(
    birds: list[Bird],
    base_url: str,
    place: Place,
    radius_km: int,
) -> list[str]:
    lines = [
        "| Photo | Species | Nearby sightings |",
        "|:--:|:--|--:|",
    ]
    for bird in birds:
        name = md_text(bird.common_name)
        if base_url:
            name = f"[**{name}**]({species_url(base_url, bird, place, radius_km)})"
        else:
            name = f"**{name}**"
        scientific = md_text(bird.scientific_name)
        if scientific:
            name = f"{name}<br>*{scientific}*"
        lines.append(
            f"| {_photo_cell(bird)} | {name} | {bird.nearby_count:,} |"
        )
    return lines


def format_nearby_reply(
    report: BirdReport,
    base_url: str,
    marker: str,
    *,
    intro: str | None = None,
) -> str:
    """Build the reply for `/bird <place>` and the `bird` label."""
    place_name = md_text(report.place.name)
    lines = [f"<!-- {marker} -->", f"## 🐦 Birds near {place_name}", ""]

    if not report.birds:
        lines.extend(
            [
                f"I couldn't find any research-grade bird sightings within "
                f"**{report.radius_km} km** of **{place_name}**.",
                "",
                "Try a nearby city or a wider radius — for example "
                "`/bird Kolkata` or `/bird 22.56, 88.36`.",
            ]
        )
        if base_url:
            lines.extend(
                [
                    "",
                    f"[Open BirdScope for {place_name} →]"
                    f"({explore_url(base_url, report.place, report.radius_km)})",
                ]
            )
        return "\n".join(lines)

    lines.append(
        f"*Within {report.radius_km} km · **{report.species_total:,}** species on record · "
        "research-grade iNaturalist sightings*"
    )
    if intro:
        lines.extend(["", intro])
    lines.extend(["", f"### Top {len(report.birds)} by recent sightings", ""])
    lines.extend(_species_table(report.birds, base_url, report.place, report.radius_km))

    if base_url:
        lines.extend(
            [
                "",
                f"[**Explore all {report.species_total:,} species in BirdScope →**]"
                f"({explore_url(base_url, report.place, report.radius_km)})",
            ]
        )

    lines.extend(
        [
            "",
            "<sub>Bird photos belong to their iNaturalist contributors. "
            "Reply with `/bird <place>` for another patch.</sub>",
        ]
    )
    return "\n".join(lines)


def format_label_reply(
    report: BirdReport,
    base_url: str,
    marker: str,
    *,
    defaulted: bool = False,
) -> str:
    intro = (
        "This issue is tagged **bird**, so here is a field guide for the place in the report."
        if not defaulted
        else "This issue is tagged **bird**. I couldn't find a place in the title or body, "
        "so here is a starting point near our default location — comment with "
        "`/bird <place>` to search somewhere else."
    )
    return format_nearby_reply(report, base_url, marker, intro=intro)


def format_error_reply(message: str, marker: str) -> str:
    return "\n".join(
        [
            f"<!-- {marker} -->",
            "### 🐦 BirdScope couldn't complete that search",
            "",
            message,
            "",
            "Try `/bird Kolkata`, `/bird Seattle, Washington`, "
            "or coordinates like `/bird 22.56, 88.36`.",
        ]
    )


def format_bird_of_the_day(
    bird: Bird,
    day: date,
    base_url: str,
    marker: str,
    *,
    place: Place,
    radius_km: int,
) -> str:
    """Build the daily feature post."""
    day_label = f"{day:%B} {day.day}, {day.year}"
    common = md_text(bird.common_name)
    scientific = md_text(bird.scientific_name)

    lines = [f"<!-- {marker} -->", f"# 🐦 Bird of the Day — {day_label}", ""]

    if bird.photo_url:
        src = html.escape(bird.photo_url, quote=True)
        alt = html.escape(bird.common_name, quote=True)
        lines.extend([f'<img src="{src}" width="560" alt="{alt}">', ""])

    lines.extend([f"## {common}", f"*{scientific}*", ""])

    summary = bird.summary.strip()
    if summary:
        lines.extend([summary, ""])
    else:
        lines.extend(
            [
                f"A bird recorded near {md_text(place.name)}. "
                "Open its profile for photos, taxonomy, and the best months to look.",
                "",
            ]
        )

    facts: list[str] = []
    if bird.conservation_code:
        facts.append(
            f"**Conservation:** {bird.conservation_code} · "
            f"{md_text(bird.conservation_label or bird.conservation_code)}"
        )
    else:
        facts.append("**Conservation:** not assessed by the IUCN Red List")
    if bird.global_count:
        facts.append(f"**Global sightings:** {bird.global_count:,}")
    facts.append(
        f"**Nearby:** {bird.nearby_count:,} within {radius_km} km of {md_text(place.name)}"
    )
    lines.extend([" · ".join(facts), ""])

    links: list[str] = []
    if base_url:
        links.append(
            f"[Meet the {common} in BirdScope →]"
            f"({species_url(base_url, bird, place, radius_km)})"
        )
    links.append(
        f"[iNaturalist taxon page](https://www.inaturalist.org/taxa/{bird.taxon_id})"
    )
    lines.append(" · ".join(links))
    lines.extend(
        [
            "",
            "<sub>Bird of the Day is chosen from recent research-grade sightings near "
            f"{md_text(place.name)}. Photos belong to their iNaturalist contributors.</sub>",
        ]
    )
    return "\n".join(lines)

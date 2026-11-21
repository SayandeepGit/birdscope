"""Bird and place data from iNaturalist, Open-Meteo, and Wikipedia."""

from __future__ import annotations

import asyncio
import html
import logging
import re
from dataclasses import dataclass, replace
from datetime import date
from typing import Any
from urllib.parse import quote, unquote, urlparse

import httpx

log = logging.getLogger(__name__)

INAT_API = "https://api.inaturalist.org/v1"
GEOCODE_API = "https://geocoding-api.open-meteo.com/v1/search"
WIKIPEDIA_API = "https://en.wikipedia.org/api/rest_v1/page/summary"
USER_AGENT = "BirdScopeBot/1.0 (GitHub App; bird sightings field guide)"

IUCN_LABELS = {
    "LC": "Least Concern",
    "NT": "Near Threatened",
    "VU": "Vulnerable",
    "EN": "Endangered",
    "CR": "Critically Endangered",
    "EW": "Extinct in the Wild",
    "EX": "Extinct",
    "DD": "Data Deficient",
    "NE": "Not Evaluated",
}

_TAG_RE = re.compile(r"<[^>]+>")
_COORDINATES_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$")


class BirdDataError(RuntimeError):
    """A user-facing failure while looking up a place or its birds."""


@dataclass(frozen=True)
class Place:
    name: str
    latitude: float
    longitude: float


@dataclass(frozen=True)
class Bird:
    taxon_id: int
    common_name: str
    scientific_name: str
    photo_url: str | None
    wikipedia_url: str | None
    nearby_count: int
    global_count: int = 0
    conservation_code: str | None = None
    conservation_label: str | None = None
    summary: str = ""


@dataclass(frozen=True)
class BirdReport:
    place: Place
    radius_km: int
    species_total: int
    birds: list[Bird]


def strip_html(value: str | None) -> str:
    if not value:
        return ""
    text = _TAG_RE.sub(" ", value)
    return " ".join(html.unescape(text).split())


def short_summary(value: str, max_chars: int = 640) -> str:
    text = " ".join((value or "").split())
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    boundary = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    if boundary >= 180:
        return cut[: boundary + 1]
    return f"{cut.rstrip()}…"


def parse_coordinates(query: str) -> Place | None:
    match = _COORDINATES_RE.match(query or "")
    if not match:
        return None
    latitude = float(match.group(1))
    longitude = float(match.group(2))
    if abs(latitude) > 90 or abs(longitude) > 180:
        return None
    return Place(
        name=f"{latitude:.4f}, {longitude:.4f}",
        latitude=latitude,
        longitude=longitude,
    )


def iucn_status(taxon: dict[str, Any]) -> tuple[str | None, str | None]:
    statuses = taxon.get("conservation_statuses") or []
    status = next(
        (item for item in statuses if "iucn" in str(item.get("authority", "")).lower()),
        None,
    )
    if status is None:
        status = taxon.get("conservation_status")
    if not isinstance(status, dict):
        return None, None
    code = str(status.get("status") or status.get("status_name") or "").upper()
    if not code:
        return None, None
    return code, IUCN_LABELS.get(code, str(status.get("status_name") or code))


def pick_bird_of_the_day(birds: list[Bird], day: date) -> Bird:
    if not birds:
        raise BirdDataError("There are no birds to feature today.")
    return birds[(day.toordinal() + day.year) % len(birds)]


class BirdService:
    """Async data client used by both the webhook and the scheduled workflow."""

    def __init__(
        self,
        http: httpx.AsyncClient | None = None,
        *,
        timeout: float = 20.0,
    ) -> None:
        self._http = http or httpx.AsyncClient(
            timeout=timeout,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            follow_redirects=True,
        )
        self._owns_http = http is None

    async def close(self) -> None:
        if self._owns_http:
            await self._http.aclose()

    async def _get_json(
        self,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        retries: int = 2,
    ) -> dict[str, Any] | None:
        last_error: Exception | None = None
        for attempt in range(retries + 1):
            try:
                response = await self._http.get(url, params=params)
                if response.status_code == 404:
                    return None
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt < retries:
                        await asyncio.sleep(0.8 + attempt * 0.9)
                        continue
                response.raise_for_status()
                data = response.json()
                return data if isinstance(data, dict) else None
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                if attempt < retries:
                    await asyncio.sleep(0.6 + attempt * 0.8)
                    continue
        log.warning("Request failed for %s: %s", url, last_error)
        raise BirdDataError(
            "The bird data service is not responding right now. Please try again in a minute."
        ) from last_error

    async def geocode(self, query: str) -> Place:
        query = (query or "").strip()
        if not query:
            raise BirdDataError("Please include a place, for example `/bird Kolkata`.")

        coordinates = parse_coordinates(query)
        if coordinates:
            return coordinates

        data = await self._get_json(
            GEOCODE_API,
            params={"name": query, "count": 1, "language": "en", "format": "json"},
        )
        results = (data or {}).get("results") or []
        if not results:
            raise BirdDataError(
                f"I couldn't find “{query}”. Try a city, town, or region — "
                "for example `Kolkata` or `Seattle, Washington`."
            )
        item = results[0]
        try:
            latitude = float(item["latitude"])
            longitude = float(item["longitude"])
        except (KeyError, TypeError, ValueError) as exc:
            raise BirdDataError(
                f"I found “{query}” but could not determine its coordinates. Try a nearby city."
            ) from exc
        name = ", ".join(
            str(part) for part in (item.get("name"), item.get("admin1"), item.get("country")) if part
        )
        return Place(name=name or query, latitude=latitude, longitude=longitude)

    async def nearby_birds(
        self,
        place: Place,
        radius_km: int,
        *,
        limit: int = 5,
    ) -> BirdReport:
        data = await self._get_json(
            f"{INAT_API}/observations/species_counts",
            params={
                "lat": place.latitude,
                "lng": place.longitude,
                "radius": radius_km,
                "taxon_id": 3,
                "quality_grade": "research",
                "per_page": max(1, min(limit, 30)),
                "order": "desc",
                "order_by": "count",
            },
        )
        if data is None:
            raise BirdDataError("The bird data service returned an empty response. Please try again.")

        birds: list[Bird] = []
        for item in (data.get("results") or [])[:limit]:
            taxon = item.get("taxon") or {}
            if not taxon.get("id"):
                continue
            photo = taxon.get("default_photo") or {}
            photo_url = (
                photo.get("medium_url")
                or photo.get("small_url")
                or photo.get("url")
            )
            birds.append(
                Bird(
                    taxon_id=int(taxon["id"]),
                    common_name=(
                        taxon.get("preferred_common_name")
                        or taxon.get("name")
                        or "Unknown bird"
                    ),
                    scientific_name=taxon.get("name") or "",
                    photo_url=photo_url,
                    wikipedia_url=taxon.get("wikipedia_url"),
                    nearby_count=int(item.get("count") or 0),
                    global_count=int(taxon.get("observations_count") or 0),
                )
            )

        return BirdReport(
            place=place,
            radius_km=radius_km,
            species_total=int(data.get("total_results") or 0),
            birds=birds,
        )

    async def nearby_report(self, location: str, radius_km: int, *, limit: int = 5) -> BirdReport:
        place = await self.geocode(location)
        return await self.nearby_birds(place, radius_km, limit=limit)

    async def taxon(self, taxon_id: int) -> dict[str, Any] | None:
        data = await self._get_json(f"{INAT_API}/taxa/{int(taxon_id)}")
        results = (data or {}).get("results") or []
        return results[0] if results else None

    async def wikipedia_summary(self, wikipedia_url: str | None, fallback: str = "") -> str:
        fallback_text = strip_html(fallback)
        if not wikipedia_url:
            return short_summary(fallback_text)

        try:
            parsed = urlparse(wikipedia_url)
        except ValueError:
            return short_summary(fallback_text)

        marker = parsed.path.find("/wiki/")
        if marker == -1:
            return short_summary(fallback_text)
        title = unquote(parsed.path[marker + 6:]).split("#")[0].replace("_", " ").strip()
        if not title:
            return short_summary(fallback_text)

        try:
            data = await self._get_json(
                f"{WIKIPEDIA_API}/{quote(title.replace(' ', '_'), safe='')}",
                retries=1,
            )
        except BirdDataError:
            return short_summary(fallback_text)
        if not data:
            return short_summary(fallback_text)
        return short_summary(data.get("extract") or fallback_text)

    async def enrich_bird(self, bird: Bird) -> Bird:
        taxon = await self.taxon(bird.taxon_id)
        if not taxon:
            return bird

        code, label = iucn_status(taxon)
        photo = taxon.get("default_photo") or {}
        photo_url = (
            photo.get("medium_url")
            or photo.get("small_url")
            or photo.get("url")
            or bird.photo_url
        )
        summary = await self.wikipedia_summary(
            taxon.get("wikipedia_url") or bird.wikipedia_url,
            taxon.get("wikipedia_summary") or "",
        )
        return replace(
            bird,
            photo_url=photo_url,
            wikipedia_url=taxon.get("wikipedia_url") or bird.wikipedia_url,
            global_count=int(taxon.get("observations_count") or bird.global_count),
            conservation_code=code,
            conservation_label=label,
            summary=summary,
        )

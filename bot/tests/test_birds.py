from datetime import date

import httpx
import pytest

from bot.app.birds import (
    Bird,
    BirdDataError,
    BirdService,
    iucn_status,
    parse_coordinates,
    pick_bird_of_the_day,
)


def test_parse_coordinates():
    place = parse_coordinates("22.56263, 88.36304")
    assert place is not None
    assert place.latitude == pytest.approx(22.56263)
    assert place.longitude == pytest.approx(88.36304)
    assert parse_coordinates("not coordinates") is None
    assert parse_coordinates("200, 88") is None


def test_iucn_status_reads_conservation_statuses():
    code, label = iucn_status(
        {
            "conservation_statuses": [
                {"authority": "IUCN Red List", "status": "LC", "status_name": "least concern"}
            ]
        }
    )
    assert code == "LC"
    assert label == "Least Concern"


def test_iucn_status_reads_singular_fallback():
    code, label = iucn_status({"conservation_status": {"status": "VU"}})
    assert code == "VU"
    assert label == "Vulnerable"
    assert iucn_status({}) == (None, None)


def test_pick_bird_of_the_day_is_deterministic():
    birds = [
        Bird(i, f"Bird {i}", f"Scientific {i}", None, None, i)
        for i in range(1, 6)
    ]
    day = date(2026, 11, 21)
    first = pick_bird_of_the_day(birds, day)
    second = pick_bird_of_the_day(birds, day)
    assert first == second
    assert first in birds


def mock_transport(request: httpx.Request) -> httpx.Response:
    host = request.url.host
    if host == "geocoding-api.open-meteo.com":
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "name": "Kolkata",
                        "admin1": "West Bengal",
                        "country": "India",
                        "latitude": 22.56263,
                        "longitude": 88.36304,
                    }
                ]
            },
        )
    if host == "api.inaturalist.org" and request.url.path.endswith("/species_counts"):
        return httpx.Response(
            200,
            json={
                "total_results": 283,
                "results": [
                    {
                        "count": 295,
                        "taxon": {
                            "id": 204454,
                            "preferred_common_name": "Common Myna",
                            "name": "Acridotheres tristis",
                            "default_photo": {"medium_url": "https://example.com/myna.jpg"},
                            "wikipedia_url": "https://en.wikipedia.org/wiki/Common_myna",
                            "observations_count": 74152,
                        },
                    }
                ],
            },
        )
    if host == "api.inaturalist.org" and "/taxa/" in request.url.path:
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": 204454,
                        "conservation_statuses": [
                            {
                                "authority": "IUCN Red List",
                                "status": "LC",
                                "status_name": "least concern",
                            }
                        ],
                        "wikipedia_url": "https://en.wikipedia.org/wiki/Common_myna",
                        "wikipedia_summary": "<p>Fallback summary.</p>",
                        "default_photo": {"medium_url": "https://example.com/myna.jpg"},
                        "observations_count": 74152,
                    }
                ]
            },
        )
    if host == "en.wikipedia.org":
        return httpx.Response(
            200,
            json={"extract": "The common myna is a bird in the family Sturnidae."},
        )
    return httpx.Response(404)


@pytest.mark.asyncio
async def test_nearby_report_and_enrichment():
    http = httpx.AsyncClient(transport=httpx.MockTransport(mock_transport))
    service = BirdService(http=http)
    try:
        report = await service.nearby_report("Kolkata", 25)
        assert report.place.name == "Kolkata, West Bengal, India"
        assert report.place.latitude == pytest.approx(22.56263)
        assert report.species_total == 283
        assert len(report.birds) == 1
        bird = report.birds[0]
        assert bird.common_name == "Common Myna"
        assert bird.scientific_name == "Acridotheres tristis"
        assert bird.nearby_count == 295
        assert bird.photo_url == "https://example.com/myna.jpg"

        enriched = await service.enrich_bird(bird)
        assert enriched.conservation_code == "LC"
        assert enriched.conservation_label == "Least Concern"
        assert enriched.summary == "The common myna is a bird in the family Sturnidae."
    finally:
        await http.aclose()


@pytest.mark.asyncio
async def test_geocode_not_found_is_friendly():
    http = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"results": []}))
    )
    service = BirdService(http=http)
    try:
        with pytest.raises(BirdDataError) as error:
            await service.geocode("Atlantis")
        assert "couldn't find" in str(error.value)
    finally:
        await http.aclose()


@pytest.mark.asyncio
async def test_coordinates_skip_geocoding():
    def fail_if_called(request):
        raise AssertionError("geocoding should not be called for coordinates")

    http = httpx.AsyncClient(transport=httpx.MockTransport(fail_if_called))
    service = BirdService(http=http)
    try:
        place = await service.geocode("22.56263, 88.36304")
        assert place.latitude == pytest.approx(22.56263)
        assert place.longitude == pytest.approx(88.36304)
    finally:
        await http.aclose()

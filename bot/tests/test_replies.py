from dataclasses import replace
from datetime import date

from bot.app.birds import Bird, BirdReport, Place
from bot.app.replies import (
    explore_url,
    format_bird_of_the_day,
    format_error_reply,
    format_label_reply,
    format_nearby_reply,
    species_url,
)

BASE = "https://example.github.io/birdscope"
PLACE = Place("Kolkata, West Bengal, India", 22.56263, 88.36304)


def make_bird() -> Bird:
    return Bird(
        taxon_id=204454,
        common_name="Common Myna",
        scientific_name="Acridotheres tristis",
        photo_url="https://example.com/myna.jpg",
        wikipedia_url="https://en.wikipedia.org/wiki/Common_myna",
        nearby_count=295,
        global_count=74152,
    )


def make_report(birds=None) -> BirdReport:
    return BirdReport(
        place=PLACE,
        radius_km=25,
        species_total=283,
        birds=[make_bird()] if birds is None else birds,
    )


def test_explore_url_contains_location_and_radius():
    url = explore_url(BASE, PLACE, 25)
    assert url.startswith(f"{BASE}/#/explore?")
    assert "lat=22.56263" in url
    assert "lng=88.36304" in url
    assert "radius=25" in url
    assert "name=Kolkata%2C%20West%20Bengal%2C%20India" in url


def test_species_url_contains_taxon_and_location():
    url = species_url(BASE, make_bird(), PLACE, 25)
    assert f"{BASE}/#/species/204454?" in url
    assert "name=Kolkata%2C%20West%20Bengal%2C%20India" in url


def test_nearby_reply_has_marker_table_photos_and_links():
    body = format_nearby_reply(make_report(), BASE, "birdscope:reply:99")
    assert "<!-- birdscope:reply:99 -->" in body
    assert "## 🐦 Birds near Kolkata, West Bengal, India" in body
    assert "283" in body
    assert "Common Myna" in body
    assert "Acridotheres tristis" in body
    assert '<img src="https://example.com/myna.jpg" width="96"' in body
    assert f"{BASE}/#/species/204454?" in body
    assert f"{BASE}/#/explore?" in body
    assert "295" in body


def test_nearby_reply_handles_no_sightings():
    body = format_nearby_reply(make_report(birds=[]), BASE, "birdscope:reply:100")
    assert "couldn't find any research-grade bird sightings" in body
    assert f"{BASE}/#/explore?" in body


def test_label_reply_mentions_the_label():
    body = format_label_reply(make_report(), BASE, "birdscope:label:7")
    assert "tagged **bird**" in body
    assert "field guide for the place" in body


def test_label_reply_mentions_default_when_no_place_was_found():
    body = format_label_reply(make_report(), BASE, "birdscope:label:7", defaulted=True)
    assert "couldn't find a place" in body
    assert "/bird <place>" in body


def test_error_reply_is_friendly():
    body = format_error_reply("I couldn't find “Atlantis”.", "birdscope:reply:5")
    assert "<!-- birdscope:reply:5 -->" in body
    assert "couldn't complete that search" in body
    assert "/bird Kolkata" in body


def test_bird_of_the_day_contains_facts_and_links():
    bird = replace(
        make_bird(),
        conservation_code="LC",
        conservation_label="Least Concern",
        summary="The common myna is a bird in the family Sturnidae.",
    )
    body = format_bird_of_the_day(
        bird,
        date(2026, 11, 21),
        BASE,
        "birdscope:botd:2026-11-21",
        place=PLACE,
        radius_km=25,
    )
    assert "# 🐦 Bird of the Day — November 21, 2026" in body
    assert '<img src="https://example.com/myna.jpg" width="560"' in body
    assert "The common myna is a bird in the family Sturnidae." in body
    assert "LC · Least Concern" in body
    assert "74,152" in body
    assert f"{BASE}/#/species/204454?" in body
    assert "https://www.inaturalist.org/taxa/204454" in body

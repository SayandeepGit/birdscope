from bot.app.commands import guess_location_from_issue, parse_bird_command


def test_parse_bird_command_with_location():
    command = parse_bird_command("Thanks!\n/bird Kolkata, West Bengal\n")
    assert command is not None
    assert command.location == "Kolkata, West Bengal"


def test_parse_bird_command_without_location_uses_default():
    command = parse_bird_command("/bird")
    assert command is not None
    assert command.location is None


def test_parse_bird_command_with_app_suffix():
    command = parse_bird_command("/bird@birdscope-bot Seattle")
    assert command is not None
    assert command.location == "Seattle"


def test_parse_bird_command_ignores_other_text():
    assert parse_bird_command("try /bird Kolkata") is None
    assert parse_bird_command("/birds Kolkata") is None
    assert parse_bird_command("") is None
    assert parse_bird_command(None) is None


def test_guess_location_prefers_explicit_command():
    location, defaulted = guess_location_from_issue(
        "Bird report",
        "Location: Seattle\n/bird London",
        "Kolkata",
    )
    assert location == "London"
    assert defaulted is False


def test_guess_location_reads_issue_form_field():
    location, defaulted = guess_location_from_issue(
        "Bird report",
        "### Location\nLocation: Cape Town, South Africa\n\n### Notes\nSeen at dusk.",
        "Kolkata",
    )
    assert location == "Cape Town, South Africa"
    assert defaulted is False


def test_guess_location_reads_title_near_phrase():
    location, defaulted = guess_location_from_issue("Birds near Singapore", "", "Kolkata")
    assert location == "Singapore"
    assert defaulted is False


def test_guess_location_falls_back_to_default():
    location, defaulted = guess_location_from_issue("A bird report", "No place here.", "Kolkata")
    assert location == "Kolkata"
    assert defaulted is True

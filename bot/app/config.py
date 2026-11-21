"""Runtime configuration for the BirdScope bot."""

from __future__ import annotations

import os
from dataclasses import dataclass

DEFAULT_LOCATION = "Kolkata, West Bengal, India"
DEFAULT_RADIUS_KM = 25


class ConfigError(RuntimeError):
    """Raised when the bot is missing required configuration."""


@dataclass(frozen=True)
class Settings:
    """Configuration shared by the webhook server and scheduled job."""

    app_id: str = ""
    private_key: str = ""
    webhook_secret: str = ""
    base_url: str = ""
    default_location: str = DEFAULT_LOCATION
    default_radius_km: int = DEFAULT_RADIUS_KM
    log_level: str = "INFO"

    @classmethod
    def from_env(cls) -> "Settings":
        radius_raw = os.getenv("DEFAULT_RADIUS_KM", str(DEFAULT_RADIUS_KM)).strip()
        try:
            radius = int(radius_raw)
        except ValueError:
            radius = DEFAULT_RADIUS_KM
        radius = max(1, min(radius, 50))

        private_key = os.getenv("GITHUB_PRIVATE_KEY", "").strip()
        # Render and most dashboards store newlines as the literal characters \n.
        if "\\n" in private_key:
            private_key = private_key.replace("\\n", "\n")

        return cls(
            app_id=os.getenv("GITHUB_APP_ID", "").strip(),
            private_key=private_key,
            webhook_secret=os.getenv("GITHUB_WEBHOOK_SECRET", "").strip(),
            base_url=os.getenv("BIRDSCOPE_BASE_URL", "").strip().rstrip("/"),
            default_location=os.getenv("DEFAULT_LOCATION", DEFAULT_LOCATION).strip() or DEFAULT_LOCATION,
            default_radius_km=radius,
            log_level=os.getenv("LOG_LEVEL", "INFO").strip().upper() or "INFO",
        )

    def require_runtime(self) -> None:
        """Validate the values needed to run the webhook server."""
        missing = [
            name
            for name, value in (
                ("GITHUB_APP_ID", self.app_id),
                ("GITHUB_PRIVATE_KEY", self.private_key),
                ("GITHUB_WEBHOOK_SECRET", self.webhook_secret),
                ("BIRDSCOPE_BASE_URL", self.base_url),
            )
            if not value
        ]
        if missing:
            raise ConfigError(f"Missing required environment variables: {', '.join(missing)}")
        if not self.private_key.startswith("-----BEGIN"):
            raise ConfigError(
                "GITHUB_PRIVATE_KEY must be a PEM-encoded RSA private key "
                "(copy the whole .pem file, including the BEGIN and END lines)."
            )
        if not self.base_url.startswith(("http://", "https://")):
            raise ConfigError("BIRDSCOPE_BASE_URL must start with http:// or https://")

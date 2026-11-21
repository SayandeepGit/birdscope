"""ASGI entry point for the BirdScope webhook server."""

from __future__ import annotations

import logging
import os

from .config import Settings
from .webhook import create_app

settings = Settings.from_env()
settings.require_runtime()

logging.basicConfig(
    level=getattr(logging, settings.log_level, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = create_app(settings=settings)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))

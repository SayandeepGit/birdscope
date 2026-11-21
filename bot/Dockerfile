FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd --create-home --shell /usr/sbin/nologin bot \
    && chown -R bot:bot /app
USER bot

EXPOSE 8000

# Render injects $PORT. The shell form is required so the variable expands.
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}

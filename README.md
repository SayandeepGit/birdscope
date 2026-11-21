# BirdScope — Discover the birds around you

BirdScope is a location-aware birdwatching field guide. Search any place on Earth to see which bird species have been spotted nearby — with photos, facts, conservation status, seasonal activity, and an interactive sightings map.

## Live site

**https://sayandeepgit.github.io/birdscope**

## Features

- **Location search & geolocation** — Type a city, town, or coordinates, or tap “Use my location”.
- **Species list** — Birds ranked by how often they have been observed within your chosen radius (5–50 km).
- **Species detail page** — Photos, Wikipedia summary, full taxonomy, IUCN conservation badge, and nearby sightings.
- **Seasonal activity chart** — Monthly observation histogram so you know when to look.
- **Interactive sightings map** — Leaflet map with recent research-grade observations pinned.
- **Favorites & dark mode** — Save birds you want to find again; your theme and favorites stay in this browser.
- **Deep links** — Every species and location has a shareable URL.
- **GitHub App bot** — Post `/bird <place>` in any issue or PR, or add the `bird` label, and the bot replies with a species table. A daily **Bird of the Day** is posted automatically.

## Data sources

- **iNaturalist API** — Species counts, observations, taxonomy, photos, conservation statuses, and seasonality histograms.
- **Wikipedia REST API** — Plain-language species summaries.
- **Open-Meteo Geocoding** — Place name → coordinates.
- **BigDataCloud** — Reverse geocoding for “my location”.
- **OpenStreetMap / Leaflet** — Base map tiles.

All data is public, free, and attribution is included in the app.

## Quick start (local)

```bash
# Serve the static site (Python 3.8+)
python -m http.server 8080 --directory web

# Open http://localhost:8080 in your browser
```

## Deploy the web app to GitHub Pages

### 1. Prerequisites (Windows)

```powershell
# Install Git and GitHub CLI
winget install Git.Git GitHub.cli

# Restart your shell, then authenticate
gh auth login
```

### 2. Create and push the repository

```bash
# From the project root (E:\Miscellaneous\birdscope)
git init
git add .
git commit -m "Initial BirdScope commit"
gh repo create birdscope --public --source=. --remote=origin --push
```

### 3. Enable GitHub Pages

1. Open the repository on GitHub: **Settings → Pages**
2. **Build and deployment** → **Source**: “GitHub Actions”
3. The `pages.yml` workflow will run on the next push to `main` and publish `web/`.
4. Your site will be live at `https://YOURNAME.github.io/birdscope`.

### 4. Verify

Open the Pages URL. Try searching “Kolkata” or “Seattle”. Click a bird to open its profile. Toggle dark mode. Add a favorite.

---

## Deploy the GitHub App bot to Render

### 1. Create a GitHub App

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App**.
2. **GitHub App name**: `BirdScope` (must be unique; add a suffix if taken).
3. **Homepage URL**: your Pages URL.
4. **Webhook URL**: leave blank for now — fill it in after Render gives you a URL.
5. **Webhook secret**: generate a long random string (save it).
6. **Permissions → Repository permissions**:
   - Issues: **Read & write**
   - Contents: **Read-only**
   - Metadata: **Read-only**
7. **Subscribe to events**: check **Issue comment** and **Issues**.
8. **Where can this GitHub App be installed?**: “Any account” (or your org).
9. **Create GitHub App**.
10. Note the **App ID** (top of the page).
11. **Generate a private key** (`.pem` file) — download and keep it safe.

### 2. Create a Render web service

1. Go to **Dashboard → New → Web Service → Public Git repository**.
2. Connect your `birdscope` repo.
3. **Name**: `birdscope-bot` (or any name you like).
4. **Runtime**: **Docker**.
5. **Dockerfile path**: `bot/Dockerfile`.
6. **Instance type**: Free (or Starter for always-on).
7. **Environment variables** (add each, then save):

| Variable | Value |
|---|---|
| `GITHUB_APP_ID` | Your App ID (digits only) |
| `GITHUB_PRIVATE_KEY` | **Entire** contents of the `.pem` file (including `-----BEGIN …` and `-----END …` lines). In Render, paste it as-is — newlines are preserved. |
| `GITHUB_WEBHOOK_SECRET` | The secret you generated in step 1. |
| `BIRDSCOPE_BASE_URL` | Your Pages URL, e.g. `https://YOURNAME.github.io/birdscope` |
| `DEFAULT_LOCATION` | `Kolkata, West Bengal, India` (or your preferred default) |
| `DEFAULT_RADIUS_KM` | `25` |
| `LOG_LEVEL` | `INFO` |

8. **Create Web Service**. Wait for the first deploy to finish (green).

### 3. Wire the webhook URL

1. Copy the Render service URL (e.g. `https://birdscope-bot.onrender.com`).
2. Return to **GitHub → Settings → Developer settings → GitHub Apps → BirdScope**.
3. **Webhook URL**: `https://birdscope-bot.onrender.com/webhook`
4. **Save changes**.

### 4. Install the app

1. In the GitHub App page, **Install App** (left sidebar).
2. Choose your account or organization.
3. Select **All repositories** or only `birdscope`.
4. **Install**.

### 5. Smoke test

Open any issue in the `birdscope` repo and comment:

```
/bird Kolkata
```

The bot should reply with a species table, photos, and a link back to the site.

Add the `bird` label to an issue (or create an issue with the label) — the bot posts a field guide for the location in the title/body.

Trigger the Bird of the Day manually:

**Actions → Bird of the Day → Run workflow**.

---

## Repository layout

```
birdscope/
├── web/                    # Static site (GitHub Pages)
│   ├── index.html
│   ├── 404.html
│   ├── .nojekyll
│   ├── assets/
│   ├── css/styles.css
│   └── js/
│       ├── app.js
│       ├── api.js
│       ├── icons.js
│       ├── router.js
│       ├── storage.js
│       ├── ui.js
│       ├── utils.js
│       ├── components/species-card.js
│       └── views/
│           ├── home.js
│           ├── explore.js
│           ├── species.js
│           └── favorites.js
├── bot/                    # GitHub App (FastAPI + Render)
│   ├── app/
│   │   ├── main.py         # ASGI entry point
│   │   ├── config.py
│   │   ├── github.py
│   │   ├── birds.py
│   │   ├── commands.py
│   │   ├── replies.py
│   │   ├── handlers.py
│   │   ├── webhook.py
│   │   └── bird_of_the_day.py
│   ├── tests/
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env.example
│   └── SETUP.md
├── .github/workflows/
│   ├── pages.yml
│   ├── bot-ci.yml
│   └── bird-of-the-day.yml
├── LICENSE
└── README.md
```

---

## License

MIT — see [LICENSE](LICENSE).

Photos and observation data belong to their iNaturalist contributors. BirdScope only displays them with attribution.

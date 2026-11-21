# BirdScope Bot — Registration & Deployment Checklist

This document walks through creating the GitHub App, deploying the FastAPI service to Render, and wiring them together. Keep it open while you work.

---

## 1. Create the GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**.
2. Fill in:
   - **GitHub App name**: `BirdScope` (must be globally unique; append a suffix if taken, e.g. `BirdScope-YourHandle`).
   - **Homepage URL**: `https://YOURNAME.github.io/birdscope` (your Pages URL).
   - **Webhook URL**: leave blank for now — fill it in after Render deploys.
   - **Webhook secret**: click **Generate a new secret** or make your own (32+ random characters). **Save this value** — you will need it for `GITHUB_WEBHOOK_SECRET`.
   - **Permissions → Repository permissions**:
     - **Issues**: Read & write
     - **Contents**: Read-only
     - **Metadata**: Read-only
   - **Subscribe to events** (under the permissions table):
     - ☑ **Issue comment**
     - ☑ **Issues**
   - **Where can this GitHub App be installed?**: “Any account” (or your organization).
3. Click **Create GitHub App**.
4. On the App’s settings page, note the **App ID** (a number near the top).
5. Scroll to **Private keys** → **Generate a private key**. A `.pem` file downloads. **Keep it safe** — you will paste its entire contents into Render as `GITHUB_PRIVATE_KEY`.

---

## 2. Deploy to Render

### Option A: Render Dashboard (recommended)

1. Go to **https://dashboard.render.com** → **New → Web Service**.
2. **Public Git repository** → connect your `birdscope` repo (or paste the HTTPS clone URL).
3. **Name**: `birdscope-bot` (or any name you prefer).
4. **Runtime**: **Docker**.
5. **Dockerfile path**: `bot/Dockerfile`.
6. **Instance type**: Free (spins down after inactivity) or Starter (always on).
7. **Environment variables** — add each, then **Save changes**:

| Key | Value | Notes |
|---|---|---|
| `GITHUB_APP_ID` | `123456` | The numeric App ID from step 1. |
| `GITHUB_PRIVATE_KEY` | *(entire `.pem` file)* | Paste the **whole file**, including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----`. Render preserves newlines. |
| `GITHUB_WEBHOOK_SECRET` | `your-generated-secret` | From step 1. |
| `BIRDSCOPE_BASE_URL` | `https://YOURNAME.github.io/birdscope` | Your Pages URL, no trailing slash. |
| `DEFAULT_LOCATION` | `Kolkata, West Bengal, India` | Fallback when `/bird` has no argument. |
| `DEFAULT_RADIUS_KM` | `25` | One of 5, 10, 25, 50. |
| `LOG_LEVEL` | `INFO` | `DEBUG` for more verbose logs. |

8. Click **Create Web Service**.
9. Wait for the first deploy to finish (green “Live” badge). Note the service URL, e.g. `https://birdscope-bot.onrender.com`.

### Option B: `render.yaml` (Infrastructure as Code)

A `render.yaml` is committed in the repo root. You can use **New → Blueprint** in Render and point it at the repo. The file references the same environment variables — you will still need to fill in the secret values in the Render dashboard after the first deploy.

---

## 3. Wire the Webhook URL

1. Copy the Render service URL (e.g. `https://birdscope-bot.onrender.com`).
2. Return to **GitHub → Settings → Developer settings → GitHub Apps → BirdScope**.
3. **Webhook URL**: `https://birdscope-bot.onrender.com/webhook`
4. **Save changes**.

---

## 4. Install the App

1. In the GitHub App page, click **Install App** (left sidebar).
2. Choose your personal account or organization.
3. **All repositories** or **Only select repositories** → pick `birdscope`.
4. **Install**.

---

## 5. Verify the Bot Works

### Test `/bird` command

Open any issue in the `birdscope` repo and comment:

```
/bird Kolkata
```

The bot should:
- React with 👀 (eyes) to your comment.
- Reply with a Markdown table of the top species, photos, sighting counts, and a link to the BirdScope explore page for that location.

### Test the `bird` label

1. Open a new issue (or edit an existing one).
2. Add the label **bird** (create it if it doesn’t exist — the bot will create it automatically on first use).
3. Put a location in the title or body, e.g.:
   - Title: `Birds near Seattle`
   - Body: `Location: Cape Town, South Africa`
4. The bot replies with a field guide for that location.

### Test Bird of the Day

Go to **Actions → Bird of the Day → Run workflow**. It creates an issue titled `Bird of the Day — <date>` with the featured species, photo, conservation status, and deep links.

---

## 6. Common Issues

| Symptom | Likely cause | Fix |
|---|---|---|
| Bot never replies | Webhook URL wrong or secret mismatch | Verify the Render URL ends with `/webhook` and `GITHUB_WEBHOOK_SECRET` matches the GitHub App setting. |
| “Invalid signature” in Render logs | `GITHUB_WEBHOOK_SECRET` not set or has extra whitespace | Re-paste the secret in Render; ensure no trailing newline. |
| “Could not create an installation token” | `GITHUB_PRIVATE_KEY` malformed | Paste the **entire** `.pem` file, including BEGIN/END lines. Ensure Render didn’t strip newlines. |
| “Missing required environment variables” on startup | One of `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `BIRDSCOPE_BASE_URL` is empty | Check all four are set in Render → Environment. |
| Bird of the Day workflow fails | `GITHUB_TOKEN` permissions | The workflow uses the default `GITHUB_TOKEN`; ensure the repo has **Settings → Actions → General → Workflow permissions → Read and write permissions**. |
| Species list is empty | iNaturalist has no research-grade observations for that radius | Try a larger radius (50 km) or a different place. |
| Photos don’t load | CORS or mixed content | The site uses HTTPS; iNaturalist photo URLs are HTTPS. If you run locally via `http://localhost`, browsers may block them — use the Pages URL or a local HTTPS tunnel. |

---

## 7. Rotating Secrets

- **Webhook secret**: Generate a new one in the GitHub App settings, update Render, save.
- **Private key**: Generate a new key in the GitHub App settings, download the `.pem`, update Render, save. The old key is revoked immediately.
- **App ID**: Never changes.

---

## 8. Local Development (optional)

```bash
cd bot
cp .env.example .env
# Edit .env with your real values
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Expose with ngrok/cloudflared for webhook testing:

```bash
ngrok http 8000
# Use the https://xxxx.ngrok-free.app/webhook URL in the GitHub App temporarily
```

Run the daily job manually:

```bash
BIRDSCOPE_BASE_URL=https://YOURNAME.github.io/birdscope \
DEFAULT_LOCATION="Kolkata, West Bengal, India" \
DRY_RUN=1 python -m app.bird_of_the_day
```

---

## 9. Upgrading the Bot

1. Push changes to `main`.
2. Render auto-deploys (or click **Manual Deploy** in the dashboard).
3. The webhook URL stays the same.

---

## 10. Support

- Check Render logs for stack traces.
- Check GitHub App → **Advanced → Recent Deliveries** for webhook payloads and responses.
- Open an issue in the `birdscope` repo with the label `bug` and the bot will reply with a field guide — a nice sanity check.
# Deploying JobTrackr

Three things to deploy: the **backend API** (Render), the **dashboard** (Vercel), and the **Chrome extension** (zip + manual install). Total time: ~30 min, no payment needed.

---

## 1. Push your code to GitHub

Render and Vercel both pull from GitHub.

```bash
# from the repo root
git add .
git commit -m "Prepare for deployment"
git push origin main
```

If you don't have a GitHub repo yet: create one at https://github.com/new (private is fine), then run the `git remote add origin ...` command GitHub shows you and `git push -u origin main`.

---

## 2. Deploy the backend on Render

1. Go to https://render.com and sign in with GitHub.
2. Click **New +** → **Blueprint**.
3. Pick the `jobtrackr-extension` repo. Render will detect `render.yaml`.
4. Click **Apply**. It will create a Postgres DB and a web service.
5. While it builds, fill in env vars on the **jobtrackr-api** service → **Environment**:
   - `CORS_ORIGINS_RAW` → leave blank for now (we'll fill after Vercel deploys)
   - The Google/Yahoo OAuth vars: leave blank unless you've already set up OAuth apps. Email sync features won't work until you do, but the rest of the app will.
6. After build finishes, you'll get a URL like `https://jobtrackr-api.onrender.com`. Hit it in a browser — should return `{"status":"ok"}`.

> Render's free tier sleeps the API after 15 min idle. First request after sleep takes ~30s. Fine for personal use.

---

## 3. Deploy the dashboard on Vercel

1. Go to https://vercel.com and sign in with GitHub.
2. Click **Add New** → **Project**, pick the same repo.
3. **Root Directory** → click Edit, set to `app`.
4. **Environment Variables**, add:
   - `REACT_APP_API_URL` = your Render URL from step 2 (e.g. `https://jobtrackr-api.onrender.com`)
5. Click **Deploy**. You'll get a URL like `https://jobtrackr-extension.vercel.app`.

### Wire CORS back to the backend
Go back to Render → jobtrackr-api → Environment, set:
- `CORS_ORIGINS_RAW` = `https://jobtrackr-extension.vercel.app` (your actual Vercel URL)

The service will redeploy automatically.

---

## 4. Package the Chrome extension

1. Edit `extension/config.js`. Change the URL to your Render API:
   ```js
   self.API_BASE = "https://jobtrackr-api.onrender.com";
   ```
2. Zip the `extension/` folder (everything inside it, not the folder itself).
3. **Install in Chrome**:
   - Go to `chrome://extensions`
   - Toggle **Developer mode** (top right)
   - Click **Load unpacked** and pick the `extension/` folder
   - (Or drag the zip onto the page)

To share with someone else, send them the zip and these same instructions. To publish to the Chrome Web Store, that requires a one-time $5 developer fee — skip for now.

---

## 5. (Optional) OAuth setup for email sync

If you want Gmail/Yahoo email scanning to work in production:

**Gmail:**
1. https://console.cloud.google.com → create a project → APIs & Services → OAuth consent screen → External, add yourself as a test user.
2. Credentials → Create OAuth client ID → Web application.
3. Authorized redirect URI: `https://jobtrackr-api.onrender.com/gmail/callback`
4. Copy client ID + secret into Render env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (same URL as above).

**Yahoo:**
1. https://developer.yahoo.com/apps → create app, request Mail Read scope.
2. Redirect URI: `https://jobtrackr-api.onrender.com/yahoo/callback`
3. Copy into Render env vars: `YAHOO_CLIENT_ID`, `YAHOO_CLIENT_SECRET`, `YAHOO_REDIRECT_URI`.

---

## What lives where

| Piece | Hosted at | Code path |
|---|---|---|
| Backend API + DB | Render | `/backend` |
| Dashboard | Vercel | `/app` |
| Chrome extension | User's browser | `/extension` |

## Troubleshooting

- **Dashboard loads but data is empty / "request failed" in console** → CORS. Make sure `CORS_ORIGINS_RAW` on Render exactly matches your Vercel URL (no trailing slash).
- **Extension does nothing** → check `extension/config.js` URL, then reload the extension in `chrome://extensions`.
- **Render build fails** → most often a missing requirement; check the build log.
- **First API call is slow** → Render free tier cold start, ~30s. Refresh and it'll be fast.

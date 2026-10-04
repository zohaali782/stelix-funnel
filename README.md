# Stelix Guide Funnel

The Stelix AI influencer guide website plus its own backend. One Node/Express server does both jobs:

- serves the website from `public/` (guide page, photos, videos)
- saves every form signup (name, email, phone) to MongoDB, in its own `stelix_leads` collection, separate from Amayra

## Files

```
server.js        Express server: website + /api/lead + admin leads page
package.json     dependencies (express, mongoose, dotenv)
.env.example     the 2 settings you need (copy to .env for local testing)
public/          the website (index.html, images/, media/)
```

## Settings (environment variables)

| Name | What to put |
|---|---|
| `MONGODB_URI` | Your MongoDB Atlas connection string. Add `stelix` as the database name before the `?` |
| `ADMIN_KEY` | Any long secret you choose. It protects the leads page |

`PORT` is set by Render automatically.

## Save leads to Google Sheets instead (no MongoDB needed)

1. Make a new Google Sheet. Open **Extensions > Apps Script**.
2. Delete what's there, paste everything from `google-sheet-script.js`, and set `SECRET` to your `ADMIN_KEY`. Save.
3. **Deploy > New deployment**, type **Web app**, Execute as **Me**, Who has access **Anyone**. Deploy and allow access.
4. Copy the Web app URL (ends with `/exec`) and add it on Render as `SHEET_WEBHOOK_URL`.

New signups then appear as rows in a **Leads** tab. If both MongoDB and the sheet are set, leads go to both.

## Run on your computer

```bash
npm install
cp .env.example .env     # then put your real MONGODB_URI and ADMIN_KEY in .env
npm run dev
```

Open http://localhost:3000, fill the form, then check http://localhost:3000/admin/leads?key=YOUR_ADMIN_KEY

## Deploy on Render

1. Push this folder to a new GitHub repo, for example `stelix-funnel` (`.env` and `node_modules` are ignored automatically).
2. Render dashboard: **New > Web Service** and pick the repo.
3. Settings:
   - Runtime: **Node**
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Under **Environment**, add `MONGODB_URI` and `ADMIN_KEY`.
5. Click **Create Web Service**. After the deploy, open `https://YOUR-APP.onrender.com/api/health`. It should say `"database":"connected"`.

**MongoDB Atlas:** under Network Access, allow `0.0.0.0/0`, otherwise Render can't connect. You can reuse the Amayra cluster. Using `stelix` as the database name keeps the leads separate.

## See your leads

- List: `https://YOUR-APP.onrender.com/admin/leads?key=YOUR_ADMIN_KEY`
- Excel / Google Sheets download: `https://YOUR-APP.onrender.com/admin/leads.csv?key=YOUR_ADMIN_KEY`

Without the right key these pages show "Not found".

## How the form works

- The guide opens right away, even if saving is slow or fails. A visitor never waits more than 4 seconds.
- If the same email signs up twice, it updates the same lead and counts `signups`. No duplicates.
- A hidden `website` field catches spam bots, and each visitor can send the form 10 times per 10 minutes.

## Updating the website

Edit `public/index.html` (or replace images in `public/media/`), push to GitHub, and Render redeploys on its own.

Note: on Render's free plan the server sleeps after 15 minutes without visitors, so the first visit after that takes about 30 to 50 seconds to load.

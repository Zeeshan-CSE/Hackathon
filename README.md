# LifeLink - deployable package

Node.js (Express) server that serves the LifeLink website and stores its shared data in a database.
The UI, layout, responsiveness and features are exactly the same as the version you approved.

## What the backend does
- `GET  /api/state`  returns the shared app data (`?since=<version>` returns 204 if nothing changed)
- `PUT  /api/state`  saves it (validated, 5 MB cap, must contain an admin account)
- `GET  /healthz`    health check (also checks the database)
- Serves `public/index.html`, with security headers, gzip, and per-IP rate limits
- Storage: **PostgreSQL** when `DATABASE_URL` is set, otherwise a **SQLite** file in `DATA_DIR`
- The browser syncs every 3 seconds, so all users (donors, requesters, coordinators, admin) see the same live data

## Run locally
    npm install
    npm start          # http://localhost:3000
    npm test           # API smoke test

## Deploy
**Render (easiest, free tier):** push this folder to GitHub > Render > New > Blueprint > pick the repo.
`render.yaml` creates the web service and a PostgreSQL database and wires `DATABASE_URL`.

**Railway / Fly.io / any Docker host:** the included `Dockerfile` works as is.
- With Postgres: add a Postgres add-on and set `DATABASE_URL`.
- With SQLite: mount a persistent volume at `/data` (otherwise data is lost on redeploy).

    docker build -t lifelink . && docker run -p 3000:3000 -v lifelink-data:/data lifelink

**VPS:** `npm install --omit=dev`, run `node server.js` under pm2/systemd, put Nginx/Caddy in front for HTTPS.
HTTPS is required for the QR camera scanner to work (browsers block camera on plain HTTP).

## Before using with real patients / donors
Business rules and sign-in checks still run in the browser (as in the original app), so every visitor's
browser receives the full data set, including donor phone numbers and password hashes. Fine for a demo,
pilot or evaluation; for real personal data, move authentication and role-based data access to the server.
Concurrent edits are last-write-wins. Demo accounts and the "Reset demo data" button are still on the home page.

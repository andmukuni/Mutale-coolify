# Deploying Mutale to Coolify (Docker / VPS)

Use this guide for **Coolify staging** or production on a VPS. For cPanel shared hosting, see [DEPLOY_CPANEL.md](DEPLOY_CPANEL.md).

## Architecture

One Docker container serves everything on **port 4000**:

- React SPA from `dist/` (built inside the image)
- Express API at `/api/*`
- User uploads at `/uploads/*` (persisted volume)

MySQL runs as a **separate Coolify database resource**. The app connects via `DB_*` environment variables.

```
Browser → Coolify proxy (TLS) → mutale container :4000 → Coolify MySQL
                                      ↓
                              volume: mutale_uploads → /app/uploads
```

---

## Prerequisites

- Coolify installed on a VPS (HTTPS admin UI reachable)
- Git repository connected to Coolify (GitHub: `andmukuni/mutale`, branch **`coolify`**)
- **Domain (staging):** Coolify auto-generates one for you (e.g. `https://mutale-xxxxx.your-coolify-domain.com`) — no custom DNS needed for first deploy. Add your own subdomain later if you want (e.g. `staging.mutalemubanga.org`).

---

## Step 1 — Create MySQL in Coolify

1. In Coolify → **Resources** → **+ New** → **Database** → **MySQL**
2. Set a root password and create the database
3. After provisioning, open the MySQL resource and copy the **internal connection details**:
   - **Host** — internal hostname (e.g. `mysql-xxxxx` or similar — **not** the public IP)
   - **Port** — usually `3306`
   - **User** — usually `mysql` or `root`
   - **Password** — from Coolify
   - **Database name** — use `default` (Coolify MySQL default schema name)

> **Important:** Use Coolify's **internal** hostname for `DB_HOST`. Public IPs like `13.140.178.27` are for external access only and may be blocked from inside the Docker network.

---

## Step 2 — Create Docker Compose application

1. Coolify → **+ New** → **Docker Compose**
2. Connect your Git repo: `andmukuni/mutale`
3. Branch: **`coolify`**
4. Compose file: `docker-compose.yml` (default)
5. Service name: **`mutale`** (matches compose file)

---

## Step 3 — Environment variables (Coolify UI only)

Copy values from [`.env.coolify.example`](.env.coolify.example) into Coolify → your app → **Environment Variables**.

**Do NOT** put secrets in `docker-compose.yml` — Coolify locks those variables to the file and they become undeletable from the UI.

| Variable | Value |
|---|---|
| `DB_HOST` | Internal MySQL hostname from Step 1 |
| `DB_PORT` | `3306` |
| `DB_USER` | MySQL user from Step 1 |
| `DB_PASSWORD` | MySQL password from Step 1 |
| `DB_NAME` | `default` |
| `APP_URL` | Your Coolify-generated URL (exact, no trailing slash) |
| `CORS_ORIGINS` | Same as `APP_URL` |
| `TRUST_PROXY` | `1` |
| `AUTH_TOKEN_SECRET` | New random 64-char hex (not production) |
| `ADMIN_API_KEY` | New random string (not production) |
| `DEFAULT_ADMIN_EMAIL` | e.g. `admin@staging.mutalemubanga.org` |
| `DEFAULT_ADMIN_PASSWORD` | Strong password (required on first boot) |
| `DEFAULT_ADMIN_NAME` | `Mutale Mubanga` |
| `RECEIPT_PDF_LEGACY` | `1` (safe default — jsPDF receipts, no Chromium) |
| `LENCO_SANDBOX` | `true` (for staging payments testing) |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> After first deploy, copy the Coolify **Links** URL and set `APP_URL` + `CORS_ORIGINS` to match exactly, then **Redeploy**.

---

## Step 4 — Volume and domain

1. **Volume:** Ensure `mutale_uploads` is mounted at `/app/uploads` (defined in `docker-compose.yml`)
2. **Domain:** Coolify auto-assigns a URL, or add a custom domain
3. **Port mapping:** Coolify proxy → container port **4000**

---

## Step 5 — Deploy

Click **Deploy** in Coolify. First build takes 5–15 minutes (Vite build + `canvas` native compile).

Verify after deploy:

```bash
# Replace with your Coolify URL
export APP_URL=https://your-coolify-generated-url.example.com
bash scripts/verify-coolify-deploy.sh
```

Or manually:

- `https://<url>/api/health` → JSON with `ok: true`
- `https://<url>/api/db-test` → database connected
- `https://<url>/` → React homepage loads
- `https://<url>/admin/login` → admin login page

---

## Step 6 — Seed staging data

After first successful deploy, seed the database. From your Coolify server (SSH) or Coolify terminal:

```bash
# Find the container name
docker ps | grep mutale

# Run all seeds
bash scripts/coolify-seed.sh <container_name_or_id>
```

Or individually:

```bash
docker exec -it <container> node server/seed.js
docker exec -it <container> node server/scripts/seed-rbac.js
docker exec -it <container> node server/scripts/seed-partner-logos.js
```

Default admin (if no users exist): uses `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` from env vars.

---

## Staging vs cPanel production

| | cPanel (`cpanel` branch) | Coolify (`coolify` branch) |
|---|---|---|
| Deploy | ZIP upload + restart | Git push → auto deploy |
| Entry | `app.js` / Passenger | `node server/index.js` |
| MySQL | cPanel local MySQL | Coolify managed MySQL |
| Uploads | `~/First/uploads/` | Docker volume `mutale_uploads` |

Keep **separate** databases and secrets. Do not point staging at production MySQL.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Build OOM / killed during `vite build` | Dockerfile caps heap at 1.5 GB; ensure VPS has ≥2 GB RAM for build |
| `vite: command not found` | Dockerfile uses `npm ci --include=dev` in build stage — redeploy latest `coolify` branch |
| CORS errors in browser | `APP_URL` and `CORS_ORIGINS` must exactly match the URL you open |
| 502 / container unhealthy | Check Coolify logs; verify `DB_*` vars and internal MySQL host |
| `AUTH_TOKEN_SECRET must be set` | Add `AUTH_TOKEN_SECRET` in Coolify env vars and redeploy |
| Uploads disappear after redeploy | Confirm `mutale_uploads` volume is attached at `/app/uploads` |
| Receipt PDF errors | Set `RECEIPT_PDF_LEGACY=1` (default) — skips Puppeteer/Chromium |

---

## Local Docker test (optional)

```bash
# Build and run locally (requires Docker installed)
docker compose build
docker compose up

# With a local .env file for DB connection:
# docker compose --env-file .env.coolify.example up
```

App listens on port 4000 inside the container. Uncomment `ports: ["4000:4000"]` in `docker-compose.yml` to publish locally.

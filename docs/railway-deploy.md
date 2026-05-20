# Deploy to Railway (one project, one pass)

Everything runs on **Railway only**. One project, **three resources**: PostgreSQL, `api`, `web`.

Config files (no Root Directory on either service — builds run from monorepo root):

- API: [`railway/api.toml`](../railway/api.toml)
- Web: [`railway/web.toml`](../railway/web.toml)

---

## One-pass checklist

Do these in order. You should only need **one API redeploy** if you skip variable references (step 6b); with references (step 6a), both services can deploy once.

### 1. Project + database

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → `httpbin-monitor` (branch `main`).
2. **+ New** → **Database** → **PostgreSQL**.

### 2. API service

1. **+ New** → **GitHub Repo** → same repo.
2. Rename service to **`api`** (exact name — used in variable references below).
3. **Settings** → **Config file path**: `railway/api.toml`
4. **Settings** → **Networking** → **Generate domain** (do this **before** the first deploy).
5. **Variables**:

| Variable                 | Value                                                       |
| ------------------------ | ----------------------------------------------------------- |
| `DATABASE_URL`           | **Add reference** → Postgres → `DATABASE_URL`               |
| `ANTHROPIC_API_KEY`      | Your Anthropic key                                          |
| `NODE_ENV`               | `production`                                                |
| `PING_INTERVAL_SECONDS`  | `300` (use `10` temporarily for a faster demo, then revert) |
| `ANTHROPIC_MODEL`        | `claude-haiku-4-5-20251001` _(optional)_                    |
| `AI_RATE_LIMIT_PER_HOUR` | `20` _(optional)_                                           |
| `AI_MAX_INPUT_TOKENS`    | `8000` _(optional)_                                         |
| `AI_CACHE_TTL_SECONDS`   | `3600` _(optional)_                                         |
| `FRONTEND_ORIGIN`        | See **6a** or **6b** below                                  |

Do **not** set `PORT` (Railway sets it). Do **not** set Root Directory.

### 3. Web service

1. **+ New** → **GitHub Repo** → same repo.
2. Rename service to **`web`**.
3. **Settings** → **Config file path**: `railway/web.toml`
4. **Settings** → **Networking** → **Generate domain** (before first deploy).
5. **Variables** — required **before** the first web build (Vite bakes these in):

| Variable                     | Value                                      |
| ---------------------------- | ------------------------------------------ |
| `VITE_API_URL`               | `https://<api-domain>` or **6a** reference |
| `VITE_WS_URL`                | Same as `VITE_API_URL`                     |
| `VITE_PING_INTERVAL_SECONDS` | `300`                                      |

### 4. Copy URLs (if not using references)

After generating domains:

- API: `https://api-production-xxxx.up.railway.app`
- Web: `https://web-production-xxxx.up.railway.app`

### 5. Wire cross-service URLs

Pick **one** approach:

#### 6a. Variable references (deploy both once)

If service names are exactly `api` and `web`:

| Service | Variable          | Value                                    |
| ------- | ----------------- | ---------------------------------------- |
| `web`   | `VITE_API_URL`    | `https://${{api.RAILWAY_PUBLIC_DOMAIN}}` |
| `web`   | `VITE_WS_URL`     | `https://${{api.RAILWAY_PUBLIC_DOMAIN}}` |
| `api`   | `FRONTEND_ORIGIN` | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}` |

No trailing slashes. Domains must be generated (step 2.4 / 3.4) before deploy.

#### 6b. Manual URLs (one extra API redeploy)

1. Set `VITE_API_URL` and `VITE_WS_URL` on **web** to the API URL from step 4.
2. Deploy **web** first (or in parallel with API).
3. Set `FRONTEND_ORIGIN` on **api** to the web URL (no trailing slash).
4. **Redeploy api** once.

### 6. Deploy

Trigger deploy on **api** and **web** (Railway may auto-deploy on save).

**API pre-deploy** runs migrations in `railway/api.toml` (`prisma migrate deploy`) after the image is built, when `DATABASE_URL` is reachable. Check api **Deployments** logs for success.

### 7. Smoke test

| Check      | Action                                                               |
| ---------- | -------------------------------------------------------------------- |
| API health | `GET https://<api-domain>/health` → `{ "ok": true }`                 |
| Dashboard  | Open web URL                                                         |
| Live pings | Rows within ~5 min (`300`) or faster with `PING_INTERVAL_SECONDS=10` |
| Socket.IO  | New rows without refresh                                             |
| Ask AI     | Chat streams an answer                                               |
| Incidents  | `/incidents` loads                                                   |

### 8. Update README + submission email

Fill the **Live demo** table in `README.md` and URLs in [`submission-email.md`](./submission-email.md).

---

## Variable cheat sheet

| Variable                     | Service | Required     | Notes                          |
| ---------------------------- | ------- | ------------ | ------------------------------ |
| `DATABASE_URL`               | api     | Yes          | Postgres reference             |
| `ANTHROPIC_API_KEY`          | api     | Yes (for AI) | Pings work without it          |
| `NODE_ENV`                   | api     | Yes          | `production`                   |
| `PING_INTERVAL_SECONDS`      | api     | Recommended  | `300` prod, `10` demo          |
| `FRONTEND_ORIGIN`            | api     | Yes          | Exact web URL, no trailing `/` |
| `VITE_API_URL`               | web     | Yes          | Before first web build         |
| `VITE_WS_URL`                | web     | Yes          | Same as API URL                |
| `VITE_PING_INTERVAL_SECONDS` | web     | Recommended  | `300`                          |
| `PORT`                       | either  | **No**       | Railway sets automatically     |

---

## Troubleshooting

| Symptom                           | Fix                                                                |
| --------------------------------- | ------------------------------------------------------------------ |
| Build fails / workspace not found | Clear **Root Directory** on both services                          |
| Web calls wrong API               | Set `VITE_*` then **redeploy web** (rebuild required)              |
| CORS / Socket errors              | `FRONTEND_ORIGIN` must exactly match web URL                       |
| No ping rows                      | API logs + confirm `DATABASE_URL` on api                           |
| Migrations failed                 | Postgres linked to api; `DATABASE_URL` on api; redeploy api        |
| AI disabled                       | `ANTHROPIC_API_KEY` on api only                                    |
| `${{api...}}` reference empty     | Service renamed? Names must be `api` and `web`; domain generated   |
| “No changes to watched files”     | See **Watch paths** below; use **Redeploy** or push a watched file |

### Watch paths

Watch paths limit which file changes trigger a deploy. **Docs-only pushes** (e.g. `docs/**`) do **not** deploy the API.

**API service** — add these in **Settings → Build → Watch Paths** (one per line), or rely on `railway/api.toml` if your builder honors config-as-code:

```gitignore
/apps/api/**
/packages/shared/**
/pnpm-lock.yaml
/railway/api.toml
/package.json
```

**Web service** — same idea with `/apps/web/**` and `/railway/web.toml` in `railway/web.toml`.

If the dashboard **Watch Paths** list is empty but deploys are still skipped, Railpack may be ignoring `watchPatterns` in the config file — **paste the patterns into the UI**. To deploy on every push (simplest while you only have one service), leave **Watch Paths** empty in the dashboard and remove `watchPatterns` from the config file.

**Wait for CI** enabled? A failed GitHub Actions run blocks deploy even when files match.

**Right now:** use **Deployments → Redeploy** once; do not wait for a docs-only commit to trigger a build.

---

## Optional: faster demo pings

On **api** only: `PING_INTERVAL_SECONDS=10`, redeploy. Revert to `300` when done.

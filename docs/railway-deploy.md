# Deploy to Railway (API + Web + Postgres)

Everything runs on **Railway only** — no Vercel required. Use **one project**, **three resources**: Postgres, API service, Web service.

## 1. Create the project

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select `httpbin-monitor`.
2. **Add PostgreSQL**: project canvas → **+ New** → **Database** → **PostgreSQL**.

## 2. API service

1. **+ New** → **GitHub Repo** → same repository (second service).
2. Rename the service to `api`.
3. **Settings** → **Config file path**: `/railway/api.toml`
4. **Settings** → **Networking** → **Generate domain** (e.g. `https://api-production-xxxx.up.railway.app`).
5. **Variables** (service variables):

| Variable                 | Value                                               |
| ------------------------ | --------------------------------------------------- |
| `DATABASE_URL`           | Reference → Postgres → `DATABASE_URL`               |
| `ANTHROPIC_API_KEY`      | Your Anthropic key                                  |
| `ANTHROPIC_MODEL`        | `claude-haiku-4-5-20251001` (optional)              |
| `PING_INTERVAL_SECONDS`  | `300`                                               |
| `NODE_ENV`               | `production`                                        |
| `FRONTEND_ORIGIN`        | Web public URL (step 3) — set after web is deployed |
| `AI_RATE_LIMIT_PER_HOUR` | `20`                                                |
| `AI_MAX_INPUT_TOKENS`    | `8000`                                              |
| `AI_CACHE_TTL_SECONDS`   | `3600`                                              |

Railway sets `PORT` automatically. Do **not** set a custom Root Directory.

Deploy. Check **Deployments** logs: Prisma migrate should run in the build step.

## 3. Web service

1. **+ New** → **GitHub Repo** → same repository (third service).
2. Rename to `web`.
3. **Settings** → **Config file path**: `/railway/web.toml`
4. **Variables** (required **before** the first successful build — Vite bakes these in):

| Variable                     | Value                      |
| ---------------------------- | -------------------------- |
| `VITE_API_URL`               | API public URL from step 2 |
| `VITE_WS_URL`                | Same as `VITE_API_URL`     |
| `VITE_PING_INTERVAL_SECONDS` | `300`                      |

5. **Networking** → **Generate domain** (e.g. `https://web-production-xxxx.up.railway.app`).
6. Deploy.

## 4. Wire CORS (API)

On the **api** service, set:

```bash
FRONTEND_ORIGIN=https://web-production-xxxx.up.railway.app
```

(use your real web URL, no trailing slash)

Redeploy the API service if it was already running.

## 5. Smoke test

| Check      | URL / action                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| API health | `GET https://<api-domain>/health` → `{ "ok": true }`                                                     |
| Dashboard  | Open web domain                                                                                          |
| Live pings | Table grows within ~5 min (`PING_INTERVAL_SECONDS=300`) or temporarily set `10` on API for a faster demo |
| Socket.IO  | New rows appear without refresh                                                                          |
| Ask AI     | Chat panel streams an answer                                                                             |
| Incidents  | `/incidents` loads                                                                                       |

## 6. Update README and submission email

Fill in the **Live demo** table in `README.md` and the URLs in [`docs/submission-email.md`](./submission-email.md).

## Troubleshooting

| Symptom                    | Fix                                                  |
| -------------------------- | ---------------------------------------------------- |
| Web calls wrong API        | Rebuild **web** after setting `VITE_*` vars          |
| CORS / Socket errors       | `FRONTEND_ORIGIN` must exactly match the web URL     |
| No rows                    | Check API logs for scheduler; confirm `DATABASE_URL` |
| Migrations failed at build | Link Postgres to API before first deploy; redeploy   |
| AI disabled                | Set `ANTHROPIC_API_KEY` on API service               |

## Optional: faster demo pings

On the API service only, set `PING_INTERVAL_SECONDS=10` temporarily. Revert to `300` for production-like behavior.

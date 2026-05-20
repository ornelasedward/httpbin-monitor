# Deploy to Fly.io (API + Web + Postgres)

Fly cannot auto-detect this pnpm monorepo — use the Dockerfiles and `fly.toml` in the repo root.

You need **three resources**: Fly Postgres, an **API** app, and a **Web** app (same pattern as Railway).

## 1. Install CLI and log in

```bash
brew install flyctl   # or: curl -L https://fly.io/install.sh | sh
fly auth login
```

## 2. Postgres

```bash
fly postgres create --name httpbin-monitor-db --region iad
```

Note the cluster name, then attach it to the API app after you create the API (step 3):

```bash
fly postgres attach httpbin-monitor-db --app <your-api-app-name>
```

This sets `DATABASE_URL` on the API app.

## 3. API app

If you already created an app in the Fly dashboard (e.g. `httpbin-monitor-lmgtsa`), set that name in **`fly.toml`**:

```toml
app = "httpbin-monitor-lmgtsa"
```

Otherwise:

```bash
fly apps create httpbin-monitor-api
# set app = "httpbin-monitor-api" in fly.toml
```

Secrets (API):

```bash
fly secrets set \
  ANTHROPIC_API_KEY="sk-..." \
  FRONTEND_ORIGIN="https://<your-web-app>.fly.dev" \
  --app <your-api-app-name>
```

`FRONTEND_ORIGIN` can be set after the web app exists; redeploy the API once the web URL is known.

Optional secrets: `ANTHROPIC_MODEL`, `AI_RATE_LIMIT_PER_HOUR`, `AI_MAX_INPUT_TOKENS`, `AI_CACHE_TTL_SECONDS`.

Deploy API (from repo root):

```bash
fly deploy --app <your-api-app-name>
```

Migrations run via `release_command` in `fly.toml`. Check:

```bash
curl https://<your-api-app>.fly.dev/health
```

## 4. Web app

Create the web app:

```bash
fly apps create httpbin-monitor-web
```

Edit **`fly.web.toml`**: set `app` and **`[build.args]`** to your real API URL (Vite bakes these in at build time):

```toml
[build.args]
  VITE_API_URL = "https://<your-api-app>.fly.dev"
  VITE_WS_URL = "https://<your-api-app>.fly.dev"
  VITE_PING_INTERVAL_SECONDS = "300"
```

Deploy:

```bash
fly deploy --config fly.web.toml
```

## 5. Wire CORS

After the web app has a URL:

```bash
fly secrets set FRONTEND_ORIGIN="https://<your-web-app>.fly.dev" --app <your-api-app-name>
fly deploy --app <your-api-app-name>
```

## 6. GitHub deploy (dashboard)

For the app linked to GitHub:

1. Ensure **`fly.toml`** at the repo root has `app = "<your-dashboard-app-name>"`.
2. **`Dockerfile.api`** must exist (Fly uses `[build] dockerfile` in `fly.toml`).
3. Push to the branch Fly watches.

The web app is a **second** Fly app — create it in the dashboard or CLI and point it at `fly.web.toml` / `Dockerfile.web` (or deploy web via CLI only).

## 7. Smoke test

| Check      | Action                                                        |
| ---------- | ------------------------------------------------------------- |
| API health | `GET https://<api>.fly.dev/health` → `{ "ok": true }`         |
| Dashboard  | Open `https://<web>.fly.dev`                                  |
| Socket.IO  | New ping rows without refresh (after ~5 min with default 300) |
| Ask AI     | Chat streams an answer                                        |

## Troubleshooting

| Symptom                         | Fix                                                                 |
| ------------------------------- | ------------------------------------------------------------------- |
| Could not detect runtime        | Push `Dockerfile.api` + `fly.toml` with `dockerfile = "Dockerfile.api"` |
| Web calls wrong API             | Update `[build.args]` in `fly.web.toml` and redeploy web            |
| CORS / Socket errors            | `FRONTEND_ORIGIN` must exactly match the web URL (no trailing slash) |
| Migrations failed               | Confirm Postgres attached; `fly logs --app <api>` during deploy     |
| `release_command` fails locally | Normal if no `DATABASE_URL`; it runs on Fly with attached Postgres  |

## Optional: faster demo pings

```bash
fly secrets set PING_INTERVAL_SECONDS=10 --app <your-api-app-name>
```

Revert to `300` for production-like behavior.

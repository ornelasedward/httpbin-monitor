# httpbin Monitor

A full-stack monitoring app that POSTs randomized JSON payloads to [httpbin.org/anything](https://httpbin.org/anything) on a schedule, persists every result to PostgreSQL, and streams new rows to a live dashboard over Socket.IO. Integrates Claude (Anthropic tool-use API) for natural-language queries over the data and auto-generated incident reports when latency spikes.

![Dashboard — live table, stats, and API health](./docs/screenshots/dashboard.png)

## Architecture

The repo is a pnpm workspace with a thin shared types package and two applications. The API owns scheduling, persistence, REST, WebSockets, and the AI module. The web app is a read-mostly client that hydrates from REST and stays current via Socket.IO.

```
apps/
  api/      Node + Express + Socket.IO + Prisma + Anthropic SDK
  web/      React + Vite + Tailwind + shadcn/ui + TanStack Query
packages/
  shared/   TS types and event-name constants (PING_NEW, INCIDENT_NEW)
```

On each tick, the scheduler invokes the ping worker. The worker generates a faker payload, POSTs to httpbin with a 10s timeout, measures round-trip time, and classifies the outcome (2xx, HTTP error, timeout, or network failure). It persists a row via Prisma and broadcasts `ping:new` with the saved record. These paths are independent: a DB failure is logged without killing the timer; a broadcast failure does not roll back the write.

The web client loads history with `GET /responses` (cursor pagination) and prepends live rows when `ping:new` arrives. The AI layer adds `POST /ai/chat` (SSE streaming, tool-assisted queries) and a 60-second incident monitor that calls Claude with forced tool-use so structured output is guaranteed before it hits Postgres.

## Tech stack

| Choice | Why |
|--------|-----|
| **TypeScript (strict)** | Shared wire types in `packages/shared` keep API, client, and Socket.IO events in sync. |
| **Express** | Minimal server with middleware and routing; handlers stay explicit. |
| **PostgreSQL + JSONB** | Indexed columns for timestamp/status/latency; JSONB for arbitrary httpbin echoes. |
| **Prisma** | Migrations, type-safe queries, and Studio for debugging. |
| **Socket.IO** | Reconnection with backoff and long-polling fallback out of the box. |
| **node-cron + setInterval** | `setInterval` under 60s (cron is unreliable sub-minute); cron at 60s+. |
| **TanStack Query** | Infinite query for pagination; `setQueryData` prepends live rows with dedupe by id. |
| **shadcn/ui** | Components copied into the repo — no design-system version skew. |
| **pnpm workspaces** | One lockfile, fast installs, `pnpm -r` for scripts. |
| **Claude Haiku 4.5** | Fast and cheap enough for tool-use loops (chat + incidents). |

## Core component and testing

**Ping worker** (`apps/api/src/ping-worker.ts`) is the core component: payload generation, httpbin POST, timing, error classification, persistence, and Socket.IO broadcast. Factory pattern (`createPingWorker(deps)`) with injected deps; tested with `vi.fn()` only (no nock, no Docker). Comprehensive coverage in `ping-worker.test.ts` (10 tests): happy 200, 4xx, 5xx, timeout, network error, DB failure, broadcaster failure, payload uniqueness, response timing, and sequential runs.

Supporting tests cover dashboard stats, incident parsing, AI cache + limiter, API routes, scheduler resilience, and web flows (dashboard, responses/incidents tables, socket cache, API client). **48 API tests** and **34 web tests** (**82 total**).

**CI** (`.github/workflows/ci.yml`) on push/PR to `main`: ESLint + Prettier, `tsc --noEmit`, full test suite with Postgres, coverage artifact.

## AI features

![Chat — natural-language query with streamed answer](./docs/screenshots/chat.png)

- **Natural-language queries** — “Ask AI” accepts questions about monitoring data. The backend exposes read-only tool `query_responses` (enum-only params); the model must call it for real numbers, then answers in prose. Tokens stream over SSE via `fetch` (not `EventSource`, which cannot POST).
- **Incident reports** — Every 60s, responses in the last five minutes above **2×** the rolling one-hour average (success codes only) get a Claude report via forced `report_incident` tool-use. Results persist and broadcast `incident:new` for the Incidents tab.

![Incidents — LLM-generated reports with severity and expandable detail](./docs/screenshots/incidents.png)

- **Response analysis** — The chat tool returns aggregates and row lists (error rates, p95, slowest requests) the model summarizes in conversation.

### Cost optimization

- LRU cache (100 entries, 1h TTL) keyed by question + data fingerprint to avoid repeat charges.
- Sliding-window limiter: max **20 LLM calls/hour** per instance (chat + incidents).
- Pre-call token check via `messages.countTokens` against `AI_MAX_INPUT_TOKENS` (default 8000).
- Forced tool-use for incidents avoids parse-retry loops on markdown-wrapped JSON.
- Missing `ANTHROPIC_API_KEY` does not crash the app — chat returns “AI features not configured,” pings continue, incidents skip.

Usage footer: `AI usage: N/20 this hour · resets HH:MM:SS` via `GET /ai/usage`.

## Setup

**Prerequisites:** Node 20+ (CI uses 22), pnpm 9+, Docker Desktop, Anthropic API key (for AI features).

```bash
git clone <repo>
cd httpbin-monitor
pnpm install
cp .env.example .env                  # set ANTHROPIC_API_KEY, FRONTEND_ORIGIN
cp apps/web/.env.example apps/web/.env
docker compose up -d
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:dev --name init
pnpm dev
```

- **Web:** http://localhost:5173 (or **:5174** if 5173 is in use — match `FRONTEND_ORIGIN` in root `.env`)
- **API:** http://localhost:3001

For development, set `PING_INTERVAL_SECONDS=10` in `.env` so pings arrive every ten seconds. The default `300` matches the five-minute spec.

## Deployment (Railway)

Deploy Postgres + API + Web in one Railway project. Config: [`railway/api.toml`](./railway/api.toml), [`railway/web.toml`](./railway/web.toml). Step-by-step: [`docs/railway-deploy.md`](./docs/railway-deploy.md).

| Resource | Config | Role |
|----------|--------|------|
| PostgreSQL | (Railway plugin) | Database |
| `api` service | `railway/api.toml` | Express, Socket.IO, scheduler, AI |
| `web` service | `railway/web.toml` | Vite build + static serve |

Do **not** set a Root Directory on either service — builds run from the monorepo root so pnpm workspaces resolve.

**API variables:** `DATABASE_URL` (Postgres reference), `ANTHROPIC_API_KEY`, `FRONTEND_ORIGIN` (web URL), `PING_INTERVAL_SECONDS=300`, `NODE_ENV=production`

**Web variables** (set before build): `VITE_API_URL`, `VITE_WS_URL` (same as API URL), `VITE_PING_INTERVAL_SECONDS=300`

## Database schema

```prisma
model Response {
  id             String   @id @default(cuid())
  timestamp      DateTime @default(now())
  statusCode     Int
  responseTimeMs Int
  requestPayload Json
  responseBody   Json
  errorMessage   String?

  @@index([timestamp])
  @@index([statusCode, timestamp])
}

model Incident {
  id          String   @id @default(cuid())
  responseId  String
  severity    String
  summary     String
  rootCauses  Json     // { rootCauses: string[], recommendations: string[] }
  createdAt   DateTime @default(now())

  @@index([createdAt])
}
```

## Testing

```bash
pnpm test                   # 82 tests (api + web)
pnpm test:coverage          # coverage/ under apps/api and apps/web
pnpm --filter api test
pnpm --filter web test
pnpm lint
pnpm format:check
```

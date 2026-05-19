# httpbin Monitor

A full-stack monitoring app that POSTs randomized JSON payloads to [httpbin.org/anything](https://httpbin.org/anything) on a schedule, persists every result to PostgreSQL, streams new rows to a live dashboard over Socket.IO, and uses Claude (Anthropic tool-use API) to answer natural-language questions about the data and auto-generate incident reports when latency spikes. Built as a take-home submission. Implements all core requirements plus **AI Enhancement Option B** (LLM-powered insights).

![Dashboard — live table, stats, and API health](./docs/screenshots/dashboard.png)

## Live demo

- **Web:** TODO (Vercel)
- **API:** TODO (Railway)

## Architecture

The repo is a pnpm workspace with a thin shared types package and two applications. The API owns scheduling, persistence, REST, WebSockets, and the AI module. The web app is a read-mostly client that hydrates from REST and stays current via Socket.IO.

```
apps/
  api/    Node + Express + Socket.IO + Prisma + Anthropic SDK
  web/    React + Vite + Tailwind + shadcn/ui + TanStack Query
packages/
  shared/  TS types and event-name constants (PING_NEW, INCIDENT_NEW)
```

On each tick, the scheduler invokes the ping worker. The worker generates a faker payload, POSTs to httpbin with a 10s timeout, measures round-trip time, and classifies the outcome (2xx, HTTP error, timeout, or network failure). It persists a row via Prisma and broadcasts `ping:new` with the saved record. These paths are independent: a DB failure is logged without killing the timer; a broadcast failure does not roll back the write.

The web client loads history with `GET /responses` (TanStack Query infinite scroll, cursor pagination) and prepends live rows when `ping:new` arrives. The AI layer adds `POST /ai/chat` (SSE streaming, tool-assisted queries) and a 60-second incident monitor that calls Claude with forced tool-use (`report_incident`) so structured output is guaranteed before it hits Postgres.

## Tech choices and reasoning

**TypeScript (strict) everywhere.** Shared wire types live in `packages/shared`, so the API, the client, and the Socket.IO events agree on shape without codegen drift. The trade-off is a bit more ceremony than plain JS; for a multi-package repo the payoff is immediate.

**Express.** Nest or Fastify would add structure we do not need at this scope. Express is the smallest server that still gives us middleware, routing, and a well-understood deployment story. We give up built-in validation and DI frameworks and keep handlers explicit.

**PostgreSQL with JSONB.** Timestamp, status code, and response time are real columns with indexes because the dashboard and the `query_responses` tool filter on them constantly. Request and response bodies stay JSONB because httpbin echoes arbitrary payloads. SQLite would be simpler locally but awkward on Railway; Mongo would push aggregations into application code.

**Prisma.** Migrations, type-safe queries, and Prisma Studio for demo debugging. Raw SQL would be faster to tune but slower to ship; Drizzle is comparable — Prisma was already in the scaffold and fit the take-home timeline.

**Socket.IO.** Reconnection with backoff and long-polling fallback come for free. Native WebSockets are lighter per frame; at our volume the difference is noise and we would own reconnection logic ourselves.

**node-cron plus setInterval.** Intervals under 60 seconds use `setInterval` because node-cron is unreliable at sub-minute granularity. At 60 seconds and above we use cron expressions derived from `PING_INTERVAL_SECONDS`. A dedicated queue (BullMQ) would be the production upgrade.

**TanStack Query infinite query plus `setQueryData`.** Initial load and “load more” go through the query cache; live rows prepend into `pages[0].items` with dedupe by id. Hand-rolling cache invalidation for this shape is error-prone — this is the pattern React Query documents for a reason.

**shadcn/ui.** Components are copied into the repo, so there is no version skew with a heavyweight design system. We trade a larger `components/ui` folder for full control over styling.

**pnpm workspaces.** One lockfile, fast installs, `pnpm -r` for scripts. npm workspaces would work; pnpm is what the scaffold specified.

**Claude Haiku 4.5.** Fast and cheap enough for tool-use loops (chat may call `query_responses` up to three times per question). Sonnet would read better in edge cases but costs roughly five times more for marginal gain when the tool returns numbers. Pricing constants in `apps/api/src/ai/services.ts` reflect Haiku list rates as of build date — update the comment there if Anthropic changes pricing.

**Forced tool-use for incidents.** `tool_choice: { type: 'tool', name: 'report_incident' }` means the model must return a valid tool input or the API rejects the response. We no longer parse JSON from prose or fight markdown fences. The trade-off is less flexibility in wording; for incident cards that is what we want.

**LRU cache plus sliding-window limiter.** Chat responses cache for one hour (100 entries max), keyed by `sha256(normalized_question + data_fingerprint)`. The fingerprint is the count of responses in the last hour rounded to the nearest five, so “any errors recently?” refreshes as data changes without invalidating on every single ping. A **shared** sliding-window limiter caps **all** LLM calls (chat and incident generation) at 20/hour per instance. Before each call, `messages.countTokens` checks input size against `AI_MAX_INPUT_TOKENS` (default 8000). Both cache and limiter are in-memory — correct for a take-home, not for multi-instance production without Redis.

## Core component and testing strategy

The take-home asks you to identify core parts, write **comprehensive tests for one** of them, and cover the rest with supporting tests across unit, integration, and basic user-flow categories. This repo maps to that structure as follows.

### Core component (comprehensive)

**Ping worker** (`apps/api/src/ping-worker.ts`) — **10 tests** in `ping-worker.test.ts`.

It owns payload generation, the httpbin POST, timing, error classification, persistence, and Socket.IO broadcast. Everything downstream (dashboard table, `GET /stats`, AI `query_responses`, incident monitor) assumes these rows are correct.

The worker is a factory (`createPingWorker(deps)`). Dependencies are injected; tests use `vi.fn()` only (no nock, no Docker). Coverage includes: happy 200, 4xx, 5xx, timeout (`ECONNABORTED`), network error, DB failure (null, no broadcast), broadcaster failure (row still returned), one payload per run, `responseTimeMs` from `now()`, and two sequential runs with distinct payloads.

The **never throws** rule is intentional: failures become persisted rows with `statusCode: 0` so the scheduler keeps running.

### Supporting tests (by PDF category)

| Category | What we test | Location |
|----------|----------------|----------|
| **Unit — business logic** | Dashboard stat aggregation; incident detail parsing; AI cache fingerprint; limiter window; LLM acquire; tool enum guard | `dashboard-stats.test.ts`, `incidents.test.ts`, `ai/*.test.ts` |
| **Integration — API** | `GET /health`, `GET /stats`, `GET /responses` (+ cursor), `GET /responses/:id`, `GET /incidents`, `GET /ai/usage`, chat validation; HTTP errors via `errorHandler` | `routes.test.ts`, `health.test.ts`, `error-handler.test.ts` |
| **Unit — scheduler** | Timer survives worker rejection | `scheduler.test.ts` |
| **Basic user flows (web)** | Dashboard stat cards + health; responses table columns, badges, payload sheet, incident cross-link; incidents table + fetched response; live socket cache + stats invalidation; API client | `Dashboard.test.tsx`, `ResponsesTable.test.tsx`, `IncidentsTable.test.tsx`, `useSocket.test.tsx`, `api.test.ts`, `App.test.tsx` |

**Totals:** **48 API tests** and **34 web tests** (**82 total**). Run `pnpm test` locally; `pnpm test:coverage` writes reports under `apps/api/coverage` and `apps/web/coverage`.

### CI pipeline

GitHub Actions (`.github/workflows/ci.yml`) on every push/PR to `main`:

1. **Lint** — ESLint (`pnpm lint`) and Prettier (`pnpm format:check`)
2. **Typecheck** — `tsc --noEmit` for API and web
3. **Test + coverage** — full suite with Postgres service for Prisma; coverage uploaded as a workflow artifact

## AI enhancement — Option B

![Chat — natural-language query with streamed answer](./docs/screenshots/chat.png)

![Incidents — LLM-generated reports with severity and expandable detail](./docs/screenshots/incidents.png)

**Natural-language query interface.** The “Ask AI” panel accepts questions like “what’s the average response time in the last hour?” or “show me the 5 slowest responses.” The backend exposes a single read-only tool, `query_responses`, with enum-only parameters (metric, window, status filter, limit). The model must call the tool to get real numbers, then answer in prose. Tokens stream over SSE; the client uses `fetch` and a manual `ReadableStream` parser because `EventSource` cannot POST. Payloads are JSON-encoded in SSE `data:` lines so newlines and spaces survive transit.

**Auto-generated incident reports.** Every 60 seconds the monitor compares recent responses to a rolling one-hour average (success codes only). Anything in the last five minutes above **2×** that average and not already linked to an incident gets a Claude report via forced `report_incident` tool-use. Results land in Postgres and broadcast `incident:new` for the Incidents tab.

**Smart response analysis.** The chat tool returns aggregates and row lists the model can summarize — error rates, p95 latency, slowest requests. Prompts steer the model toward `responseBody.json` (parsed echo) rather than `responseBody.data` (escaped string) to save tokens.

![Payload sheet — request and response JSON](./docs/screenshots/payload.png)

### Cost optimization

Usage comes from Anthropic’s `usage` field on each completion. The chat footer shows `AI usage: N/20 this hour · est. $0.0XXX · resets HH:MM:SS`, backed by `GET /ai/usage`.

The LRU cache (100 entries, 1h TTL) avoids repeat charges for identical questions on stable data. The data fingerprint in the cache key prevents stale answers when the underlying row count shifts.

`acquireLlmCall` runs Anthropic `count_tokens` before each completion, then checks the shared hourly limiter (chat + incidents). Over-budget or over-quota requests fail gracefully with a clear message; incidents fall back to rule-based text without calling the API.

The sliding-window limiter caps spend at 20 LLM calls per hour per process (all features combined), with a human-readable reset time when exhausted.

Forced tool-use for incidents removes parse-retry loops that burned tokens when Haiku wrapped JSON in markdown fences.

Haiku 4.5 keeps per-question cost low; the tool-use API does the structured work.

Missing `ANTHROPIC_API_KEY` does not crash the app — chat returns “AI features not configured,” pings continue, and incidents simply do not generate.

### Cost ballpark

A typical chat turn is roughly 500–1500 input tokens (system prompt, tool schema, often one tool round-trip) and 100–400 output tokens. At Haiku 4.5 list pricing, that is about **$0.001–0.003 per question**. Twenty questions per hour is on the order of **$0.06/hour** (~$1.44/day) before cache hits. Incident generation runs only when latency anomalies exist — a few structured calls per hour in the worst case, roughly **$0.10/day** on top. Real usage during development was well under a dollar.

## Setup

**Prerequisites:** Node 20+, pnpm 9+, Docker Desktop, Anthropic API key (for AI features).

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

If Vite binds to 5174, set `FRONTEND_ORIGIN=http://localhost:5174`. CORS applies to Socket.IO upgrades as well as REST.

## Deployment (Railway only)

Deploy **Postgres + API + Web** in one Railway project. Config lives in [`railway/api.toml`](./railway/api.toml) and [`railway/web.toml`](./railway/web.toml). Step-by-step guide: [`docs/railway-deploy.md`](./docs/railway-deploy.md).

**Summary**

| Resource | Config file | Role |
|----------|-------------|------|
| PostgreSQL | (Railway plugin) | Database |
| `api` service | `/railway/api.toml` | Express, Socket.IO, scheduler, AI |
| `web` service | `/railway/web.toml` | Vite build + static `serve` |

Do **not** set a Root Directory on either service — builds run from the monorepo root so `pnpm` workspaces resolve.

**API variables**

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | From Railway Postgres reference |
| `ANTHROPIC_API_KEY` | your key |
| `FRONTEND_ORIGIN` | `https://web-xxxx.up.railway.app` |
| `PING_INTERVAL_SECONDS` | `300` |
| `NODE_ENV` | `production` |

**Web variables** (set before build — Vite embeds them)

| Variable | Value |
|----------|--------|
| `VITE_API_URL` | API public URL |
| `VITE_WS_URL` | Same as API URL |
| `VITE_PING_INTERVAL_SECONDS` | `300` |

After deploy, update the live-demo links at the top of this README.

### GitHub

```bash
git init
git add .
git commit -m "httpbin monitor take-home submission"
git remote add origin git@github.com:YOU/httpbin-monitor.git
git push -u origin main
```

Ensure the repo is **public** or invite reviewers listed in the assignment.

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

`@@index([timestamp])` supports the dashboard sort. `@@index([statusCode, timestamp])` supports error-rate and status-filtered tool queries. `@@index([createdAt])` supports the incidents list.

## Testing

```bash
pnpm test                   # 82 tests (api + web)
pnpm test:coverage          # coverage/ under apps/api and apps/web
pnpm --filter api test
pnpm --filter web test
pnpm lint
pnpm format:check
```

See [Core component and testing strategy](#core-component-and-testing-strategy) for how tests map to the take-home requirements.

## Assumptions

- **Single API instance.** The scheduler and incident monitor run in-process. Horizontal scale would duplicate pings unless the scheduler moves to a dedicated worker or acquires a distributed lock.
- **In-memory cache and rate limiter.** Fine for one container; multiple instances would need Redis (or similar) for shared state.
- **httpbin.org is available.** Outages produce failure rows (`statusCode: 0`); the system stays up and observable.
- **Five-minute ping interval in production.** `PING_INTERVAL_SECONDS` is the escape hatch for local dev without code changes.
- **No auth.** The take-home scope is monitoring, not multi-tenant security.

## Future improvements

- Persist rate-limit and cache keys in Redis so restarts and second instances behave consistently.
- Extract scheduler + incident monitor into a worker service so API replicas stay stateless.
- Add rolling time-series endpoints for anomaly charts (Option A territory).
- Propagate a trace id from worker → DB → WebSocket → UI so an incident card deep-links to the exact row.
- Optional pgvector on `responseBody.json` for semantic “find similar requests” (Option C territory).

## Acknowledgments

Built with Cursor and Claude, per the spec’s encouragement to use AI tooling. Architectural decisions and iteration history are in the commit log.

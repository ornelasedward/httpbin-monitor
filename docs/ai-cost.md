# AI cost analysis (Option B)

This document explains how httpbin-monitor controls Anthropic API spend for the take-home **Option B: LLM-Powered Insights** enhancement.

## Model and pricing assumptions

| Setting            | Value                                            |
| ------------------ | ------------------------------------------------ |
| Default model      | `claude-haiku-4-5-20251001` (`ANTHROPIC_MODEL`)  |
| Input rate (list)  | **$1.00 / 1M tokens** (`HAIKU_INPUT_USD_PER_M`)  |
| Output rate (list) | **$5.00 / 1M tokens** (`HAIKU_OUTPUT_USD_PER_M`) |

Rates are defined in `apps/api/src/ai/services.ts` and surfaced on `GET /ai/usage` via `pricingNote`. Update constants if Anthropic changes Haiku pricing.

## What consumes LLM calls

Both features share one **in-memory sliding-window limiter** (`AI_RATE_LIMIT_PER_HOUR`, default **20**):

| Feature                    | Trigger                            | Typical calls                                           |
| -------------------------- | ---------------------------------- | ------------------------------------------------------- |
| **Chat** (`POST /ai/chat`) | User sends a question              | 1–4 per question (tool loop, max 3 tool rounds)         |
| **Incident monitor**       | Every 60s; slow rows in last 5 min | 0–5 per tick (one per qualifying response, capped at 5) |

Each **acquired** call runs `messages.countTokens` first, then streams or completes. Cache hits and quota blocks do **not** increment the limiter.

## Token budgets (per call)

| Guard                 | Default | Behavior                                                       |
| --------------------- | ------- | -------------------------------------------------------------- |
| `AI_MAX_INPUT_TOKENS` | 8000    | Pre-call `countTokens`; reject if over budget (`token_budget`) |
| Chat `maxTokens`      | 1024    | Cap on assistant reply per stream iteration                    |
| Incident `maxTokens`  | 512     | Forced `report_incident` tool completion                       |

Incident prompts include the full response record JSON (payload + httpbin echo), so token use scales with stored JSON size.

## Caching

- **LRU cache**: 100 entries, TTL `AI_CACHE_TTL_SECONDS` (default 3600).
- **Key**: `hash(question + "|" + dataFingerprint)`.
- **Fingerprint**: `count|max(timestamp)` over all `Response` rows — invalidates when new pings land, so stale answers are not served after fresh data arrives.
- **Effect**: Repeated identical questions with unchanged data cost **$0** (SSE `cached` event, 0 tokens reported).

## Rate limiting and fallbacks

When the hourly cap is hit:

- **Chat**: SSE `error` with reset time; no API call.
- **Incidents**: Row still saved; LLM skipped; fallback summary/root causes if the model was never called or output was unparseable.

When `ANTHROPIC_API_KEY` is missing:

- Pings and dashboard work; chat returns HTTP 503; incident monitor skips LLM.

## Cost estimates (scenarios)

Assumptions for planning (actual tokens vary with question length and tool results):

| Scenario                    | Calls/hr | Est. input tokens   | Est. output tokens | Est. cost/hr     |
| --------------------------- | -------- | ------------------- | ------------------ | ---------------- |
| Light chat only             | 5        | 5 × 800 = 4,000     | 5 × 400 = 2,000    | ~$0.006          |
| Heavy chat (at cap)         | 20       | 20 × 1,200 = 24,000 | 20 × 600 = 12,000  | ~$0.084          |
| Incidents only (worst tick) | 5        | 5 × 2,000 = 10,000  | 5 × 400 = 2,000    | ~$0.012 per tick |
| Mixed at cap (20 calls)     | 20       | 20 × 1,000 = 20,000 | 20 × 500 = 10,000  | ~$0.070          |

Formula: `cost = (input/1e6)*1 + (output/1e6)*5`.

### Dashboard display

`GET /ai/usage` returns `used`, `max`, `resetAt`, and `estimatedCostUsd`. The UI shows **AI N/20 · est. $X.XXXX**.

The estimate uses a **heuristic** for the header (not per-call metering):

```text
estimatedCostUsd = estimateCostUsd(used * 500, used * 300)
```

So it approximates **500 input + 300 output tokens per acquired call**. Real chat sessions with large tool results can cost more; cache hits cost less. Treat the footer as a **directional** budget indicator, not an invoice.

## Design trade-offs

| Choice                         | Rationale                                                                |
| ------------------------------ | ------------------------------------------------------------------------ |
| Haiku                          | Fast tool-use loops; low $/token for a monitoring demo                   |
| Forced tool for incidents      | Avoids markdown JSON parse retries (saves tokens + latency)              |
| Enum-only `query_responses`    | Prevents arbitrary SQL; smaller tool schemas                             |
| Per-instance limiter           | Simple for take-home; Redis would be needed for multi-replica production |
| Fingerprint cache invalidation | Cheap correctness vs. TTL-only cache                                     |

## Monthly rough bound (single instance, always at cap)

`20 calls/hour × 24 × 30 ≈ 14,400 calls/month`  
At heuristic 500/300 tokens: ~$0.05/hour × 720 hours ≈ **$36/month** upper bound if the limiter were saturated continuously (unlikely in normal demo usage).

Typical demo usage (a few chats + occasional incidents) is usually **well under $1/day**.

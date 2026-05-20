# Submission email (template)

Copy, fill in Railway URLs after deploy, and send to the BizScout reviewers.

---

**Subject:** Full Stack Take-Home — httpbin-monitor (Option B)

Hi BizScout Engineering Team,

Please find my take-home submission:

**Repository (public):** https://github.com/ornelasedward/httpbin-monitor

**Live demo**

- Web: https://web-production-9ea3e.up.railway.app/
- API health: https://httpbin-monitor-cwws0q-production.up.railway.app/health

**Enhancement:** Option B — LLM-Powered Insights (natural-language chat, automatic incident reports, cost controls). Details in the README and [`docs/ai-cost.md`](./ai-cost.md).

**Quick demo**

1. Open the web URL — the dashboard table fills as pings run (production interval: 5 minutes; see README to use `PING_INTERVAL_SECONDS=10` on Railway for a faster demo).
2. Confirm live updates without refresh (Socket.IO).
3. Click **Ask AI** and try: _"What's the average response time in the last hour?"_ or _"Summarize payload patterns in the last 24 hours"_.
4. Open **Incidents** — reports appear when a success response exceeds **2×** the rolling 1-hour average (may need some history + a slow response).
5. Header shows **AI usage N/20** and estimated cost.

**AI setup:** Set `ANTHROPIC_API_KEY` on the API service (Railway). Pings and the dashboard work without it; chat and LLM incident text are disabled without the key.

**Local setup:** See README — `docker compose up -d`, `pnpm install`, migrate, `pnpm dev`.

**Tests / CI:** `pnpm test` (87 tests); GitHub Actions runs lint, Prettier, typecheck, and coverage on push/PR to `main`.

Happy to walk through architecture or trade-offs on a call.

Best,  
[Your name]

---

**Reviewers** (repo is public; no invite required):

- Asif Bin Hossain
- Md Mizanur Rahman
- Zahidul Hossain Choyan

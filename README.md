# AI CFO Agent

> **The AI CFO that 99% of startups can't afford — now open source.**

Drop a CSV of weekly transactions. Get board-ready financial intelligence in 30 seconds — Monte Carlo survival analysis, VC investment memos, pre-mortem scenarios, cap table dilution, industry benchmarking, and more. Powered by Claude Haiku at **~$0.003 per run**.

---

## 22 Features

| Category | Feature |
|---|---|
| **KPI Engine** | 7 KPI cards (MRR, ARR, Burn, Gross Margin, Churn, CAC, LTV) + click-to-expand deep-dive charts |
| **Survival** | Monte Carlo (10K simulations) → ruin probability at 90d / 180d / 365d |
| **Runway** | Interactive arc gauge + cut-burn / grow-MRR sliders with per-lever impact chips |
| **Morning Briefing** | 7 AM proactive text: runway, urgent alerts, good news, 3 AI action items |
| **Scenarios** | Bear / Base / Bull stress test with Series A readiness verdict |
| **AI Reports** | Board Q&A (8 adversarial VC questions), CFO Report, VC Verdict, Investor Update |
| **CFO Chat** | Multi-turn board prep chat grounded in your live KPI data |
| **Pre-mortem** | 3 failure scenarios (financial / market / operational) with prevention actions |
| **Fundraising** | 5-dimension readiness score: MRR growth, GM, LTV:CAC, runway, churn |
| **Cap Table** | Dilution simulator: pre-money → post-money, share price, founder % |
| **Compliance** | Autopilot: ASC 606, 1099 risk, round-number transactions, data gaps |
| **Benchmarker** | Anonymous industry percentile comparison (SaaStr / OpenView / a16z data) |
| **Fraud Detection** | ML pattern detection: velocity spikes, round numbers, contractor ratio |
| **Anomaly Detection** | IsolationForest + rules-based, deduplicated & severity-ranked |
| **Customer Matrix** | Scatter segmentation: Stars / At Risk / Growing / Watch quadrants |
| **Competitor Intel** | Threat radar + hiring signals + pricing scraping (DuckDuckGo, free) |
| **Cash Flow Forecast** | 13-week P10/P50/P90 probabilistic forecast |
| **Deferred Revenue** | GAAP ASC 606 recognition schedule for annual contracts |
| **Board Deck** | 10-slide PowerPoint generation |
| **Integrations** | Stripe sync + QuickBooks OAuth |
| **Multi-file Upload** | Merge multiple CSVs in one analysis run |
| **Alembic Migrations** | Schema migrations for safe production deployments |

---

## Quickstart

```bash
# 1. Clone
git clone https://github.com/your-org/ai-cfo-agent.git
cd ai-cfo-agent

# 2. Install backend dependencies
pip install -e ".[ml]"          # ml group = scikit-learn, chronos (optional)

# 3. Configure — only ANTHROPIC_API_KEY is required
cp .env.example .env

# 4. Start backend
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

# 5. Start frontend (new terminal)
cd frontend && npm install && npm run dev
```

Open **http://localhost:3000** and click **Run Demo** — no file upload needed.

---

## API Keys

| Key | Required | Purpose | Cost |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Claude Haiku for all AI reports | ~$0.001–0.008/run |
| `TAVILY_API_KEY` | No | Competitor news (DuckDuckGo fallback) | Free tier |
| `DATABASE_URL` | No | PostgreSQL (SQLite default) | Free |
| `REDIS_URL` | No | Background tasks | Free |
| Stripe / QuickBooks | No | Live transaction sync | Free OAuth |

---

## CSV Format

```csv
date,category,amount,customer_id
2024-01-07,subscription_revenue,12500.00,acme_corp
2024-01-07,salary_expense,-18000.00,
2024-01-07,marketing_expense,-4500.00,
2024-01-07,cogs,-3200.00,
```

**Valid categories**: `subscription_revenue` · `churn_refund` · `salary_expense` · `marketing_expense` · `cogs` · `software_expense` · `office_rent` · `travel_expense` · `contractor_expense` · `tax_payment` · `professional_services`

Download a blank template from the upload page or `GET /analyze/template`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Next.js 15 App Router (port 3000)                       │
│  ├── / (upload + pipeline animation)                     │
│  ├── /run/[runId] (full dashboard — 14 sections)         │
│  └── /integrations/stripe · /integrations/quickbooks    │
└──────────────────────┬──────────────────────────────────┘
                       │  REST  (NEXT_PUBLIC_API_URL)
┌──────────────────────▼──────────────────────────────────┐
│  FastAPI (port 8000) + LangGraph pipeline                │
│                                                          │
│  POST /demo           → sample data, full pipeline       │
│  POST /analyze        → upload CSV, full pipeline        │
│  POST /report         → CFO briefing (Claude Haiku)      │
│  POST /board-prep     → adversarial Q&A (Claude Haiku)   │
│  POST /vc-memo        → VC investment memo               │
│  POST /investor-update→ monthly LP update email          │
│  POST /pre-mortem     → 3 failure scenarios              │
│  POST /board-prep/chat→ multi-turn CFO chat              │
│  POST /briefing/preview→ morning CFO briefing preview    │
│  GET  /benchmarks     → industry percentile comparison   │
│  GET  /runs/{id}/...  → KPIs · anomalies · signals       │
│                                                          │
│  agents/analysis.py      KPI, IsolationForest, Monte Carlo│
│  agents/insight_writer   Claude Haiku AI reports         │
│  agents/market_agent     Competitor intel (free APIs)    │
│  agents/ingestion.py     CSV / PDF parsing               │
│  agents/morning_briefing Proactive daily CFO briefing    │
│  agents/stripe_sync      Stripe subscription data        │
│  agents/quickbooks_sync  QuickBooks P&L data             │
│                                                          │
│  SQLite (dev) / PostgreSQL (prod) via Alembic migrations │
└─────────────────────────────────────────────────────────┘
```

---

## Demo Data

78-week synthetic B2B SaaS dataset with a realistic crisis/recovery arc:

| Act | Weeks | Story |
|---|---|---|
| 1 | 1–12 | Healthy growth, <0.5% weekly churn |
| 2 | 13–26 | Crisis: 3 enterprise churns, marketing panic, burn spikes to $45K/wk |
| 3 | 27–38 | Near-death: new mid-market wins, team right-sizing |
| 4 | 39–55 | Recovery: 2 enterprise re-signs, MRR climbs back |
| 5 | 56–78 | Hypergrowth: 3 more enterprise wins, MRR hits $42K/wk |

Regenerate: `python3 data/gen_drama.py`

---

## Cost Breakdown

| Component | Cost |
|---|---|
| Claude Haiku (all AI reports per run) | ~$0.003–0.025 |
| Morning briefing (Claude Haiku) | ~$0.003/day per user |
| SMS delivery (Twilio) | ~$0.01/message |
| Email delivery (SendGrid) | $0 (free tier) |
| Competitor news (DuckDuckGo) | $0 |
| Hiring signals (DuckDuckGo) | $0 |
| Pricing scrape (httpx + BeautifulSoup) | $0 |
| Anomaly detection (IsolationForest) | $0 |
| Monte Carlo survival (NumPy) | $0 |
| **Total per run** | **~$0.003–0.025** |
| **Daily briefing** | **~$0.013–0.033/user/day** |

---

## Production Deployment

```bash
# Run database migrations
alembic upgrade head

# Set environment variables
export DATABASE_URL=postgresql+asyncpg://user:pass@host/ai_cfo
export ANTHROPIC_API_KEY=sk-ant-...

# Start API (2 workers)
gunicorn api.main:app -k uvicorn.workers.UvicornWorker -w 2 --bind 0.0.0.0:8000

# Build frontend
cd frontend && npm run build && npm start
```

---

## Project Layout

```
agents/          KPI engine, insight writer, market agent, ingestion
api/             FastAPI app, models, schemas, DB manager
graph/           LangGraph orchestration
frontend/        Next.js 15 App Router dashboard
data/            Demo CSV + competitor profiles + industry benchmarks
alembic/         Database migration scripts
scripts/         Playwright visual check, morning briefing cron script
```

---

## License

MIT — fork it, deploy it, build products on top of it. Star the repo if it saves you time. ⭐

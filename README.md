# AI CFO Agent

**The AI CFO that 99% of startups can't afford — now open source.**

A real CFO costs $250,000+/year. Most startups fly blind on their own finances until it's too late. This project changes that: a production-grade, multi-agent financial analyst that runs for **less than $0.05/week**, delivers board-quality intelligence, and ships with three capabilities that exist nowhere else in open source.

---

## What makes this different

### ◆ Survival Score — Monte Carlo runway probability

Instead of a single burn rate number that hides all variance, this agent runs **1,000 Monte Carlo simulations** to produce a probability distribution of when your company hits zero cash.

```
SURVIVAL SCORE: 67 / 100  ·  MODERATE RISK

  Probability of zero runway:
    90 days  →  4%
   180 days  →  14%
   365 days  →  33%

  Expected zero cash: day 241
  ⚡ Start fundraising by: 2026-08-12
```

No guesswork. No spreadsheets. A single number tells you exactly where you stand.

### ◆ Board Interrogation Mode — adversarial Q&A prep

Before every board meeting, the agent plays the role of a skeptical Sequoia partner and generates **the 8 hardest questions they would ask** — with pre-drafted CFO answers grounded in your actual data.

```json
{
  "question": "Your CAC increased 34% MoM while LTV dropped 12%. Explain the unit economics trajectory.",
  "danger": "RED",
  "answer": "Marketing spend spiked $8,200 in March due to a channel test that did not convert...",
  "follow_up": "What is your target CAC payback period and when exactly do you hit it?"
}
```

Founders currently pay $50K+/year in advisory fees for this. Now it's one API call.

### ◆ Scenario Stress Test — Bear / Base / Bull in milliseconds

Three financial scenarios computed instantly from your KPI data. Zero API calls. Pure arithmetic.

```
BEAR   →  91 days runway   ○ NOT_READY    (top customer churns + costs up 15%)
BASE   → 241 days runway   ◐ 6 MONTHS    (current trajectory continues)
BULL   → 480 days runway   ● READY        (2.5x growth rate, costs down 15%)
```

---

## Architecture

```mermaid
flowchart TD
    A[CSV / PDF / Auto-ingestion] --> B[POST /analyze or POST /demo]
    B --> C[LangGraph Router]
    C --> D[IngestionAgent\nPolars · pdfplumber · Pydantic v2]
    D --> E{Validation OK?}
    E -- No --> F[Self-Correction Node\nClaude Haiku 3.5]
    F --> D
    E -- Yes --> G[(raw_financials)]
    G --> H[AnalysisAgent\nKPI Engine · IsolationForest · Chronos-t5-tiny]
    H --> I[Monte Carlo Survival Score]
    I --> J[Scenario Stress Test Bear/Base/Bull]
    J --> K[(kpi_snapshots · anomalies)]

    L[POST /report] --> C
    C --> M[MarketAgent\nTavily · DuckDuckGo · httpx+BS4]
    M --> N[(market_signals)]
    N --> O[InsightWriterAgent\nClaude 3.5 Sonnet]
    O --> P[(reports)]

    Q[POST /board-prep] --> C
    C --> R[Board Interrogation\nClaude 3.5 Sonnet · 8 adversarial Q&A]

    P --> S[Slack + Email via n8n]
    K --> T[Live Dashboard\nStreamlit · Plotly · 30s auto-refresh]
```

---

## Cost breakdown

| Component | Before | After | Savings |
|---|---|---|---|
| Proxycurl (LinkedIn jobs) | $0.30–$1.00/run | $0 — DuckDuckGo | 100% |
| Zyte (pricing scraping) | $0.03–$0.10/run | $0 — httpx + BS4 | 100% |
| GPT-4o-mini normalization | $0.008/run | $0 — Pydantic handles it | 100% |
| Signal classification (×45 LLM calls) | $0.20–$0.80/run | $0 — rules engine | 100% |
| Chronos-2-base RAM | 1.3 GB | 120 MB (t5-tiny) | 91% |
| Docker layer (torch CUDA) | 2.5 GB | 200 MB (CPU-only) | 92% |
| **Total estimated monthly (4 runs/week)** | **~$50–200** | **~$2–8** | **~95%** |

The only recurring cost is the Claude 3.5 Sonnet call for executive briefings and board prep (~$0.05 per analysis run).

---

## Quick start

```bash
# 1. Install
git clone https://github.com/daniel-st3/ai-cfo-agent
cd ai-cfo-agent
poetry install

# 2. Configure
cp .env.example .env
# Only ANTHROPIC_API_KEY and DATABASE_URL are required to start

# 3. Start the API
poetry run uvicorn api.main:app --reload

# 4. Run the demo — no file upload, no Stripe account needed
curl -X POST http://localhost:8000/demo | python -m json.tool

# 5. Get board interrogation Q&A (use run_id from step 4)
curl -X POST http://localhost:8000/board-prep \
  -H "Content-Type: application/json" \
  -d '{"run_id": "<run_id_from_demo>"}'

# 6. Open the live dashboard
poetry run streamlit run dashboard/streamlit_app.py
```

---

## API endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/demo` | Full pipeline on sample data — no upload needed |
| `POST` | `/analyze` | Upload CSV or PDF + run full analysis |
| `POST` | `/report` | Generate board-ready CFO briefing |
| `POST` | `/board-prep` | Generate adversarial board Q&A deck |
| `GET` | `/health` | Service + DB health check |

### `/demo` response shape

```json
{
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "kpis": { "mrr": 18450.0, "arr": 221400.0, "burn_rate": 6200.0, ... },
  "anomalies": [
    { "metric": "burn_rate", "severity": "HIGH", "source": "isolation_forest", ... }
  ],
  "survival_analysis": {
    "score": 67,
    "label": "MODERATE_RISK",
    "probability_ruin_90d": 0.04,
    "probability_ruin_180d": 0.14,
    "probability_ruin_365d": 0.33,
    "expected_zero_cash_day": 241,
    "fundraising_deadline": "2026-08-12"
  },
  "scenario_analysis": [
    { "scenario": "bear", "months_runway": 5.6, "series_a_readiness": "NOT_READY", ... },
    { "scenario": "base", "months_runway": 13.2, "series_a_readiness": "6_MONTHS", ... },
    { "scenario": "bull", "months_runway": 31.8, "series_a_readiness": "READY", ... }
  ],
  "status": "complete"
}
```

---

## Core stack

| Layer | Technology |
|---|---|
| **Orchestration** | LangGraph · MessagesState · BoundedMemorySaver |
| **LLM routing** | LiteLLM → Claude 3.5 Sonnet (briefings) · Claude Haiku 3.5 (corrections) |
| **Data processing** | Polars lazy evaluation · pdfplumber · pypdf |
| **Anomaly detection** | scikit-learn IsolationForest · Amazon Chronos-t5-tiny (40MB) |
| **Survival analysis** | NumPy Monte Carlo (1,000 simulations, no external API) |
| **Market intelligence** | Tavily API · DuckDuckGo (free fallback) · httpx + BeautifulSoup |
| **Storage** | PostgreSQL · SQLAlchemy 2.0 async · asyncpg |
| **API** | FastAPI async · multipart file upload · lifespan pool management |
| **Background tasks** | Celery + Redis |
| **Dashboard** | Streamlit · Plotly · 30s auto-refresh |
| **Deploy** | Render.com (CPU-only torch → 2.3GB lighter build) |

---

## Database schema

Six PostgreSQL tables: `raw_financials`, `kpi_snapshots`, `anomalies`, `market_signals`, `reports`, `metrics_log`.

Connect Looker Studio directly to these tables for live board-level dashboards. See `dashboard/looker_config.md` for setup instructions.

---

## LangGraph workflow paths

```
Analyze:    router → ingestion → (correction ×2)? → persist_raw → analysis → END
Report:     router → market → insight → END
Board Prep: router → board_prep → END
```

The correction loop triggers only when Pydantic validation fails on ingested data — the LLM rewrites the malformed rows and retries (max 2 attempts before failing gracefully).

---

## Deployment on Render

`render.yaml` provisions three services:

1. **ai-cfo-agent-api** — FastAPI web service
2. **ai-cfo-agent-worker** — Celery background worker
3. **ai-cfo-dashboard** — Streamlit live dashboard

The build command installs CPU-only PyTorch first (`--index-url https://download.pytorch.org/whl/cpu`), reducing the Docker layer by **2.3 GB** compared to the default CUDA wheel.

Required environment variables: `DATABASE_URL`, `ANTHROPIC_API_KEY`.
Optional: `TAVILY_API_KEY` (falls back to DuckDuckGo automatically), `REDIS_URL`, `N8N_WEBHOOK_BASE_URL`.

---

## Configuration

```bash
# Required
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/ai_cfo
ANTHROPIC_API_KEY=sk-ant-...

# Optional — system works without these (free fallbacks activate automatically)
TAVILY_API_KEY=tvly-...           # DuckDuckGo used if not set
REDIS_URL=redis://localhost:6379  # For Celery background tasks
LOOKER_STUDIO_URL=https://...
N8N_WEBHOOK_BASE_URL=https://...

# Feature flags
DISABLE_CHRONOS=1   # Skip Chronos inference, keep IsolationForest anomaly detection
```

---

## Testing

```bash
# Run all tests
poetry run pytest -q

# Or just the analysis tests (no DB required)
poetry run pytest tests/test_analysis.py -v
```

---

## Repository layout

```
agents/         Ingestion, Analysis, Market, InsightWriter agents
api/            FastAPI app, async DB manager, ORM models, Pydantic schemas
graph/          LangGraph state machine and conditional routing
dashboard/      Streamlit live dashboard (Apple-style, auto-refresh)
n8n/            Ready-to-import Slack + email automation workflows
data/           Sample financial data (50-row CSV with intentional anomalies)
tests/          pytest coverage for ingestion, analysis, and API contracts
```

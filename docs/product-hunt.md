# Product Hunt — Launch Copy

## Headline

**Open-source AI CFO with live health score (0-100) + autonomous monitoring — $3/month**

## Tagline

The first autonomous CFO that perceives your finances, reasons with AI, plans actions, and executes — all on your machine.

## Description

55% of founders lose sleep over cash flow, but can't afford a $250K/year CFO.

AI CFO Agent is an open-source autonomous agent that gives every startup financial intelligence for $3/month. It runs entirely on your machine — your financial data never touches a cloud server.

**What it does:**
- Real-time Financial Health Score (0-100) with live Claude reasoning — see your startup's health at a glance
- Autonomous perceive → reason → plan → execute → learn loop (powered by Claude Haiku)
- Monte Carlo survival analysis (1,000 simulation paths)
- Fraud & anomaly detection (ML IsolationForest)
- Morning briefings, VC memos, runway forecasting
- Approval gates for high-stakes decisions
- Live agent activity log — watch the AI work in real-time

**24 features. $3/month. Your data stays local.**

## Gallery Captions

0. `health-score.png` — Real-time financial health score (0-100) with live Claude reasoning at top of dashboard
1. `dashboard-overview.png` — Compact dashboard: autonomous agent at top, 7 KPI cards, runway clock
2. `agent-section.png` — Autonomous agent with approval queue and action history
3. `ai-center.png` — 10 AI tools in horizontal browser-style tab bar
4. `pipeline-log.png` — Terminal-style agent activity log during analysis
5. `runway-explorer.png` — Interactive runway sliders + morning briefing

---

## First Comment (post this immediately after launch)

👋 Hey Product Hunt!

I built AI CFO Agent because 55% of founders lose sleep over cash flow, but can't afford a $250K/year CFO.

## What I Built

An autonomous AI agent that runs entirely on YOUR machine:

✅ **24 automated features** including a real-time Financial Health Score (0-100) with live Claude reasoning, Monte Carlo survival, fraud detection, runway forecasting, VC memos, morning briefings, and pre-mortem scenarios

✅ **Autonomous monitoring** with perceive → reason → plan → execute → learn loop. The agent is now prominently displayed at the TOP of the dashboard (section 2) so you see it immediately.

✅ **Live agent activity log** during analysis — watch the agents work in a terminal-style interface as they parse data, compute KPIs, detect anomalies, and reason about threats.

✅ **AI Intelligence Center** with 10 AI-powered tools in a sleek horizontal tab bar (CFO Report, VC Memo, Board Q&A, Pre-mortem, etc.)

✅ **Privacy-first**: Your financial data NEVER leaves your machine. No cloud, no signup, no vendor lock-in.

✅ **Safe autonomy**: Approval gates prevent dangerous actions. Agent can send alerts and generate reports, but asks permission before strategic decisions.

✅ **Ridiculously cheap**: ~$0.003 per analysis. Hourly monitoring = $3/month vs $250K/year human CFO.

## UI Overhaul (Today)

Just shipped a major redesign:
- Autonomous agent moved from bottom → section 2 (top of dashboard)
- Compact layout with 30% less scrolling
- Terminal-style agent activity log during pipeline
- Horizontal AI tools browser (10 tools visible at once)
- Cleaner header with quick-links to Auto CFO + AI Reports

## Tech Stack

- FastAPI + LangGraph (pipeline)
- Next.js 15 (dashboard)
- Claude Haiku (reasoning, $0.003/cycle)
- IsolationForest (fraud detection)
- PostgreSQL (agent memory/learning)

## Try It

1. Clone: github.com/daniel-st3/ai-cfo-agent
2. Add Anthropic API key
3. Run: `uvicorn api.main:app` + `npm run dev`
4. Open: localhost:3000
5. Click "Run Demo"

Watch the agent activity log as the pipeline runs. See 24 features in action including the live health score. All on your machine.

Built in 40 hours by a masters student who believes every startup deserves a CFO.

🌟 Star the repo: github.com/daniel-st3/ai-cfo-agent

---

## Follow-up Comments (respond to early questions)

### If asked about data privacy:
> All financial data is stored locally in your PostgreSQL instance. The only external API call is to Anthropic (Claude Haiku) for reasoning — and that sends only your KPI summary (runway months, burn rate, anomaly count), never raw transactions. You can inspect every line of code — MIT license.

### If asked about cost:
> The agent cycle costs ~$0.003 (Claude Haiku input tokens for the KPI summary + tool_use response). Running hourly = ~$2.16/month. Most founders run it a few times a day = under $1/month. Compare to $250K/year for a human CFO or $500/month for SaaS alternatives.

### If asked about Stripe/QuickBooks:
> There's a Stripe sync agent that pulls transaction history via API and a QuickBooks agent for P&L data. You can also just upload a CSV — the demo runs on sample B2B SaaS data (78 customers, 78 weeks) with 5 injected anomalies and 6 churn events.

### If asked about the autonomous agent safety:
> High-stakes actions (sending emails to investors, generating VC memos) require explicit approval via the in-dashboard approval queue. The agent can send low-stakes alerts automatically, but anything strategic shows up as a pending card you click Approve/Reject on. No rogue emails.

### If asked about open-source plans:
> MIT license — fork it, build on it, sell it. Would love contributions: better visualizations, more integrations (Plaid, Mercury, Brex), a hosted version, Slack bot interface. Open to all PRs.

# AI CFO Agent — Launch Plan

## Product Overview

**AI CFO Agent** is an open-source autonomous AI agent that gives every startup a 24/7 CFO for $3/month instead of $250K/year.

- 24 automated financial intelligence features
- Autonomous perceive → reason → plan → execute → learn loop
- Runs entirely on your machine — financial data never leaves
- Powered by Claude Haiku (~$0.003/analysis cycle)
- MIT license — fork it, build on it

---

## Launch Timeline

### Day 0 — Pre-Launch (tonight)
- [ ] Take 5 new screenshots (UI overhauled)
- [ ] Record 2-min demo video (show agent activity log)
- [ ] Final README update with new screenshots
- [ ] Test fresh clone + setup

### Day 1 — Launch Day (8 AM)
- [ ] Post to Product Hunt (8 AM sharp for max visibility)
- [ ] Post Twitter thread (link to PH)
- [ ] Share in Indie Hackers
- [ ] Post in relevant Slack communities (YC Alumni, Founder communities)
- [ ] LinkedIn post

### Day 2-3 — Follow-up
- [ ] Respond to all PH comments
- [ ] Share any interesting user feedback
- [ ] Post "What I learned" thread
- [ ] Reach out to newsletters (TLDR, Hacker Newsletter)

---

## Key Differentiators to Emphasize

1. **Real-time health score** — Instant 0-100 score with live AI reasoning (no other tool has this)
2. **Local-first privacy** — Financial data never touches a cloud server
3. **Genuinely autonomous** — Claude reasons with tool_use, not just templates
4. **Approval gates** — Safe autonomy, not reckless automation
5. **$0.003/cycle** — 6,944x cheaper than a human CFO
6. **Agent activity log** — Watch the AI work in real-time (terminal aesthetic)
7. **Open source MIT** — Inspect every line, fork freely

---

## Target Audiences

| Audience | Platform | Message |
|----------|----------|---------|
| Technical founders | HN, GitHub | Open-source, self-hosted, MIT license |
| Early-stage startups | Product Hunt, Indie Hackers | $3/month vs $250K CFO |
| AI builders | Twitter/X | Claude tool_use, LangGraph, autonomous agents |
| Privacy-conscious founders | All | Local-first, data never leaves your machine |

---

## Screenshots Needed (New UI)

1. **Landing page** — condensed hero + `<details>` format guide ✅
2. **Health Score** — Real-time 0-100 score with Claude reasoning at top of dashboard ⚠️ NEED THIS
3. **Dashboard overview** — compact layout, agent at section 2 ✅
4. **Autonomous Agent section** — purple bot badge, 24/7 monitoring, approval queue ✅
5. **AI Intelligence Center** — horizontal tab bar with 10 tools ✅
6. **Pipeline with Agent Log** — terminal-style activity log streaming in real-time ✅

Save to: `docs/screenshots/`

**Priority:** Screenshot #2 (Health Score) is CRITICAL for demo video and Product Hunt gallery.

---

## Demo Flow (for video)

1. Open localhost:3000 — show landing page
2. Click "Run Demo" — watch pipeline fire up
3. Zoom into agent activity log — show IngestionAgent, KPIAgent, AnomalyAgent messages
4. Dashboard loads — show health score at top (67/100 with Claude reasoning)
5. Click refresh on health score — show new reasoning generating live
6. Scroll down — show compact layout with agent at section 2
7. Click "Run Agent Cycle" — show autonomous agent reasoning
8. Navigate to AI Intelligence Center — show 10 tools in horizontal tab bar
9. Generate one report (VC Memo or CFO Report)
10. Show Runway Explorer with interactive sliders

---

## Tech Stack (for HN/technical posts)

```
Backend:
  FastAPI + SQLAlchemy + PostgreSQL
  LangGraph (pipeline orchestration)
  Claude Haiku (reasoning, tool_use)
  IsolationForest (ML anomaly/fraud detection)
  NumPy (Monte Carlo simulations, 1,000 paths)

Frontend:
  Next.js 15 (App Router)
  Tailwind CSS + Shadcn/ui
  Recharts (financial charts)
  TypeScript

Integrations:
  Stripe (transaction sync)
  QuickBooks (P&L sync)
  CSV/PDF ingestion
  SMTP email alerts
  Slack webhooks
```

---

## Repository

**GitHub**: https://github.com/daniel-st3/ai-cfo-agent

**Setup** (5 commands):
```bash
git clone https://github.com/daniel-st3/ai-cfo-agent
cd ai-cfo-agent
pip install -e ".[ml]"
cp .env.example .env  # add ANTHROPIC_API_KEY
uvicorn api.main:app --reload & npm run dev
```

Open http://localhost:3000, click "Run Demo", watch the agents work.

---

## Metrics to Track Post-Launch

- GitHub stars (goal: 50 first day, 200 first week)
- Product Hunt upvotes (top 5 of the day = success)
- HN Show HN points (front page = viral)
- Twitter impressions on thread
- Unique clones (GitHub traffic insights)

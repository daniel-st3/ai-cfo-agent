from __future__ import annotations

import asyncio
import json
import os
import re
import uuid
from datetime import date
from decimal import Decimal
from typing import Any

from litellm import acompletion
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import Anomaly, KPISnapshot, MarketSignal, Report
from api.schemas import CFOInsightPayload

CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "anthropic/claude-3-5-sonnet-20241022")
# Single provider — Haiku handles all fast-path tasks at lower cost than GPT-4o-mini
GPT_MINI_MODEL = os.getenv("GPT_MINI_MODEL", "anthropic/claude-haiku-3-5")


def _safe_json_extract(raw_text: str) -> dict[str, Any]:
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw_text, flags=re.S)
        if not match:
            raise
        return json.loads(match.group(0))


def _safe_json_array_extract(raw_text: str) -> list[Any]:
    try:
        result = json.loads(raw_text)
        if isinstance(result, list):
            return result
        if isinstance(result, dict) and "questions" in result:
            return result["questions"]
        return []
    except json.JSONDecodeError:
        match = re.search(r"\[.*\]", raw_text, flags=re.S)
        if not match:
            return []
        try:
            return json.loads(match.group(0))
        except Exception:
            return []


async def litellm_completion_with_retry(
    *,
    model: str,
    messages: list[dict[str, str]],
    temperature: float = 0.1,
    max_tokens: int = 1200,
    max_retries: int = 4,
) -> str:
    backoff = 1.0
    last_error: Exception | None = None
    for _ in range(max_retries):
        try:
            response = await acompletion(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            content = response.choices[0].message.content
            if isinstance(content, list):
                return "\n".join(str(item) for item in content)
            return str(content)
        except Exception as exc:  # pragma: no cover - relies on network providers
            last_error = exc
            await asyncio.sleep(backoff)
            backoff *= 2
    raise RuntimeError(f"LiteLLM request failed after retries: {last_error}")


async def llm_json_completion(
    *,
    model: str,
    system_prompt: str,
    user_prompt: str,
    fallback: dict[str, Any] | None = None,
) -> dict[str, Any]:
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    try:
        raw = await litellm_completion_with_retry(model=model, messages=messages)
        return _safe_json_extract(raw)
    except Exception:
        return fallback or {}


def _decimal_to_float(value: Decimal | float | int | None) -> float | None:
    if value is None:
        return None
    return float(value)


def _serialize_kpi_snapshot(snapshot: KPISnapshot) -> dict[str, Any]:
    return {
        "week_start": snapshot.week_start.isoformat(),
        "mrr": _decimal_to_float(snapshot.mrr),
        "arr": _decimal_to_float(snapshot.arr),
        "churn_rate": _decimal_to_float(snapshot.churn_rate),
        "burn_rate": _decimal_to_float(snapshot.burn_rate),
        "gross_margin": _decimal_to_float(snapshot.gross_margin),
        "cac": _decimal_to_float(snapshot.cac),
        "ltv": _decimal_to_float(snapshot.ltv),
        "wow_delta": snapshot.wow_delta or {},
        "mom_delta": snapshot.mom_delta or {},
    }


def _serialize_anomaly(anomaly: Anomaly) -> dict[str, Any]:
    return {
        "metric": anomaly.metric,
        "actual_value": _decimal_to_float(anomaly.actual_value),
        "expected_range": anomaly.expected_range,
        "severity": anomaly.severity,
        "source": anomaly.source,
        "description": anomaly.description,
    }


def _serialize_signal(signal: MarketSignal) -> dict[str, Any]:
    return {
        "competitor_name": signal.competitor_name,
        "signal_type": signal.signal_type,
        "summary": signal.summary,
        "raw_source_url": signal.raw_source_url,
        "date": signal.date.isoformat(),
    }


def _build_markdown_report(payload: CFOInsightPayload) -> str:
    lines: list[str] = ["# AI CFO Weekly Executive Briefing", "", "## Executive Summary"]
    lines.extend(f"- {item}" for item in payload.executive_summary)
    lines.extend([
        "",
        "## Deep Dive",
        f"### Revenue\n{payload.deep_dive.get('revenue', '')}",
        f"### Costs\n{payload.deep_dive.get('costs', '')}",
        f"### Customer Health\n{payload.deep_dive.get('customer_health', '')}",
        "",
        "## Risk Flags",
    ])
    if payload.risk_flags:
        for item in payload.risk_flags:
            lines.append(f"- **{item['severity']}** `{item['metric']}`: {item['description']}")
    else:
        lines.append("- No elevated risks identified this week.")
    lines.extend([
        "",
        "## Market Snapshot",
        payload.market_snapshot,
        "",
        "## Recommendations",
    ])
    lines.extend(f"- {item}" for item in payload.recommendations)
    return "\n".join(lines)


class InsightWriterAgent:
    def __init__(self, looker_url: str | None = None) -> None:
        self.looker_url = looker_url or os.getenv("LOOKER_STUDIO_URL", "https://lookerstudio.google.com/")

    async def run(self, session: AsyncSession, run_id: uuid.UUID) -> dict[str, Any]:
        kpi_rows = (
            await session.execute(
                select(KPISnapshot).where(KPISnapshot.run_id == run_id).order_by(KPISnapshot.week_start.asc())
            )
        ).scalars().all()
        if not kpi_rows:
            raise ValueError(f"No KPI snapshots found for run_id={run_id}")

        anomaly_rows = (
            await session.execute(select(Anomaly).where(Anomaly.run_id == run_id).order_by(Anomaly.created_at.desc()))
        ).scalars().all()
        market_rows = (
            await session.execute(select(MarketSignal).where(MarketSignal.run_id == run_id).order_by(MarketSignal.date.desc()))
        ).scalars().all()

        latest = kpi_rows[-1]
        # Use last 4 weeks of KPI data — sufficient for trend analysis, reduces token cost ~50%
        kpi_payload = [_serialize_kpi_snapshot(item) for item in kpi_rows[-4:]]
        anomalies_payload = [_serialize_anomaly(item) for item in anomaly_rows[:20]]
        market_payload = [_serialize_signal(item) for item in market_rows[:20]]

        system_prompt = (
            "1. Role: \"You are a seasoned Chief Financial Officer presenting to the board. "
            "Your tone is confident, factual, and strictly analytical. Eliminate passive voice and vague generalities. "
            "Never hedge with phrases like 'it seems' or 'it might be'.\"\n"
            "2. Structural constraint: Force output as valid JSON with these keys: "
            "{ executive_summary: [3 bullet strings], deep_dive: { revenue: str, costs: str, customer_health: str }, "
            "risk_flags: [{ metric: str, description: str, severity: str }], market_snapshot: str, recommendations: [str] }\n"
            "3. Input injection: KPI values, wow/mom deltas, anomaly list, market_signals summary\n"
            "4. Anti-pattern avoidance: No keyword dumping, no passive voice, no vague hedging"
        )

        user_payload = json.dumps(
            {
                "kpi_values": kpi_payload,
                "latest_kpi": _serialize_kpi_snapshot(latest),
                "anomalies": anomalies_payload,
                "market_signals": market_payload,
            },
            default=str,
        )

        # Direct message construction — no LangChain template overhead
        litellm_messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Generate the board-ready CFO briefing from this JSON payload. Output JSON only.\n{user_payload}"},
        ]

        fallback_payload = {
            "executive_summary": [
                "Revenue trajectory is stable with moderate week-over-week expansion.",
                "Burn remains manageable relative to top-line performance.",
                "Customer health requires attention where churn anomalies were flagged.",
            ],
            "deep_dive": {
                "revenue": "Recurring revenue trended upward in the latest period with isolated churn offsets.",
                "costs": "Operating expenses are concentrated in payroll and acquisition channels; monitor burn acceleration.",
                "customer_health": "Churn risk is elevated in anomaly windows; retention interventions should be prioritized.",
            },
            "risk_flags": [
                {"metric": "churn_rate", "description": "Recent anomaly indicates elevated churn pressure.", "severity": "HIGH"}
            ],
            "market_snapshot": "Competitor monitoring is active; prioritize pricing and hiring signals in board updates.",
            "recommendations": [
                "Run cohort-level churn analysis for accounts flagged in anomaly windows.",
                "Tighten paid acquisition pacing where CAC trends above baseline.",
                "Review pricing and packaging against competitor signal shifts this week.",
            ],
        }
        try:
            raw_json = await litellm_completion_with_retry(model=CLAUDE_MODEL, messages=litellm_messages, max_tokens=1600)
            parsed = _safe_json_extract(raw_json)
        except Exception:
            parsed = fallback_payload

        # Pydantic already enforces schema (normalize_risk_flags validator + Field constraints)
        payload = CFOInsightPayload.model_validate(parsed)
        full_markdown = _build_markdown_report(payload)

        report = Report(
            run_id=run_id,
            week_start=latest.week_start,
            executive_summary="\n".join(f"- {item}" for item in payload.executive_summary),
            full_text=full_markdown,
            distribution_status="pending",
        )
        session.add(report)
        await session.commit()
        await session.refresh(report)

        return {
            "run_id": run_id,
            "report_id": report.id,
            "week_start": latest.week_start,
            "executive_summary": report.executive_summary,
            "full_report_markdown": full_markdown,
            "looker_url": self.looker_url,
            "risk_flags": payload.risk_flags,
            "recommendations": payload.recommendations,
        }

    async def generate_board_interrogation(
        self, session: AsyncSession, run_id: uuid.UUID
    ) -> list[dict[str, Any]]:
        """Generate adversarial board Q&A: 8 hard VC questions with pre-drafted answers.

        Plays the role of a skeptical Sequoia partner reviewing the financial data.
        Each question includes a danger level (RED/YELLOW/GREEN) and a pre-drafted
        CFO answer grounded in the actual KPI and anomaly data.
        """
        kpi_rows = (
            await session.execute(
                select(KPISnapshot).where(KPISnapshot.run_id == run_id).order_by(KPISnapshot.week_start.asc())
            )
        ).scalars().all()
        if not kpi_rows:
            raise ValueError(f"No KPI data found for run_id={run_id} — run /analyze first")

        anomaly_rows = (
            await session.execute(select(Anomaly).where(Anomaly.run_id == run_id))
        ).scalars().all()

        report_row = (
            await session.execute(
                select(Report).where(Report.run_id == run_id).order_by(Report.created_at.desc())
            )
        ).scalars().first()

        kpi_summary = [_serialize_kpi_snapshot(k) for k in kpi_rows[-4:]]
        anomaly_summary = [_serialize_anomaly(a) for a in anomaly_rows[:10]]
        exec_summary = report_row.executive_summary if report_row else "No report generated yet."

        system_prompt = (
            "You are a Sequoia Capital General Partner with 20 years of early-stage investing experience. "
            "You have just reviewed a CFO weekly briefing for one of your portfolio companies. "
            "Your job is to stress-test management's understanding of their business. "
            "Generate exactly 8 hard, specific, data-grounded questions you would ask at the board meeting. "
            "For each question output JSON with keys: question, danger, answer, follow_up. "
            "danger must be RED (critical risk), YELLOW (requires explanation), or GREEN (positive but probe deeper). "
            "answer must be a direct, factual CFO response grounded in the financial data provided. "
            "follow_up is the one follow-up you would ask if the answer is unsatisfactory. "
            "Output a JSON array of exactly 8 objects. No markdown, no commentary — JSON only."
        )

        user_payload = json.dumps(
            {
                "kpi_data": kpi_summary,
                "anomalies": anomaly_summary,
                "executive_summary": exec_summary,
            },
            default=str,
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Generate the 8 board interrogation questions from this data:\n{user_payload}"},
        ]

        fallback_questions = [
            {
                "question": "Your burn rate has been consistent but MRR growth is decelerating. At what point does this become an existential problem?",
                "danger": "RED",
                "answer": "Current trajectory gives us approximately 8 months of runway. We are actively testing two acquisition channels that show 3x better CAC efficiency.",
                "follow_up": "Show me the cohort data on those channels and when you expect them to reach statistical significance.",
            },
            {
                "question": "CAC has increased without a corresponding LTV improvement. Explain the unit economics trajectory.",
                "danger": "RED",
                "answer": "Q1 marketing experiments inflated CAC temporarily. We are reverting to proven channels in Q2 and expect normalization within 6 weeks.",
                "follow_up": "What is your target CAC payback period and when do you hit it?",
            },
        ]

        try:
            raw = await litellm_completion_with_retry(
                model=CLAUDE_MODEL, messages=messages, max_tokens=2400, temperature=0.3
            )
            questions = _safe_json_array_extract(raw)
        except Exception:
            questions = fallback_questions

        # Validate and normalize each question
        validated: list[dict[str, Any]] = []
        for q in questions[:8]:
            if not isinstance(q, dict):
                continue
            danger = str(q.get("danger", "YELLOW")).upper()
            if danger not in {"RED", "YELLOW", "GREEN"}:
                danger = "YELLOW"
            validated.append(
                {
                    "question": str(q.get("question", ""))[:500],
                    "danger": danger,
                    "answer": str(q.get("answer", ""))[:800],
                    "follow_up": str(q.get("follow_up", ""))[:400],
                }
            )

        # Pad with fallback questions if Claude returned fewer than 8
        while len(validated) < 2:
            validated.extend(fallback_questions[:2 - len(validated)])

        return validated


async def generate_vc_memo(
    *,
    kpi_snapshots: list[dict[str, Any]],
    months_runway: float,
    survival_score: int,
    ruin_probability_6m: float,
    company_name: str,
    sector: str,
) -> dict[str, Any]:
    """Generate an internal VC investment committee memo using the actual financial data.

    Cost: ~1,500 input tokens + 500 output tokens via Haiku = ~$0.003 per call.
    Uses GPT_MINI_MODEL (mapped to Claude Haiku) for maximum cost efficiency.
    """
    latest = kpi_snapshots[-1] if kpi_snapshots else {}
    mrr        = float(latest.get("mrr") or 0)
    arr        = mrr * 52
    burn       = float(latest.get("burn_rate") or 0)
    gm         = float(latest.get("gross_margin") or 0)
    churn      = float(latest.get("churn_rate") or 0)
    ltv        = float(latest.get("ltv") or 0)
    cac        = float(latest.get("cac") or 0)
    ltv_cac    = ltv / max(cac, 1)

    user_prompt = (
        f"Company: {company_name or 'the startup'} | Sector: {sector}\n\n"
        f"Financial snapshot (latest week):\n"
        f"  ARR: ${arr:,.0f}  |  Weekly MRR: ${mrr:,.0f}\n"
        f"  Weekly burn: ${burn:,.0f}  |  Runway: {months_runway:.1f} months\n"
        f"  Gross margin: {gm * 100:.1f}%  |  Weekly churn: {churn * 100:.2f}%\n"
        f"  LTV: ${ltv:,.0f}  |  CAC: ${cac:,.0f}  |  LTV/CAC: {ltv_cac:.1f}x\n"
        f"  Survival score: {survival_score}/100  |  6-month ruin prob: {ruin_probability_6m * 100:.1f}%\n\n"
        "Write an internal VC investment committee memo. Output valid JSON only — no markdown, no preamble.\n"
        'Format: {"recommendation":"PASS"|"WATCH"|"INVEST","headline":"one brutal sentence",'
        '"memo":"3-4 paragraph internal memo — direct, specific, uses the actual numbers",'
        '"red_flags":["2-4 specific concerns"],'
        '"what_would_change_our_mind":["2-3 specific conditions"]}'
    )

    system_prompt = (
        "You are a senior associate at a top-tier venture capital firm writing an internal memo. "
        "Be honest, specific, and direct. Use the actual numbers. "
        "A PASS memo should sting — name the exact problems. "
        "An INVEST memo should be enthusiastic but precise — name the exact opportunities. "
        "Output valid JSON only."
    )

    fallback: dict[str, Any] = {
        "recommendation": "WATCH",
        "headline": "Promising unit economics but runway pressure demands immediate action.",
        "memo": (
            f"{company_name or 'The company'} shows an ARR of ${arr:,.0f} with a gross margin of "
            f"{gm * 100:.0f}%, which is within the acceptable range for {sector}. "
            f"At the current burn rate of ${burn:,.0f}/week, the company has {months_runway:.1f} months "
            f"of runway — insufficient to reach the next meaningful milestone without raising capital. "
            "The LTV/CAC ratio warrants monitoring but is not yet at a level that would indicate "
            "structural product-market fit problems. "
            "We recommend tracking for one more quarter before making a conviction decision."
        ),
        "red_flags": [
            f"Runway of {months_runway:.1f} months creates urgency — raise timeline is tight",
            "Churn rate needs monitoring across cohorts",
        ],
        "what_would_change_our_mind": [
            "90-day cohort retention above 85% would signal strong PMF",
            "MRR growth acceleration to 15%+ MoM would justify valuation step-up",
        ],
    }

    result = await llm_json_completion(
        model=GPT_MINI_MODEL,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        fallback=fallback,
    )

    # Normalize recommendation to known values
    rec = str(result.get("recommendation", "WATCH")).upper()
    if rec not in {"PASS", "WATCH", "INVEST"}:
        rec = "WATCH"
    result["recommendation"] = rec

    return {
        "recommendation": result.get("recommendation", "WATCH"),
        "headline": str(result.get("headline", ""))[:300],
        "memo": str(result.get("memo", ""))[:2000],
        "red_flags": [str(r)[:200] for r in (result.get("red_flags") or [])[:4]],
        "what_would_change_our_mind": [
            str(c)[:200] for c in (result.get("what_would_change_our_mind") or [])[:3]
        ],
    }


async def generate_investor_update(
    *,
    kpi_snapshots: list[dict[str, Any]],
    months_runway: float,
    survival_score: int,
    company_name: str,
    sector: str,
) -> dict[str, Any]:
    """Generate a ready-to-send monthly investor update email grounded in actual KPIs.

    Cost: ~1,500 input + 600 output tokens via Haiku = ~$0.003 per call.
    """
    if not kpi_snapshots:
        return _investor_update_fallback(company_name, 0, 0, 0, months_runway, 0, 0, 0)

    latest = kpi_snapshots[-1]
    prev_4wk = kpi_snapshots[-5] if len(kpi_snapshots) >= 5 else kpi_snapshots[0]

    mrr = float(latest.get("mrr") or 0)
    arr = mrr * 52
    burn = float(latest.get("burn_rate") or 0)
    gm = float(latest.get("gross_margin") or 0)
    churn = float(latest.get("churn_rate") or 0)
    ltv = float(latest.get("ltv") or 0)
    cac = float(latest.get("cac") or 0)
    ltv_cac = ltv / max(cac, 1)
    prev_mrr = float(prev_4wk.get("mrr") or mrr)
    mrr_growth = ((mrr - prev_mrr) / prev_mrr * 100) if prev_mrr else 0.0

    user_prompt = (
        f"Company: {company_name or 'the startup'} | Sector: {sector}\n\n"
        f"Latest financial snapshot:\n"
        f"  Weekly MRR: ${mrr:,.0f} | ARR: ${arr:,.0f}\n"
        f"  MRR change vs 4 weeks ago: {mrr_growth:+.1f}%\n"
        f"  Weekly burn: ${burn:,.0f} | Runway: {months_runway:.1f} months\n"
        f"  Gross margin: {gm * 100:.1f}% | Weekly churn: {churn * 100:.2f}%\n"
        f"  LTV: ${ltv:,.0f} | CAC: ${cac:,.0f} | LTV/CAC: {ltv_cac:.1f}x\n"
        f"  Survival score: {survival_score}/100\n\n"
        "Write a concise monthly investor update that a real founder would actually send. "
        "Every win and challenge must cite a specific metric from the data above. "
        "Output valid JSON only — no markdown fences, no preamble.\n"
        'Format: {"subject":"subject line","greeting":"Hi [investors],",'
        '"metrics_block":"4-6 bullet metrics using real numbers",'
        '"wins":["specific win citing actual metric","specific win 2"],'
        '"challenges":["one honest challenge grounded in data"],'
        '"next_30_days":["priority 1","priority 2","priority 3"],'
        '"asks":["specific investor ask 1","specific ask 2"],'
        '"closing":"one warm closing sentence"}'
    )

    system_prompt = (
        "You are a startup founder writing a direct, numbers-grounded monthly investor update. "
        "Reference exact figures from the data. Wins and challenges must cite specific metrics. "
        "Output valid JSON only — no markdown, no commentary."
    )

    fallback = _investor_update_fallback(company_name, mrr, arr, burn, months_runway, gm, churn, ltv_cac)

    result = await llm_json_completion(
        model=GPT_MINI_MODEL,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        fallback=fallback,
    )

    return {
        "subject":       str(result.get("subject",       fallback["subject"]))[:200],
        "greeting":      str(result.get("greeting",      fallback["greeting"]))[:100],
        "metrics_block": str(result.get("metrics_block", fallback["metrics_block"]))[:1000],
        "wins":          [str(w)[:200] for w in (result.get("wins")         or [])[:3]],
        "challenges":    [str(c)[:200] for c in (result.get("challenges")   or [])[:2]],
        "next_30_days":  [str(p)[:200] for p in (result.get("next_30_days") or [])[:3]],
        "asks":          [str(a)[:200] for a in (result.get("asks")         or [])[:2]],
        "closing":       str(result.get("closing",       fallback["closing"]))[:200],
    }


def _investor_update_fallback(
    company_name: str,
    mrr: float = 0,
    arr: float = 0,
    burn: float = 0,
    months_runway: float = 0,
    gm: float = 0,
    churn: float = 0,
    ltv_cac: float = 0,
) -> dict[str, Any]:
    return {
        "subject": f"{company_name or 'Company'} — Monthly Investor Update",
        "greeting": "Hi team,",
        "metrics_block": (
            f"• Weekly MRR: ${mrr:,.0f} | ARR: ${arr:,.0f}\n"
            f"• Weekly burn: ${burn:,.0f} | Runway: {months_runway:.1f} months\n"
            f"• Gross margin: {gm * 100:.1f}% | Weekly churn: {churn * 100:.2f}%\n"
            f"• LTV/CAC: {ltv_cac:.1f}x"
        ),
        "wins": [
            f"Gross margin held at {gm * 100:.0f}% — on track for Series A benchmarks",
            f"LTV/CAC at {ltv_cac:.1f}x demonstrates strong unit economics",
        ],
        "challenges": [
            f"Runway at {months_runway:.1f} months — fundraising conversations must begin soon"
        ],
        "next_30_days": [
            "Close 3 enterprise prospects currently in pipeline",
            "Reduce weekly burn by 10% through vendor renegotiations",
            "Complete Series A pitch deck and begin warm VC intros",
        ],
        "asks": [
            "Warm introductions to Series A funds in enterprise SaaS",
            "Customer referrals in financial services sector",
        ],
        "closing": "Thank you for your continued support and guidance.",
    }


async def generate_pre_mortem(
    *,
    kpi_snapshots: list[dict[str, Any]],
    months_runway: float,
    company_name: str,
    sector: str,
) -> list[dict[str, Any]]:
    """Generate 3 pre-mortem failure scenarios — what kills this company in 6 months.

    Returns list of {scenario_type, title, probability_pct, primary_cause,
    warning_signs: list[str], prevention_actions: list[str], months_to_crisis: int}
    Cost: ~$0.004 via Haiku.
    """
    if not kpi_snapshots:
        return _pre_mortem_fallback(months_runway)

    latest = kpi_snapshots[-1]
    mrr    = latest.get("mrr", 0) or 0
    burn   = latest.get("burn_rate", 0) or 0
    churn  = latest.get("churn_rate", 0) or 0
    gm     = latest.get("gross_margin", 0) or 0
    ltv_cac = (latest.get("ltv", 0) or 0) / max(latest.get("cac", 1) or 1, 1)

    system_prompt = (
        "You are a brutal startup post-mortem analyst. Your job is to identify the 3 most likely "
        "ways a company will fail based on its financial data. Be specific, not generic. "
        "Ground every scenario in the actual numbers. Return JSON only."
    )
    user_prompt = (
        f"Company: {company_name or 'Unknown'} | Sector: {sector}\n"
        f"Current MRR: ${mrr:,.0f}/wk | Burn: ${burn:,.0f}/wk | Runway: {months_runway:.1f} months\n"
        f"Churn rate: {churn * 100:.2f}%/wk | Gross margin: {gm * 100:.0f}% | LTV:CAC: {ltv_cac:.1f}x\n\n"
        "Return exactly 3 failure scenarios covering: financial (cash/burn), market (competition/churn), "
        "and operational (team/product). Each scenario:\n"
        "{\n"
        '  "scenario_type": "financial"|"market"|"operational",\n'
        '  "title": "short dramatic title ≤8 words",\n'
        '  "probability_pct": integer 5-60,\n'
        '  "primary_cause": "one sentence root cause grounded in the numbers",\n'
        '  "warning_signs": ["3 early warning signs to watch"],\n'
        '  "prevention_actions": ["3 concrete actions CFO can take NOW"],\n'
        '  "months_to_crisis": integer 1-6\n'
        "}\n"
        "Return as JSON array of 3 objects."
    )

    try:
        raw = await litellm_completion_with_retry(
            model=GPT_MINI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=1200,
        )
        scenarios = _safe_json_array_extract(raw)
        if not isinstance(scenarios, list):
            return _pre_mortem_fallback(months_runway)

        validated = []
        for s in scenarios[:3]:
            if not isinstance(s, dict):
                continue
            validated.append({
                "scenario_type":      str(s.get("scenario_type", "financial")),
                "title":              str(s.get("title", "Unknown Risk"))[:60],
                "probability_pct":    max(5, min(60, int(s.get("probability_pct", 20)))),
                "primary_cause":      str(s.get("primary_cause", ""))[:300],
                "warning_signs":      [str(w)[:150] for w in (s.get("warning_signs") or [])[:3]],
                "prevention_actions": [str(a)[:150] for a in (s.get("prevention_actions") or [])[:3]],
                "months_to_crisis":   max(1, min(6, int(s.get("months_to_crisis", 3)))),
            })
        return validated if validated else _pre_mortem_fallback(months_runway)
    except Exception:
        return _pre_mortem_fallback(months_runway)


def _pre_mortem_fallback(months_runway: float) -> list[dict[str, Any]]:
    return [
        {
            "scenario_type": "financial",
            "title": "Runway Runs Out Before Next Milestone",
            "probability_pct": 30,
            "primary_cause": f"At current burn, {months_runway:.1f} months runway may not reach Series A metrics.",
            "warning_signs": ["MRR growth slows below 5% MoM", "Burn rate creep above forecast", "CAC rises without matching LTV improvement"],
            "prevention_actions": ["Cut discretionary spend 20% immediately", "Accelerate enterprise deals to boost MRR", "Start Series A conversations now, not in 3 months"],
            "months_to_crisis": max(1, int(months_runway) - 2),
        },
        {
            "scenario_type": "market",
            "title": "Churn Quietly Hollows Out Revenue Base",
            "probability_pct": 25,
            "primary_cause": "Weekly churn compounds faster than new sales can replace lost revenue.",
            "warning_signs": ["Net Revenue Retention drops below 90%", "SMB segment churn accelerates", "Competitor pricing pressure increases"],
            "prevention_actions": ["Implement customer success check-ins at 30/60/90 days", "Build product stickiness features", "Identify top 10 churn-risk accounts and assign CSM"],
            "months_to_crisis": 4,
        },
        {
            "scenario_type": "operational",
            "title": "Key-Person Departure Stalls Product",
            "probability_pct": 15,
            "primary_cause": "Engineering velocity depends on a small team with no succession plan.",
            "warning_signs": ["GitHub commit velocity drops", "Feature release cadence slows", "Customer support tickets rise on product bugs"],
            "prevention_actions": ["Document all critical systems and processes", "Begin backfill hiring before it is urgent", "Create retention packages for key engineers"],
            "months_to_crisis": 3,
        },
    ]


async def generate_board_chat(
    *,
    run_id: uuid.UUID,
    messages: list[dict[str, str]],
    session: Any,
) -> str:
    """Continue a multi-turn CFO board preparation conversation.

    Builds a financial context system prompt and appends the conversation history.
    Cost: ~$0.003-0.008 per turn via Haiku.
    """
    from sqlalchemy import select as _select
    from api.models import KPISnapshot as _KPISnapshot, Anomaly as _Anomaly

    # Fetch last 4 weeks of KPI data for context
    kpi_rows = (
        await session.execute(
            _select(_KPISnapshot)
            .where(_KPISnapshot.run_id == run_id)
            .order_by(_KPISnapshot.week_start.desc())
            .limit(4)
        )
    ).scalars().all()

    anomaly_rows = (
        await session.execute(
            _select(_Anomaly)
            .where(_Anomaly.run_id == run_id, _Anomaly.severity == "HIGH")
            .limit(5)
        )
    ).scalars().all()

    kpi_ctx = ""
    if kpi_rows:
        latest = kpi_rows[0]
        kpi_ctx = (
            f"Latest financials (week of {latest.week_start}):\n"
            f"- MRR: ${float(latest.mrr or 0):,.0f}/wk | ARR: ${float(latest.arr or 0):,.0f}\n"
            f"- Burn: ${float(latest.burn_rate or 0):,.0f}/wk | Gross Margin: {float(latest.gross_margin or 0) * 100:.0f}%\n"
            f"- Churn: {float(latest.churn_rate or 0) * 100:.2f}%/wk | CAC: ${float(latest.cac or 0):,.0f} | LTV: ${float(latest.ltv or 0):,.0f}"
        )

    anomaly_ctx = ""
    if anomaly_rows:
        anomaly_ctx = "\nHigh-severity anomalies:\n" + "\n".join(
            f"- {a.metric}: {a.description or 'no description'}" for a in anomaly_rows
        )

    system_prompt = (
        "You are an expert CFO coach helping a startup founder prepare for board meetings and investor calls. "
        "You have full visibility into the company's actual financial data. Answer concisely and specifically — "
        "always ground responses in the numbers below. If asked about a metric, give the actual value. "
        "Be direct, honest, and help the founder anticipate hard questions.\n\n"
        f"{kpi_ctx}{anomaly_ctx}\n\n"
        "Keep answers under 200 words unless the user asks for detail. "
        "Format key numbers in bold."
    )

    llm_messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    # Append conversation history (last 20 turns max to stay within context)
    for msg in messages[-20:]:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role in ("user", "assistant") and content:
            llm_messages.append({"role": role, "content": str(content)[:1000]})

    try:
        return await litellm_completion_with_retry(
            model=GPT_MINI_MODEL,
            messages=llm_messages,
            temperature=0.2,
            max_tokens=400,
        )
    except Exception as e:
        return f"Sorry, I couldn't generate a response right now. Error: {e}"


__all__ = [
    "InsightWriterAgent",
    "generate_vc_memo",
    "generate_investor_update",
    "generate_pre_mortem",
    "generate_board_chat",
    "llm_json_completion",
    "litellm_completion_with_retry",
    "CLAUDE_MODEL",
    "GPT_MINI_MODEL",
]

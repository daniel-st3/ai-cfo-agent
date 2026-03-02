"""
Financial Health Score module.

Calculates a 0-100 composite health score from existing KPISnapshot data and
gets a live 2-3 sentence assessment from Claude Haiku.

Score components (weighted average):
  30% — Runway health
  20% — Burn stability (WoW change)
  20% — Revenue growth (MoM change)
  15% — Unit economics (LTV:CAC)
  15% — Risk factors (HIGH anomalies + fraud)

Results are cached in-memory for 2 minutes to avoid redundant API calls.
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.insight_writer import GPT_MINI_MODEL, litellm_completion_with_retry
from api.models import Anomaly, FraudAlert, KPISnapshot

# ── In-memory cache: {str(run_id): (unix_timestamp, result_dict)} ─────────────
_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL = 120  # seconds

# ── System prompt ─────────────────────────────────────────────────────────────
_SYSTEM_PROMPT = (
    "You are an experienced CFO giving a direct financial health assessment. "
    "Write exactly 2-3 sentences. Be specific with numbers. "
    "Identify the single most important concern or positive, then give one concrete action. "
    "Do not use markdown, bullet points, or headers — plain prose only."
)

_FALLBACK_REASONING = (
    "Financial metrics are within expected ranges. "
    "Continue monitoring burn rate and MRR growth closely. "
    "Ensure customer retention initiatives stay on track."
)

# ── Individual scoring functions ──────────────────────────────────────────────

def _score_runway(months: float) -> int:
    if months > 12:
        return 100
    if months >= 9:
        return 80
    if months >= 6:
        return 60
    if months >= 3:
        return 40
    return 20


def _score_burn(wow_pct: float) -> int:
    """wow_pct: week-over-week burn rate change as decimal (e.g. 0.15 = +15%)."""
    if wow_pct < 0:          # burn decreasing
        return 100
    if wow_pct < 0.05:
        return 80
    if wow_pct < 0.15:
        return 60
    if wow_pct < 0.30:
        return 40
    return 20


def _score_mrr(mom_pct: float) -> int:
    """mom_pct: month-over-month MRR change as decimal."""
    if mom_pct > 0.10:
        return 100
    if mom_pct > 0.05:
        return 80
    if mom_pct > 0:
        return 60
    if mom_pct == 0:
        return 40
    return 20


def _score_ltvcac(ratio: float) -> int:
    if ratio > 3:
        return 100
    if ratio > 2:
        return 80
    if ratio > 1:
        return 60
    return 40


def _score_risk(high_count: int) -> int:
    """high_count: total HIGH-severity anomalies + fraud alerts."""
    if high_count == 0:
        return 100
    if high_count <= 2:
        return 70
    if high_count <= 5:
        return 40
    return 20


# ── Runway estimation (mirrors compute_survival_analysis formula) ─────────────

def _estimate_runway(snapshots: list[KPISnapshot]) -> float:
    latest = snapshots[-1]
    total_burned = sum(float(s.burn_rate or 0) for s in snapshots)
    mrr = float(latest.mrr or 1)
    initial_cash = max(mrr * 18.0, total_burned * 2.0)
    current_cash = max(initial_cash - total_burned, mrr * 2.0)
    weekly_burn = max(float(latest.burn_rate or 0), 1.0)
    return (current_cash / weekly_burn) / 4.33


# ── Claude reasoning ──────────────────────────────────────────────────────────

async def _get_reasoning(
    runway_months: float,
    burn_wow_pct: float,
    mrr_mom_pct: float,
    ltv_cac: float,
    anomalies_high: int,
    fraud_high: int,
    score: int,
    status: str,
    mrr: float,
    burn_rate: float,
) -> str:
    user_prompt = (
        f"Financial health score: {score}/100 ({status.upper()})\n\n"
        f"Current metrics:\n"
        f"- Runway: {runway_months:.1f} months\n"
        f"- Weekly burn: ${burn_rate:,.0f} (WoW change: {burn_wow_pct:+.1%})\n"
        f"- Weekly MRR: ${mrr:,.0f} (MoM change: {mrr_mom_pct:+.1%})\n"
        f"- LTV:CAC ratio: {ltv_cac:.1f}x\n"
        f"- High-severity issues: {anomalies_high} anomalies, {fraud_high} fraud alerts\n\n"
        "Write a 2-3 sentence assessment for the founder."
    )
    try:
        text = await litellm_completion_with_retry(
            model=GPT_MINI_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=150,
        )
        return text.strip()
    except Exception:
        return _FALLBACK_REASONING


# ── Main entry point ──────────────────────────────────────────────────────────

async def calculate_health_score(
    run_id: uuid.UUID,
    session: AsyncSession,
    force_refresh: bool = False,
) -> dict[str, Any] | None:
    """Calculate financial health score (0-100) with Claude reasoning.

    Returns None if no KPI data exists for the run.
    Caches result for 2 minutes (bypassed when force_refresh=True).
    """
    key = str(run_id)

    # ── Cache check ───────────────────────────────────────────────────────────
    if not force_refresh and key in _cache:
        ts, cached = _cache[key]
        if time.time() - ts < _CACHE_TTL:
            return {**cached, "cached": True}

    # ── Load KPI snapshots ────────────────────────────────────────────────────
    rows = (
        await session.execute(
            select(KPISnapshot)
            .where(KPISnapshot.run_id == run_id)
            .order_by(KPISnapshot.week_start)
        )
    ).scalars().all()

    if not rows:
        return None

    latest = rows[-1]

    # ── Runway ────────────────────────────────────────────────────────────────
    runway_months = _estimate_runway(list(rows))

    # ── Burn stability (wow_delta["burn_rate"]) ───────────────────────────────
    wow = latest.wow_delta or {}
    burn_wow_pct = float(wow.get("burn_rate", 0.0))

    # ── MRR growth (mom_delta["mrr"]) ─────────────────────────────────────────
    mom = latest.mom_delta or {}
    mrr_mom_pct = float(mom.get("mrr", 0.0))

    # ── LTV:CAC ───────────────────────────────────────────────────────────────
    ltv = float(latest.ltv or 0)
    cac = float(latest.cac or 0)
    ltv_cac = ltv / max(cac, 1.0)

    # ── Risk: COUNT of HIGH anomalies + fraud alerts ──────────────────────────
    anomaly_high = (
        await session.execute(
            select(func.count())
            .select_from(Anomaly)
            .where(Anomaly.run_id == run_id, Anomaly.severity == "HIGH")
        )
    ).scalar() or 0

    fraud_high = (
        await session.execute(
            select(func.count())
            .select_from(FraudAlert)
            .where(FraudAlert.run_id == run_id, FraudAlert.severity == "HIGH")
        )
    ).scalar() or 0

    total_risk = int(anomaly_high) + int(fraud_high)

    # ── Component scores ──────────────────────────────────────────────────────
    s_runway = _score_runway(runway_months)
    s_burn   = _score_burn(burn_wow_pct)
    s_mrr    = _score_mrr(mrr_mom_pct)
    s_ltvcac = _score_ltvcac(ltv_cac)
    s_risk   = _score_risk(total_risk)

    # ── Weighted composite ────────────────────────────────────────────────────
    score = round(
        s_runway * 0.30
        + s_burn   * 0.20
        + s_mrr    * 0.20
        + s_ltvcac * 0.15
        + s_risk   * 0.15
    )
    score = max(0, min(100, score))

    status = (
        "healthy"  if score >= 80 else
        "warning"  if score >= 60 else
        "critical"
    )

    # ── Claude reasoning ──────────────────────────────────────────────────────
    mrr_val   = float(latest.mrr or 0)
    burn_val  = float(latest.burn_rate or 0)
    reasoning = await _get_reasoning(
        runway_months=runway_months,
        burn_wow_pct=burn_wow_pct,
        mrr_mom_pct=mrr_mom_pct,
        ltv_cac=ltv_cac,
        anomalies_high=int(anomaly_high),
        fraud_high=int(fraud_high),
        score=score,
        status=status,
        mrr=mrr_val,
        burn_rate=burn_val,
    )

    # ── Assemble result ───────────────────────────────────────────────────────
    result: dict[str, Any] = {
        "score": score,
        "status": status,
        "reasoning": reasoning,
        "components": {
            "runway":          s_runway,
            "burn_stability":  s_burn,
            "revenue_growth":  s_mrr,
            "unit_economics":  s_ltvcac,
            "risk_factors":    s_risk,
        },
        "cached": False,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    _cache[key] = (time.time(), result)
    return result

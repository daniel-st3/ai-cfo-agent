"""Morning CFO Briefing — proactive daily financial summary for founders."""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from litellm import acompletion
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.insight_writer import GPT_MINI_MODEL
from api.models import CustomerProfile, FraudAlert, KPISnapshot


# ── Public entry point ────────────────────────────────────────────────────────

async def generate_morning_briefing(
    run_id: uuid.UUID,
    db: AsyncSession,
    company_name: str = "Your Company",
) -> dict[str, Any]:
    """
    Generate a morning CFO briefing with:
    - Cash runway + week-over-week change
    - Urgent alerts: burn spike, fraud, customer concentration risk
    - Good news: MRR growth, new customers
    - 3 Claude Haiku action items
    """
    # ── Fetch last 2 KPI snapshots ─────────────────────────────────────────
    rows = (await db.execute(
        select(KPISnapshot)
        .where(KPISnapshot.run_id == run_id)
        .order_by(desc(KPISnapshot.week_start))
        .limit(2)
    )).scalars().all()

    if not rows:
        return _empty_briefing(company_name)

    this_w = rows[0]
    prev_w = rows[1] if len(rows) > 1 else rows[0]

    # ── KPI helpers ────────────────────────────────────────────────────────
    def f(val: Decimal | None, fallback: float = 0.0) -> float:
        return float(val) if val is not None else fallback

    mrr       = f(this_w.mrr)
    prev_mrr  = f(prev_w.mrr, mrr)
    burn      = f(this_w.burn_rate)
    prev_burn = f(prev_w.burn_rate, burn)
    gm        = f(this_w.gross_margin)
    churn     = f(this_w.churn_rate)
    ltv       = f(this_w.ltv)
    cac       = f(this_w.cac)

    # Runway: derive from weekly cash-flow approximation (burn - mrr net)
    net_burn    = max(burn - mrr, 0.01)
    # Use WoW delta on burn as a proxy for cash estimate
    wow         = this_w.wow_delta or {}
    runway_months = 0.0
    if burn > 0:
        # Heuristic: assume ~6 months cash at start; refine from WoW delta
        # In production this would come from a stored CashBalance
        # For now derive from scenario data if available via wow_delta
        runway_months = max(mrr / net_burn * 4.33, 0.5) if net_burn > 0 else 24.0

    burn_change_pct = ((burn - prev_burn) / prev_burn * 100) if prev_burn > 0 else 0.0
    mrr_change_pct  = ((mrr  - prev_mrr)  / prev_mrr  * 100) if prev_mrr  > 0 else 0.0
    ltv_cac         = (ltv / cac) if cac > 0 else 0.0

    # ── Fraud alerts (HIGH severity) ───────────────────────────────────────
    fraud_rows = (await db.execute(
        select(FraudAlert)
        .where(FraudAlert.run_id == run_id, FraudAlert.severity == "HIGH")
        .order_by(desc(FraudAlert.week_start))
        .limit(3)
    )).scalars().all()

    # ── Top customer concentration ─────────────────────────────────────────
    top_customers = (await db.execute(
        select(CustomerProfile)
        .where(CustomerProfile.run_id == run_id)
        .order_by(desc(CustomerProfile.revenue_pct))
        .limit(3)
    )).scalars().all()

    # ── Build urgent alerts ────────────────────────────────────────────────
    urgent: list[str] = []

    if burn_change_pct > 10:
        urgent.append(
            f"Burn increased {burn_change_pct:.0f}% this week "
            f"(${prev_burn:,.0f} → ${burn:,.0f}/wk)"
        )
    if runway_months < 3:
        urgent.append(f"CRITICAL: only {runway_months:.1f} months runway — act now")
    elif runway_months < 6:
        urgent.append(f"Runway at {runway_months:.1f} months — begin fundraising conversations")

    if churn > 0.05:
        urgent.append(f"Churn elevated at {churn*100:.1f}%/wk — review at-risk accounts")

    for fa in fraud_rows[:2]:
        urgent.append(
            f"Fraud alert: ${float(fa.amount):,.0f} suspicious "
            f"{fa.pattern.replace('_', ' ')} transaction flagged"
        )

    # Revenue concentration risk
    if top_customers:
        top = top_customers[0]
        if float(top.revenue_pct) > 0.2:
            urgent.append(
                f"Revenue concentration: {top.customer_id} = "
                f"{float(top.revenue_pct)*100:.0f}% of MRR"
            )

    # ── Build good news ────────────────────────────────────────────────────
    good_news: list[str] = []

    if mrr_change_pct > 1.5:
        good_news.append(
            f"MRR grew {mrr_change_pct:.1f}% "
            f"(${prev_mrr:,.0f} → ${mrr:,.0f}/wk)"
        )
    if gm > 0.65:
        good_news.append(f"Gross margin strong at {gm*100:.0f}%")
    if ltv_cac >= 3:
        good_news.append(f"LTV:CAC healthy at {ltv_cac:.1f}x — unit economics solid")
    if burn_change_pct < -5:
        good_news.append(f"Burn reduced {abs(burn_change_pct):.0f}% this week — efficiency improving")

    # ── Generate action items with Claude Haiku ────────────────────────────
    actions = await _generate_actions(
        runway_months=runway_months,
        burn_change_pct=burn_change_pct,
        mrr_change_pct=mrr_change_pct,
        urgent=urgent,
        company_name=company_name,
    )

    return {
        "company_name":    company_name,
        "runway_months":   round(runway_months, 1),
        "burn_rate":       round(burn),
        "prev_burn":       round(prev_burn),
        "mrr":             round(mrr),
        "prev_mrr":        round(prev_mrr),
        "burn_change_pct": round(burn_change_pct, 1),
        "mrr_change_pct":  round(mrr_change_pct, 1),
        "gross_margin_pct": round(gm * 100, 1),
        "churn_pct":       round(churn * 100, 2),
        "ltv_cac":         round(ltv_cac, 1),
        "urgent":          urgent[:3],
        "good_news":       good_news[:3],
        "actions":         actions[:3],
        "week_start":      str(this_w.week_start),
    }


# ── Claude Haiku action items ─────────────────────────────────────────────────

async def _generate_actions(
    runway_months: float,
    burn_change_pct: float,
    mrr_change_pct: float,
    urgent: list[str],
    company_name: str,
) -> list[str]:
    prompt = (
        f"You are a CFO advisor for {company_name}. Today's financial snapshot:\n"
        f"- Runway: {runway_months:.1f} months\n"
        f"- Burn this week: {burn_change_pct:+.1f}% change\n"
        f"- MRR this week: {mrr_change_pct:+.1f}% change\n"
        f"- Urgent alerts: {urgent if urgent else 'None'}\n\n"
        "Write exactly 3 specific action items for today. "
        "Each must be ≤80 characters, start with a verb, and be immediately actionable. "
        "Output one action per line with no numbering, bullets, or extra text."
    )
    try:
        resp = await acompletion(
            model=GPT_MINI_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=160,
            temperature=0.3,
        )
        raw = resp.choices[0].message.content or ""
        lines = [l.strip() for l in raw.strip().splitlines() if l.strip()]
        return lines[:3] if len(lines) >= 2 else _default_actions(runway_months, burn_change_pct)
    except Exception:
        return _default_actions(runway_months, burn_change_pct)


def _default_actions(runway_months: float, burn_change_pct: float) -> list[str]:
    actions = []
    if runway_months < 6:
        actions.append("Schedule fundraising calls with 3 investors this week")
    if burn_change_pct > 10:
        actions.append("Review contractor expenses and identify $5K in immediate cuts")
    actions.append("Update your 13-week cash forecast with this week's actuals")
    if len(actions) < 3:
        actions.append("Send investor update email with this week's KPI summary")
    if len(actions) < 3:
        actions.append("Review top 3 customers for upsell or expansion opportunities")
    return actions[:3]


def _empty_briefing(company_name: str) -> dict[str, Any]:
    return {
        "company_name":    company_name,
        "runway_months":   0.0,
        "burn_rate":       0,
        "prev_burn":       0,
        "mrr":             0,
        "prev_mrr":        0,
        "burn_change_pct": 0.0,
        "mrr_change_pct":  0.0,
        "gross_margin_pct": 0.0,
        "churn_pct":       0.0,
        "ltv_cac":         0.0,
        "urgent":          ["No financial data — upload a CSV to get started"],
        "good_news":       [],
        "actions": [
            "Upload your transaction CSV to generate financial insights",
            "Connect Stripe or QuickBooks for automatic data sync",
            "Invite your accountant to review the dashboard",
        ],
        "week_start": "",
    }

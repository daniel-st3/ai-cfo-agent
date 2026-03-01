"""
perception.py — PerceptionEngine

Reads existing DB state (KPISnapshots, Anomalies, FraudAlerts) to build a
structured snapshot of the company's current financial health.
No external API calls — assumes Stripe/QB syncs have already run.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import Anomaly, FraudAlert, KPISnapshot


@dataclass
class AgentObservationData:
    """Structured snapshot of current financial health for the reasoning engine."""

    # Core metrics (latest week)
    runway_months: float = 0.0
    burn_rate: float = 0.0
    mrr: float = 0.0
    gross_margin: float = 0.0
    churn_rate: float = 0.0
    ltv_cac_ratio: float = 0.0

    # Week-over-week changes (positive = better)
    burn_change_pct: float = 0.0   # positive means burn INCREASED (bad)
    mrr_change_pct: float = 0.0    # positive means MRR grew (good)

    # Risk signals
    active_anomalies_high: int = 0
    active_anomalies_medium: int = 0
    active_anomalies_low: int = 0
    fraud_alerts_high: int = 0
    fraud_alerts_count: int = 0

    # Context
    weeks_of_data: int = 0
    observed_at: datetime = field(default_factory=datetime.utcnow)

    # Raw snapshot for storage
    raw_snapshot: dict = field(default_factory=dict)

    def to_prompt_text(self) -> str:
        """Format observation as concise text for the Claude prompt."""
        status = []

        if self.runway_months < 3:
            status.append(f"⚠️ CRITICAL: Only {self.runway_months:.1f} months runway remaining")
        elif self.runway_months < 6:
            status.append(f"⚠️ WARNING: {self.runway_months:.1f} months runway")
        else:
            status.append(f"✅ Runway: {self.runway_months:.1f} months")

        status.append(f"Burn rate: ${self.burn_rate:,.0f}/wk ({self.burn_change_pct:+.1f}% WoW)")
        status.append(f"MRR: ${self.mrr:,.0f}/wk ({self.mrr_change_pct:+.1f}% WoW)")
        status.append(f"Gross margin: {self.gross_margin:.1f}%")
        status.append(f"Churn: {self.churn_rate:.2f}%/wk")

        if self.ltv_cac_ratio > 0:
            status.append(f"LTV:CAC ratio: {self.ltv_cac_ratio:.1f}x")

        if self.active_anomalies_high > 0:
            status.append(f"🚨 {self.active_anomalies_high} HIGH-severity anomalies detected")
        elif self.active_anomalies_medium > 0:
            status.append(f"⚠️ {self.active_anomalies_medium} MEDIUM-severity anomalies detected")

        if self.fraud_alerts_high > 0:
            status.append(f"🚨 {self.fraud_alerts_high} HIGH-severity fraud alerts")

        return "\n".join(status)


class PerceptionEngine:
    """
    Reads existing DB state to produce an AgentObservationData.

    Uses:
    - Last 2 KPISnapshot rows to derive current metrics and WoW changes
    - Active Anomaly rows to count signal severity
    - FraudAlert rows for fraud risk count
    """

    async def observe(self, session: AsyncSession, run_id: uuid.UUID) -> AgentObservationData:
        """Produce a structured observation of the current financial state."""

        kpis = await self._get_trailing_kpis(session, run_id, n=2)
        anomalies = await self._get_anomalies(session, run_id)
        fraud_alerts = await self._get_fraud_alerts(session, run_id)

        obs = AgentObservationData(observed_at=datetime.utcnow())

        if not kpis:
            return obs

        latest = kpis[0]

        # Core metrics
        obs.mrr = float(latest.mrr or 0)
        obs.burn_rate = float(latest.burn_rate or 0)
        obs.gross_margin = float(latest.gross_margin or 0) * 100  # fraction → %
        obs.churn_rate = float(latest.churn_rate or 0) * 100       # fraction → %
        obs.weeks_of_data = len(kpis)

        # LTV:CAC ratio
        ltv = float(latest.ltv or 0)
        cac = float(latest.cac or 0)
        obs.ltv_cac_ratio = ltv / cac if cac > 0 else 0.0

        # Runway estimate: net_burn = burn - mrr; runway = cash reserve / net_burn
        # We use a simple approximation: if net_burn > 0, runway ≈ 26 weeks of net burn
        # The actual cash position is managed by CashFlowForecaster;
        # here we derive from wow_delta if available, else fallback to 6mo estimate
        net_burn = max(obs.burn_rate - obs.mrr, 0.0)
        if net_burn > 0:
            # Estimate ~6 months of cash reserve (same as forecaster default)
            estimated_cash = net_burn * 26
            obs.runway_months = estimated_cash / (net_burn * 4.33)
        else:
            obs.runway_months = 24.0  # profitable → infinite for purposes of display, cap at 24

        # WoW changes
        if len(kpis) >= 2:
            prev = kpis[1]
            prev_burn = float(prev.burn_rate or 0)
            prev_mrr = float(prev.mrr or 0)

            if prev_burn > 0:
                obs.burn_change_pct = ((obs.burn_rate - prev_burn) / prev_burn) * 100
            if prev_mrr > 0:
                obs.mrr_change_pct = ((obs.mrr - prev_mrr) / prev_mrr) * 100

        # Anomaly counts
        for a in anomalies:
            if a.severity == "HIGH":
                obs.active_anomalies_high += 1
            elif a.severity == "MEDIUM":
                obs.active_anomalies_medium += 1
            else:
                obs.active_anomalies_low += 1

        # Fraud alert counts
        obs.fraud_alerts_count = len(fraud_alerts)
        obs.fraud_alerts_high = sum(1 for f in fraud_alerts if f.severity == "HIGH")

        # Store raw snapshot for DB persistence
        obs.raw_snapshot = {
            "mrr": obs.mrr,
            "burn_rate": obs.burn_rate,
            "gross_margin": obs.gross_margin,
            "churn_rate": obs.churn_rate,
            "ltv_cac_ratio": obs.ltv_cac_ratio,
            "runway_months": obs.runway_months,
            "burn_change_pct": obs.burn_change_pct,
            "mrr_change_pct": obs.mrr_change_pct,
            "anomalies_high": obs.active_anomalies_high,
            "fraud_alerts_high": obs.fraud_alerts_high,
        }

        return obs

    async def _get_trailing_kpis(
        self, session: AsyncSession, run_id: uuid.UUID, n: int = 2
    ) -> list[KPISnapshot]:
        result = await session.execute(
            select(KPISnapshot)
            .where(KPISnapshot.run_id == run_id)
            .order_by(KPISnapshot.week_start.desc())
            .limit(n)
        )
        return list(result.scalars().all())

    async def _get_anomalies(
        self, session: AsyncSession, run_id: uuid.UUID
    ) -> list[Anomaly]:
        result = await session.execute(
            select(Anomaly).where(Anomaly.run_id == run_id)
        )
        return list(result.scalars().all())

    async def _get_fraud_alerts(
        self, session: AsyncSession, run_id: uuid.UUID
    ) -> list[FraudAlert]:
        result = await session.execute(
            select(FraudAlert).where(FraudAlert.run_id == run_id)
        )
        return list(result.scalars().all())

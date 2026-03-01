"""
cash_flow_forecaster.py — 13-Week Rolling Cash Flow Forecast

Generates P10/P50/P90 cash balance bands by combining:
  - Current cash balance (from CashBalance table or estimated)
  - Committed expenses (rent, payroll, SaaS) from CommittedExpense table
  - Variable burn/inflow from trailing KPISnapshot history
  - Monte Carlo variance (N=500 paths)
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import CashBalance, CashFlowForecast, CommittedExpense, KPISnapshot


class CashFlowForecaster:
    """Generates a 13-week rolling cash flow forecast with P10/P50/P90 percentile bands."""

    N_SIMULATIONS = 500
    N_WEEKS = 13

    async def run(self, session: AsyncSession, run_id: uuid.UUID) -> dict:
        """Compute and persist a 13-week forecast for the given run_id.

        Returns a dict with current_cash, total_committed_weekly, weeks_until_zero_p50,
        forecast (list of 13 weekly dicts), and committed_expenses list.
        """
        # ── Fetch inputs ──────────────────────────────────────────────────────
        current_cash = await self._get_current_cash(session, run_id)
        committed = await self._get_committed_expenses(session, run_id)
        trailing_kpis = await self._get_trailing_kpis(session, run_id, weeks=8)

        # ── Compute weekly averages from KPI history ───────────────────────────
        if trailing_kpis:
            avg_mrr = float(
                np.mean([float(k.mrr or 0) for k in trailing_kpis])
            )
            burns = [float(k.burn_rate or 0) for k in trailing_kpis if (k.burn_rate or 0) > 0]
            avg_burn = float(np.mean(burns)) if burns else avg_mrr * 0.4
            # Floor std at 20% of avg_burn so bands are always visibly wide
            std_burn = max(
                float(np.std(burns)) if len(burns) > 1 else avg_burn * 0.20,
                avg_burn * 0.20,
            )
        else:
            avg_mrr = 0.0
            avg_burn = 0.0
            std_burn = 1000.0

        # ── Committed weekly outflow ───────────────────────────────────────────
        committed_weekly = self._compute_weekly_committed(committed)
        total_committed_weekly = sum(committed_weekly.values()) if committed_weekly else 0.0

        # Variable burn = max(0, avg_burn - committed_weekly_total)
        variable_burn = max(0.0, avg_burn - total_committed_weekly)

        # ── Monte Carlo simulation ─────────────────────────────────────────────
        today = date.today()
        rng = np.random.default_rng(seed=42)

        # Shape: (N_SIMULATIONS, N_WEEKS+1)  — week 0 is starting cash
        paths = np.zeros((self.N_SIMULATIONS, self.N_WEEKS + 1))
        paths[:, 0] = current_cash

        for w in range(1, self.N_WEEKS + 1):
            week_date = today + timedelta(weeks=w - 1)
            committed_this_week = self._committed_for_week(committed, week_date)

            # Stochastic weekly net change
            inflows = avg_mrr  # deterministic MRR
            variable_outflow = rng.normal(variable_burn, std_burn * 1.0, size=self.N_SIMULATIONS)
            variable_outflow = np.maximum(variable_outflow, 0)

            outflows = committed_this_week + variable_outflow
            net = inflows - outflows

            paths[:, w] = np.maximum(paths[:, w - 1] + net, 0)

        # ── Compute percentiles at each week ───────────────────────────────────
        forecast_rows: list[dict] = []
        for w in range(1, self.N_WEEKS + 1):
            week_start = today + timedelta(weeks=w - 1)
            week_date_committed = self._committed_for_week(committed, week_start)

            p10 = float(np.percentile(paths[:, w], 10))
            p50 = float(np.percentile(paths[:, w], 50))
            p90 = float(np.percentile(paths[:, w], 90))

            inflows_val = avg_mrr
            outflows_val = week_date_committed + variable_burn

            forecast_rows.append({
                "week_offset": w,
                "week_start": week_start,
                "predicted_balance_p10": round(p10, 2),
                "predicted_balance_p50": round(p50, 2),
                "predicted_balance_p90": round(p90, 2),
                "expected_inflows": round(inflows_val, 2),
                "expected_outflows": round(outflows_val, 2),
            })

        # ── Persist forecast rows (delete old, insert new) ─────────────────────
        await self._persist(session, run_id, forecast_rows)

        # ── Weeks until P50 hits zero ──────────────────────────────────────────
        weeks_until_zero = None
        for row in forecast_rows:
            if row["predicted_balance_p50"] <= 0:
                weeks_until_zero = row["week_offset"]
                break

        return {
            "current_cash": round(current_cash, 2),
            "total_committed_weekly": round(total_committed_weekly, 2),
            "weeks_until_zero_p50": weeks_until_zero,
            "forecast": forecast_rows,
            "committed_expenses": [
                {
                    "id": str(c.id),
                    "name": c.name,
                    "amount": float(c.amount),
                    "frequency": c.frequency,
                    "next_payment_date": c.next_payment_date.isoformat(),
                    "category": c.category,
                }
                for c in committed
            ],
        }

    # ── Private helpers ────────────────────────────────────────────────────────

    async def _get_current_cash(self, session: AsyncSession, run_id: uuid.UUID) -> float:
        """Return latest cash balance or estimate from burn history."""
        result = await session.execute(
            select(CashBalance)
            .where(CashBalance.run_id == run_id)
            .order_by(CashBalance.as_of_date.desc())
            .limit(1)
        )
        cb = result.scalar_one_or_none()
        if cb:
            return float(cb.balance)

        # Estimate: ~6 months of net burn (gross burn minus MRR)
        kpis = await self._get_trailing_kpis(session, run_id, weeks=4)
        if kpis:
            avg_burn = float(np.mean([float(k.burn_rate or 0) for k in kpis]))
            avg_mrr_val = float(np.mean([float(k.mrr or 0) for k in kpis]))
            avg_net_burn = max(avg_burn - avg_mrr_val, 0.0)
            return max(avg_net_burn * 26, 50_000.0)  # 6 months net-burn runway or $50K floor
        return 200_000.0  # safe default

    async def _get_committed_expenses(
        self, session: AsyncSession, run_id: uuid.UUID
    ) -> list[CommittedExpense]:
        result = await session.execute(
            select(CommittedExpense).where(CommittedExpense.run_id == run_id)
        )
        return list(result.scalars().all())

    async def _get_trailing_kpis(
        self, session: AsyncSession, run_id: uuid.UUID, weeks: int = 8
    ) -> list[KPISnapshot]:
        result = await session.execute(
            select(KPISnapshot)
            .where(KPISnapshot.run_id == run_id)
            .order_by(KPISnapshot.week_start.desc())
            .limit(weeks)
        )
        return list(result.scalars().all())

    def _compute_weekly_committed(
        self, expenses: list[CommittedExpense]
    ) -> dict[str, float]:
        """Convert each expense to weekly equivalent amount."""
        multipliers = {"weekly": 1.0, "monthly": 1 / 4.33, "quarterly": 1 / 13.0, "annual": 1 / 52.0}
        return {
            str(e.id): float(e.amount) * multipliers.get(e.frequency, 1 / 4.33)
            for e in expenses
        }

    def _committed_for_week(
        self, expenses: list[CommittedExpense], week_start: date
    ) -> float:
        """Sum of committed expenses due in the given week."""
        total = 0.0
        for e in expenses:
            weekly_amount = float(e.amount) * {
                "weekly": 1.0,
                "monthly": 1 / 4.33,
                "quarterly": 1 / 13.0,
                "annual": 1 / 52.0,
            }.get(e.frequency, 1 / 4.33)
            total += weekly_amount
        return total

    async def _persist(
        self, session: AsyncSession, run_id: uuid.UUID, forecast_rows: list[dict]
    ) -> None:
        """Delete existing forecast for run_id and insert fresh rows."""
        from sqlalchemy import delete
        await session.execute(
            delete(CashFlowForecast).where(CashFlowForecast.run_id == run_id)
        )
        for row in forecast_rows:
            session.add(CashFlowForecast(
                run_id=run_id,
                week_offset=row["week_offset"],
                week_start=row["week_start"],
                predicted_balance_p10=Decimal(str(row["predicted_balance_p10"])),
                predicted_balance_p50=Decimal(str(row["predicted_balance_p50"])),
                predicted_balance_p90=Decimal(str(row["predicted_balance_p90"])),
                expected_inflows=Decimal(str(row["expected_inflows"])),
                expected_outflows=Decimal(str(row["expected_outflows"])),
            ))
        await session.commit()

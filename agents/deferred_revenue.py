"""
deferred_revenue.py — GAAP Deferred Revenue Engine

Calculates monthly revenue recognition schedules for annual/multi-year SaaS contracts.
Tracks deferred revenue balance as contracts are recognized over time.
"""

from __future__ import annotations

import uuid
from calendar import monthrange
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import Contract, DeferredRevenueSchedule


class DeferredRevenueCalculator:
    """Computes GAAP-compliant revenue recognition schedules for SaaS contracts."""

    async def run(self, session: AsyncSession, run_id: uuid.UUID) -> dict:
        """Fetch all contracts for run_id, compute schedules, and return summary.

        Returns:
            {
              total_deferred_balance: float,
              current_month_recognized: float,
              contract_count: int,
              schedule_next_12_months: list[{month_start, recognized_revenue, deferred_balance}],
              contracts: list[contract dicts],
            }
        """
        contracts = await self._get_contracts(session, run_id)
        if not contracts:
            return {
                "total_deferred_balance": 0.0,
                "current_month_recognized": 0.0,
                "contract_count": 0,
                "schedule_next_12_months": [],
                "contracts": [],
            }

        today = date.today()
        current_month = date(today.year, today.month, 1)

        all_schedules: list[dict] = []
        for contract in contracts:
            schedule = self.calculate_schedule(contract)
            await self._persist_schedule(session, contract.id, schedule)
            all_schedules.extend(schedule)

        # Aggregate by month
        monthly: dict[date, dict[str, float]] = {}
        for row in all_schedules:
            m = row["month_start"]
            if m not in monthly:
                monthly[m] = {"recognized": 0.0, "deferred": 0.0}
            monthly[m]["recognized"] += row["recognized_revenue"]
            monthly[m]["deferred"] += row["deferred_balance"]

        # Current month recognized
        current_month_recognized = monthly.get(current_month, {}).get("recognized", 0.0)

        # Total deferred balance as of today (sum of deferred at current month)
        total_deferred = monthly.get(current_month, {}).get("deferred", 0.0)

        # Next 12 months schedule
        schedule_out: list[dict] = []
        for i in range(12):
            m = self._add_months(current_month, i)
            entry = monthly.get(m, {"recognized": 0.0, "deferred": 0.0})
            schedule_out.append({
                "month_start": m.isoformat(),
                "recognized_revenue": round(entry["recognized"], 2),
                "deferred_balance": round(entry["deferred"], 2),
            })

        return {
            "total_deferred_balance": round(total_deferred, 2),
            "current_month_recognized": round(current_month_recognized, 2),
            "contract_count": len(contracts),
            "schedule_next_12_months": schedule_out,
            "contracts": [self._contract_to_dict(c) for c in contracts],
        }

    def calculate_schedule(self, contract: Contract) -> list[dict]:
        """Generate monthly recognition rows for a contract.

        Args:
            contract: The Contract ORM object.

        Returns:
            List of dicts: {month_start, recognized_revenue, deferred_balance}
        """
        total_value = float(contract.total_value)
        start = contract.start_date
        end = contract.end_date

        # All month-start dates from start to end
        months = self._month_range(start, end)
        if not months:
            return []

        n_months = len(months)
        base_monthly = total_value / n_months

        rows: list[dict] = []
        deferred_remaining = total_value

        for i, month_start in enumerate(months):
            is_first = i == 0
            is_last = i == n_months - 1

            if is_first and start.day > 1:
                # Pro-rate first month by days remaining
                days_in_month = monthrange(month_start.year, month_start.month)[1]
                days_remaining = days_in_month - start.day + 1
                recognized = base_monthly * (days_remaining / days_in_month)
            elif is_last:
                # Last month gets the residual to avoid rounding drift
                recognized = deferred_remaining
            else:
                recognized = base_monthly

            recognized = round(recognized, 2)
            deferred_remaining = max(0.0, round(deferred_remaining - recognized, 2))

            rows.append({
                "month_start": month_start,
                "recognized_revenue": recognized,
                "deferred_balance": deferred_remaining,
            })

        return rows

    # ── Private helpers ────────────────────────────────────────────────────────

    async def _get_contracts(
        self, session: AsyncSession, run_id: uuid.UUID
    ) -> list[Contract]:
        result = await session.execute(
            select(Contract).where(Contract.run_id == run_id).order_by(Contract.start_date)
        )
        return list(result.scalars().all())

    async def _persist_schedule(
        self,
        session: AsyncSession,
        contract_id: uuid.UUID,
        schedule: list[dict],
    ) -> None:
        """Delete existing schedule for contract and insert fresh rows."""
        from sqlalchemy import delete
        await session.execute(
            delete(DeferredRevenueSchedule).where(
                DeferredRevenueSchedule.contract_id == contract_id
            )
        )
        for row in schedule:
            session.add(DeferredRevenueSchedule(
                contract_id=contract_id,
                month_start=row["month_start"],
                recognized_revenue=Decimal(str(row["recognized_revenue"])),
                deferred_balance=Decimal(str(row["deferred_balance"])),
            ))
        await session.commit()

    def _month_range(self, start: date, end: date) -> list[date]:
        """Return list of first-of-month dates from start to end (inclusive)."""
        months = []
        current = date(start.year, start.month, 1)
        end_month = date(end.year, end.month, 1)
        while current <= end_month:
            months.append(current)
            current = self._add_months(current, 1)
        return months

    def _add_months(self, d: date, n: int) -> date:
        month = d.month - 1 + n
        year = d.year + month // 12
        month = month % 12 + 1
        return date(year, month, 1)

    def _contract_to_dict(self, c: Contract) -> dict:
        return {
            "id": str(c.id),
            "run_id": str(c.run_id),
            "customer_id": c.customer_id,
            "total_value": float(c.total_value),
            "start_date": c.start_date.isoformat(),
            "end_date": c.end_date.isoformat(),
            "payment_terms": c.payment_terms,
        }

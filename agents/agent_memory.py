"""
agent_memory.py — AgentMemory

Persistent memory for the autonomous CFO agent using PostgreSQL.
Stores observations, plans, and action outcomes for learning.
No vector DB required — uses SQL aggregation for success rate tracking.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from agents.perception import AgentObservationData
from agents.planning import Action, ActionPlan, ActionType
from api.models import AgentAction, AgentObservation, AgentPlan


class AgentMemory:
    """Stores and retrieves agent observations, plans, and action outcomes."""

    # ── Store ─────────────────────────────────────────────────────────────────

    async def store_observation(
        self,
        session: AsyncSession,
        run_id: uuid.UUID,
        obs: AgentObservationData,
    ) -> AgentObservation:
        """Persist an observation snapshot to DB."""
        row = AgentObservation(
            run_id=run_id,
            observed_at=obs.observed_at,
            runway_months=obs.runway_months,
            burn_rate=obs.burn_rate,
            mrr=obs.mrr,
            burn_change_pct=obs.burn_change_pct,
            mrr_change_pct=obs.mrr_change_pct,
            active_anomalies_count=(
                obs.active_anomalies_high
                + obs.active_anomalies_medium
                + obs.active_anomalies_low
            ),
            fraud_alerts_count=obs.fraud_alerts_count,
            raw_snapshot=obs.raw_snapshot,
        )
        session.add(row)
        await session.flush()
        return row

    async def store_plan(
        self,
        session: AsyncSession,
        run_id: uuid.UUID,
        observation_id: uuid.UUID,
        plan: ActionPlan,
    ) -> AgentPlan:
        """Persist an action plan to DB."""
        row = AgentPlan(
            run_id=run_id,
            observation_id=observation_id,
            goal=plan.goal,
            plan_type=plan.plan_type,
            status="active",
            decision_reasoning=plan.decision_reasoning,
        )
        session.add(row)
        await session.flush()
        return row

    async def store_action(
        self,
        session: AsyncSession,
        plan_id: uuid.UUID,
        run_id: uuid.UUID,
        action: Action,
        result: dict[str, Any] | None = None,
        status: str = "executed",
    ) -> AgentAction:
        """Persist an action and its outcome to DB."""
        now = datetime.now(timezone.utc)
        row = AgentAction(
            plan_id=plan_id,
            run_id=run_id,
            action_type=action.type.value,
            params=action.params,
            status=status,
            requires_approval=action.requires_approval,
            approval_message=action.approval_message,
            result=result or {},
            created_at=now,
            executed_at=now if status == "executed" else None,
        )
        session.add(row)
        await session.flush()
        return row

    async def mark_plan_complete(self, session: AsyncSession, plan_id: uuid.UUID) -> None:
        """Mark a plan as completed after all actions run."""
        result = await session.execute(
            select(AgentPlan).where(AgentPlan.id == plan_id)
        )
        plan = result.scalar_one_or_none()
        if plan:
            plan.status = "completed"
            await session.flush()

    # ── Retrieve ──────────────────────────────────────────────────────────────

    async def get_recent_history(
        self,
        session: AsyncSession,
        run_id: uuid.UUID,
        n: int = 5,
    ) -> list[AgentAction]:
        """Return the last n agent actions for context in the reasoning prompt."""
        result = await session.execute(
            select(AgentAction)
            .where(AgentAction.run_id == run_id)
            .order_by(AgentAction.created_at.desc())
            .limit(n)
        )
        return list(result.scalars().all())

    async def get_recent_observations(
        self,
        session: AsyncSession,
        run_id: uuid.UUID,
        n: int = 20,
    ) -> list[AgentObservation]:
        """Return the last n observations."""
        result = await session.execute(
            select(AgentObservation)
            .where(AgentObservation.run_id == run_id)
            .order_by(AgentObservation.observed_at.desc())
            .limit(n)
        )
        return list(result.scalars().all())

    async def get_pending_approvals(
        self,
        session: AsyncSession,
        run_id: uuid.UUID,
    ) -> list[AgentAction]:
        """Return all actions waiting for founder approval."""
        result = await session.execute(
            select(AgentAction)
            .where(
                AgentAction.run_id == run_id,
                AgentAction.status == "pending_approval",
            )
            .order_by(AgentAction.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_action_by_id(
        self,
        session: AsyncSession,
        action_id: uuid.UUID,
    ) -> AgentAction | None:
        result = await session.execute(
            select(AgentAction).where(AgentAction.id == action_id)
        )
        return result.scalar_one_or_none()

    async def get_success_rate(
        self,
        session: AsyncSession,
        action_type: ActionType,
    ) -> float:
        """Calculate success rate for a given action type over the last 30 days."""
        from sqlalchemy import and_
        from datetime import timedelta

        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        result = await session.execute(
            select(
                func.count().label("total"),
                func.sum(
                    func.cast(AgentAction.status == "executed", func.Integer)
                    if False  # SQLite compat: use filter below
                    else 1
                ).filter(AgentAction.status == "executed").label("success"),
            ).where(
                and_(
                    AgentAction.action_type == action_type.value,
                    AgentAction.created_at >= cutoff,
                )
            )
        )
        row = result.first()
        if not row or not row.total:
            return 0.5
        return float(row.success or 0) / float(row.total)

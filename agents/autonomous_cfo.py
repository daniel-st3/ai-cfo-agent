"""
autonomous_cfo.py — AutonomousCFOAgent

Main agent loop orchestrating the 5 components:
  1. Perception  — observe current financial state from DB
  2. Reasoning   — Claude Haiku + tool_use decides what to do
  3. Planning    — convert decision into concrete action steps
  4. Execution   — run each action (alerts, Slack, report generation, approval gates)
  5. Memory      — store observation + plan + outcomes for learning

Usage::

    agent = AutonomousCFOAgent()
    result = await agent.run_cycle(session, run_id, company_name="Synapse AI")

Entry point for the API endpoint POST /agent/{run_id}/cycle.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from agents.agent_memory import AgentMemory
from agents.executor import ActionExecutor, ActionResult
from agents.perception import AgentObservationData, PerceptionEngine
from agents.planning import Action, ActionPlan, ActionType, PlanningEngine
from agents.reasoning import AgentDecision, ReasoningEngine

logger = logging.getLogger(__name__)


@dataclass
class AgentCycleResult:
    """Summary of what happened during one agent cycle."""

    run_id: uuid.UUID
    observation: AgentObservationData | None = None
    decision_tool: str = "do_nothing"
    decision_reasoning: str = ""
    plan_type: str = "all_clear"
    plan_goal: str = ""
    actions_executed: int = 0
    actions_pending_approval: int = 0
    actions_failed: int = 0
    error: str = ""
    completed_at: datetime = field(default_factory=datetime.utcnow)


class AutonomousCFOAgent:
    """
    Autonomous CFO agent that runs one monitoring cycle:
    perceive → reason → plan → execute → remember.
    """

    def __init__(self) -> None:
        self.perception = PerceptionEngine()
        self.reasoning = ReasoningEngine()
        self.planner = PlanningEngine()
        self.executor = ActionExecutor()
        self.memory = AgentMemory()

    async def run_cycle(
        self,
        session: AsyncSession,
        run_id: uuid.UUID,
        company_name: str = "the company",
        sector: str = "saas",
    ) -> AgentCycleResult:
        """Execute one full agent cycle. Returns a summary of what happened."""

        result = AgentCycleResult(run_id=run_id)

        try:
            # ── 1. PERCEIVE ────────────────────────────────────────────────────
            obs = await self.perception.observe(session, run_id)
            result.observation = obs
            logger.info(
                "[Agent] Observed: runway=%.1fmo burn=$%.0f/wk mrr=$%.0f/wk anomalies_high=%d",
                obs.runway_months, obs.burn_rate, obs.mrr, obs.active_anomalies_high,
            )

            # Persist observation
            obs_row = await self.memory.store_observation(session, run_id, obs)

            # ── 2. REASON ─────────────────────────────────────────────────────
            history = await self.memory.get_recent_history(session, run_id, n=5)
            decision: AgentDecision = await self.reasoning.analyze(obs, history, company_name)
            result.decision_tool = decision.tool_name
            result.decision_reasoning = decision.reasoning

            # ── 3. PLAN ───────────────────────────────────────────────────────
            plan: ActionPlan = await self.planner.create_plan(
                decision_type=decision.decision_type,
                decision_reasoning=decision.reasoning,
                obs_data=obs.raw_snapshot,
                company_name=company_name,
            )
            result.plan_type = plan.plan_type
            result.plan_goal = plan.goal
            logger.info("[Agent] Plan: %s — %s (%d actions)", plan.plan_type, plan.goal, len(plan.actions))

            # Persist plan
            plan_row = await self.memory.store_plan(session, run_id, obs_row.id, plan)

            # ── 4. EXECUTE ────────────────────────────────────────────────────
            for action in plan.actions:
                action_result, action_status = await self._execute_action(
                    action=action,
                    session=session,
                    run_id=run_id,
                    company_name=company_name,
                    obs=obs,
                    sector=sector,
                )

                # ── 5. REMEMBER ───────────────────────────────────────────────
                await self.memory.store_action(
                    session=session,
                    plan_id=plan_row.id,
                    run_id=run_id,
                    action=action,
                    result=action_result.to_dict(),
                    status=action_status,
                )

                if action_status == "executed":
                    result.actions_executed += 1
                elif action_status == "pending_approval":
                    result.actions_pending_approval += 1
                elif action_status == "failed":
                    result.actions_failed += 1

            # Mark plan complete if all actions resolved
            if result.actions_pending_approval == 0:
                await self.memory.mark_plan_complete(session, plan_row.id)

            await session.commit()
            logger.info(
                "[Agent] Cycle complete: %d executed, %d pending approval, %d failed",
                result.actions_executed,
                result.actions_pending_approval,
                result.actions_failed,
            )

        except Exception as exc:
            logger.exception("[Agent] Cycle error: %s", exc)
            result.error = str(exc)
            try:
                await session.rollback()
            except Exception:
                pass

        result.completed_at = datetime.utcnow()
        return result

    async def _execute_action(
        self,
        action: Action,
        session: AsyncSession,
        run_id: uuid.UUID,
        company_name: str,
        obs: AgentObservationData,
        sector: str,
    ) -> tuple[ActionResult, str]:
        """
        Execute a single action. Returns (ActionResult, status_string).

        If action.requires_approval → save as pending_approval, don't execute yet.
        """
        if action.requires_approval:
            # Write to DB as pending — founder approves/rejects via dashboard
            return (
                ActionResult(
                    success=True,
                    message="Pending founder approval",
                    data={"approval_message": action.approval_message},
                ),
                "pending_approval",
            )

        try:
            action_result = await self.executor.execute(
                action=action,
                session=session,
                run_id=run_id,
                company_name=company_name,
                months_runway=obs.runway_months,
                survival_score=max(0, min(100, int(100 - obs.runway_months * 4))),
                ruin_prob_6m=max(0.0, min(1.0, (6 - obs.runway_months) / 6))
                if obs.runway_months < 6 else 0.0,
                sector=sector,
            )
            status = "executed" if action_result.success else "failed"
        except Exception as exc:
            logger.warning("[Agent] Action %s failed: %s", action.type, exc)
            action_result = ActionResult(success=False, message=str(exc))
            status = "failed"

        return action_result, status

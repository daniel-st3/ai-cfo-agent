"""
reasoning.py — ReasoningEngine

Uses Claude Haiku with tool_use to analyze a financial observation and decide
what action (if any) to take. Claude picks from three tools:
  - create_action_plan  → specific scenario detected
  - send_immediate_alert → urgent, notify immediately
  - do_nothing          → all metrics healthy

Cost: ~$0.003 per cycle.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from agents.perception import AgentObservationData
from agents.planning import DecisionType
from api.models import AgentAction

logger = logging.getLogger(__name__)

AUTONOMOUS_CFO_SYSTEM_PROMPT = """\
You are an autonomous AI CFO agent monitoring a startup's finances 24/7.

Your job:
1. Analyze the current financial snapshot
2. Detect threats before they become critical
3. Decide what action to take (or do nothing if all is well)
4. Be proactive but not alarmist — only fire alerts for genuine issues

Decision framework:
- Runway < 3 months → CRITICAL (create_action_plan: critical_runway)
- Runway 3–6 months → WARNING (create_action_plan: warning_runway)
- Burn spike > 20% WoW with runway < 9 months → (create_action_plan: burn_spike)
- HIGH fraud alerts > 0 → (create_action_plan: fraud_detected)
- HIGH anomalies > 1 → (create_action_plan: anomaly_high)
- Everything looks fine → do_nothing

You MUST call exactly one tool. Do not output text outside of the tool call.
Be concise in your reasoning — 1–2 sentences max.
"""

AGENT_TOOLS = [
    {
        "name": "create_action_plan",
        "description": (
            "Create a multi-step action plan for a detected financial threat. "
            "Use this when you identify a specific risk requiring a response."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "plan_type": {
                    "type": "string",
                    "enum": [
                        "critical_runway",
                        "warning_runway",
                        "burn_spike",
                        "fraud_detected",
                        "anomaly_high",
                    ],
                    "description": "The type of threat requiring a plan",
                },
                "reasoning": {
                    "type": "string",
                    "description": "1-2 sentence explanation of why this plan is needed",
                },
            },
            "required": ["plan_type", "reasoning"],
        },
    },
    {
        "name": "send_immediate_alert",
        "description": (
            "Log an immediate alert for an urgent issue. "
            "Use this for issues that don't fit a specific plan template but are still concerning."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "severity": {
                    "type": "string",
                    "enum": ["CRITICAL", "WARNING", "INFO"],
                },
                "message": {
                    "type": "string",
                    "description": "The alert message for the founder",
                },
            },
            "required": ["severity", "message"],
        },
    },
    {
        "name": "do_nothing",
        "description": "No action required. All metrics are within healthy ranges.",
        "input_schema": {
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "description": "Brief confirmation of why no action is needed",
                },
            },
            "required": ["reason"],
        },
    },
]


@dataclass
class AgentDecision:
    """Structured result from the reasoning engine."""

    tool_name: str  # create_action_plan | send_immediate_alert | do_nothing
    tool_input: dict[str, Any]

    @property
    def decision_type(self) -> DecisionType:
        if self.tool_name == "create_action_plan":
            plan_type = self.tool_input.get("plan_type", "all_clear")
            return DecisionType(plan_type)
        elif self.tool_name == "send_immediate_alert":
            severity = self.tool_input.get("severity", "INFO")
            return DecisionType.BURN_SPIKE if severity == "WARNING" else DecisionType.CRITICAL_RUNWAY
        return DecisionType.ALL_CLEAR

    @property
    def reasoning(self) -> str:
        return (
            self.tool_input.get("reasoning")
            or self.tool_input.get("message")
            or self.tool_input.get("reason")
            or ""
        )

    @property
    def requires_action(self) -> bool:
        return self.tool_name != "do_nothing"


class ReasoningEngine:
    """
    Calls Claude Haiku with tool_use to decide what action (if any) to take
    based on the current financial observation.
    """

    async def analyze(
        self,
        obs: AgentObservationData,
        history: list[AgentAction],
        company_name: str = "the company",
    ) -> AgentDecision:
        """Send financial observation to Claude and parse its tool call decision."""

        history_text = self._format_history(history)
        user_prompt = self._build_prompt(obs, history_text, company_name)

        try:
            decision = await self._call_claude(user_prompt)
            logger.info(
                "[Agent] Decision: %s → %s",
                decision.tool_name,
                decision.tool_input.get("plan_type") or decision.tool_input.get("severity") or "all_clear",
            )
            return decision
        except Exception as exc:
            logger.warning("[Agent] Claude reasoning failed, falling back to rules: %s", exc)
            return self._rule_based_fallback(obs)

    async def _call_claude(self, user_prompt: str) -> AgentDecision:
        """Call Claude Haiku with tool_use and extract the tool call."""
        import anthropic

        client = anthropic.AsyncAnthropic()
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            system=AUTONOMOUS_CFO_SYSTEM_PROMPT,
            tools=AGENT_TOOLS,  # type: ignore[arg-type]
            messages=[{"role": "user", "content": user_prompt}],
        )

        # Extract the first tool_use block
        for block in response.content:
            if block.type == "tool_use":
                return AgentDecision(
                    tool_name=block.name,
                    tool_input=block.input if isinstance(block.input, dict) else {},
                )

        # If Claude returned text only (shouldn't happen), default to do_nothing
        text = " ".join(
            b.text for b in response.content if hasattr(b, "text")
        )
        logger.warning("[Agent] Claude returned text instead of tool call: %s", text[:200])
        return AgentDecision(
            tool_name="do_nothing",
            tool_input={"reason": "No tool call received from model"},
        )

    def _build_prompt(
        self,
        obs: AgentObservationData,
        history_text: str,
        company_name: str,
    ) -> str:
        prompt = f"Company: {company_name}\n\n"
        prompt += "Current Financial State:\n"
        prompt += obs.to_prompt_text()
        if history_text:
            prompt += f"\n\nRecent Agent Actions:\n{history_text}"
        prompt += "\n\nAnalyze the state above and call exactly one tool."
        return prompt

    def _format_history(self, history: list[AgentAction]) -> str:
        if not history:
            return ""
        lines = []
        for action in history[:5]:
            ts = action.created_at.strftime("%Y-%m-%d %H:%M") if action.created_at else "?"
            lines.append(f"- [{ts}] {action.action_type} → {action.status}")
        return "\n".join(lines)

    def _rule_based_fallback(self, obs: AgentObservationData) -> AgentDecision:
        """Deterministic fallback if Claude call fails."""
        if obs.runway_months < 3:
            return AgentDecision(
                tool_name="create_action_plan",
                tool_input={
                    "plan_type": "critical_runway",
                    "reasoning": f"Runway at {obs.runway_months:.1f} months — critical threshold.",
                },
            )
        if obs.runway_months < 6:
            return AgentDecision(
                tool_name="create_action_plan",
                tool_input={
                    "plan_type": "warning_runway",
                    "reasoning": f"Runway at {obs.runway_months:.1f} months — begin fundraising.",
                },
            )
        if obs.burn_change_pct > 20 and obs.runway_months < 9:
            return AgentDecision(
                tool_name="create_action_plan",
                tool_input={
                    "plan_type": "burn_spike",
                    "reasoning": f"Burn jumped {obs.burn_change_pct:.1f}% WoW.",
                },
            )
        if obs.fraud_alerts_high > 0:
            return AgentDecision(
                tool_name="create_action_plan",
                tool_input={
                    "plan_type": "fraud_detected",
                    "reasoning": f"{obs.fraud_alerts_high} high-severity fraud alerts detected.",
                },
            )
        return AgentDecision(
            tool_name="do_nothing",
            tool_input={"reason": "All metrics within healthy ranges."},
        )

"""
planning.py — PlanningEngine

Converts a ReasoningEngine decision into a concrete ActionPlan with
a sequence of Action steps. Uses pre-defined templates per decision type.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class ActionType(str, Enum):
    LOG_ALERT = "log_alert"                    # Write alert to DB action log (always approved)
    SEND_SLACK_WEBHOOK = "send_slack_webhook"  # POST to SLACK_WEBHOOK_URL (always approved)
    SEND_EMAIL = "send_email"                  # Send email via SMTP (always approved for reminders)
    GENERATE_VC_MEMO = "generate_vc_memo"      # Call existing generate_vc_memo() (always approved)
    GENERATE_INVESTOR_UPDATE = "generate_investor_update"  # Call existing generate_investor_update()
    CREATE_APPROVAL = "create_approval"        # Write pending_approval action — founder must OK


class DecisionType(str, Enum):
    CRITICAL_RUNWAY = "critical_runway"
    WARNING_RUNWAY = "warning_runway"
    BURN_SPIKE = "burn_spike"
    FRAUD_DETECTED = "fraud_detected"
    ANOMALY_HIGH = "anomaly_high"
    ALL_CLEAR = "all_clear"


@dataclass
class Action:
    type: ActionType
    params: dict = field(default_factory=dict)
    requires_approval: bool = False
    approval_message: str = ""


@dataclass
class ActionPlan:
    goal: str
    plan_type: str
    actions: list[Action] = field(default_factory=list)
    decision_reasoning: str = ""


class PlanningEngine:
    """Creates concrete action plans from agent decisions."""

    async def create_plan(
        self,
        decision_type: DecisionType,
        decision_reasoning: str,
        obs_data: dict,
        company_name: str = "the company",
    ) -> ActionPlan:
        """Map a decision type to a pre-defined action plan template."""

        if decision_type == DecisionType.CRITICAL_RUNWAY:
            return self._plan_critical_runway(decision_reasoning, obs_data, company_name)

        elif decision_type == DecisionType.WARNING_RUNWAY:
            return self._plan_warning_runway(decision_reasoning, obs_data, company_name)

        elif decision_type == DecisionType.BURN_SPIKE:
            return self._plan_burn_spike(decision_reasoning, obs_data, company_name)

        elif decision_type == DecisionType.FRAUD_DETECTED:
            return self._plan_fraud_detected(decision_reasoning, obs_data, company_name)

        elif decision_type == DecisionType.ANOMALY_HIGH:
            return self._plan_anomaly_high(decision_reasoning, obs_data, company_name)

        else:  # ALL_CLEAR
            return self._plan_all_clear(decision_reasoning)

    # ── Plan templates ────────────────────────────────────────────────────────

    def _plan_critical_runway(self, reasoning: str, obs: dict, company: str) -> ActionPlan:
        runway = obs.get("runway_months", 0)
        return ActionPlan(
            goal=f"Emergency response: runway at {runway:.1f} months",
            plan_type="critical_runway",
            decision_reasoning=reasoning,
            actions=[
                Action(
                    type=ActionType.LOG_ALERT,
                    params={
                        "severity": "CRITICAL",
                        "title": f"☠ CRITICAL: {runway:.1f}mo runway",
                        "message": (
                            f"{company} has only {runway:.1f} months of runway. "
                            "Immediate action required: fundraising, revenue acceleration, or burn cuts."
                        ),
                    },
                ),
                Action(
                    type=ActionType.SEND_SLACK_WEBHOOK,
                    params={
                        "text": (
                            f"🚨 *CRITICAL RUNWAY ALERT — {company}*\n"
                            f"Only *{runway:.1f} months* remaining.\n"
                            f"Burn: ${obs.get('burn_rate', 0):,.0f}/wk | "
                            f"MRR: ${obs.get('mrr', 0):,.0f}/wk\n"
                            f"_AI CFO Agent has logged this alert. Check dashboard._"
                        ),
                    },
                ),
                Action(
                    type=ActionType.GENERATE_VC_MEMO,
                    params={
                        "reason": "Emergency fundraising preparation",
                        "months_runway": runway,
                    },
                    requires_approval=False,  # auto-generate, founder reviews in dashboard
                ),
            ],
        )

    def _plan_warning_runway(self, reasoning: str, obs: dict, company: str) -> ActionPlan:
        runway = obs.get("runway_months", 0)
        return ActionPlan(
            goal=f"Fundraising preparation: runway at {runway:.1f} months",
            plan_type="warning_runway",
            decision_reasoning=reasoning,
            actions=[
                Action(
                    type=ActionType.LOG_ALERT,
                    params={
                        "severity": "WARNING",
                        "title": f"⚠ Runway warning: {runway:.1f} months",
                        "message": (
                            f"{company} has {runway:.1f} months runway. "
                            "Begin fundraising conversations now."
                        ),
                    },
                ),
                Action(
                    type=ActionType.GENERATE_INVESTOR_UPDATE,
                    params={
                        "reason": "Proactive fundraising prep — runway < 6 months",
                        "months_runway": runway,
                    },
                    requires_approval=False,
                ),
                Action(
                    type=ActionType.SEND_SLACK_WEBHOOK,
                    params={
                        "text": (
                            f"⚠️ *Runway Warning — {company}*\n"
                            f"*{runway:.1f} months* remaining.\n"
                            f"Agent has drafted an investor update. Check dashboard."
                        ),
                    },
                ),
            ],
        )

    def _plan_burn_spike(self, reasoning: str, obs: dict, company: str) -> ActionPlan:
        burn = obs.get("burn_rate", 0)
        burn_change = obs.get("burn_change_pct", 0)
        return ActionPlan(
            goal=f"Investigate burn spike: +{burn_change:.1f}% WoW",
            plan_type="burn_spike",
            decision_reasoning=reasoning,
            actions=[
                Action(
                    type=ActionType.LOG_ALERT,
                    params={
                        "severity": "WARNING",
                        "title": f"Burn spike detected: +{burn_change:.1f}%",
                        "message": (
                            f"Burn rate jumped {burn_change:.1f}% WoW to ${burn:,.0f}/wk. "
                            "Review expenses and identify drivers."
                        ),
                    },
                ),
                Action(
                    type=ActionType.CREATE_APPROVAL,
                    params={
                        "action_description": "Flag discretionary expenses for founder review",
                        "estimated_impact": f"Potential burn reduction from ${burn:,.0f}/wk",
                    },
                    requires_approval=True,
                    approval_message=(
                        f"Burn spike of +{burn_change:.1f}% detected (now ${burn:,.0f}/wk). "
                        "Approve to flag non-essential expenses for review and "
                        "add this to your weekly review checklist."
                    ),
                ),
            ],
        )

    def _plan_fraud_detected(self, reasoning: str, obs: dict, company: str) -> ActionPlan:
        count = obs.get("fraud_alerts_high", 0)
        return ActionPlan(
            goal=f"Fraud response: {count} high-severity alert(s)",
            plan_type="fraud_detected",
            decision_reasoning=reasoning,
            actions=[
                Action(
                    type=ActionType.LOG_ALERT,
                    params={
                        "severity": "CRITICAL",
                        "title": f"🚨 Fraud Alert: {count} HIGH-severity pattern(s)",
                        "message": (
                            f"ML fraud detection flagged {count} high-severity transaction pattern(s). "
                            "Review the Fraud Monitor section immediately."
                        ),
                    },
                ),
                Action(
                    type=ActionType.SEND_SLACK_WEBHOOK,
                    params={
                        "text": (
                            f"🚨 *Fraud Alert — {company}*\n"
                            f"*{count}* high-severity suspicious pattern(s) detected.\n"
                            "Review Fraud Monitor in dashboard immediately."
                        ),
                    },
                ),
            ],
        )

    def _plan_anomaly_high(self, reasoning: str, obs: dict, company: str) -> ActionPlan:
        count = obs.get("anomalies_high", 0)
        return ActionPlan(
            goal=f"Anomaly investigation: {count} HIGH-severity metric(s)",
            plan_type="anomaly_high",
            decision_reasoning=reasoning,
            actions=[
                Action(
                    type=ActionType.LOG_ALERT,
                    params={
                        "severity": "WARNING",
                        "title": f"Anomaly: {count} HIGH-severity metric spike(s)",
                        "message": (
                            f"IsolationForest / Chronos detected {count} statistically significant "
                            "anomalies in your financial metrics. Review Anomaly Detection."
                        ),
                    },
                ),
            ],
        )

    def _plan_all_clear(self, reasoning: str) -> ActionPlan:
        return ActionPlan(
            goal="No action required — financial state healthy",
            plan_type="all_clear",
            decision_reasoning=reasoning,
            actions=[
                Action(
                    type=ActionType.LOG_ALERT,
                    params={
                        "severity": "INFO",
                        "title": "✓ All Clear",
                        "message": f"Financial metrics within normal range. {reasoning}",
                    },
                ),
            ],
        )

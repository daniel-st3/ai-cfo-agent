"""
executor.py — ActionExecutor

Executes agent actions via real integrations (Slack, email, report generation)
or creates in-app approval requests. Safely falls back to logging when
external services (SMTP, Slack) are not configured.
"""

from __future__ import annotations

import asyncio
import logging
import os
import smtplib
import uuid
from datetime import datetime, timezone
from email.mime.text import MIMEText
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from agents.planning import Action, ActionType

logger = logging.getLogger(__name__)


class ActionResult:
    """Result of executing an action."""

    def __init__(
        self,
        success: bool,
        message: str = "",
        data: dict[str, Any] | None = None,
    ) -> None:
        self.success = success
        self.message = message
        self.data = data or {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "message": self.message,
            "data": self.data,
        }


class ActionExecutor:
    """
    Executes individual Action objects.

    External integrations degrade gracefully if env vars are missing:
    - SLACK_WEBHOOK_URL → Slack notifications (skipped if not set, logs instead)
    - SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM → Email
    - If SMTP not configured → email is logged only
    """

    async def execute(
        self,
        action: Action,
        session: AsyncSession,
        run_id: uuid.UUID,
        company_name: str = "",
        months_runway: float = 0.0,
        survival_score: int = 50,
        ruin_prob_6m: float = 0.0,
        sector: str = "saas",
    ) -> ActionResult:
        """Dispatch to the correct handler based on action type."""

        if action.type == ActionType.LOG_ALERT:
            return self._log_alert(action)

        elif action.type == ActionType.SEND_SLACK_WEBHOOK:
            return await self._send_slack(action)

        elif action.type == ActionType.SEND_EMAIL:
            return await self._send_email(action)

        elif action.type == ActionType.GENERATE_VC_MEMO:
            return await self._generate_vc_memo(
                action, session, run_id, company_name, sector,
                months_runway, survival_score, ruin_prob_6m,
            )

        elif action.type == ActionType.GENERATE_INVESTOR_UPDATE:
            return await self._generate_investor_update(
                action, session, run_id, company_name, sector,
                months_runway, survival_score,
            )

        elif action.type == ActionType.CREATE_APPROVAL:
            # Caller handles DB write; executor just marks success
            return ActionResult(
                success=True,
                message="Approval request created — awaiting founder decision",
                data={"status": "pending_approval"},
            )

        else:
            return ActionResult(success=False, message=f"Unknown action type: {action.type}")

    # ── Handlers ─────────────────────────────────────────────────────────────

    def _log_alert(self, action: Action) -> ActionResult:
        severity = action.params.get("severity", "INFO")
        title = action.params.get("title", "Agent Alert")
        message = action.params.get("message", "")
        log_fn = logger.warning if severity in ("WARNING", "CRITICAL") else logger.info
        log_fn("[Agent] %s — %s", title, message)
        return ActionResult(
            success=True,
            message=f"Alert logged: {title}",
            data={"severity": severity, "title": title, "message": message},
        )

    async def _send_slack(self, action: Action) -> ActionResult:
        webhook_url = os.getenv("SLACK_WEBHOOK_URL", "")
        text = action.params.get("text", "AI CFO Agent notification")

        if not webhook_url:
            logger.info("[Agent] Slack not configured — would send: %s", text[:120])
            return ActionResult(
                success=True,
                message="Slack not configured — alert logged only",
                data={"text": text, "delivered": False},
            )

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(webhook_url, json={"text": text})
                resp.raise_for_status()
            return ActionResult(
                success=True,
                message="Slack notification delivered",
                data={"text": text, "delivered": True},
            )
        except Exception as exc:
            logger.warning("[Agent] Slack delivery failed: %s", exc)
            return ActionResult(
                success=False,
                message=f"Slack delivery failed: {exc}",
                data={"text": text, "delivered": False},
            )

    async def _send_email(self, action: Action) -> ActionResult:
        smtp_host = os.getenv("SMTP_HOST", "")
        to_addr = action.params.get("to", "")
        subject = action.params.get("subject", "AI CFO Alert")
        body = action.params.get("body", "")

        if not smtp_host or not to_addr:
            logger.info("[Agent] Email not configured — would send to %s: %s", to_addr, subject)
            return ActionResult(
                success=True,
                message="Email not configured — alert logged only",
                data={"to": to_addr, "subject": subject, "delivered": False},
            )

        try:
            msg = MIMEText(body)
            msg["Subject"] = subject
            msg["From"] = os.getenv("SMTP_FROM", "cfo-agent@yourdomain.com")
            msg["To"] = to_addr

            port = int(os.getenv("SMTP_PORT", "587"))
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                self._smtp_send,
                smtp_host, port,
                os.getenv("SMTP_USER", ""),
                os.getenv("SMTP_PASS", ""),
                msg,
            )
            return ActionResult(
                success=True,
                message=f"Email sent to {to_addr}",
                data={"to": to_addr, "subject": subject, "delivered": True},
            )
        except Exception as exc:
            logger.warning("[Agent] Email send failed: %s", exc)
            return ActionResult(
                success=False,
                message=f"Email send failed: {exc}",
            )

    def _smtp_send(
        self,
        host: str,
        port: int,
        user: str,
        password: str,
        msg: MIMEText,
    ) -> None:
        with smtplib.SMTP(host, port) as smtp:
            smtp.ehlo()
            smtp.starttls()
            if user and password:
                smtp.login(user, password)
            smtp.send_message(msg)

    async def _generate_vc_memo(
        self,
        action: Action,
        session: AsyncSession,
        run_id: uuid.UUID,
        company_name: str,
        sector: str,
        months_runway: float,
        survival_score: int,
        ruin_prob_6m: float,
    ) -> ActionResult:
        try:
            from agents.insight_writer import generate_vc_memo
            from api.models import KPISnapshot
            from sqlalchemy import select

            result = await session.execute(
                select(KPISnapshot)
                .where(KPISnapshot.run_id == run_id)
                .order_by(KPISnapshot.week_start.desc())
                .limit(8)
            )
            kpis = list(result.scalars().all())

            memo = await generate_vc_memo(
                kpi_snapshots=kpis,
                months_runway=months_runway,
                survival_score=survival_score,
                ruin_probability_6m=ruin_prob_6m,
                company_name=company_name,
                sector=sector,
            )
            return ActionResult(
                success=True,
                message="VC memo generated — available in dashboard",
                data={"memo": memo},
            )
        except Exception as exc:
            logger.warning("[Agent] VC memo generation failed: %s", exc)
            return ActionResult(success=False, message=f"VC memo failed: {exc}")

    async def _generate_investor_update(
        self,
        action: Action,
        session: AsyncSession,
        run_id: uuid.UUID,
        company_name: str,
        sector: str,
        months_runway: float,
        survival_score: int,
    ) -> ActionResult:
        try:
            from agents.insight_writer import generate_investor_update
            from api.models import KPISnapshot
            from sqlalchemy import select

            result = await session.execute(
                select(KPISnapshot)
                .where(KPISnapshot.run_id == run_id)
                .order_by(KPISnapshot.week_start.desc())
                .limit(8)
            )
            kpis = list(result.scalars().all())

            update = await generate_investor_update(
                kpi_snapshots=kpis,
                months_runway=months_runway,
                survival_score=survival_score,
                company_name=company_name,
                sector=sector,
            )
            return ActionResult(
                success=True,
                message="Investor update generated — available in dashboard",
                data={"update": update},
            )
        except Exception as exc:
            logger.warning("[Agent] Investor update generation failed: %s", exc)
            return ActionResult(success=False, message=f"Investor update failed: {exc}")

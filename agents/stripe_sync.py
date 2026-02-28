"""
stripe_sync.py — Stripe OAuth Integration

Handles Stripe OAuth flow, token storage/encryption, and subscription data sync.
Runs in demo mode if STRIPE_CLIENT_ID is not set — returns placeholder URLs.
"""

from __future__ import annotations

import os
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import Integration, RawFinancial, SyncLog

STRIPE_OAUTH_URL = "https://connect.stripe.com/oauth/authorize"
STRIPE_TOKEN_URL = "https://connect.stripe.com/oauth/token"
STRIPE_API_BASE = "https://api.stripe.com/v1"


def _get_fernet():
    """Return a Fernet cipher or None if cryptography is not available."""
    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception:
        return None


def _encrypt(token: str) -> str:
    fernet = _get_fernet()
    if not fernet:
        return token  # store plaintext in dev mode
    return fernet.encrypt(token.encode()).decode()


def _decrypt(token_enc: str) -> str:
    fernet = _get_fernet()
    if not fernet:
        return token_enc
    try:
        return fernet.decrypt(token_enc.encode()).decode()
    except Exception:
        return token_enc


class StripeIngestionAgent:
    """Manages Stripe OAuth and subscription data synchronization."""

    @property
    def _demo_mode(self) -> bool:
        return not os.environ.get("STRIPE_CLIENT_ID")

    def get_authorization_url(self) -> dict:
        """Return the Stripe OAuth authorization URL.

        In demo mode (no STRIPE_CLIENT_ID), returns a placeholder URL with demo_mode=True.
        """
        if self._demo_mode:
            return {
                "authorization_url": "https://connect.stripe.com/oauth/authorize?demo=1",
                "demo_mode": True,
            }

        client_id = os.environ["STRIPE_CLIENT_ID"]
        redirect_uri = os.environ.get("STRIPE_REDIRECT_URI", "http://localhost:3000/integrations/stripe/callback")
        state = str(uuid.uuid4())

        url = (
            f"{STRIPE_OAUTH_URL}"
            f"?response_type=code"
            f"&client_id={client_id}"
            f"&scope=read_only"
            f"&redirect_uri={redirect_uri}"
            f"&state={state}"
        )
        return {"authorization_url": url, "demo_mode": False}

    async def exchange_code_for_token(
        self, session: AsyncSession, code: str
    ) -> Integration:
        """Exchange OAuth code for access_token and persist Integration record."""
        if self._demo_mode:
            return await self._create_demo_integration(session)

        client_secret = os.environ.get("STRIPE_CLIENT_SECRET", "")
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                STRIPE_TOKEN_URL,
                data={"code": code, "grant_type": "authorization_code"},
                auth=(client_secret, ""),
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()

        access_token = data.get("access_token", "")
        integration = Integration(
            platform="stripe",
            access_token_enc=_encrypt(access_token),
            status="active",
            company_name=data.get("stripe_user_id", "Stripe Account"),
        )
        session.add(integration)
        await session.commit()
        return integration

    async def sync(
        self, session: AsyncSession, run_id: uuid.UUID
    ) -> dict:
        """Sync Stripe subscriptions to RawFinancial rows for the given run_id.

        Returns: {rows_synced: int, status: str, message: str}
        """
        if self._demo_mode:
            return await self._sync_demo_data(session, run_id)

        result = await session.execute(
            select(Integration).where(Integration.platform == "stripe", Integration.status == "active").limit(1)
        )
        integration = result.scalar_one_or_none()
        if not integration:
            return {"rows_synced": 0, "status": "error", "message": "No active Stripe integration. Connect first."}

        access_token = _decrypt(integration.access_token_enc or "")
        rows_synced = 0

        try:
            # Clear existing stripe rows for this run to avoid duplicates on re-sync
            await session.execute(
                delete(RawFinancial).where(
                    RawFinancial.run_id == run_id,
                    RawFinancial.source_file == "stripe_sync",
                )
            )
            await session.flush()

            async with httpx.AsyncClient() as client:
                # Paginate through all active + canceled subscriptions for history
                starting_after: str | None = None
                while True:
                    params: dict = {"limit": 100}
                    if starting_after:
                        params["starting_after"] = starting_after

                    resp = await client.get(
                        f"{STRIPE_API_BASE}/subscriptions",
                        params=params,
                        auth=(access_token, ""),
                        timeout=30,
                    )
                    resp.raise_for_status()
                    data = resp.json()

                    for sub in data.get("data", []):
                        history_rows = self._subscription_to_raw_history(sub, run_id)
                        for row in history_rows:
                            session.add(row)
                        rows_synced += len(history_rows)

                    if not data.get("has_more"):
                        break
                    starting_after = data["data"][-1]["id"]

            await session.commit()

            # Update last_sync_at
            integration.last_sync_at = datetime.utcnow()
            integration.status = "active"
            await session.commit()

            # Log sync
            session.add(SyncLog(
                integration_id=integration.id,
                status="success",
                rows_synced=rows_synced,
            ))
            await session.commit()

            return {"rows_synced": rows_synced, "status": "success", "message": f"Synced {rows_synced} subscriptions"}

        except Exception as e:
            session.add(SyncLog(
                integration_id=integration.id,
                status="error",
                rows_synced=rows_synced,
                error_message=str(e),
            ))
            await session.commit()
            return {"rows_synced": rows_synced, "status": "error", "message": str(e)}

    def _subscription_to_raw_history(
        self, sub: dict, run_id: uuid.UUID
    ) -> list[RawFinancial]:
        """Generate one RawFinancial row per week for the full subscription lifetime."""
        try:
            item = sub.get("items", {}).get("data", [{}])[0]
            amount_cents = item.get("price", {}).get("unit_amount", 0) or 0
            interval = item.get("price", {}).get("recurring", {}).get("interval", "month")

            amount_usd = amount_cents / 100.0
            if interval == "year":
                weekly_amount = Decimal(str(round(amount_usd / 52, 4)))
            elif interval == "month":
                weekly_amount = Decimal(str(round(amount_usd / 4.33, 4)))
            else:
                weekly_amount = Decimal(str(round(amount_usd, 4)))

            start_ts = sub.get("created") or sub.get("current_period_start", 0)
            start = date.fromtimestamp(start_ts)

            cancel_ts = sub.get("canceled_at") or sub.get("ended_at")
            end = date.fromtimestamp(cancel_ts) if cancel_ts else date.today()

            customer_id = sub.get("customer", "")

            rows: list[RawFinancial] = []
            week = start
            while week <= end:
                rows.append(RawFinancial(
                    run_id=run_id,
                    date=week,
                    category="subscription_revenue",
                    amount=weekly_amount,
                    customer_id=customer_id,
                    source_file="stripe_sync",
                ))
                week += timedelta(weeks=1)
            return rows
        except Exception:
            return []

    async def _create_demo_integration(self, session: AsyncSession) -> Integration:
        integration = Integration(
            platform="stripe",
            access_token_enc=_encrypt("demo_token"),
            status="active",
            company_name="Demo Stripe Account",
        )
        session.add(integration)
        await session.commit()
        return integration

    async def _sync_demo_data(self, session: AsyncSession, run_id: uuid.UUID) -> dict:
        """Insert mock Stripe data in demo mode."""
        from decimal import Decimal
        from datetime import date, timedelta

        today = date.today()
        demo_rows = [
            RawFinancial(
                run_id=run_id,
                date=today - timedelta(weeks=i),
                category="subscription_revenue",
                amount=Decimal(str(round(5000 + i * 200, 2))),
                customer_id=f"stripe_cust_{i:03d}",
                source_file="stripe_demo",
            )
            for i in range(4)
        ]
        for row in demo_rows:
            session.add(row)
        await session.commit()
        return {"rows_synced": len(demo_rows), "status": "success", "message": "Demo: 4 mock subscription rows synced"}

    async def get_status(self, session: AsyncSession) -> dict:
        """Return current integration status."""
        result = await session.execute(
            select(Integration).where(Integration.platform == "stripe").order_by(Integration.last_sync_at.desc()).limit(1)
        )
        integration = result.scalar_one_or_none()
        if not integration:
            return {"platform": "stripe", "status": "not_connected", "last_sync_at": None, "rows_synced": 0}

        # Get last sync log
        log_result = await session.execute(
            select(SyncLog).where(SyncLog.integration_id == integration.id).order_by(SyncLog.created_at.desc()).limit(1)
        )
        log = log_result.scalar_one_or_none()

        return {
            "platform": "stripe",
            "status": integration.status,
            "company_name": integration.company_name,
            "last_sync_at": integration.last_sync_at.isoformat() if integration.last_sync_at else None,
            "rows_synced": log.rows_synced if log else 0,
        }

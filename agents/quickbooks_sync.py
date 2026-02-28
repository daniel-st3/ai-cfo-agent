"""
quickbooks_sync.py — QuickBooks Online OAuth Integration

Handles QuickBooks OAuth 2.0 flow, P&L sync, and account-to-category mapping.
Runs in demo mode if QUICKBOOKS_CLIENT_ID is not set.
"""

from __future__ import annotations

import os
import uuid
from datetime import date, datetime, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import Integration, RawFinancial, SyncLog

QB_OAUTH_URL = "https://appcenter.intuit.com/connect/oauth2"
QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
QB_API_BASE = "https://quickbooks.api.intuit.com/v3/company"

# Maps QuickBooks account names → RawFinancial categories
ACCOUNT_MAPPING: dict[str, str] = {
    "Sales": "subscription_revenue",
    "Services Revenue": "subscription_revenue",
    "Subscription Revenue": "subscription_revenue",
    "Cost of Goods Sold": "cogs",
    "Cost of Sales": "cogs",
    "Payroll Expenses": "salary_expense",
    "Salaries and Wages": "salary_expense",
    "Employee Benefits": "salary_expense",
    "Advertising": "marketing_expense",
    "Marketing": "marketing_expense",
    "Software": "software_expense",
    "Software Subscriptions": "software_expense",
    "Rent": "office_rent",
    "Office Rent": "office_rent",
    "Contractors": "contractor_expense",
    "Professional Services": "professional_services",
    "Taxes": "tax_payment",
    "Tax Payments": "tax_payment",
    "Refunds": "churn_refund",
    "Customer Refunds": "churn_refund",
}


def _encrypt_token(token: str) -> str:
    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        return token
    try:
        from cryptography.fernet import Fernet
        return Fernet(key.encode()).encrypt(token.encode()).decode()
    except Exception:
        return token


def _decrypt_token(token_enc: str) -> str:
    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        return token_enc
    try:
        from cryptography.fernet import Fernet
        return Fernet(key.encode()).decrypt(token_enc.encode()).decode()
    except Exception:
        return token_enc


class QuickBooksIngestionAgent:
    """Manages QuickBooks Online OAuth and P&L data synchronization."""

    @property
    def _demo_mode(self) -> bool:
        return not os.environ.get("QUICKBOOKS_CLIENT_ID")

    def get_authorization_url(self, state: str = "") -> dict:
        """Return the QuickBooks OAuth authorization URL.

        In demo mode, returns a placeholder URL with demo_mode=True.
        """
        if self._demo_mode:
            return {
                "authorization_url": "https://appcenter.intuit.com/connect/oauth2?demo=1",
                "demo_mode": True,
            }

        client_id = os.environ["QUICKBOOKS_CLIENT_ID"]
        redirect_uri = os.environ.get("QUICKBOOKS_REDIRECT_URI", "http://localhost:3000/integrations/quickbooks/callback")
        if not state:
            state = str(uuid.uuid4())

        url = (
            f"{QB_OAUTH_URL}"
            f"?client_id={client_id}"
            f"&redirect_uri={redirect_uri}"
            f"&response_type=code"
            f"&scope=com.intuit.quickbooks.accounting"
            f"&state={state}"
        )
        return {"authorization_url": url, "demo_mode": False}

    async def exchange_code_for_token(
        self, session: AsyncSession, code: str, realm_id: str
    ) -> Integration:
        """Exchange OAuth code for tokens and persist Integration record."""
        if self._demo_mode:
            return await self._create_demo_integration(session)

        client_id = os.environ["QUICKBOOKS_CLIENT_ID"]
        client_secret = os.environ["QUICKBOOKS_CLIENT_SECRET"]
        redirect_uri = os.environ.get("QUICKBOOKS_REDIRECT_URI", "http://localhost:3000/integrations/quickbooks/callback")

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                QB_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
                auth=(client_id, client_secret),
                headers={"Accept": "application/json"},
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()

        integration = Integration(
            platform="quickbooks",
            access_token_enc=_encrypt_token(data.get("access_token", "")),
            refresh_token_enc=_encrypt_token(data.get("refresh_token", "")),
            realm_id=realm_id,
            status="active",
        )
        session.add(integration)
        await session.commit()
        return integration

    async def sync(
        self,
        session: AsyncSession,
        run_id: uuid.UUID,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict:
        """Sync QuickBooks P&L to RawFinancial rows.

        Returns: {rows_synced: int, status: str, message: str}
        """
        if self._demo_mode:
            return await self._sync_demo_data(session, run_id)

        result = await session.execute(
            select(Integration).where(
                Integration.platform == "quickbooks",
                Integration.status == "active",
            ).limit(1)
        )
        integration = result.scalar_one_or_none()
        if not integration:
            return {"rows_synced": 0, "status": "error", "message": "No active QuickBooks integration."}

        access_token = _decrypt_token(integration.access_token_enc or "")
        realm_id = integration.realm_id or ""

        if not start_date:
            start_date = date.today() - timedelta(days=365)
        if not end_date:
            end_date = date.today()

        rows_synced = 0
        try:
            try:
                rows_synced = await self._sync_profit_and_loss(
                    session, run_id, access_token, realm_id, start_date, end_date
                )
            except httpx.HTTPStatusError as token_err:
                if token_err.response.status_code == 401:
                    refreshed = await self._refresh_access_token(session, integration)
                    if refreshed:
                        access_token = _decrypt_token(integration.access_token_enc or "")
                        rows_synced = await self._sync_profit_and_loss(
                            session, run_id, access_token, realm_id, start_date, end_date
                        )
                    else:
                        raise
                else:
                    raise
            integration.last_sync_at = datetime.utcnow()
            await session.commit()

            session.add(SyncLog(
                integration_id=integration.id,
                status="success",
                rows_synced=rows_synced,
            ))
            await session.commit()
            return {"rows_synced": rows_synced, "status": "success", "message": f"Synced {rows_synced} P&L rows"}

        except Exception as e:
            session.add(SyncLog(
                integration_id=integration.id,
                status="error",
                rows_synced=rows_synced,
                error_message=str(e),
            ))
            await session.commit()
            return {"rows_synced": rows_synced, "status": "error", "message": str(e)}

    async def _refresh_access_token(
        self, session: AsyncSession, integration: Integration
    ) -> bool:
        """Exchange the stored refresh_token for a new access_token.

        Updates integration in-place and commits. Returns True on success.
        """
        client_id = os.environ.get("QUICKBOOKS_CLIENT_ID", "")
        client_secret = os.environ.get("QUICKBOOKS_CLIENT_SECRET", "")
        if not client_id or not client_secret:
            return False

        refresh_token = _decrypt_token(integration.refresh_token_enc or "")
        if not refresh_token:
            return False

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    QB_TOKEN_URL,
                    data={"grant_type": "refresh_token", "refresh_token": refresh_token},
                    auth=(client_id, client_secret),
                    headers={"Accept": "application/json"},
                    timeout=15,
                )
                resp.raise_for_status()
                data = resp.json()

            integration.access_token_enc = _encrypt_token(data["access_token"])
            if "refresh_token" in data:
                integration.refresh_token_enc = _encrypt_token(data["refresh_token"])
            await session.commit()
            return True
        except Exception:
            return False

    async def _sync_profit_and_loss(
        self,
        session: AsyncSession,
        run_id: uuid.UUID,
        access_token: str,
        realm_id: str,
        start_date: date,
        end_date: date,
    ) -> int:
        from decimal import Decimal

        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{QB_API_BASE}/{realm_id}/reports/ProfitAndLoss",
                params={
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "accounting_method": "Accrual",
                },
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
                timeout=30,
            )
            resp.raise_for_status()
            report = resp.json()

        rows: list[RawFinancial] = []
        for row in report.get("Rows", {}).get("Row", []):
            for item in row.get("Rows", {}).get("Row", []):
                col_data = item.get("ColData", [])
                if len(col_data) >= 2:
                    account_name = col_data[0].get("value", "")
                    try:
                        amount = float(col_data[1].get("value", "0").replace(",", ""))
                    except (ValueError, AttributeError):
                        continue

                    category = self._map_account(account_name)
                    if category and amount != 0:
                        # Revenue is positive; expenses are negative in RawFinancial
                        if category not in ("subscription_revenue", "churn_refund"):
                            amount = -abs(amount)

                        rows.append(RawFinancial(
                            run_id=run_id,
                            date=end_date,
                            category=category,
                            amount=Decimal(str(round(amount, 4))),
                            source_file="quickbooks_sync",
                        ))

        for row in rows:
            session.add(row)
        await session.commit()
        return len(rows)

    def _map_account(self, account_name: str) -> str | None:
        """Map QuickBooks account name to RawFinancial category."""
        for key, value in ACCOUNT_MAPPING.items():
            if key.lower() in account_name.lower():
                return value
        return None

    async def _create_demo_integration(self, session: AsyncSession) -> Integration:
        integration = Integration(
            platform="quickbooks",
            access_token_enc=_encrypt_token("demo_token"),
            realm_id="demo_realm",
            status="active",
            company_name="Demo QuickBooks Company",
        )
        session.add(integration)
        await session.commit()
        return integration

    async def _sync_demo_data(self, session: AsyncSession, run_id: uuid.UUID) -> dict:
        """Insert mock QuickBooks P&L data in demo mode."""
        from decimal import Decimal
        from datetime import timedelta

        today = date.today()
        demo_rows = [
            RawFinancial(run_id=run_id, date=today, category="subscription_revenue", amount=Decimal("45000"), source_file="quickbooks_demo"),
            RawFinancial(run_id=run_id, date=today, category="cogs", amount=Decimal("-12600"), source_file="quickbooks_demo"),
            RawFinancial(run_id=run_id, date=today, category="salary_expense", amount=Decimal("-18000"), source_file="quickbooks_demo"),
            RawFinancial(run_id=run_id, date=today, category="marketing_expense", amount=Decimal("-4500"), source_file="quickbooks_demo"),
            RawFinancial(run_id=run_id, date=today, category="software_expense", amount=Decimal("-2200"), source_file="quickbooks_demo"),
        ]
        for row in demo_rows:
            session.add(row)
        await session.commit()
        return {"rows_synced": len(demo_rows), "status": "success", "message": "Demo: 5 mock P&L rows synced"}

    async def get_status(self, session: AsyncSession) -> dict:
        result = await session.execute(
            select(Integration).where(Integration.platform == "quickbooks").order_by(Integration.last_sync_at.desc()).limit(1)
        )
        integration = result.scalar_one_or_none()
        if not integration:
            return {"platform": "quickbooks", "status": "not_connected", "last_sync_at": None, "rows_synced": 0}

        log_result = await session.execute(
            select(SyncLog).where(SyncLog.integration_id == integration.id).order_by(SyncLog.created_at.desc()).limit(1)
        )
        log = log_result.scalar_one_or_none()

        return {
            "platform": "quickbooks",
            "status": integration.status,
            "company_name": integration.company_name,
            "last_sync_at": integration.last_sync_at.isoformat() if integration.last_sync_at else None,
            "rows_synced": log.rows_synced if log else 0,
        }

from __future__ import annotations

# Load .env FIRST — must happen before any module reads os.getenv at import time
from dotenv import load_dotenv
load_dotenv()

import asyncio
import tomllib
import uuid
from datetime import date
from decimal import Decimal
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Callable

import httpx
import json as _json

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import func as sqlfunc, select

from api.database import check_db_connection, close_db, get_db_manager, init_db
from api.models import (
    Anomaly,
    BoardDeck,
    CashBalance,
    CashFlowForecast,
    CommittedExpense,
    Contract,
    CustomerProfile,
    FraudAlert,
    KPISnapshot,
    MarketSignal,
    RawFinancial,
)
from api.schemas import (
    AnalyzeResponse,
    BoardDeckStatusResponse,
    BoardPrepRequest,
    BoardPrepResponse,
    CashBalanceRequest,
    CashFlowForecastResponse,
    CommittedExpenseRequest,
    ContractRequest,
    ContractResponse,
    DeferredRevenueResponse,
    HealthResponse,
    IntegrationStatusResponse,
    InvestorUpdateRequest,
    InvestorUpdateResponse,
    OAuthAuthorizeResponse,
    ReportRequest,
    ReportResponse,
    SyncResponse,
    VCMemoRequest,
    VCMemoResponse,
)
from agents.board_deck_generator import BoardDeckGenerator
from agents.cash_flow_forecaster import CashFlowForecaster
from agents.deferred_revenue import DeferredRevenueCalculator
from agents.insight_writer import generate_investor_update, generate_vc_memo, generate_pre_mortem, generate_board_chat
from agents.morning_briefing import generate_morning_briefing
from agents.quickbooks_sync import QuickBooksIngestionAgent
from agents.stripe_sync import StripeIngestionAgent
from graph.cfo_graph import CFOGraphRunner, build_graph_runner

_PROJECT_ROOT = Path(__file__).parent.parent


def _load_app_version() -> str:
    pyproject_path = _PROJECT_ROOT / "pyproject.toml"
    if not pyproject_path.exists():
        return "0.0.0"
    data = tomllib.loads(pyproject_path.read_text())
    return data.get("tool", {}).get("poetry", {}).get("version", "0.0.0")


async def _run_analyze_bg(
    *,
    graph_runner: CFOGraphRunner,
    file_name: str,
    file_bytes: bytes,
    run_id: uuid.UUID,
) -> None:
    """Background task: run the full analysis pipeline for a given run_id."""
    try:
        await graph_runner.run_analyze(
            file_name=file_name, file_bytes=file_bytes, run_id=run_id
        )
    except Exception:
        pass  # Errors surface through /runs/{run_id}/status


def create_app(
    *,
    graph_runner_factory: Callable[[Any], CFOGraphRunner] | None = None,
    initialize_db: bool = True,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db_manager = get_db_manager()
        if initialize_db:
            await init_db()
        factory = graph_runner_factory or build_graph_runner
        app.state.graph_runner = factory(db_manager)
        app.state.app_version = _load_app_version()
        yield
        await close_db()

    app = FastAPI(
        title="AI CFO Agent API",
        version=_load_app_version(),
        description=(
            "Autonomous multi-agent financial analyst — Survival Score, Board Interrogation, "
            "and Scenario Stress Testing for startups that can't afford a real CFO."
        ),
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Root ─────────────────────────────────────────────────────────────────

    @app.get("/", include_in_schema=False)
    async def root():
        return RedirectResponse(url="/docs")

    @app.get("/sample-csv", include_in_schema=False)
    async def sample_csv_download():
        """Download the built-in sample CSV for format reference."""
        csv_path = _PROJECT_ROOT / "data" / "sample_financials.csv"
        if not csv_path.exists():
            raise HTTPException(status_code=404, detail="Sample CSV not found")
        return FileResponse(str(csv_path), filename="ai-cfo-sample.csv", media_type="text/csv")

    # ── Sync endpoints ────────────────────────────────────────────────────────

    @app.post("/analyze", response_model=AnalyzeResponse)
    async def analyze(
        file: UploadFile = File(...),
        run_id: str | None = Form(default=None),
        company_name: str = Form(default=""),
        sector: str = Form(default="saas_productivity"),
    ) -> AnalyzeResponse:
        """Ingest a CSV or PDF and run the full analysis pipeline synchronously."""
        try:
            run_uuid = uuid.UUID(run_id) if run_id else None
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"Invalid run_id: {exc}") from exc

        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        try:
            result = await app.state.graph_runner.run_analyze(
                file_name=file.filename or "uploaded_file",
                file_bytes=content,
                run_id=run_uuid,
                company_name=company_name,
                sector=sector,
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        return AnalyzeResponse(
            run_id=result["run_id"],
            kpis=result.get("kpis", {}),
            anomalies=result.get("anomalies", []),
            survival_analysis=result.get("survival_analysis"),
            scenario_analysis=result.get("scenario_analysis"),
            status="complete",
        )

    @app.post("/demo", response_model=AnalyzeResponse)
    async def demo(
        company_name: str | None = None,
        sector: str | None = None,
    ) -> AnalyzeResponse:
        """Run the full pipeline on built-in sample data synchronously."""
        demo_csv = _PROJECT_ROOT / "data" / "sample_financials.csv"
        if not demo_csv.exists():
            raise HTTPException(status_code=404, detail="Demo data not found")
        try:
            result = await app.state.graph_runner.run_analyze(
                file_name="sample_financials.csv",
                file_bytes=demo_csv.read_bytes(),
                company_name=company_name or "Synapse AI",
                sector=sector or "saas_productivity",
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        # Seed demo deferred revenue contracts so the dashboard shows real data
        try:
            from datetime import timedelta
            run_id_uuid = uuid.UUID(str(result["run_id"]))
            today = date.today()
            db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
            async with db_manager.session() as session:
                demo_contracts = [
                    Contract(
                        run_id=run_id_uuid, customer_id="acme_enterprise",
                        total_value=Decimal("120000"),
                        start_date=today - timedelta(days=180),
                        end_date=today + timedelta(days=185),
                        payment_terms="annual",
                    ),
                    Contract(
                        run_id=run_id_uuid, customer_id="bigco_corp",
                        total_value=Decimal("84000"),
                        start_date=today - timedelta(days=90),
                        end_date=today + timedelta(days=275),
                        payment_terms="annual",
                    ),
                    Contract(
                        run_id=run_id_uuid, customer_id="series_a_startup",
                        total_value=Decimal("60000"),
                        start_date=today - timedelta(days=30),
                        end_date=today + timedelta(days=335),
                        payment_terms="quarterly",
                    ),
                ]
                session.add_all(demo_contracts)
                await session.commit()
                await DeferredRevenueCalculator().run(session, run_id_uuid)
        except Exception:
            pass  # Non-fatal — dashboard degrades gracefully if seeding fails

        return AnalyzeResponse(
            run_id=result["run_id"],
            kpis=result.get("kpis", {}),
            anomalies=result.get("anomalies", []),
            survival_analysis=result.get("survival_analysis"),
            scenario_analysis=result.get("scenario_analysis"),
            status="complete",
        )

    # ── Async endpoints (return immediately, pipeline runs in background) ─────

    @app.post("/demo/async")
    async def demo_async(background_tasks: BackgroundTasks) -> dict:
        """Start demo pipeline in background; poll /runs/{run_id}/status for progress."""
        demo_csv = _PROJECT_ROOT / "data" / "sample_financials.csv"
        if not demo_csv.exists():
            raise HTTPException(status_code=404, detail="Demo data not found")
        run_id = uuid.uuid4()
        background_tasks.add_task(
            _run_analyze_bg,
            graph_runner=app.state.graph_runner,
            file_name="sample_financials.csv",
            file_bytes=demo_csv.read_bytes(),
            run_id=run_id,
        )
        return {"run_id": str(run_id), "status": "started"}

    @app.post("/analyze/async")
    async def analyze_async(
        background_tasks: BackgroundTasks,
        file: UploadFile = File(...),
    ) -> dict:
        """Start file analysis in background; poll /runs/{run_id}/status for progress."""
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        run_id = uuid.uuid4()
        background_tasks.add_task(
            _run_analyze_bg,
            graph_runner=app.state.graph_runner,
            file_name=file.filename or "upload",
            file_bytes=content,
            run_id=run_id,
        )
        return {"run_id": str(run_id), "status": "started"}

    # ── Pipeline status polling ───────────────────────────────────────────────

    @app.get("/runs/{run_id}/status")
    async def run_status(run_id: uuid.UUID) -> dict:
        """Return which pipeline stages have completed for this run_id.

        The dashboard polls this endpoint every 500 ms to drive the live progress UI.
        Stages:  ingestion → kpi → anomalies → monte_carlo → scenarios
        """
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            raw_count = (
                await session.execute(
                    select(sqlfunc.count(RawFinancial.id)).where(RawFinancial.run_id == run_id)
                )
            ).scalar_one()

            kpi_count = (
                await session.execute(
                    select(sqlfunc.count(KPISnapshot.id)).where(KPISnapshot.run_id == run_id)
                )
            ).scalar_one()

            anomaly_count = (
                await session.execute(
                    select(sqlfunc.count(Anomaly.id)).where(Anomaly.run_id == run_id)
                )
            ).scalar_one()

            signal_count = (
                await session.execute(
                    select(sqlfunc.count(MarketSignal.id)).where(MarketSignal.run_id == run_id)
                )
            ).scalar_one()

        steps: list[dict] = []
        if raw_count > 0:
            steps.append({"id": "ingestion",   "label": "Financial data ingested",       "detail": f"{raw_count} rows loaded"})
        if kpi_count > 0:
            steps.append({"id": "kpi",         "label": "KPI snapshots computed",        "detail": f"{kpi_count} weekly periods"})
            steps.append({"id": "anomalies",   "label": "Anomaly detection complete",    "detail": f"{anomaly_count} anomalies flagged"})
            steps.append({"id": "monte_carlo", "label": "Monte Carlo survival score",    "detail": "1,000 simulations"})
            steps.append({"id": "scenarios",   "label": "Bear / Base / Bull stress test","detail": "3 scenarios computed"})
        if signal_count > 0:
            steps.append({"id": "market",      "label": "Market intelligence scan",      "detail": f"{signal_count} competitor signals"})

        complete = kpi_count > 0 and signal_count > 0

        return {
            "run_id":       str(run_id),
            "steps":        steps,
            "complete":     complete,
            "raw_count":    int(raw_count),
            "kpi_count":    int(kpi_count),
            "signal_count": int(signal_count),
        }

    # ── Run data endpoints (full series for dashboard) ────────────────────────

    @app.get("/runs/{run_id}/kpis")
    async def run_kpis(run_id: uuid.UUID) -> list[dict]:
        """Return all KPI snapshots for a run, ordered by week_start ascending."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            rows = (await session.execute(
                select(KPISnapshot)
                .where(KPISnapshot.run_id == run_id)
                .order_by(KPISnapshot.week_start)
            )).scalars().all()
        return [
            {
                "week_start":   str(r.week_start),
                "mrr":          float(r.mrr or 0),
                "arr":          float(r.arr or 0),
                "churn_rate":   float(r.churn_rate or 0),
                "burn_rate":    float(r.burn_rate or 0),
                "gross_margin": float(r.gross_margin or 0),
                "cac":          float(r.cac or 0),
                "ltv":          float(r.ltv or 0),
                "wow_delta":    r.wow_delta or {},
                "mom_delta":    r.mom_delta or {},
            }
            for r in rows
        ]

    @app.get("/runs/{run_id}/anomalies")
    async def run_anomalies(run_id: uuid.UUID) -> list[dict]:
        """Return all anomalies for a run, ordered by severity then created_at."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        sev_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        async with db_manager.session() as session:
            rows = (await session.execute(
                select(Anomaly)
                .where(Anomaly.run_id == run_id)
                .order_by(Anomaly.created_at)
            )).scalars().all()
        return sorted(
            [
                {
                    "metric":         r.metric,
                    "actual_value":   float(r.actual_value),
                    "expected_range": r.expected_range or {},
                    "severity":       r.severity,
                    "source":         r.source,
                    "description":    r.description or "",
                }
                for r in rows
            ],
            key=lambda x: sev_order.get(x["severity"], 99),
        )

    @app.get("/runs/{run_id}/fraud-alerts")
    async def run_fraud_alerts(run_id: uuid.UUID) -> list[dict]:
        """Return all fraud alerts for a run, ordered by severity then week."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        sev_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        async with db_manager.session() as session:
            rows = (await session.execute(
                select(FraudAlert)
                .where(FraudAlert.run_id == run_id)
                .order_by(FraudAlert.week_start.desc())
            )).scalars().all()
        return sorted(
            [
                {
                    "week_start":  str(r.week_start),
                    "category":    r.category,
                    "pattern":     r.pattern,
                    "severity":    r.severity,
                    "amount":      float(r.amount),
                    "description": r.description or "",
                }
                for r in rows
            ],
            key=lambda x: sev_order.get(x["severity"], 99),
        )

    @app.get("/runs/{run_id}/customers")
    async def run_customers(run_id: uuid.UUID) -> list[dict]:
        """Return all customer profiles for a run, ordered by total revenue descending."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            rows = (await session.execute(
                select(CustomerProfile)
                .where(CustomerProfile.run_id == run_id)
                .order_by(CustomerProfile.total_revenue.desc())
            )).scalars().all()
        return [
            {
                "customer_id":        r.customer_id,
                "total_revenue":      float(r.total_revenue),
                "weeks_active":       r.weeks_active,
                "avg_weekly_revenue": float(r.avg_weekly_revenue),
                "first_seen":         str(r.first_seen),
                "last_seen":          str(r.last_seen),
                "churn_flag":         r.churn_flag,
                "segment":            r.segment,
                "revenue_pct":        float(r.revenue_pct),
            }
            for r in rows
        ]

    @app.get("/runs/{run_id}/signals")
    async def run_signals(run_id: uuid.UUID) -> list[dict]:
        """Return all market signals for a run."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            rows = (await session.execute(
                select(MarketSignal)
                .where(MarketSignal.run_id == run_id)
                .order_by(MarketSignal.date.desc())
            )).scalars().all()
        return [
            {
                "competitor_name": r.competitor_name,
                "signal_type":     r.signal_type,
                "summary":         r.summary,
                "raw_source_url":  r.raw_source_url,
                "date":            str(r.date),
            }
            for r in rows
        ]

    # ── Competitor profiles (Wikipedia + Clearbit logo — fully free) ─────────

    async def _fetch_wikipedia(title: str) -> dict:
        """Fetch company summary from Wikipedia REST API — free, no key, CORS-enabled."""
        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                r = await client.get(url, headers={"User-Agent": "ai-cfo-agent/1.0 (contact@example.com)"})
                if r.status_code == 200:
                    d = r.json()
                    return {
                        "description": d.get("description", ""),
                        "extract":     (d.get("extract") or "")[:280],
                        "thumbnail":   (d.get("thumbnail") or {}).get("source"),
                    }
        except Exception:
            pass
        return {"description": "", "extract": "", "thumbnail": None}

    @app.get("/sectors/{sector}/competitors")
    async def sector_competitors(sector: str) -> list[dict]:
        """Return competitor profiles for a sector, enriched with Wikipedia summaries.

        Logo URLs are constructed using the free Clearbit Logo API:
        https://logo.clearbit.com/{domain}  — no API key required.
        """
        competitors_file = _PROJECT_ROOT / "data" / "competitors.json"
        if not competitors_file.exists():
            raise HTTPException(status_code=404, detail="competitors.json not found")

        all_comps: list[dict] = _json.loads(competitors_file.read_text())
        filtered = [c for c in all_comps if c.get("sector") == sector]
        if not filtered:
            filtered = [c for c in all_comps if c.get("sector") == "general"]

        # Fetch Wikipedia for all competitors in parallel
        wiki_tasks = [
            _fetch_wikipedia(c.get("wikipedia_title") or c["name"])
            for c in filtered
        ]
        wiki_results = await asyncio.gather(*wiki_tasks)

        profiles = []
        for comp, wiki in zip(filtered, wiki_results):
            profiles.append({
                "name":        comp["name"],
                "domain":      comp["domain"],
                "sector":      comp.get("sector", sector),
                "logo_url":    f"https://logo.clearbit.com/{comp['domain']}",
                "description": wiki["description"],
                "extract":     wiki["extract"],
                "thumbnail":   wiki["thumbnail"],
                "pricing_url": comp.get("pricing_url"),
            })

        return profiles

    @app.get("/sectors")
    async def list_sectors() -> list[dict]:
        """List all available sectors with display labels."""
        return [
            {"id": "saas_productivity",    "label": "SaaS / Productivity"},
            {"id": "fintech_payments",     "label": "Fintech / Payments"},
            {"id": "ecommerce",            "label": "E-commerce"},
            {"id": "hr_tech",              "label": "HR Tech"},
            {"id": "marketing_automation", "label": "Marketing / Automation"},
            {"id": "devtools",             "label": "Dev Tools"},
            {"id": "ai_saas",              "label": "AI / SaaS"},
            {"id": "general",              "label": "General / Other"},
        ]

    # ── Report + board prep ───────────────────────────────────────────────────

    @app.post("/report", response_model=ReportResponse)
    async def report(request: ReportRequest) -> ReportResponse:
        """Generate a board-ready CFO briefing for a completed analysis run."""
        try:
            result = await app.state.graph_runner.run_report(run_id=request.run_id)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        return ReportResponse(
            run_id=request.run_id,
            executive_summary=result.get("executive_summary", ""),
            full_report_markdown=result.get("full_report_markdown", ""),
            looker_url=result.get("looker_url", "https://lookerstudio.google.com/"),
        )

    @app.post("/board-prep", response_model=BoardPrepResponse)
    async def board_prep(request: BoardPrepRequest) -> BoardPrepResponse:
        """Generate adversarial board Q&A — 8 hard VC questions with pre-drafted CFO answers."""
        try:
            result = await app.state.graph_runner.run_board_prep(run_id=request.run_id)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        return BoardPrepResponse(
            run_id=request.run_id,
            questions=result.get("board_questions", []),
        )

    @app.post("/vc-memo", response_model=VCMemoResponse)
    async def vc_memo(request: VCMemoRequest) -> VCMemoResponse:
        """Generate an internal VC investment committee memo for a run.

        Uses Claude Haiku — costs ~$0.003 per call. Fetches KPI data from DB,
        combines with survival data passed in the request body.
        """
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            rows = (await session.execute(
                select(KPISnapshot)
                .where(KPISnapshot.run_id == request.run_id)
                .order_by(KPISnapshot.week_start)
            )).scalars().all()

        if not rows:
            raise HTTPException(status_code=404, detail="No KPI data found for this run")

        kpi_snapshots = [
            {
                "mrr":          float(r.mrr or 0),
                "arr":          float(r.arr or 0),
                "burn_rate":    float(r.burn_rate or 0),
                "gross_margin": float(r.gross_margin or 0),
                "churn_rate":   float(r.churn_rate or 0),
                "cac":          float(r.cac or 0),
                "ltv":          float(r.ltv or 0),
            }
            for r in rows
        ]

        try:
            result = await generate_vc_memo(
                kpi_snapshots=kpi_snapshots,
                months_runway=request.months_runway,
                survival_score=request.survival_score,
                ruin_probability_6m=request.ruin_probability_6m,
                company_name=request.company_name,
                sector=request.sector,
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        return VCMemoResponse(**result)

    @app.post("/investor-update", response_model=InvestorUpdateResponse)
    async def investor_update(request: InvestorUpdateRequest) -> InvestorUpdateResponse:
        """Generate a ready-to-send monthly investor update email grounded in real KPI data.

        Uses Claude Haiku — costs ~$0.003 per call. One click, copy-paste ready.
        """
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            rows = (await session.execute(
                select(KPISnapshot)
                .where(KPISnapshot.run_id == request.run_id)
                .order_by(KPISnapshot.week_start)
            )).scalars().all()

        if not rows:
            raise HTTPException(status_code=404, detail="No KPI data found for this run")

        kpi_snapshots = [
            {
                "mrr":          float(r.mrr or 0),
                "burn_rate":    float(r.burn_rate or 0),
                "gross_margin": float(r.gross_margin or 0),
                "churn_rate":   float(r.churn_rate or 0),
                "cac":          float(r.cac or 0),
                "ltv":          float(r.ltv or 0),
            }
            for r in rows
        ]

        try:
            result = await generate_investor_update(
                kpi_snapshots=kpi_snapshots,
                months_runway=request.months_runway,
                survival_score=request.survival_score,
                company_name=request.company_name,
                sector=request.sector,
            )
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        return InvestorUpdateResponse(**result)

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        db_connected = await check_db_connection()
        return HealthResponse(
            status="ok",
            db="connected" if db_connected else "disconnected",
            models=["claude-haiku-4-5", "isolation-forest", "monte-carlo"],
        )

    # ── Cash Flow Forecast endpoints ─────────────────────────────────────────

    @app.post("/runs/{run_id}/cash-balance")
    async def set_cash_balance(run_id: uuid.UUID, body: CashBalanceRequest) -> dict:
        """Manually set the current cash balance for a run."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            from decimal import Decimal
            session.add(CashBalance(
                run_id=run_id,
                balance=Decimal(str(body.balance)),
                as_of_date=body.as_of_date,
                source=body.source,
            ))
            await session.commit()
        return {"status": "ok", "run_id": str(run_id), "balance": float(body.balance)}

    @app.post("/runs/{run_id}/committed-expenses")
    async def add_committed_expense(run_id: uuid.UUID, body: CommittedExpenseRequest) -> dict:
        """Add a recurring committed expense (rent, payroll, SaaS subscription)."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            from decimal import Decimal
            expense = CommittedExpense(
                run_id=run_id,
                name=body.name,
                amount=Decimal(str(body.amount)),
                frequency=body.frequency,
                next_payment_date=body.next_payment_date,
                category=body.category,
            )
            session.add(expense)
            await session.commit()
        return {"status": "ok", "id": str(expense.id), "name": body.name}

    @app.get("/runs/{run_id}/forecast/cash-flow")
    async def get_cash_flow_forecast(run_id: uuid.UUID) -> dict:
        """Return the 13-week cash flow forecast (P10/P50/P90) for a run.

        Automatically computes the forecast from existing KPI + committed expense data.
        """
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            forecaster = CashFlowForecaster()
            result = await forecaster.run(session, run_id)
        result["run_id"] = str(run_id)
        return result

    @app.post("/runs/{run_id}/forecast/refresh")
    async def refresh_cash_flow_forecast(run_id: uuid.UUID) -> dict:
        """Re-compute the 13-week forecast from latest data."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            forecaster = CashFlowForecaster()
            result = await forecaster.run(session, run_id)
        result["run_id"] = str(run_id)
        return result

    # ── Deferred Revenue endpoints ────────────────────────────────────────────

    @app.post("/runs/{run_id}/contracts")
    async def create_contract(run_id: uuid.UUID, body: ContractRequest) -> dict:
        """Create an annual/multi-year contract for GAAP revenue recognition tracking."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            from decimal import Decimal
            contract = Contract(
                run_id=run_id,
                customer_id=body.customer_id,
                total_value=Decimal(str(body.total_value)),
                start_date=body.start_date,
                end_date=body.end_date,
                payment_terms=body.payment_terms,
                payment_received_at=body.payment_received_at,
            )
            session.add(contract)
            await session.commit()

            # Auto-compute schedule
            calc = DeferredRevenueCalculator()
            schedule = calc.calculate_schedule(contract)
            await calc._persist_schedule(session, contract.id, schedule)

        return {"status": "ok", "id": str(contract.id), "customer_id": body.customer_id}

    @app.get("/runs/{run_id}/contracts")
    async def list_contracts(run_id: uuid.UUID) -> list[dict]:
        """List all contracts for a run."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            rows = (await session.execute(
                select(Contract).where(Contract.run_id == run_id).order_by(Contract.start_date)
            )).scalars().all()
        return [
            {
                "id": str(r.id),
                "customer_id": r.customer_id,
                "total_value": float(r.total_value),
                "start_date": str(r.start_date),
                "end_date": str(r.end_date),
                "payment_terms": r.payment_terms,
            }
            for r in rows
        ]

    @app.get("/runs/{run_id}/deferred-revenue")
    async def get_deferred_revenue(run_id: uuid.UUID) -> dict:
        """Return total deferred revenue balance and 12-month recognition schedule."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            calc = DeferredRevenueCalculator()
            result = await calc.run(session, run_id)
        result["run_id"] = str(run_id)
        return result

    # ── Board Deck endpoints ──────────────────────────────────────────────────

    async def _generate_deck_bg(
        run_id: uuid.UUID,
        company_name: str,
        db_manager: Any,
    ) -> None:
        """Background task: generate PowerPoint board deck."""
        try:
            async with db_manager.session() as session:
                generator = BoardDeckGenerator()
                await generator.run(session, run_id, company_name)
        except Exception as e:
            # Mark deck as failed
            async with db_manager.session() as session:
                deck = (await session.execute(
                    select(BoardDeck).where(BoardDeck.run_id == run_id).limit(1)
                )).scalar_one_or_none()
                if deck:
                    deck.status = "failed"
                    await session.commit()

    @app.post("/runs/{run_id}/board-deck/generate")
    async def generate_board_deck(
        run_id: uuid.UUID,
        background_tasks: BackgroundTasks,
        company_name: str = "Portfolio Company",
    ) -> dict:
        """Trigger async PowerPoint board deck generation."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        # Create a "generating" record immediately
        async with db_manager.session() as session:
            existing = (await session.execute(
                select(BoardDeck).where(BoardDeck.run_id == run_id).limit(1)
            )).scalar_one_or_none()
            if existing:
                existing.status = "generating"
                await session.commit()
                deck_id = existing.id
            else:
                deck = BoardDeck(run_id=run_id, file_path="", status="generating")
                session.add(deck)
                await session.commit()
                deck_id = deck.id

        background_tasks.add_task(_generate_deck_bg, run_id, company_name, db_manager)
        return {"deck_id": str(deck_id), "run_id": str(run_id), "status": "generating"}

    @app.get("/runs/{run_id}/board-deck/status")
    async def board_deck_status(run_id: uuid.UUID) -> dict:
        """Check the status of a board deck generation."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            deck = (await session.execute(
                select(BoardDeck).where(BoardDeck.run_id == run_id).order_by(BoardDeck.generated_at.desc()).limit(1)
            )).scalar_one_or_none()

        if not deck:
            return {"status": "not_started", "deck_id": None, "run_id": str(run_id)}

        download_url = f"/runs/{run_id}/board-deck/download" if deck.status == "ready" else None
        return {
            "deck_id": str(deck.id),
            "run_id": str(run_id),
            "status": deck.status,
            "generated_at": deck.generated_at.isoformat() if deck.generated_at else None,
            "download_url": download_url,
        }

    @app.get("/runs/{run_id}/board-deck/download")
    async def download_board_deck(run_id: uuid.UUID) -> FileResponse:
        """Download the generated PowerPoint board deck."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            deck = (await session.execute(
                select(BoardDeck)
                .where(BoardDeck.run_id == run_id, BoardDeck.status == "ready")
                .order_by(BoardDeck.generated_at.desc())
                .limit(1)
            )).scalar_one_or_none()

        if not deck or not deck.file_path:
            raise HTTPException(status_code=404, detail="Board deck not ready. Generate it first.")

        import os
        if not os.path.exists(deck.file_path):
            raise HTTPException(status_code=404, detail="Deck file not found on disk.")

        return FileResponse(
            path=deck.file_path,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            filename=f"board_deck_{run_id}.pptx",
        )

    # ── Stripe integration endpoints ──────────────────────────────────────────

    @app.get("/integrations/stripe/authorize")
    async def stripe_authorize() -> dict:
        """Return the Stripe OAuth authorization URL."""
        agent = StripeIngestionAgent()
        return agent.get_authorization_url()

    @app.get("/integrations/stripe/callback")
    async def stripe_callback(code: str) -> dict:
        """Handle Stripe OAuth callback — exchange code for access token."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            agent = StripeIngestionAgent()
            integration = await agent.exchange_code_for_token(session, code)
        return {"status": "connected", "platform": "stripe", "id": str(integration.id)}

    @app.post("/runs/{run_id}/integrations/stripe/sync")
    async def stripe_sync(run_id: uuid.UUID) -> dict:
        """Sync Stripe subscriptions to RawFinancial rows for this run."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            agent = StripeIngestionAgent()
            result = await agent.sync(session, run_id)
        result["run_id"] = str(run_id)
        return result

    @app.get("/integrations/stripe/status")
    async def stripe_status() -> dict:
        """Return current Stripe integration status."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            agent = StripeIngestionAgent()
            return await agent.get_status(session)

    # ── QuickBooks integration endpoints ──────────────────────────────────────

    @app.get("/integrations/quickbooks/authorize")
    async def quickbooks_authorize() -> dict:
        """Return the QuickBooks OAuth authorization URL."""
        agent = QuickBooksIngestionAgent()
        return agent.get_authorization_url()

    @app.get("/integrations/quickbooks/callback")
    async def quickbooks_callback(code: str, realmId: str = "") -> dict:
        """Handle QuickBooks OAuth callback — exchange code for access token."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            agent = QuickBooksIngestionAgent()
            integration = await agent.exchange_code_for_token(session, code, realmId)
        return {"status": "connected", "platform": "quickbooks", "id": str(integration.id)}

    @app.post("/runs/{run_id}/integrations/quickbooks/sync")
    async def quickbooks_sync(run_id: uuid.UUID) -> dict:
        """Sync QuickBooks P&L to RawFinancial rows for this run."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            agent = QuickBooksIngestionAgent()
            result = await agent.sync(session, run_id)
        result["run_id"] = str(run_id)
        return result

    @app.get("/integrations/quickbooks/status")
    async def quickbooks_status() -> dict:
        """Return current QuickBooks integration status."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            agent = QuickBooksIngestionAgent()
            return await agent.get_status(session)

    @app.get("/integrations/status")
    async def all_integrations_status() -> list[dict]:
        """Return status of all integrations (Stripe + QuickBooks)."""
        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            stripe_status = await StripeIngestionAgent().get_status(session)
            qb_status = await QuickBooksIngestionAgent().get_status(session)
        return [stripe_status, qb_status]

    # Attach db_manager to app state so /runs/{run_id}/status can reach it
    @app.on_event("startup")
    async def _attach_db():
        app.state.db_manager = get_db_manager()

    # ── CSV Template ────────────────────────────────────────────────────────

    @app.get("/analyze/template")
    async def csv_template():
        """Return a minimal valid CSV template the user can fill in."""
        from fastapi.responses import Response as _Response
        rows = [
            "date,category,amount,customer_id",
            "2024-01-07,subscription_revenue,12500.00,acme_corp",
            "2024-01-07,subscription_revenue,4200.00,startup_b",
            "2024-01-07,salary_expense,-18000.00,",
            "2024-01-07,marketing_expense,-4500.00,",
            "2024-01-07,cogs,-3200.00,",
            "2024-01-14,subscription_revenue,12900.00,acme_corp",
            "2024-01-14,subscription_revenue,4200.00,startup_b",
            "2024-01-14,salary_expense,-18000.00,",
            "2024-01-14,marketing_expense,-4200.00,",
            "2024-01-14,cogs,-3300.00,",
        ]
        content = "\n".join(rows)
        return _Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=ai_cfo_template.csv"},
        )

    # ── Pre-mortem Generator ─────────────────────────────────────────────────

    @app.post("/pre-mortem")
    async def pre_mortem_endpoint(request: dict) -> list[dict]:
        """Generate 3 failure scenarios for a run using Claude Haiku (~$0.004/call)."""
        run_id_str = request.get("run_id", "")
        company_name = str(request.get("company_name", ""))
        sector = str(request.get("sector", "saas_productivity"))
        months_runway = float(request.get("months_runway", 12))

        try:
            run_id = uuid.UUID(str(run_id_str))
        except (ValueError, AttributeError):
            raise HTTPException(status_code=422, detail="Invalid run_id")

        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            kpi_rows = (
                await session.execute(
                    select(KPISnapshot)
                    .where(KPISnapshot.run_id == run_id)
                    .order_by(KPISnapshot.week_start.desc())
                    .limit(8)
                )
            ).scalars().all()
            snapshots = [
                {
                    "mrr":          float(r.mrr or 0),
                    "arr":          float(r.arr or 0),
                    "burn_rate":    float(r.burn_rate or 0),
                    "gross_margin": float(r.gross_margin or 0),
                    "churn_rate":   float(r.churn_rate or 0),
                    "cac":          float(r.cac or 0),
                    "ltv":          float(r.ltv or 0),
                }
                for r in reversed(kpi_rows)
            ]

        return await generate_pre_mortem(
            kpi_snapshots=snapshots,
            months_runway=months_runway,
            company_name=company_name,
            sector=sector,
        )

    # ── Multi-turn Board Q&A Chat ─────────────────────────────────────────────

    @app.post("/board-prep/chat")
    async def board_prep_chat(request: dict) -> dict:
        """Continue a multi-turn CFO board prep conversation with Claude Haiku (~$0.003-0.008/turn)."""
        run_id_str = request.get("run_id", "")
        messages = request.get("messages", [])

        if not isinstance(messages, list):
            raise HTTPException(status_code=422, detail="messages must be a list")

        try:
            run_id = uuid.UUID(str(run_id_str))
        except (ValueError, AttributeError):
            raise HTTPException(status_code=422, detail="Invalid run_id")

        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            reply = await generate_board_chat(
                run_id=run_id,
                messages=messages,
                session=session,
            )

        return {"role": "assistant", "content": reply}

    # ── Anonymous Industry Benchmarker ────────────────────────────────────────

    @app.get("/benchmarks")
    async def get_benchmarks(sector: str = "saas_productivity", run_id: str | None = None) -> dict:
        """Compare this run's KPIs against anonymous industry percentile benchmarks.

        Returns p25/p50/p75 for each metric plus the company's percentile rank.
        No API key required — data is from public SaaStr / OpenView / a16z reports.
        """
        benchmarks_file = _PROJECT_ROOT / "data" / "benchmarks.json"
        if not benchmarks_file.exists():
            raise HTTPException(status_code=404, detail="benchmarks.json not found")

        all_benchmarks: dict = _json.loads(benchmarks_file.read_text())
        sector_key = sector if sector in all_benchmarks else "saas_productivity"
        benchmarks = all_benchmarks[sector_key]

        your_metrics: dict = {}
        percentiles: dict = {}

        def _pct(val: float, p25: float, p50: float, p75: float, higher_better: bool) -> float:
            """Linear interpolation between quartiles → 0-100 percentile score."""
            if higher_better:
                if p75 <= p25:
                    return 50.0
                if val <= p25:
                    return max(0.0, (val / max(p25, 0.001)) * 25)
                if val <= p50:
                    return 25.0 + ((val - p25) / (p50 - p25)) * 25
                if val <= p75:
                    return 50.0 + ((val - p50) / (p75 - p50)) * 25
                return min(100.0, 75.0 + ((val - p75) / max(p75 - p25, 0.001)) * 25)
            else:
                # lower is better — invert scale
                if p25 <= p75:
                    return 50.0
                if val >= p25:
                    return max(0.0, (p25 / max(val, 0.001)) * 25)
                if val >= p50:
                    return 25.0 + ((p25 - val) / max(p25 - p50, 0.001)) * 25
                if val >= p75:
                    return 50.0 + ((p50 - val) / max(p50 - p75, 0.001)) * 25
                return min(100.0, 75.0 + ((p75 - val) / max(p50 - p75, 0.001)) * 25)

        if run_id:
            try:
                run_uuid = uuid.UUID(run_id)
                db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
                async with db_manager.session() as session:
                    rows = (await session.execute(
                        select(KPISnapshot)
                        .where(KPISnapshot.run_id == run_uuid)
                        .order_by(KPISnapshot.week_start)
                    )).scalars().all()

                if rows:
                    latest = rows[-1]
                    prev   = rows[-5] if len(rows) >= 5 else rows[0]

                    mrr_now  = float(latest.mrr or 0)
                    mrr_old  = float(prev.mrr or 0)
                    gm       = float(latest.gross_margin or 0)
                    ltv      = float(latest.ltv or 0)
                    cac      = float(latest.cac or 0)
                    churn    = float(latest.churn_rate or 0)
                    burn     = float(latest.burn_rate or 0)

                    mrr_growth   = ((mrr_now - mrr_old) / max(mrr_old, 1)) * 100
                    ltv_cac      = ltv / max(cac, 1)
                    churn_pct    = churn * 100
                    net_new_mrr  = max(mrr_now - mrr_old, 0.01)
                    burn_mult    = min((burn * 4) / max(net_new_mrr * 4, 0.01), 10.0)

                    your_metrics = {
                        "mrr_growth_mom_pct": round(mrr_growth, 1),
                        "gross_margin_pct":   round(gm, 1),
                        "ltv_cac_ratio":      round(ltv_cac, 1),
                        "weekly_churn_pct":   round(churn_pct, 2),
                        "burn_multiple":      round(burn_mult, 1),
                    }

                    for metric, info in benchmarks.items():
                        if metric in your_metrics:
                            percentiles[metric] = round(_pct(
                                your_metrics[metric],
                                info["p25"], info["p50"], info["p75"],
                                info["higher_better"],
                            ), 1)
            except Exception:
                pass

        return {
            "sector":       sector_key,
            "benchmarks":   benchmarks,
            "your_metrics": your_metrics,
            "percentiles":  percentiles,
        }

    # ── Morning CFO Briefing ─────────────────────────────────────────────
    @app.post("/briefing/preview")
    async def briefing_preview(request: dict[str, Any]) -> dict[str, Any]:
        """
        Generate a proactive morning CFO briefing for a run.
        Returns structured data: urgent alerts, good news, action items, KPI deltas.
        ~$0.003 per call (Claude Haiku).
        """
        run_id_str   = request.get("run_id", "")
        company_name = str(request.get("company_name", "Your Company"))
        try:
            run_id = uuid.UUID(str(run_id_str))
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid run_id")

        db_manager = app.state.db_manager if hasattr(app.state, "db_manager") else get_db_manager()
        async with db_manager.session() as session:
            briefing = await generate_morning_briefing(run_id, session, company_name)
        return briefing

    return app


app = create_app()

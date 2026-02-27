from __future__ import annotations

# Load .env FIRST — must happen before any module reads os.getenv at import time
from dotenv import load_dotenv
load_dotenv()

import asyncio
import tomllib
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Callable

import httpx
import json as _json

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy import func as sqlfunc, select

from api.database import check_db_connection, close_db, get_db_manager, init_db
from api.models import Anomaly, KPISnapshot, MarketSignal, RawFinancial
from api.schemas import (
    AnalyzeResponse,
    BoardPrepRequest,
    BoardPrepResponse,
    HealthResponse,
    InvestorUpdateRequest,
    InvestorUpdateResponse,
    ReportRequest,
    ReportResponse,
    VCMemoRequest,
    VCMemoResponse,
)
from agents.insight_writer import generate_investor_update, generate_vc_memo
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
                company_name=company_name or "Acme SaaS Co.",
                sector=sector or "saas_productivity",
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

    # Attach db_manager to app state so /runs/{run_id}/status can reach it
    @app.on_event("startup")
    async def _attach_db():
        app.state.db_manager = get_db_manager()

    return app


app = create_app()

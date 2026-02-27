from __future__ import annotations

import uuid
from collections import OrderedDict
from typing import Annotated, Any, Literal

from langchain_core.messages import AIMessage, AnyMessage, HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.graph.message import add_messages

from agents import AnalysisAgent, IngestionAgent, InsightWriterAgent, MarketAgent
from api.database import DatabaseManager

# Python equivalent of addMessages reducer naming from the project spec.
addMessages = add_messages


class BoundedMemorySaver(MemorySaver):
    """MemorySaver that evicts the oldest checkpoint after max_size entries.

    Prevents unbounded RAM growth in long-running processes where thousands
    of unique run_ids each create their own thread checkpoint.
    """

    def __init__(self, max_size: int = 200) -> None:
        super().__init__()
        self._max_size = max_size

    def put(self, config: Any, checkpoint: Any, metadata: Any, new_versions: Any) -> Any:
        result = super().put(config, checkpoint, metadata, new_versions)
        storage = getattr(self, "storage", None)
        if storage is not None and len(storage) > self._max_size:
            try:
                oldest_key = next(iter(storage))
                del storage[oldest_key]
            except (StopIteration, RuntimeError):
                pass
        return result


class CFOState(MessagesState, total=False):
    messages: Annotated[list[AnyMessage], addMessages]
    task: Literal["analyze", "report", "board_prep"]
    run_id: uuid.UUID
    company_name: str
    sector: str
    file_name: str
    file_bytes: bytes
    raw_rows: list[dict[str, Any]]
    corrected_rows: list[dict[str, Any]]
    validated_rows: list[dict[str, Any]]
    validation_errors: list[str]
    needs_correction: bool
    correction_attempts: int
    ingestion_metadata: dict[str, Any]
    persisted_count: int
    kpis: dict[str, Any]
    anomalies: list[dict[str, Any]]
    survival_analysis: dict[str, Any] | None
    scenario_analysis: list[dict[str, Any]] | None
    board_questions: list[dict[str, Any]] | None
    market_signals: list[dict[str, Any]]
    executive_summary: str
    full_report_markdown: str
    looker_url: str
    status: str
    error: str


class CFOGraphRunner:
    def __init__(self, db_manager: DatabaseManager, checkpointer: Any | None = None) -> None:
        self.db_manager = db_manager
        self.checkpointer = checkpointer or BoundedMemorySaver(max_size=200)
        self.ingestion_agent = IngestionAgent()
        self.analysis_agent = AnalysisAgent()
        self.market_agent = MarketAgent()
        self.insight_writer = InsightWriterAgent()
        self.graph = self._build_graph()

    def _build_graph(self):
        workflow = StateGraph(CFOState)

        workflow.add_node("router", self._router_node)
        workflow.add_node("ingestion", self._ingestion_node)
        workflow.add_node("correction", self._correction_node)
        workflow.add_node("persist_raw", self._persist_raw_node)
        workflow.add_node("analysis", self._analysis_node)
        workflow.add_node("market_analyze", self._market_analyze_node)
        workflow.add_node("market", self._market_node)
        workflow.add_node("insight", self._insight_node)
        workflow.add_node("board_prep", self._board_prep_node)
        workflow.add_node("failure", self._failure_node)

        workflow.add_edge(START, "router")
        workflow.add_conditional_edges(
            "router",
            self._route_from_router,
            {
                "analyze": "ingestion",
                "report": "market",
                "board_prep": "board_prep",
            },
        )
        workflow.add_conditional_edges(
            "ingestion",
            self._route_after_ingestion,
            {
                "correction": "correction",
                "persist_raw": "persist_raw",
                "failure": "failure",
            },
        )
        workflow.add_edge("correction", "ingestion")
        workflow.add_edge("persist_raw", "analysis")
        workflow.add_edge("analysis", "market_analyze")
        workflow.add_edge("market_analyze", END)
        workflow.add_edge("market", "insight")
        workflow.add_edge("insight", END)
        workflow.add_edge("board_prep", END)
        workflow.add_edge("failure", END)

        return workflow.compile(checkpointer=self.checkpointer)

    async def _router_node(self, state: CFOState) -> dict[str, Any]:
        run_id = state.get("run_id") or uuid.uuid4()
        task = state.get("task", "analyze")
        return {
            "run_id": run_id,
            "task": task,
            "correction_attempts": state.get("correction_attempts", 0),
            "messages": [HumanMessage(content=f"Starting {task} workflow for run_id={run_id}")],
        }

    def _route_from_router(self, state: CFOState) -> str:
        return state.get("task", "analyze")

    async def _ingestion_node(self, state: CFOState) -> dict[str, Any]:
        if state.get("task") != "analyze":
            return {"needs_correction": False}

        result = await self.ingestion_agent.ingest(
            filename=state["file_name"],
            file_bytes=state["file_bytes"],
            run_id=state["run_id"],
            corrected_rows=state.get("corrected_rows"),
        )

        msg = (
            "Validation passed and data is ready for persistence"
            if not result["needs_correction"]
            else "Validation failed; triggering self-correction cycle"
        )
        return {
            **result,
            "messages": [AIMessage(content=msg)],
        }

    def _route_after_ingestion(self, state: CFOState) -> str:
        if not state.get("needs_correction"):
            return "persist_raw"
        if state.get("correction_attempts", 0) >= 2:
            return "failure"
        return "correction"

    async def _correction_node(self, state: CFOState) -> dict[str, Any]:
        corrected = await self.ingestion_agent.correct_rows_with_llm(
            bad_rows=state.get("raw_rows", []),
            validation_errors=state.get("validation_errors", []),
        )
        attempts = state.get("correction_attempts", 0) + 1
        return {
            "corrected_rows": corrected,
            "correction_attempts": attempts,
            "messages": [AIMessage(content=f"Applied correction pass #{attempts}")],
        }

    async def _persist_raw_node(self, state: CFOState) -> dict[str, Any]:
        async with self.db_manager.session() as session:
            count = await self.ingestion_agent.persist(session, state.get("validated_rows", []))
        return {
            "persisted_count": count,
            "messages": [AIMessage(content=f"Persisted {count} raw financial rows")],
        }

    async def _analysis_node(self, state: CFOState) -> dict[str, Any]:
        async with self.db_manager.session() as session:
            result = await self.analysis_agent.run(session, state["run_id"])
        return {
            "kpis": result["kpis"],
            "anomalies": result["anomalies"],
            "survival_analysis": result.get("survival_analysis"),
            "scenario_analysis": result.get("scenario_analysis"),
            "status": result["status"],
            "messages": [AIMessage(content="Analysis completed — survival score and scenarios computed")],
        }

    async def _market_analyze_node(self, state: CFOState) -> dict[str, Any]:
        """Light market scan that runs during every analyze — sector-aware."""
        async with self.db_manager.session() as session:
            result = await self.market_agent.run(
                session,
                state["run_id"],
                sector=state.get("sector"),
                company_name=state.get("company_name"),
            )
        return {
            "market_signals": result["market_signals"],
            "messages": [AIMessage(content=f"Market scan complete — {len(result['market_signals'])} signals")],
        }

    async def _market_node(self, state: CFOState) -> dict[str, Any]:
        async with self.db_manager.session() as session:
            result = await self.market_agent.run(
                session,
                state["run_id"],
                sector=state.get("sector"),
                company_name=state.get("company_name"),
            )
        return {
            "market_signals": result["market_signals"],
            "messages": [AIMessage(content="Market intelligence scan completed")],
        }

    async def _insight_node(self, state: CFOState) -> dict[str, Any]:
        async with self.db_manager.session() as session:
            result = await self.insight_writer.run(session, state["run_id"])
        return {
            "executive_summary": result["executive_summary"],
            "full_report_markdown": result["full_report_markdown"],
            "looker_url": result["looker_url"],
            "status": "complete",
            "messages": [AIMessage(content="Board-ready report generated")],
        }

    async def _board_prep_node(self, state: CFOState) -> dict[str, Any]:
        async with self.db_manager.session() as session:
            questions = await self.insight_writer.generate_board_interrogation(session, state["run_id"])
        return {
            "board_questions": questions,
            "status": "complete",
            "messages": [AIMessage(content=f"Board interrogation deck generated — {len(questions)} questions")],
        }

    async def _failure_node(self, state: CFOState) -> dict[str, Any]:
        return {
            "status": "failed",
            "error": "Validation failed after correction retries",
            "messages": [AIMessage(content="Workflow terminated after correction retries")],
        }

    async def run_analyze(
        self,
        *,
        file_name: str,
        file_bytes: bytes,
        run_id: uuid.UUID | None = None,
        company_name: str = "",
        sector: str = "saas_productivity",
    ) -> dict[str, Any]:
        effective_run_id = run_id or uuid.uuid4()
        initial_state: CFOState = {
            "task": "analyze",
            "file_name": file_name,
            "file_bytes": file_bytes,
            "run_id": effective_run_id,
            "company_name": company_name,
            "sector": sector,
            "messages": [],
        }
        final_state = await self.graph.ainvoke(
            initial_state,
            config={"recursion_limit": 25, "configurable": {"thread_id": str(effective_run_id)}},
        )
        if final_state.get("status") == "failed":
            raise ValueError(final_state.get("error", "Analyze workflow failed"))
        return final_state

    async def run_report(self, *, run_id: uuid.UUID) -> dict[str, Any]:
        initial_state: CFOState = {
            "task": "report",
            "run_id": run_id,
            "messages": [],
        }
        final_state = await self.graph.ainvoke(
            initial_state,
            config={"recursion_limit": 25, "configurable": {"thread_id": str(run_id)}},
        )
        if final_state.get("status") == "failed":
            raise ValueError(final_state.get("error", "Report workflow failed"))
        return final_state

    async def run_board_prep(self, *, run_id: uuid.UUID) -> dict[str, Any]:
        """Generate adversarial board Q&A for a completed analysis run."""
        initial_state: CFOState = {
            "task": "board_prep",
            "run_id": run_id,
            "messages": [],
        }
        final_state = await self.graph.ainvoke(
            initial_state,
            config={"recursion_limit": 10, "configurable": {"thread_id": f"board_prep:{run_id}"}},
        )
        if final_state.get("status") == "failed":
            raise ValueError(final_state.get("error", "Board prep workflow failed"))
        return final_state


def build_graph_runner(db_manager: DatabaseManager, checkpointer: Any | None = None) -> CFOGraphRunner:
    return CFOGraphRunner(db_manager, checkpointer=checkpointer)

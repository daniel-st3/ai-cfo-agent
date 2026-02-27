"""AI CFO Agent — Live Intelligence Dashboard

Upload a CSV, watch the AI pipeline run step-by-step, and get your full financial
analysis: Survival Score, Board Interrogation, and Scenario Stress Test.

Run locally:
    streamlit run dashboard/streamlit_app.py
"""

from __future__ import annotations

import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load .env so DATABASE_URL etc. are available
load_dotenv(Path(__file__).parent.parent / ".env")

# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="AI CFO Agent",
    page_icon="◆",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ---------------------------------------------------------------------------
# Styles
# ---------------------------------------------------------------------------
st.markdown(
    """
    <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

    html, body, [class*="css"] {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background-color: #ffffff;
        color: #1d1d1f;
    }
    #MainMenu, footer, header { visibility: hidden; }
    .block-container { padding: 2rem 3rem 1rem 3rem; max-width: 1400px; }

    /* Cards */
    .metric-card {
        background: #f5f5f7;
        border-radius: 16px;
        padding: 1.25rem 1.5rem;
    }
    .upload-card {
        background: #f5f5f7;
        border-radius: 16px;
        padding: 2rem;
        text-align: center;
    }

    /* Pipeline steps */
    .step-done {
        display: flex; align-items: center; gap: 0.75rem;
        padding: 0.75rem 1rem; border-radius: 12px;
        background: #f0fff4; margin-bottom: 0.5rem;
    }
    .step-done .icon { color: #30d158; font-size: 1.1rem; }
    .step-run {
        display: flex; align-items: center; gap: 0.75rem;
        padding: 0.75rem 1rem; border-radius: 12px;
        background: #fff8e1; margin-bottom: 0.5rem;
        animation: pulse 1.2s ease-in-out infinite;
    }
    .step-run .icon { font-size: 1.1rem; }
    .step-wait {
        display: flex; align-items: center; gap: 0.75rem;
        padding: 0.75rem 1rem; border-radius: 12px;
        background: #f5f5f7; margin-bottom: 0.5rem;
        opacity: 0.45;
    }
    .step-wait .icon { color: #86868b; font-size: 1.1rem; }
    @keyframes pulse {
        0%, 100% { opacity: 1; } 50% { opacity: 0.6; }
    }
    .step-label { font-size: 0.875rem; font-weight: 500; color: #1d1d1f; }
    .step-detail { font-size: 0.75rem; color: #86868b; margin-top: 0.1rem; }

    /* KPI typography */
    .label-text { font-size: 0.72rem; font-weight: 600; color: #86868b; letter-spacing: 0.08em; text-transform: uppercase; }
    .value-text { font-size: 1.8rem; font-weight: 700; color: #1d1d1f; letter-spacing: -0.02em; margin-top: 0.2rem; }
    .delta-positive { font-size: 0.78rem; color: #30d158; font-weight: 500; margin-top: 0.15rem; }
    .delta-negative { font-size: 0.78rem; color: #ff453a; font-weight: 500; margin-top: 0.15rem; }

    /* Badges */
    .badge-red    { background: #ff453a20; color: #ff453a; border-radius: 6px; padding: 2px 8px; font-size: 0.7rem; font-weight: 700; }
    .badge-yellow { background: #ffd60a20; color: #b07d10; border-radius: 6px; padding: 2px 8px; font-size: 0.7rem; font-weight: 700; }
    .badge-green  { background: #30d15820; color: #1a8c3a; border-radius: 6px; padding: 2px 8px; font-size: 0.7rem; font-weight: 700; }
    .badge-high   { background: #ff453a20; color: #ff453a; border-radius: 6px; padding: 2px 8px; font-size: 0.7rem; font-weight: 700; }
    .badge-medium { background: #ffd60a20; color: #b07d10; border-radius: 6px; padding: 2px 8px; font-size: 0.7rem; font-weight: 700; }
    .badge-low    { background: #30d15820; color: #1a8c3a; border-radius: 6px; padding: 2px 8px; font-size: 0.7rem; font-weight: 700; }

    /* Pill badges for scenarios */
    .pill-bear { background:#ff453a15;color:#ff453a;border-radius:20px;padding:3px 12px;font-size:0.75rem;font-weight:600; }
    .pill-base { background:#007aff15;color:#007aff;border-radius:20px;padding:3px 12px;font-size:0.75rem;font-weight:600; }
    .pill-bull { background:#30d15815;color:#1a8c3a;border-radius:20px;padding:3px 12px;font-size:0.75rem;font-weight:600; }

    /* API status dot */
    .api-ok  { color:#30d158;font-weight:600;font-size:0.82rem; }
    .api-err { color:#ff453a;font-weight:600;font-size:0.82rem; }

    h2 { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.01em; margin-bottom: 0.85rem; }
    hr { border: none; border-top: 1px solid #e5e5e7; margin: 1.25rem 0; }

    .stButton > button {
        background: #1d1d1f; color: #fff;
        border: none; border-radius: 10px;
        padding: 0.55rem 1.4rem;
        font-family: 'Inter', sans-serif; font-size: 0.875rem; font-weight: 500;
        width: 100%;
    }
    .stButton > button:hover { opacity: 0.82; }
    </style>
    """,
    unsafe_allow_html=True,
)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
_PROJECT_ROOT = Path(__file__).parent.parent
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

PIPELINE_STEPS = [
    {"id": "ingestion",   "label": "Financial data ingested",         "icon": "📥"},
    {"id": "kpi",         "label": "KPI snapshots computed",          "icon": "📊"},
    {"id": "anomalies",   "label": "Anomaly detection complete",      "icon": "🔍"},
    {"id": "monte_carlo", "label": "Monte Carlo survival score",      "icon": "🎲"},
    {"id": "scenarios",   "label": "Bear / Base / Bull stress test",  "icon": "📈"},
]

APPLE = {
    "blue": "#007aff", "green": "#30d158", "red": "#ff453a",
    "orange": "#ff9f0a", "gray": "#86868b", "bg": "#ffffff", "grid": "#f0f0f2",
}

# ---------------------------------------------------------------------------
# Database engine  (SQLite-compatible)
# ---------------------------------------------------------------------------

@st.cache_resource(show_spinner=False)
def _get_engine():
    """Return a sync SQLAlchemy engine, preferring the project's SQLite DB."""
    db_url = os.getenv("DATABASE_URL", "")

    if db_url:
        # Strip async drivers so SQLAlchemy sync engine is happy
        url = (db_url
               .replace("postgresql+asyncpg://", "postgresql://")
               .replace("sqlite+aiosqlite:///", "sqlite:///"))
        try:
            return create_engine(url, pool_pre_ping=True)
        except Exception:
            pass

    # Auto-detect local SQLite database
    sqlite_path = _PROJECT_ROOT / "ai_cfo.db"
    if sqlite_path.exists():
        return create_engine(f"sqlite:///{sqlite_path}")

    return None


def _query(sql: str, params: dict | None = None) -> pd.DataFrame:
    engine = _get_engine()
    if engine is None:
        return pd.DataFrame()
    try:
        with engine.connect() as conn:
            return pd.read_sql(text(sql), conn, params=params or {})
    except Exception:
        return pd.DataFrame()


# ---------------------------------------------------------------------------
# Data loaders (SQLite-compatible — no ::text casts)
# ---------------------------------------------------------------------------

def _load_all_run_ids() -> list[str]:
    df = _query("SELECT DISTINCT CAST(run_id AS TEXT) AS run_id FROM kpi_snapshots ORDER BY run_id DESC LIMIT 20")
    return df.iloc[:, 0].tolist() if not df.empty else []


def _load_kpi_history(run_id: str) -> pd.DataFrame:
    return _query(
        "SELECT week_start, mrr, arr, burn_rate, churn_rate, gross_margin, cac, ltv, wow_delta "
        "FROM kpi_snapshots WHERE CAST(run_id AS TEXT) = :rid ORDER BY week_start ASC",
        {"rid": run_id},
    )


def _load_anomalies(run_id: str) -> pd.DataFrame:
    return _query(
        "SELECT metric, actual_value, severity, source, description "
        "FROM anomalies WHERE CAST(run_id AS TEXT) = :rid ORDER BY severity DESC",
        {"rid": run_id},
    )


def _load_report(run_id: str) -> pd.DataFrame:
    return _query(
        "SELECT executive_summary, distribution_status FROM reports "
        "WHERE CAST(run_id AS TEXT) = :rid ORDER BY created_at DESC LIMIT 1",
        {"rid": run_id},
    )


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def _api_alive() -> bool:
    try:
        import httpx
        with httpx.Client(timeout=3.0) as c:
            return c.get(f"{API_BASE_URL}/health").status_code == 200
    except Exception:
        return False


def _post(path: str, **kwargs) -> dict | None:
    try:
        import httpx
        with httpx.Client(timeout=180.0) as c:
            resp = c.post(f"{API_BASE_URL}{path}", **kwargs)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        st.error(f"API error: {e}")
        return None


def _poll_status(run_id: str) -> dict:
    try:
        import httpx
        with httpx.Client(timeout=5.0) as c:
            r = c.get(f"{API_BASE_URL}/runs/{run_id}/status")
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return {"steps": [], "complete": False}


# ---------------------------------------------------------------------------
# Chart builders
# ---------------------------------------------------------------------------

CHART_BASE = dict(
    paper_bgcolor=APPLE["bg"], plot_bgcolor=APPLE["bg"],
    font=dict(family="Inter, sans-serif", size=12, color="#1d1d1f"),
    margin=dict(l=12, r=12, t=24, b=12),
    showlegend=True,
    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0, font=dict(size=11)),
    xaxis=dict(showgrid=False, showline=False, zeroline=False, tickfont=dict(size=11, color="#86868b")),
    yaxis=dict(showgrid=True, gridcolor=APPLE["grid"], showline=False, zeroline=False,
               tickfont=dict(size=11, color="#86868b")),
)


def _chart_kpi_trends(df: pd.DataFrame) -> go.Figure:
    fig = go.Figure()
    x = pd.to_datetime(df["week_start"])
    fig.add_trace(go.Scatter(x=x, y=df["mrr"].astype(float), name="MRR",
                             mode="lines+markers", line=dict(color=APPLE["blue"], width=2.5),
                             marker=dict(size=5)))
    fig.add_trace(go.Scatter(x=x, y=df["burn_rate"].astype(float), name="Burn Rate",
                             mode="lines+markers", line=dict(color=APPLE["red"], width=2.5, dash="dot"),
                             marker=dict(size=5)))
    if "gross_margin" in df.columns:
        fig.add_trace(go.Scatter(x=x, y=df["gross_margin"].astype(float) * 100,
                                 name="Gross Margin %", mode="lines",
                                 line=dict(color=APPLE["green"], width=1.5), yaxis="y2"))
    layout = {**CHART_BASE, "height": 250,
              "yaxis2": dict(overlaying="y", side="right", ticksuffix="%",
                             showgrid=False, tickfont=dict(size=11, color="#86868b"))}
    fig.update_layout(**layout)
    return fig


def _chart_survival_gauge(score: int) -> go.Figure:
    color = APPLE["green"] if score >= 80 else (APPLE["orange"] if score >= 50 else APPLE["red"])
    fig = go.Figure(go.Indicator(
        mode="gauge+number", value=score,
        number=dict(font=dict(size=52, family="Inter", color="#1d1d1f")),
        gauge=dict(
            axis=dict(range=[0, 100], tickwidth=0, showticklabels=False),
            bar=dict(color=color, thickness=0.7),
            bgcolor="white", borderwidth=0,
            steps=[dict(range=[0, 50], color="#fff0f0"),
                   dict(range=[50, 75], color="#fff8f0"),
                   dict(range=[75, 100], color="#f0fff4")],
        ),
    ))
    fig.update_layout(paper_bgcolor="white", plot_bgcolor="white",
                      margin=dict(l=20, r=20, t=20, b=20), height=180,
                      font=dict(family="Inter, sans-serif"))
    return fig


def _chart_scenarios(scenarios: list[dict]) -> go.Figure:
    names = [s["scenario"].upper() for s in scenarios]
    values = [float(s["months_runway"]) for s in scenarios]
    colors = [APPLE["red"], APPLE["blue"], APPLE["green"]]
    fig = go.Figure(go.Bar(
        x=names, y=values, marker_color=colors, marker_line_width=0, width=0.45,
        text=[f"{v:.1f}mo" for v in values], textposition="outside",
        textfont=dict(size=12, color="#1d1d1f", family="Inter"),
    ))
    layout = {**CHART_BASE, "height": 210,
              "xaxis": dict(showgrid=False, showline=False, zeroline=False,
                            tickfont=dict(size=13, color="#1d1d1f")),
              "yaxis": dict(title="Months", showgrid=True, gridcolor=APPLE["grid"],
                            zeroline=False, tickfont=dict(size=11, color="#86868b")),
              "showlegend": False}
    fig.update_layout(**layout)
    return fig


# ---------------------------------------------------------------------------
# Pipeline progress UI
# ---------------------------------------------------------------------------

def _render_pipeline(completed_step_ids: list[str], running_step_id: str | None = None) -> None:
    completed = set(completed_step_ids)
    for step in PIPELINE_STEPS:
        sid = step["id"]
        if sid in completed:
            st.markdown(
                f'<div class="step-done">'
                f'<span class="icon">✅</span>'
                f'<div><div class="step-label">{step["label"]}</div></div>'
                f'</div>',
                unsafe_allow_html=True,
            )
        elif sid == running_step_id:
            st.markdown(
                f'<div class="step-run">'
                f'<span class="icon">⏳</span>'
                f'<div><div class="step-label">{step["label"]}</div>'
                f'<div class="step-detail">Running…</div></div>'
                f'</div>',
                unsafe_allow_html=True,
            )
        else:
            st.markdown(
                f'<div class="step-wait">'
                f'<span class="icon">{step["icon"]}</span>'
                f'<div><div class="step-label">{step["label"]}</div></div>'
                f'</div>',
                unsafe_allow_html=True,
            )


def _live_pipeline_loop(run_id: str, pipeline_placeholder, results_placeholder) -> None:
    """Poll /runs/{run_id}/status until complete, updating UI each tick."""
    all_step_ids = [s["id"] for s in PIPELINE_STEPS]

    for _ in range(120):  # max 2 minutes
        status = _poll_status(run_id)
        done_ids = [s["id"] for s in status.get("steps", [])]

        # Determine which step is currently running
        running = None
        for sid in all_step_ids:
            if sid not in done_ids:
                running = sid
                break

        with pipeline_placeholder.container():
            _render_pipeline(done_ids, running_step_id=running)

        if status.get("complete"):
            # Done! Show full results
            with results_placeholder.container():
                _render_results(run_id, status)
            st.session_state["active_run_id"] = run_id
            st.session_state["pipeline_done"] = True
            return

        time.sleep(0.7)

    pipeline_placeholder.error("Pipeline timed out after 2 minutes.")


# ---------------------------------------------------------------------------
# Results renderer
# ---------------------------------------------------------------------------

def _kpi_card(col, label: str, value: str, wow: float) -> None:
    if wow > 0:
        delta = f'<div class="delta-positive">▲ {wow*100:.1f}%</div>'
    elif wow < 0:
        delta = f'<div class="delta-negative">▼ {abs(wow)*100:.1f}%</div>'
    else:
        delta = ""
    col.markdown(
        f'<div class="metric-card">'
        f'<div class="label-text">{label}</div>'
        f'<div class="value-text">{value}</div>'
        f'{delta}'
        f'</div>',
        unsafe_allow_html=True,
    )


def _render_results(run_id: str, status: dict) -> None:
    kpi_df = _load_kpi_history(run_id)
    anomaly_df = _load_anomalies(run_id)
    report_df = _load_report(run_id)
    latest = kpi_df.iloc[-1] if not kpi_df.empty else None

    st.markdown("<hr/>", unsafe_allow_html=True)
    st.markdown("## Key Metrics")

    if latest is not None:
        c1, c2, c3, c4, c5 = st.columns(5)
        wow = latest.get("wow_delta") or {}
        if isinstance(wow, str):
            import json
            try:
                wow = json.loads(wow)
            except Exception:
                wow = {}

        _kpi_card(c1, "MRR", f"${float(latest['mrr']):,.0f}", float(wow.get("mrr", 0) or 0))
        _kpi_card(c2, "ARR", f"${float(latest['arr']):,.0f}", float(wow.get("arr", 0) or 0))
        _kpi_card(c3, "Burn Rate", f"${float(latest['burn_rate']):,.0f}/wk", float(wow.get("burn_rate", 0) or 0))
        _kpi_card(c4, "Churn Rate", f"{float(latest['churn_rate'])*100:.1f}%", float(wow.get("churn_rate", 0) or 0))
        _kpi_card(c5, "Gross Margin", f"{float(latest['gross_margin'])*100:.1f}%", float(wow.get("gross_margin", 0) or 0))

    st.markdown("<div style='height:1rem'></div>", unsafe_allow_html=True)

    # Survival + KPI trends
    col_surv, col_trend = st.columns([1, 2.5])

    with col_surv:
        st.markdown("## Survival Score")
        surv = st.session_state.get("survival_data", {})
        if surv:
            score = int(surv.get("score", 0))
            label = surv.get("label", "—").replace("_", " ")
            deadline = surv.get("fundraising_deadline", "")
            st.plotly_chart(_chart_survival_gauge(score), use_container_width=True,
                            config={"displayModeBar": False}, key=f"gauge_{run_id}")
            st.markdown(
                f'<div style="text-align:center;">'
                f'<div class="label-text">{label}</div>'
                + (f'<div style="font-size:0.8rem;color:#ff453a;font-weight:500;margin-top:0.5rem;">⚡ Raise by {deadline}</div>' if deadline else "")
                + "</div>",
                unsafe_allow_html=True,
            )
        else:
            st.markdown('<div class="metric-card" style="text-align:center;padding:2rem;">'
                        '<div class="label-text">SURVIVAL SCORE</div>'
                        '<div style="font-size:2.5rem;font-weight:700;color:#86868b;margin-top:0.5rem;">—</div>'
                        '</div>', unsafe_allow_html=True)

    with col_trend:
        st.markdown("## KPI Trends")
        if not kpi_df.empty:
            st.plotly_chart(_chart_kpi_trends(kpi_df), use_container_width=True,
                            config={"displayModeBar": False}, key=f"kpi_trends_{run_id}")

    # Scenario + Anomalies
    col_scen, col_anom = st.columns([1.2, 1.8])

    with col_scen:
        st.markdown("## Scenario Stress Test")
        scenarios = st.session_state.get("scenario_data", [])
        if scenarios:
            st.plotly_chart(_chart_scenarios(scenarios), use_container_width=True,
                            config={"displayModeBar": False}, key=f"scenarios_{run_id}")
            for s in scenarios:
                pill = {"bear": "pill-bear", "base": "pill-base", "bull": "pill-bull"}.get(s["scenario"], "pill-base")
                ready_map = {"READY": ("🟢", "Ready"), "6_MONTHS": ("🟡", "6 Months"),
                             "NOT_READY": ("🔴", "Not Ready")}
                r_icon, r_label = ready_map.get(s.get("series_a_readiness", ""), ("⚪", "Unknown"))
                st.markdown(
                    f'<div style="display:flex;align-items:center;gap:0.75rem;margin:0.35rem 0;">'
                    f'<span class="{pill}">{s["scenario"].upper()}</span>'
                    f'<span style="font-size:0.82rem;">{float(s["months_runway"]):.1f} mo runway</span>'
                    f'<span style="margin-left:auto;font-size:0.8rem;">{r_icon} {r_label}</span>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
        else:
            st.markdown('<p style="color:#86868b;">Scenario data not available.</p>', unsafe_allow_html=True)

    with col_anom:
        st.markdown("## Anomaly Detection")
        if not anomaly_df.empty:
            for _, row in anomaly_df.iterrows():
                sev = row["severity"]
                cls = {"HIGH": "badge-high", "MEDIUM": "badge-medium", "LOW": "badge-low"}.get(sev, "badge-low")
                st.markdown(
                    f'<div class="metric-card" style="margin-bottom:0.5rem;padding:0.85rem 1.1rem;">'
                    f'<div style="display:flex;align-items:center;gap:0.6rem;">'
                    f'<span class="{cls}">{sev}</span>'
                    f'<span style="font-weight:600;font-size:0.875rem;">{row["metric"]}</span>'
                    f'<span style="margin-left:auto;font-size:0.82rem;color:#86868b;">{float(row["actual_value"]):,.2f}</span>'
                    f'</div>'
                    f'<div style="font-size:0.78rem;color:#555;margin-top:0.35rem;">{row.get("description","")}</div>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
        else:
            st.markdown('<div class="metric-card" style="text-align:center;padding:1.5rem;">'
                        '<div style="font-size:1.5rem;">✅</div>'
                        '<div style="font-size:0.85rem;color:#30d158;font-weight:500;margin-top:0.5rem;">No anomalies detected</div>'
                        '</div>', unsafe_allow_html=True)

    # Board prep button
    st.markdown("<div style='height:0.5rem'></div>", unsafe_allow_html=True)
    c_board, c_report, _ = st.columns([1, 1, 3])
    with c_board:
        if st.button("◈  Generate Board Q&A", key="board_btn"):
            with st.spinner("Generating 8 adversarial board questions…"):
                res = _post("/board-prep", json={"run_id": run_id})
                if res:
                    st.session_state["board_questions"] = res.get("questions", [])
                    st.rerun()
    with c_report:
        if st.button("📄  CFO Report", key="report_btn"):
            with st.spinner("Generating board-ready CFO briefing…"):
                res = _post("/report", json={"run_id": run_id})
                if res:
                    st.session_state["report_data"] = res
                    st.rerun()

    # Board questions
    bqs = st.session_state.get("board_questions", [])
    if bqs:
        st.markdown("<hr/>", unsafe_allow_html=True)
        st.markdown("## Board Interrogation Deck")
        st.markdown('<p style="color:#86868b;font-size:0.83rem;margin:-0.5rem 0 1rem 0;">'
                    'Questions a Sequoia partner would ask · with pre-drafted CFO answers</p>',
                    unsafe_allow_html=True)
        for i, q in enumerate(bqs):
            danger = q.get("danger", "YELLOW")
            cls = {"RED": "badge-red", "YELLOW": "badge-yellow", "GREEN": "badge-green"}.get(danger, "badge-yellow")
            with st.expander(f"Q{i+1}  {q.get('question','')[:80]}…", expanded=(i == 0)):
                st.markdown(f'<span class="{cls}">{danger}</span>', unsafe_allow_html=True)
                st.markdown(f"**{q.get('question','')}")
                st.markdown(
                    f'<div style="background:#f5f5f7;border-radius:12px;padding:1rem;margin:0.75rem 0;">'
                    f'<div style="font-size:0.72rem;font-weight:700;color:#86868b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.4rem;">CFO Answer</div>'
                    f'<p style="font-size:0.875rem;color:#1d1d1f;margin:0;line-height:1.6;">{q.get("answer","")}</p>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
                if q.get("follow_up"):
                    st.markdown(f'<p style="font-size:0.8rem;color:#86868b;font-style:italic;">Follow-up: {q["follow_up"]}</p>',
                                unsafe_allow_html=True)

    # Report preview
    rd = st.session_state.get("report_data", {})
    if rd:
        st.markdown("<hr/>", unsafe_allow_html=True)
        with st.expander("📄 CFO Report Preview", expanded=True):
            st.markdown(rd.get("executive_summary", ""))
            if rd.get("full_report_markdown"):
                st.markdown(rd["full_report_markdown"])


# ---------------------------------------------------------------------------
# Past runs tab
# ---------------------------------------------------------------------------

def _tab_past_runs() -> None:
    run_ids = _load_all_run_ids()
    if not run_ids:
        st.info("No completed runs found. Run the demo or upload a file on the Analyze tab.", icon="ℹ️")
        return

    run_id = st.selectbox("Select a past run", options=run_ids,
                          format_func=lambda x: f"run · {x[:8]}…")
    if run_id:
        # Show results directly (no pipeline animation needed)
        kpi_df = _load_kpi_history(run_id)
        if not kpi_df.empty:
            fake_status = {"steps": [{"id": s["id"]} for s in PIPELINE_STEPS], "complete": True}
            _render_results(run_id, fake_status)
        else:
            st.warning("No KPI data found for this run.")


# ---------------------------------------------------------------------------
# Main app
# ---------------------------------------------------------------------------

def main() -> None:
    # Header
    alive = _api_alive()
    api_dot = '<span class="api-ok">● API online</span>' if alive else '<span class="api-err">● API offline — start: poetry run uvicorn api.main:app --port 8000</span>'
    col_h, col_api = st.columns([3, 2])
    with col_h:
        st.markdown(
            "<h1 style='font-size:1.6rem;font-weight:700;letter-spacing:-0.03em;margin:0;'>◆ AI CFO Agent</h1>"
            "<p style='color:#86868b;font-size:0.83rem;margin:0.2rem 0 0 0;'>Autonomous financial intelligence · Monte Carlo · Board Prep · Scenario Stress</p>",
            unsafe_allow_html=True,
        )
    with col_api:
        st.markdown(
            f'<div style="text-align:right;padding-top:0.9rem;">{api_dot}</div>',
            unsafe_allow_html=True,
        )

    st.markdown("<hr/>", unsafe_allow_html=True)

    tab_analyze, tab_past = st.tabs(["🚀  Analyze Data", "📋  Past Runs"])

    # ── Analyze tab ──────────────────────────────────────────────────────────
    with tab_analyze:
        left, right = st.columns([1.4, 1])

        with left:
            st.markdown("### Upload your financials")
            uploaded = st.file_uploader(
                "Drop a CSV or PDF with your financial data",
                type=["csv", "pdf"],
                label_visibility="collapsed",
            )
            c_demo, c_upload = st.columns(2)
            with c_demo:
                run_demo = st.button("▶  Run Demo", help="Run on built-in sample data — no upload needed")
            with c_upload:
                run_file = st.button("⬆  Analyze File", disabled=(uploaded is None),
                                     help="Run pipeline on your uploaded file")

        with right:
            st.markdown("### Pipeline")
            pipeline_ph = st.empty()
            # Show idle state initially
            with pipeline_ph.container():
                _render_pipeline([], running_step_id=None)

        results_ph = st.empty()

        # Restore state from a previous pipeline run in this session
        if st.session_state.get("pipeline_done") and st.session_state.get("active_run_id"):
            rid = st.session_state["active_run_id"]
            with pipeline_ph.container():
                _render_pipeline([s["id"] for s in PIPELINE_STEPS])
            with results_ph.container():
                _render_results(rid, {"steps": PIPELINE_STEPS, "complete": True})

        # Trigger demo
        if run_demo:
            if not alive:
                st.error("API is offline. Start it first: `poetry run uvicorn api.main:app --port 8000`")
            else:
                st.session_state.pop("board_questions", None)
                st.session_state.pop("report_data", None)
                st.session_state.pop("survival_data", None)
                st.session_state.pop("scenario_data", None)
                st.session_state["pipeline_done"] = False

                with st.spinner("Starting demo pipeline…"):
                    res = _post("/demo/async")
                if res:
                    run_id = res["run_id"]
                    # Also call sync to get survival/scenario data
                    with st.spinner("Fetching full results…"):
                        sync_res = _post("/demo")
                    if sync_res:
                        surv = sync_res.get("survival_analysis") or {}
                        scen = sync_res.get("scenario_analysis") or []
                        if isinstance(surv, dict):
                            st.session_state["survival_data"] = surv
                        if isinstance(scen, list):
                            st.session_state["scenario_data"] = scen
                    with right:
                        with pipeline_ph.container():
                            _render_pipeline([s["id"] for s in PIPELINE_STEPS])
                    with results_ph.container():
                        _render_results(run_id, {"steps": PIPELINE_STEPS, "complete": True})
                    st.session_state["active_run_id"] = run_id
                    st.session_state["pipeline_done"] = True
                    # Clear cached engine so new DB data is picked up
                    _get_engine.clear()

        # Trigger file upload
        if run_file and uploaded is not None:
            if not alive:
                st.error("API is offline. Start it first: `poetry run uvicorn api.main:app --port 8000`")
            else:
                st.session_state.pop("board_questions", None)
                st.session_state.pop("report_data", None)
                st.session_state.pop("survival_data", None)
                st.session_state.pop("scenario_data", None)
                st.session_state["pipeline_done"] = False

                file_bytes = uploaded.read()

                with st.spinner("Starting analysis pipeline…"):
                    import httpx
                    try:
                        with httpx.Client(timeout=180.0) as c:
                            # Run sync endpoint to get full results
                            resp = c.post(
                                f"{API_BASE_URL}/analyze",
                                files={"file": (uploaded.name, file_bytes, "text/csv")},
                            )
                            resp.raise_for_status()
                            sync_res = resp.json()
                            run_id = sync_res["run_id"]
                            surv = sync_res.get("survival_analysis") or {}
                            scen = sync_res.get("scenario_analysis") or []
                            if isinstance(surv, dict):
                                st.session_state["survival_data"] = surv
                            if isinstance(scen, list):
                                st.session_state["scenario_data"] = scen
                    except Exception as e:
                        st.error(f"Analysis failed: {e}")
                        run_id = None

                if run_id:
                    with right:
                        with pipeline_ph.container():
                            _render_pipeline([s["id"] for s in PIPELINE_STEPS])
                    with results_ph.container():
                        _render_results(run_id, {"steps": PIPELINE_STEPS, "complete": True})
                    st.session_state["active_run_id"] = run_id
                    st.session_state["pipeline_done"] = True
                    _get_engine.clear()

    # ── Past runs tab ────────────────────────────────────────────────────────
    with tab_past:
        _tab_past_runs()


if __name__ == "__main__":
    main()

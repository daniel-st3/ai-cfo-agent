from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


SignalType = Literal["pricing_change", "job_posting", "news"]
SeverityType = Literal["LOW", "MEDIUM", "HIGH"]
AnomalySource = Literal["isolation_forest", "chronos2"]


class RawFinancialRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: date
    category: str = Field(min_length=1, max_length=100)
    amount: Decimal
    source_file: str | None = Field(default=None, max_length=255)
    customer_id: str | None = Field(default=None, max_length=255)
    run_id: uuid.UUID


class KPISnapshotRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: uuid.UUID
    week_start: date
    mrr: Decimal | None = None
    arr: Decimal | None = None
    churn_rate: Decimal | None = None
    burn_rate: Decimal | None = None
    gross_margin: Decimal | None = None
    cac: Decimal | None = None
    ltv: Decimal | None = None
    wow_delta: dict[str, Any] | None = None
    mom_delta: dict[str, Any] | None = None


class AnomalyRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: uuid.UUID
    metric: str = Field(min_length=1, max_length=100)
    actual_value: Decimal
    expected_range: dict[str, float]
    severity: SeverityType
    source: AnomalySource
    description: str | None = None


class MarketSignalRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: uuid.UUID
    competitor_name: str = Field(min_length=1, max_length=255)
    signal_type: SignalType
    summary: str = Field(min_length=1)
    raw_source_url: str | None = None
    date: date


class ReportRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: uuid.UUID
    week_start: date
    executive_summary: str
    full_text: str
    distribution_status: str = "pending"
    slack_message_ts: str | None = None
    email_sent_at: datetime | None = None


# ---------------------------------------------------------------------------
# WOW feature schemas
# ---------------------------------------------------------------------------

class SurvivalAnalysis(BaseModel):
    """Monte Carlo runway survival output — probability of financial ruin at each horizon."""

    score: int = Field(ge=0, le=100, description="Survival score 0-100 (100 = no risk of ruin in 365 days)")
    label: Literal["SAFE", "LOW_RISK", "MODERATE_RISK", "HIGH_RISK", "CRITICAL"]
    probability_ruin_90d: float = Field(ge=0.0, le=1.0)
    probability_ruin_180d: float = Field(ge=0.0, le=1.0)
    probability_ruin_365d: float = Field(ge=0.0, le=1.0)
    expected_zero_cash_day: int = Field(description="Median simulated days until cash hits zero")
    fundraising_deadline: str | None = Field(
        default=None,
        description="ISO date by which fundraising must start (expected_zero_cash_day minus 180 days)",
    )


class ScenarioResult(BaseModel):
    """Financial outcome for a single stress-test scenario."""

    scenario: Literal["bear", "base", "bull"]
    months_runway: float
    projected_mrr_6mo: float = Field(default=0.0, description="Projected MRR 6 months forward")
    series_a_readiness: Literal["READY", "6_MONTHS", "NOT_READY"]
    key_risks: list[str]
    recommended_actions: list[str]


class BoardQuestion(BaseModel):
    """A single adversarial board interrogation question with pre-drafted CFO answer."""

    question: str
    danger: Literal["RED", "YELLOW", "GREEN"]
    answer: str
    follow_up: str


# ---------------------------------------------------------------------------
# API request / response schemas
# ---------------------------------------------------------------------------

class AnalyzeResponse(BaseModel):
    run_id: uuid.UUID
    kpis: dict[str, Any]
    anomalies: list[dict[str, Any]]
    survival_analysis: dict[str, Any] | None = None
    scenario_analysis: list[dict[str, Any]] | None = None
    status: Literal["complete"]


class ReportRequest(BaseModel):
    run_id: uuid.UUID


class ReportResponse(BaseModel):
    run_id: uuid.UUID
    executive_summary: str
    full_report_markdown: str
    looker_url: str


class BoardPrepRequest(BaseModel):
    run_id: uuid.UUID


class BoardPrepResponse(BaseModel):
    run_id: uuid.UUID
    questions: list[dict[str, Any]]


class CFOInsightPayload(BaseModel):
    executive_summary: list[str] = Field(min_length=3, max_length=3)
    deep_dive: dict[str, str]
    risk_flags: list[dict[str, str]]
    market_snapshot: str
    recommendations: list[str]

    @field_validator("risk_flags")
    @classmethod
    def normalize_risk_flags(cls, value: list[dict[str, str]]) -> list[dict[str, str]]:
        normalized: list[dict[str, str]] = []
        for item in value:
            severity = item.get("severity", "MEDIUM").upper()
            if severity not in {"LOW", "MEDIUM", "HIGH"}:
                severity = "MEDIUM"
            normalized.append(
                {
                    "metric": item.get("metric", "unknown"),
                    "description": item.get("description", ""),
                    "severity": severity,
                }
            )
        return normalized


class VCMemoRequest(BaseModel):
    run_id: uuid.UUID
    company_name: str = ""
    sector: str = "saas"
    months_runway: float = 0.0
    survival_score: int = 0
    ruin_probability_6m: float = 0.0


class VCMemoResponse(BaseModel):
    recommendation: Literal["PASS", "WATCH", "INVEST"]
    headline: str
    memo: str
    red_flags: list[str]
    what_would_change_our_mind: list[str]


class InvestorUpdateRequest(BaseModel):
    run_id: uuid.UUID
    company_name: str = ""
    sector: str = "saas"
    months_runway: float = 0.0
    survival_score: int = 0


class InvestorUpdateResponse(BaseModel):
    subject: str
    greeting: str
    metrics_block: str
    wins: list[str]
    challenges: list[str]
    next_30_days: list[str]
    asks: list[str]
    closing: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
    db: Literal["connected", "disconnected"]
    models: list[str]

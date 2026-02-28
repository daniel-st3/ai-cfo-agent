from __future__ import annotations

import hashlib
import importlib
import math
import os
import statistics as _statistics
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Iterable

import numpy as np
import polars as pl
from sklearn.ensemble import IsolationForest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import Anomaly, CustomerProfile, FraudAlert, KPISnapshot, RawFinancial
from api.schemas import AnomalyRecord, CustomerProfileRecord, FraudAlertRecord, KPISnapshotRecord

METRIC_NAMES = ["mrr", "arr", "churn_rate", "burn_rate", "gross_margin", "cac", "ltv"]


@dataclass
class ChronosBounds:
    low: list[float]
    median: list[float]
    high: list[float]


class Chronos2Forecaster:
    _pipeline: Any = None
    # Prediction cache keyed on MD5 of (series_values, horizon) — avoids re-inference on retries
    _forecast_cache: dict[str, ChronosBounds] = {}

    def __init__(self, enabled: bool = True) -> None:
        self.enabled = enabled and os.getenv("DISABLE_CHRONOS", "0") != "1"

    def _import_pipeline_class(self) -> Any:
        for module_name in ("chronos", "chronos_forecasting"):
            try:
                module = importlib.import_module(module_name)
                return getattr(module, "ChronosPipeline")
            except Exception:
                continue
        raise RuntimeError("ChronosPipeline not available. Install chronos-forecasting.")

    def _get_pipeline(self) -> Any:
        if not self.enabled:
            raise RuntimeError("Chronos disabled")
        if Chronos2Forecaster._pipeline is None:
            pipeline_cls = self._import_pipeline_class()
            device_map = "cpu"
            try:
                import torch
                if torch.cuda.is_available():
                    device_map = "cuda"
            except Exception:
                device_map = "cpu"
            # chronos-t5-tiny: 40MB vs 600MB for chronos-2-base, ~120MB RAM vs 1.3GB
            Chronos2Forecaster._pipeline = pipeline_cls.from_pretrained(
                "amazon/chronos-t5-tiny",
                device_map=device_map,
                torch_dtype="bfloat16",
            )
        return Chronos2Forecaster._pipeline

    @staticmethod
    def _extract_quantiles(prediction: Any, horizon: int) -> ChronosBounds:
        if isinstance(prediction, dict):
            quantiles = prediction.get("quantiles") or prediction.get("forecast")
            if quantiles:
                if isinstance(quantiles, dict):
                    normalized_quantiles: dict[float, Any] = {}
                    for key, value in quantiles.items():
                        try:
                            normalized_quantiles[float(key)] = value
                        except Exception:
                            continue
                    if {0.1, 0.5, 0.9}.issubset(normalized_quantiles.keys()):
                        return ChronosBounds(
                            low=list(np.asarray(normalized_quantiles[0.1], dtype=float)[:horizon]),
                            median=list(np.asarray(normalized_quantiles[0.5], dtype=float)[:horizon]),
                            high=list(np.asarray(normalized_quantiles[0.9], dtype=float)[:horizon]),
                        )
                else:
                    arr_q = np.asarray(quantiles, dtype=float)
                    if arr_q.ndim == 2 and arr_q.shape[0] >= 3:
                        return ChronosBounds(
                            low=list(np.asarray(arr_q[0], dtype=float)[:horizon]),
                            median=list(np.asarray(arr_q[1], dtype=float)[:horizon]),
                            high=list(np.asarray(arr_q[2], dtype=float)[:horizon]),
                        )

        arr = np.asarray(prediction)
        if arr.ndim == 3:
            arr = arr[0]
        if arr.ndim == 2 and arr.shape[0] >= 20:
            low, median, high = np.quantile(arr, [0.1, 0.5, 0.9], axis=0)
        elif arr.ndim == 2 and arr.shape[0] == 3:
            low, median, high = arr[0], arr[1], arr[2]
        elif arr.ndim == 1:
            low = median = high = arr
        else:
            low, median, high = np.quantile(arr, [0.1, 0.5, 0.9], axis=0)

        return ChronosBounds(
            low=list(np.asarray(low, dtype=float)[:horizon]),
            median=list(np.asarray(median, dtype=float)[:horizon]),
            high=list(np.asarray(high, dtype=float)[:horizon]),
        )

    def forecast_bounds(self, series: list[float], horizon: int) -> ChronosBounds:
        # Cache hit: same series + horizon → skip inference
        cache_key = hashlib.md5(
            f"{series}:{horizon}".encode(), usedforsecurity=False
        ).hexdigest()
        if cache_key in Chronos2Forecaster._forecast_cache:
            return Chronos2Forecaster._forecast_cache[cache_key]

        pipeline = self._get_pipeline()
        context = series[:-horizon]
        if len(context) < 6:
            raise RuntimeError("Insufficient history for Chronos forecast")

        try:
            import torch
        except Exception as exc:
            raise RuntimeError("Torch missing for Chronos forecast") from exc

        context_tensor = torch.tensor(context, dtype=torch.float32)
        prediction: Any

        try:
            prediction = pipeline.predict(
                context=context_tensor,
                prediction_length=horizon,
                quantile_levels=[0.1, 0.5, 0.9],
            )
        except TypeError:
            prediction = pipeline.predict(
                context=context_tensor,
                prediction_length=horizon,
                num_samples=200,
            )

        result = self._extract_quantiles(prediction, horizon)
        Chronos2Forecaster._forecast_cache[cache_key] = result
        return result


def _as_decimal(value: float | Decimal | None, scale: str = "0.01") -> Decimal | None:
    if value is None:
        return None
    dec = value if isinstance(value, Decimal) else Decimal(str(value))
    return dec.quantize(Decimal(scale), rounding=ROUND_HALF_UP)


def _to_float(value: Decimal | float | int | None) -> float:
    if value is None:
        return 0.0
    return float(value)


def _safe_div(numerator: float, denominator: float, default: float = 0.0) -> float:
    if math.isclose(denominator, 0.0):
        return default
    return numerator / denominator


def _delta(current: float, previous: float) -> float:
    if math.isclose(previous, 0.0):
        return 0.0
    return (current - previous) / abs(previous)


def _rows_to_polars(rows: Iterable[RawFinancial]) -> pl.DataFrame:
    records = [
        {
            "date": item.date,
            "category": item.category,
            "amount": float(item.amount),
            "customer_id": item.customer_id,
        }
        for item in rows
    ]
    if not records:
        return pl.DataFrame(schema={"date": pl.Date, "category": pl.Utf8, "amount": pl.Float64, "customer_id": pl.Utf8})
    return pl.DataFrame(records)


def compute_kpi_snapshots(rows: Iterable[RawFinancial], run_id: uuid.UUID) -> list[KPISnapshotRecord]:
    df = _rows_to_polars(rows)
    if df.is_empty():
        return []

    base = df.lazy().with_columns(
        pl.col("date").cast(pl.Date),
        pl.col("customer_id").cast(pl.Utf8),
        pl.col("date").dt.truncate("1w").alias("week_start"),
    )

    weekly_financials = (
        base.with_columns(
            pl.when(pl.col("category") == "subscription_revenue").then(pl.col("amount")).otherwise(0.0).alias("subscription_revenue"),
            pl.when(pl.col("category") == "churn_refund").then(pl.col("amount")).otherwise(0.0).alias("churn_refund"),
            pl.when(pl.col("category") == "salary_expense").then(pl.col("amount")).otherwise(0.0).alias("salary_expense"),
            pl.when(pl.col("category") == "software_expense").then(pl.col("amount")).otherwise(0.0).alias("software_expense"),
            pl.when(pl.col("category") == "marketing_expense").then(pl.col("amount")).otherwise(0.0).alias("marketing_expense"),
            pl.when(pl.col("category") == "cogs").then(pl.col("amount")).otherwise(0.0).alias("cogs"),
            pl.when(pl.col("category") == "tax_payment").then(pl.col("amount")).otherwise(0.0).alias("tax_payment"),
        )
        .group_by("week_start")
        .agg(
            pl.sum("subscription_revenue").alias("subscription_revenue"),
            pl.sum("churn_refund").alias("churn_refund"),
            pl.sum("salary_expense").alias("salary_expense"),
            pl.sum("software_expense").alias("software_expense"),
            pl.sum("marketing_expense").alias("marketing_expense"),
            pl.sum("cogs").alias("cogs"),
            pl.sum("tax_payment").alias("tax_payment"),
        )
        .rename({"week_start": "date"})
    )

    sub_base = base.filter(
        (pl.col("category") == "subscription_revenue")
        & pl.col("customer_id").is_not_null()
        & (pl.col("customer_id").str.len_chars() > 0)
    )

    new_customers_weekly = (
        sub_base
        .group_by("customer_id")
        .agg(pl.col("week_start").min().alias("first_week"))
        .group_by("first_week")
        .agg(pl.len().alias("new_customer_events"))
        .rename({"first_week": "date"})
    )

    active_customers_weekly = (
        sub_base
        .group_by("week_start")
        .agg(pl.col("customer_id").n_unique().alias("active_customer_count"))
        .rename({"week_start": "date"})
    )

    weekly = (
        weekly_financials
        .join(new_customers_weekly, on="date", how="left")
        .join(active_customers_weekly, on="date", how="left")
        .with_columns(
            pl.col("new_customer_events").fill_null(0).cast(pl.Int64),
            pl.col("active_customer_count").fill_null(1).cast(pl.Int64),
        )
        .sort("date")
        .collect()
    )

    snapshots: list[KPISnapshotRecord] = []
    hist: list[dict[str, float]] = []

    for row in weekly.iter_rows(named=True):
        revenue = float(row["subscription_revenue"])
        churn_abs = abs(float(row["churn_refund"]))
        salary = abs(float(row["salary_expense"]))
        software = abs(float(row["software_expense"]))
        marketing = abs(float(row["marketing_expense"]))
        cogs = abs(float(row["cogs"]))
        taxes = abs(float(row["tax_payment"]))
        new_customers = int(row["new_customer_events"] or 0)
        active_customer_count = max(int(row["active_customer_count"] or 1), 1)

        expenses_total = salary + software + marketing + cogs + taxes

        mrr = max(revenue - churn_abs, 0.0)
        arr = mrr * 12.0
        churn_rate = min(_safe_div(churn_abs, revenue, 0.0), 1.0)
        burn_rate = max(expenses_total - revenue, 0.0)
        gross_margin = _safe_div(revenue - cogs, revenue, 0.0)
        # CAC: trailing 4-week marketing spend per newly acquired customer
        cac = _safe_div(marketing, float(new_customers), 0.0)
        # ARPU: revenue per active paying customer (weekly → annualised for LTV)
        arpu_weekly = _safe_div(revenue, float(active_customer_count), 0.0)
        arpu_annual = arpu_weekly * 52.0
        # LTV: use trailing churn rate (12-week avg) for stability; floor at 5% annual
        trailing_churn_weekly = (
            sum(h["churn_rate"] for h in hist[-12:]) / len(hist[-12:])
            if len(hist) >= 4 else max(churn_rate, 0.001)
        )
        annual_churn = max(trailing_churn_weekly * 52.0, 0.05)  # at least 5% annual churn
        ltv = _safe_div(arpu_annual * max(gross_margin, 0.01), annual_churn, 0.0)

        metrics = {
            "mrr": mrr,
            "arr": arr,
            "churn_rate": churn_rate,
            "burn_rate": burn_rate,
            "gross_margin": gross_margin,
            "cac": cac,
            "ltv": ltv,
        }
        hist.append(metrics)

        previous = hist[-2] if len(hist) >= 2 else {name: 0.0 for name in METRIC_NAMES}
        month_back = hist[-5] if len(hist) >= 5 else {name: 0.0 for name in METRIC_NAMES}

        wow_delta = {name: round(_delta(metrics[name], previous[name]), 4) for name in METRIC_NAMES}
        mom_delta = {name: round(_delta(metrics[name], month_back[name]), 4) for name in METRIC_NAMES}

        snapshots.append(
            KPISnapshotRecord(
                run_id=run_id,
                week_start=row["date"],
                mrr=_as_decimal(mrr),
                arr=_as_decimal(arr),
                churn_rate=_as_decimal(churn_rate, "0.0001"),
                burn_rate=_as_decimal(burn_rate),
                gross_margin=_as_decimal(gross_margin, "0.0001"),
                cac=_as_decimal(cac),
                ltv=_as_decimal(ltv),
                wow_delta=wow_delta,
                mom_delta=mom_delta,
            )
        )
    return snapshots


def detect_isolation_forest_anomalies(
    snapshots: list[KPISnapshotRecord], run_id: uuid.UUID
) -> list[AnomalyRecord]:
    anomalies: list[AnomalyRecord] = []
    if len(snapshots) < 8:
        return anomalies

    for metric in METRIC_NAMES:
        values = np.array([_to_float(getattr(item, metric)) for item in snapshots], dtype=float)
        if np.allclose(values, values[0]):
            continue

        model = IsolationForest(contamination=0.05, random_state=42)
        labels = model.fit_predict(values.reshape(-1, 1))
        scores = model.score_samples(values.reshape(-1, 1))

        max_score = float(np.max(scores))
        min_score = float(np.min(scores))
        scale = max(max_score - min_score, 1e-9)

        low_q, med_q, high_q = np.quantile(values, [0.1, 0.5, 0.9])

        for idx, label in enumerate(labels):
            if label != -1:
                continue
            anomaly_strength = (max_score - float(scores[idx])) / scale
            if anomaly_strength >= 0.66:
                severity = "HIGH"
            elif anomaly_strength >= 0.33:
                severity = "MEDIUM"
            else:
                severity = "LOW"

            snapshot_date = snapshots[idx].week_start.isoformat()
            anomalies.append(
                AnomalyRecord(
                    run_id=run_id,
                    metric=metric,
                    actual_value=_as_decimal(float(values[idx]), "0.0001") or Decimal("0.0000"),
                    expected_range={"low": float(low_q), "median": float(med_q), "high": float(high_q)},
                    severity=severity,
                    source="isolation_forest",
                    description=f"Isolation forest outlier in {metric} for week {snapshot_date}",
                )
            )
    return anomalies


def detect_chronos_anomalies(
    snapshots: list[KPISnapshotRecord], run_id: uuid.UUID, forecaster: Chronos2Forecaster
) -> list[AnomalyRecord]:
    anomalies: list[AnomalyRecord] = []
    if len(snapshots) < 12 or not forecaster.enabled:
        return anomalies

    for metric in METRIC_NAMES:
        values = [_to_float(getattr(item, metric)) for item in snapshots]
        horizon = min(4, max(2, len(values) // 6))
        if len(values) <= horizon + 6:
            continue

        try:
            bounds = forecaster.forecast_bounds(values, horizon)
        except Exception:
            continue

        actual_tail = values[-horizon:]
        tail_snapshots = snapshots[-horizon:]
        for idx in range(horizon):
            actual = actual_tail[idx]
            low = float(bounds.low[idx])
            median = float(bounds.median[idx])
            high = float(bounds.high[idx])

            if actual > high:
                description = f"Chronos detected upward spike for {metric} in week {tail_snapshots[idx].week_start.isoformat()}"
            elif actual < low:
                description = f"Chronos detected downward collapse for {metric} in week {tail_snapshots[idx].week_start.isoformat()}"
            else:
                continue

            anomalies.append(
                AnomalyRecord(
                    run_id=run_id,
                    metric=metric,
                    actual_value=_as_decimal(actual, "0.0001") or Decimal("0.0000"),
                    expected_range={"low": low, "median": median, "high": high},
                    severity="HIGH",
                    source="chronos2",
                    description=description,
                )
            )
    return anomalies


def merge_and_deduplicate_anomalies(anomalies: list[AnomalyRecord]) -> list[AnomalyRecord]:
    severity_rank = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}
    merged: dict[tuple[str, str, str], AnomalyRecord] = {}

    for item in anomalies:
        actual_key = f"{float(item.actual_value):.4f}"
        key = (item.metric, actual_key, item.description or "")
        existing = merged.get(key)
        if existing is None:
            merged[key] = item
            continue

        if severity_rank[item.severity] > severity_rank[existing.severity]:
            merged[key] = item
        elif item.source == "chronos2" and existing.source != "chronos2":
            merged[key] = item

    return list(merged.values())


def compute_survival_analysis(
    snapshots: list[KPISnapshotRecord], n_simulations: int = 1000
) -> dict[str, Any]:
    """Monte Carlo runway survival simulation.

    Runs 1,000 scenarios with randomized weekly cash flows to produce a probability
    distribution of when the company hits zero cash. Returns a Survival Score (0-100)
    and a Fundraising Deadline — the date by which fundraising conversations must start
    to ensure 12 months of runway at close.

    No external API calls — uses numpy only.
    """
    if len(snapshots) < 3:
        return {}

    burn_rates = np.array([_to_float(s.burn_rate) for s in snapshots])
    mrr_values = np.array([_to_float(s.mrr) for s in snapshots])

    # Weekly net cash change = -burn_rate (burn_rate is already net of revenue)
    net_weekly = -burn_rates  # all values <= 0

    mu = float(np.mean(net_weekly))
    sigma = float(np.std(net_weekly)) if len(net_weekly) > 1 else abs(mu) * 0.2

    # Infer current cash: assume initial seed = 18 months of initial MRR (typical seed sizing)
    last_mrr = float(mrr_values[-1]) if mrr_values[-1] > 0 else 1.0
    total_burned = float(np.sum(burn_rates))
    initial_cash = max(last_mrr * 18.0, total_burned * 2.0)
    current_cash = max(initial_cash - total_burned, last_mrr * 2.0)

    # Run simulations
    rng = np.random.default_rng(42)
    max_weeks = 54  # ~1 year + buffer
    zero_cash_days: list[int] = []
    ruin_90 = ruin_180 = ruin_365 = 0

    for _ in range(n_simulations):
        cash = current_cash
        exhausted_at_days: int | None = None

        for week in range(1, max_weeks + 1):
            weekly_change = rng.normal(mu, max(sigma, 1.0))
            cash += weekly_change
            if cash <= 0 and exhausted_at_days is None:
                exhausted_at_days = week * 7

        days = exhausted_at_days if exhausted_at_days is not None else max_weeks * 7 + 1
        zero_cash_days.append(days)
        if days <= 90:
            ruin_90 += 1
        if days <= 180:
            ruin_180 += 1
        if days <= 365:
            ruin_365 += 1

    p_ruin_90 = ruin_90 / n_simulations
    p_ruin_180 = ruin_180 / n_simulations
    p_ruin_365 = ruin_365 / n_simulations
    expected_zero_day = int(np.median(zero_cash_days))

    survival_score = max(0, min(100, int((1.0 - p_ruin_365) * 100)))

    if survival_score >= 80:
        label = "SAFE"
    elif survival_score >= 65:
        label = "LOW_RISK"
    elif survival_score >= 45:
        label = "MODERATE_RISK"
    elif survival_score >= 25:
        label = "HIGH_RISK"
    else:
        label = "CRITICAL"

    # Fundraising deadline = expected_zero_day minus 180 days (typical raise duration)
    fundraising_deadline_days = expected_zero_day - 180
    fundraising_deadline: str | None = None
    if fundraising_deadline_days > 0:
        fundraising_deadline = (date.today() + timedelta(days=fundraising_deadline_days)).isoformat()

    return {
        "score": survival_score,
        "label": label,
        "probability_ruin_90d": round(p_ruin_90, 4),
        "probability_ruin_180d": round(p_ruin_180, 4),
        "probability_ruin_365d": round(p_ruin_365, 4),
        "expected_zero_cash_day": min(expected_zero_day, max_weeks * 7),
        "fundraising_deadline": fundraising_deadline,
    }


def compute_scenario_stress_test(snapshots: list[KPISnapshotRecord]) -> list[dict[str, Any]]:
    """Three-scenario financial stress test: Bear / Base / Bull.

    Pure arithmetic on KPI snapshots — zero API calls, sub-millisecond execution.

    Bear:  Top customer churns (MRR -20%), expenses up 15%
    Base:  Current trajectory continues for 6 months
    Bull:  Revenue grows at 2.5x current rate, costs down 15%
    """
    if not snapshots:
        return []

    latest = snapshots[-1]
    last_mrr = max(_to_float(latest.mrr), 1.0)
    last_burn = max(_to_float(latest.burn_rate), 0.0)

    # Weekly MRR growth rate from recent history
    if len(snapshots) >= 4:
        prev_mrr = max(_to_float(snapshots[-4].mrr), 0.001)
        mrr_growth_rate = max(_delta(last_mrr, prev_mrr) / 4.0, -0.15)
    elif len(snapshots) >= 2:
        prev_mrr = max(_to_float(snapshots[-2].mrr), 0.001)
        mrr_growth_rate = max(_delta(last_mrr, prev_mrr), -0.15)
    else:
        mrr_growth_rate = 0.01

    # Current cash estimate (simplified: seed = 18 months of initial MRR)
    total_burned = sum(_to_float(s.burn_rate) for s in snapshots)
    initial_cash = max(last_mrr * 18.0, total_burned * 2.0)
    current_cash = max(initial_cash - total_burned, last_mrr * 2.0)

    def _months_runway(cash: float, weekly_burn: float) -> float:
        """Simple cash / weekly_burn / weeks_per_month."""
        if weekly_burn <= 0.0:
            return 99.0  # company is profitable
        return round(cash / weekly_burn / 4.33, 1)

    def _projected_mrr_6mo(base_mrr: float, weekly_growth: float) -> float:
        return base_mrr * ((1.0 + weekly_growth) ** 26)

    def _series_a_readiness(proj_mrr: float, adj_burn: float, weekly_growth: float) -> str:
        burn_multiple = _safe_div(adj_burn * 52.0, max(proj_mrr * weekly_growth * 52.0, 1.0), 99.0)
        if proj_mrr >= 100_000 and burn_multiple <= 2.0:
            return "READY"
        if proj_mrr >= 50_000 or weekly_growth >= 0.03:
            return "6_MONTHS"
        return "NOT_READY"

    scenario_params = [
        # (name, mrr_mult, burn_mult, growth_mult)
        ("bear", 0.80, 1.15, 0.30),
        ("base", 1.00, 1.00, 1.00),
        ("bull", 1.20, 0.85, 2.50),
    ]

    scenarios: list[dict[str, Any]] = []

    for scenario_name, mrr_mult, burn_mult, growth_mult in scenario_params:
        adj_mrr = last_mrr * mrr_mult
        adj_burn = last_burn * burn_mult
        adj_growth = mrr_growth_rate * growth_mult

        months = _months_runway(current_cash, adj_burn)
        proj_mrr = _projected_mrr_6mo(adj_mrr, adj_growth)
        readiness = _series_a_readiness(proj_mrr, adj_burn, adj_growth)

        if scenario_name == "bear":
            key_risks = [
                f"Top customer loss reduces MRR by ${last_mrr * 0.20:,.0f}/week",
                "Increased cost pressure compresses gross margin",
                f"Runway shortens from {_months_runway(current_cash, last_burn):.0f} to {months:.0f} months",
            ]
            recommended_actions = [
                "Identify and protect top 3 revenue accounts with dedicated success plans",
                "Initiate 90-day cost reduction targeting software and marketing spend",
                "Begin fundraising conversations immediately if not already in progress",
            ]
        elif scenario_name == "base":
            key_risks = (
                ["Current growth rate insufficient for Series A qualification", "Burn trajectory requires monitoring"]
                if readiness == "NOT_READY"
                else ["Execution risk on maintaining current growth and retention rates"]
            )
            recommended_actions = [
                "Maintain current acquisition and retention strategies with weekly KPI reviews",
                "Build 3-month pipeline of qualified enterprise prospects to accelerate MRR",
            ]
        else:  # bull
            key_risks = [
                "Rapid hiring ahead of revenue creates fragile burn profile",
                "Growth deceleration risk if top acquisition channels saturate",
            ]
            recommended_actions = [
                "Invest in sales capacity now to capture the growth window",
                "Build 6-month cash reserve before Series A to negotiate from strength",
                "Instrument product for expansion revenue — NRR above 120% unlocks premium multiples",
            ]

        scenarios.append(
            {
                "scenario": scenario_name,
                "months_runway": months,
                "projected_mrr_6mo": round(proj_mrr, 2),
                "series_a_readiness": readiness,
                "key_risks": key_risks,
                "recommended_actions": recommended_actions,
            }
        )

    return scenarios


def _week_of(d: date) -> date:
    """Return the Monday of the week containing date d."""
    return d - timedelta(days=d.weekday())


def detect_fraud_patterns(
    rows: list[RawFinancial], run_id: uuid.UUID
) -> list[FraudAlertRecord]:
    """Apply 5 rule-based fraud checks to raw transaction rows."""
    EXPENSE_CATS = {"subscription_revenue", "churn_refund"}

    # Build weekly buckets: {week -> {category -> [amounts]}}
    weekly: dict[date, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for row in rows:
        weekly[_week_of(row.date)][row.category].append(float(row.amount))

    sorted_weeks = sorted(weekly.keys())

    # Build per-category timeseries of weekly totals
    cat_weekly: dict[str, list[tuple[date, float]]] = defaultdict(list)
    for wk in sorted_weeks:
        for cat, amts in weekly[wk].items():
            cat_weekly[cat].append((wk, sum(amts)))

    alerts: list[FraudAlertRecord] = []

    # Rule 1: round_number — expense amounts exactly divisible by 1000 (>= $1000)
    for row in rows:
        if row.category in EXPENSE_CATS:
            continue
        amt = abs(float(row.amount))
        if amt >= 1000 and amt % 1000 == 0:
            alerts.append(FraudAlertRecord(
                run_id=run_id,
                week_start=_week_of(row.date),
                category=row.category,
                pattern="round_number",
                severity="HIGH",
                amount=row.amount,
                description=(
                    f"Perfectly round ${amt:,.0f} in {row.category} on {row.date}. "
                    "Round numbers may indicate fictitious or manually entered transactions."
                ),
            ))

    # Rule 2: velocity_spike — weekly category total > 3× 8-week rolling median
    for cat, totals in cat_weekly.items():
        if len(totals) < 4:
            continue
        for i, (wk, total) in enumerate(totals):
            lookback = [t for _, t in totals[max(0, i - 8):i]]
            if len(lookback) < 2:
                continue
            median = _statistics.median(lookback)
            if median == 0:
                continue
            if abs(total) > 3 * abs(median):
                alerts.append(FraudAlertRecord(
                    run_id=run_id,
                    week_start=wk,
                    category=cat,
                    pattern="velocity_spike",
                    severity="HIGH",
                    amount=Decimal(str(round(total, 4))),
                    description=(
                        f"{cat} spike: ${abs(total):,.0f} vs ${abs(median):,.0f} rolling median "
                        f"({abs(total) / abs(median):.1f}x). Possible unauthorized spend."
                    ),
                ))

    # Rule 3: duplicate_amount — same amount + category 2+ times in same week
    for wk in sorted_weeks:
        for cat, amts in weekly[wk].items():
            seen: dict[str, int] = {}
            for a in amts:
                key = f"{a:.4f}"
                seen[key] = seen.get(key, 0) + 1
            for key, count in seen.items():
                if count >= 2:
                    alerts.append(FraudAlertRecord(
                        run_id=run_id,
                        week_start=wk,
                        category=cat,
                        pattern="duplicate_amount",
                        severity="MEDIUM",
                        amount=Decimal(key),
                        description=(
                            f"${float(key):,.2f} appears {count}x in {cat} during week {wk}. "
                            "Possible duplicate or split transaction."
                        ),
                    ))

    # Rule 4: zero_revenue_week — zero revenue but above-median expenses
    all_expense_totals = [
        sum(abs(a) for cat, amts in weekly[wk].items()
            if cat not in EXPENSE_CATS for a in amts)
        for wk in sorted_weeks
    ]
    if len(all_expense_totals) >= 4:
        median_expense = _statistics.median(all_expense_totals)
        for wk in sorted_weeks:
            revenue = sum(weekly[wk].get("subscription_revenue", []))
            expense = sum(
                abs(a) for cat, amts in weekly[wk].items()
                if cat not in EXPENSE_CATS for a in amts
            )
            if revenue == 0 and expense > median_expense:
                alerts.append(FraudAlertRecord(
                    run_id=run_id,
                    week_start=wk,
                    category="subscription_revenue",
                    pattern="zero_revenue_week",
                    severity="MEDIUM",
                    amount=Decimal("0"),
                    description=(
                        f"Zero revenue week {wk} with ${expense:,.0f} in expenses "
                        f"(median: ${median_expense:,.0f}). Revenue recognition gap or data issue."
                    ),
                ))

    # Rule 5: contractor_ratio — contractor > 2.5× salary in a week
    for wk in sorted_weeks:
        contractor = abs(sum(weekly[wk].get("contractor_expense", [])))
        salary = abs(sum(weekly[wk].get("salary_expense", [])))
        if salary > 0 and contractor / salary > 2.5:
            alerts.append(FraudAlertRecord(
                run_id=run_id,
                week_start=wk,
                category="contractor_expense",
                pattern="contractor_ratio",
                severity="LOW",
                amount=Decimal(str(round(contractor, 4))),
                description=(
                    f"Contractors ${contractor:,.0f} = {contractor / salary:.1f}x salary ${salary:,.0f} "
                    f"(week {wk}). High ratio may indicate misclassification."
                ),
            ))

    # Deduplicate: keep first occurrence per (week, category, pattern)
    seen_keys: set[str] = set()
    deduped: list[FraudAlertRecord] = []
    for a in alerts:
        key = f"{a.week_start}|{a.category}|{a.pattern}"
        if key not in seen_keys:
            seen_keys.add(key)
            deduped.append(a)

    return deduped


def compute_customer_profiles(
    rows: list[RawFinancial], run_id: uuid.UUID
) -> list[CustomerProfileRecord]:
    """Compute per-customer revenue metrics from raw subscription rows."""
    customer_weeks: dict[str, set[date]] = defaultdict(set)
    customer_revenue: dict[str, float] = defaultdict(float)
    customer_first: dict[str, date] = {}
    customer_last: dict[str, date] = {}
    churned: set[str] = set()

    for row in rows:
        if not row.customer_id:
            continue
        cid = row.customer_id
        if row.category == "subscription_revenue":
            customer_weeks[cid].add(row.date)
            customer_revenue[cid] += float(row.amount)
            if cid not in customer_first or row.date < customer_first[cid]:
                customer_first[cid] = row.date
            if cid not in customer_last or row.date > customer_last[cid]:
                customer_last[cid] = row.date
        elif row.category == "churn_refund":
            churned.add(cid)

    if not customer_revenue:
        return []

    total_revenue = sum(customer_revenue.values())

    profiles: list[CustomerProfileRecord] = []
    for cid, revenue in customer_revenue.items():
        weeks_active = len(customer_weeks[cid])
        avg_weekly = revenue / max(weeks_active, 1)

        if avg_weekly > 500:
            segment = "Enterprise"
        elif avg_weekly > 150:
            segment = "Mid"
        else:
            segment = "SMB"

        profiles.append(CustomerProfileRecord(
            run_id=run_id,
            customer_id=cid,
            total_revenue=Decimal(str(round(revenue, 2))),
            weeks_active=weeks_active,
            avg_weekly_revenue=Decimal(str(round(avg_weekly, 2))),
            first_seen=customer_first.get(cid, date.today()),
            last_seen=customer_last.get(cid, date.today()),
            churn_flag=cid in churned,
            segment=segment,
            revenue_pct=Decimal(str(round(revenue / total_revenue, 4))) if total_revenue > 0 else Decimal("0"),
        ))

    return sorted(profiles, key=lambda x: float(x.total_revenue), reverse=True)


class AnalysisAgent:
    def __init__(self, chronos_enabled: bool = True) -> None:
        self.forecaster = Chronos2Forecaster(enabled=chronos_enabled)

    async def run(self, session: AsyncSession, run_id: uuid.UUID) -> dict[str, Any]:
        raw_rows = (
            await session.execute(select(RawFinancial).where(RawFinancial.run_id == run_id).order_by(RawFinancial.date.asc()))
        ).scalars().all()
        if not raw_rows:
            raise ValueError(f"No raw financial records found for run_id={run_id}")

        snapshots = compute_kpi_snapshots(raw_rows, run_id)
        if not snapshots:
            raise ValueError("No KPI snapshots could be computed from ingestion data")

        iso_anomalies = detect_isolation_forest_anomalies(snapshots, run_id)
        chronos_anomalies = detect_chronos_anomalies(snapshots, run_id, self.forecaster)
        merged_anomalies = merge_and_deduplicate_anomalies(iso_anomalies + chronos_anomalies)

        # Compute WOW features: survival probability + scenario stress test
        survival = compute_survival_analysis(snapshots)
        scenarios = compute_scenario_stress_test(snapshots)

        snapshot_entities = [
            KPISnapshot(
                run_id=item.run_id,
                week_start=item.week_start,
                mrr=item.mrr,
                arr=item.arr,
                churn_rate=item.churn_rate,
                burn_rate=item.burn_rate,
                gross_margin=item.gross_margin,
                cac=item.cac,
                ltv=item.ltv,
                wow_delta=item.wow_delta,
                mom_delta=item.mom_delta,
            )
            for item in snapshots
        ]
        anomaly_entities = [
            Anomaly(
                run_id=item.run_id,
                metric=item.metric,
                actual_value=item.actual_value,
                expected_range=item.expected_range,
                severity=item.severity,
                source=item.source,
                description=item.description,
            )
            for item in merged_anomalies
        ]

        # Fraud detection and customer profiling
        fraud_alerts = detect_fraud_patterns(list(raw_rows), run_id)
        customer_profiles = compute_customer_profiles(list(raw_rows), run_id)

        await session.execute(delete(KPISnapshot).where(KPISnapshot.run_id == run_id))
        await session.execute(delete(Anomaly).where(Anomaly.run_id == run_id))
        await session.execute(delete(FraudAlert).where(FraudAlert.run_id == run_id))
        await session.execute(delete(CustomerProfile).where(CustomerProfile.run_id == run_id))

        fraud_entities = [
            FraudAlert(
                run_id=item.run_id,
                week_start=item.week_start,
                category=item.category,
                pattern=item.pattern,
                severity=item.severity,
                amount=item.amount,
                description=item.description,
            )
            for item in fraud_alerts
        ]
        customer_entities = [
            CustomerProfile(
                run_id=item.run_id,
                customer_id=item.customer_id,
                total_revenue=item.total_revenue,
                weeks_active=item.weeks_active,
                avg_weekly_revenue=item.avg_weekly_revenue,
                first_seen=item.first_seen,
                last_seen=item.last_seen,
                churn_flag=item.churn_flag,
                segment=item.segment,
                revenue_pct=item.revenue_pct,
            )
            for item in customer_profiles
        ]

        session.add_all(snapshot_entities)
        session.add_all(anomaly_entities)
        session.add_all(fraud_entities)
        session.add_all(customer_entities)
        await session.commit()

        latest = snapshots[-1]
        kpi_payload = {
            "week_start": latest.week_start.isoformat(),
            "mrr": _to_float(latest.mrr),
            "arr": _to_float(latest.arr),
            "churn_rate": _to_float(latest.churn_rate),
            "burn_rate": _to_float(latest.burn_rate),
            "gross_margin": _to_float(latest.gross_margin),
            "cac": _to_float(latest.cac),
            "ltv": _to_float(latest.ltv),
            "wow_delta": latest.wow_delta or {},
            "mom_delta": latest.mom_delta or {},
        }

        anomalies_payload = [
            {
                "metric": item.metric,
                "actual_value": float(item.actual_value),
                "expected_range": item.expected_range,
                "severity": item.severity,
                "source": item.source,
                "description": item.description,
            }
            for item in merged_anomalies
        ]

        return {
            "run_id": run_id,
            "kpis": kpi_payload,
            "anomalies": anomalies_payload,
            "survival_analysis": survival,
            "scenario_analysis": scenarios,
            "status": "complete",
        }


__all__ = [
    "AnalysisAgent",
    "compute_kpi_snapshots",
    "detect_isolation_forest_anomalies",
    "detect_chronos_anomalies",
    "merge_and_deduplicate_anomalies",
    "compute_survival_analysis",
    "compute_scenario_stress_test",
    "detect_fraud_patterns",
    "compute_customer_profiles",
]

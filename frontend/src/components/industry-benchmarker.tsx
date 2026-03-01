"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { BenchmarkResult } from "@/lib/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  mrr_growth_mom_pct: "MRR Growth",
  gross_margin_pct:   "Gross Margin",
  ltv_cac_ratio:      "LTV:CAC",
  weekly_churn_pct:   "Churn",
  burn_multiple:      "Burn Eff.",
  cac_payback_weeks:  "CAC Payback",
};

function tierLabel(avg: number): { text: string; color: string; bg: string } {
  if (avg >= 60) return { text: "TIER 1", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" };
  if (avg >= 35) return { text: "TIER 2", color: "text-amber-700",   bg: "bg-amber-50 border-amber-200" };
  return          { text: "BELOW MEDIAN", color: "text-red-700",     bg: "bg-red-50 border-red-200" };
}

function barColor(pct: number): string {
  if (pct >= 60) return "bg-emerald-500";
  if (pct >= 35) return "bg-amber-400";
  return "bg-red-400";
}

function fmt(metric: string, val: number): string {
  if (metric === "ltv_cac_ratio")     return `${val.toFixed(1)}×`;
  if (metric === "burn_multiple")     return `${val.toFixed(1)}×`;
  if (metric === "cac_payback_weeks") return `${val.toFixed(0)} wks`;
  if (metric === "weekly_churn_pct")  return `${val.toFixed(2)}%`;
  return `${val.toFixed(1)}%`;
}

function percentileLabel(pct: number): string {
  if (pct >= 75) return `Top 25%`;
  if (pct >= 50) return `Top 50%`;
  if (pct >= 25) return `Bottom 50%`;
  return `Bottom 25%`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  data: BenchmarkResult;
}

export function IndustryBenchmarker({ data }: Props) {
  const { benchmarks, your_metrics, percentiles } = data;

  const metrics = Object.keys(benchmarks).filter(m => m in METRIC_LABELS);

  // Build radar data — use percentile as the "score" for each dimension
  const radarData = metrics.map(m => ({
    metric: METRIC_LABELS[m] ?? m,
    you:    percentiles[m] ?? 0,
    median: 50,  // industry median always at 50th percentile
  }));

  // Average percentile for tier label
  const avgPct = metrics.length > 0
    ? metrics.reduce((sum, m) => sum + (percentiles[m] ?? 0), 0) / metrics.length
    : 0;

  const tier = tierLabel(avgPct);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 mt-0.5">
            Anonymous peer comparison · B2B SaaS benchmarks (SaaStr / OpenView / a16z)
          </p>
        </div>
        <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${tier.bg} ${tier.color}`}>
          {tier.text}
        </span>
      </div>

      {/* Radar chart */}
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fontSize: 10, fill: "#6b7280" }}
            />
            <Tooltip
              formatter={(val: number, name: string) =>
                [name === "you" ? `${val.toFixed(0)}th pctile` : "50th pctile", name === "you" ? "You" : "Industry Median"]
              }
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
            />
            {/* Industry median (reference) */}
            <Radar
              name="Industry Median"
              dataKey="median"
              stroke="#d1d5db"
              fill="#f3f4f6"
              fillOpacity={0.5}
              strokeDasharray="4 3"
            />
            {/* Your company */}
            <Radar
              name="You"
              dataKey="you"
              stroke="#0071e3"
              fill="#0071e3"
              fillOpacity={0.18}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Percentile bars */}
      <div className="space-y-2.5">
        {metrics.map(m => {
          const pct   = percentiles[m] ?? 0;
          const raw   = your_metrics[m];
          const bmark = benchmarks[m];
          return (
            <div key={m}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700">{METRIC_LABELS[m] ?? m}</span>
                <div className="flex items-center gap-2">
                  {raw !== undefined && (
                    <span className="text-xs text-gray-500">{fmt(m, raw)}</span>
                  )}
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    pct >= 60 ? "bg-emerald-50 text-emerald-700" :
                    pct >= 35 ? "bg-amber-50 text-amber-700" :
                    "bg-red-50 text-red-700"
                  }`}>
                    {percentileLabel(pct)}
                  </span>
                </div>
              </div>
              <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${barColor(pct)}`}
                  style={{ width: `${pct}%` }}
                />
                {/* P25 / P50 / P75 ticks */}
                {[25, 50, 75].map(tick => (
                  <div
                    key={tick}
                    className="absolute top-0 bottom-0 w-px bg-white/70"
                    style={{ left: `${tick}%` }}
                  />
                ))}
              </div>
              {/* Benchmark reference row */}
              <div className="flex justify-between mt-0.5 text-[9px] text-gray-400">
                <span>P25: {fmt(m, bmark.p25)}</span>
                <span>Median: {fmt(m, bmark.p50)}</span>
                <span>P75: {fmt(m, bmark.p75)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-400 text-center">
        Percentile scores are anonymized — your data is never shared with peers.
      </p>
    </div>
  );
}

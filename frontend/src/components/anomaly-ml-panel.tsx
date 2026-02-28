"use client";
import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, Tooltip,
  ScatterChart, Scatter, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { AnomalyTable } from "./anomaly-table";
import type { Anomaly } from "@/lib/types";
import { Cpu, Activity } from "lucide-react";

const METRIC_LABELS: Record<string, string> = {
  mrr:          "MRR",
  arr:          "ARR",
  burn_rate:    "Burn Rate",
  gross_margin: "Gross Margin",
  churn_rate:   "Churn Rate",
  cac:          "CAC",
  ltv:          "LTV",
};

const METRIC_ORDER = ["mrr", "arr", "burn_rate", "gross_margin", "churn_rate", "cac", "ltv"];

const SEV_WEIGHT: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

const importanceConfig: ChartConfig = {
  weight: { label: "Anomaly Weight", color: "#0071e3" },
};

interface Props {
  anomalies: Anomaly[];
  snapshotCount: number;
}

function parseWeekDate(description: string): number | null {
  const match = description.match(/week (\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  return new Date(match[1]).getTime();
}

export function AnomalyMLPanel({ anomalies, snapshotCount }: Props) {
  // ── Feature importance: weight per metric ──────────────────────────────────
  const importance = useMemo(() => {
    const map: Record<string, number> = {};
    for (const a of anomalies) {
      map[a.metric] = (map[a.metric] ?? 0) + (SEV_WEIGHT[a.severity] ?? 1);
    }
    return METRIC_ORDER
      .filter(m => map[m])
      .map(m => ({ metric: METRIC_LABELS[m] ?? m, weight: map[m], raw: m }))
      .sort((a, b) => b.weight - a.weight);
  }, [anomalies]);

  // ── Scatter timeline: one dot per anomaly ──────────────────────────────────
  const timelineData = useMemo(() => {
    return anomalies
      .map(a => ({
        ts: parseWeekDate(a.description),
        metricIdx: METRIC_ORDER.indexOf(a.metric),
        severity: a.severity,
        metric: METRIC_LABELS[a.metric] ?? a.metric,
        actual: Number(a.actual_value),
      }))
      .filter(d => d.ts !== null && d.metricIdx >= 0);
  }, [anomalies]);

  const highCount   = anomalies.filter(a => a.severity === "HIGH").length;
  const medCount    = anomalies.filter(a => a.severity === "MEDIUM").length;
  const lowCount    = anomalies.filter(a => a.severity === "LOW").length;
  const anomalyRate = snapshotCount > 0 ? (anomalies.length / snapshotCount) * 100 : 0;

  const dotColor = (sev: string) =>
    sev === "HIGH" ? "#ff3b30" : sev === "MEDIUM" ? "#ff9500" : "#9ca3af";
  const dotSize = (sev: string) =>
    sev === "HIGH" ? 100 : sev === "MEDIUM" ? 60 : 30;

  return (
    <div className="space-y-6">

      {/* ── Model Stats Bar ───────────────────────────────────────────────── */}
      <div className="card-brutal p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Cpu className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900">IsolationForest · Model Performance</div>
            <div className="text-[11px] text-gray-400">Unsupervised ML · contamination 5% · {snapshotCount} training samples</div>
          </div>
          <div className="ml-auto flex gap-2">
            {highCount > 0 && (
              <span className="rounded-full bg-red-600 text-white text-[10px] font-bold px-2 py-0.5">{highCount} HIGH</span>
            )}
            {medCount > 0 && (
              <span className="rounded-full bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5">{medCount} MED</span>
            )}
            {lowCount > 0 && (
              <span className="rounded-full bg-gray-400 text-white text-[10px] font-bold px-2 py-0.5">{lowCount} LOW</span>
            )}
          </div>
        </div>

        {/* Anomaly rate bar */}
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-500 w-28 flex-shrink-0">Anomaly Rate</span>
          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(anomalyRate, 100)}%`,
                background: anomalyRate > 20 ? "#ff3b30" : anomalyRate > 10 ? "#ff9500" : "#34c759",
              }}
            />
          </div>
          <span className="text-[11px] font-bold font-mono text-gray-700 w-10 text-right">
            {anomalyRate.toFixed(0)}%
          </span>
        </div>

        <div className="mt-2.5 flex gap-4 text-[10px] text-gray-400">
          <span>{anomalies.length} outliers detected</span>
          <span>·</span>
          <span>random_state=42</span>
          <span>·</span>
          <span>Scoring: path length in isolation trees</span>
        </div>
      </div>

      {/* ── Charts row: Feature Importance + Timeline ──────────────────────── */}
      {anomalies.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">

          {/* Feature Importance */}
          <div className="card-brutal p-5 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <div>
                <div className="text-sm font-bold text-gray-900">Feature Importance</div>
                <div className="text-[11px] text-gray-400">Which metrics the model flags most</div>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ChartContainer config={importanceConfig} className="h-[180px] w-full">
                <BarChart
                  data={importance}
                  layout="vertical"
                  margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false}
                    tick={{ fontSize: 9, fill: "#9ca3af" }} />
                  <YAxis type="category" dataKey="metric" tickLine={false} axisLine={false}
                    tick={{ fontSize: 10, fill: "#374151" }} width={78} />
                  <Tooltip
                    formatter={(v: number) => [`Weight: ${v}`, "Anomaly Score"]}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                  <Bar dataKey="weight" radius={[0, 3, 3, 0]} animationDuration={900} animationEasing="ease-out">
                    {importance.map((entry, i) => (
                      <Cell
                        key={entry.raw}
                        fill={i === 0 ? "#ff3b30" : i === 1 ? "#ff9500" : i === 2 ? "#f59e0b" : "#0071e3"}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">Weight = 3×HIGH + 2×MEDIUM + 1×LOW per metric</p>
          </div>

          {/* Anomaly Timeline */}
          <div className="card-brutal p-5 flex flex-col h-full">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <div>
                <div className="text-sm font-bold text-gray-900">Detection Timeline</div>
                <div className="text-[11px] text-gray-400">When anomalies were flagged by week</div>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height={180}>
                <ScatterChart margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    domain={["auto", "auto"]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 9, fill: "#9ca3af" }}
                    tickFormatter={v => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    tickCount={4}
                  />
                  <YAxis
                    dataKey="metricIdx"
                    type="number"
                    domain={[-0.5, METRIC_ORDER.length - 0.5]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 9, fill: "#6b7280" }}
                    tickFormatter={i => METRIC_LABELS[METRIC_ORDER[Math.round(i)]] ?? ""}
                    width={72}
                    tickCount={METRIC_ORDER.length}
                  />
                  <Tooltip
                    formatter={(_v: unknown, _n: string, props: { payload?: { metric?: string; severity?: string; actual?: number } }) => {
                      const p = props?.payload;
                      return [`${p?.metric} · ${p?.severity}`, `Value: ${p?.actual?.toFixed(2)}`];
                    }}
                    labelFormatter={v => new Date(Number(v)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  />
                  <ReferenceLine x={0} stroke="transparent" />
                  <Scatter
                    data={timelineData}
                    shape={(props: { cx?: number; cy?: number; payload?: { severity?: string } }) => {
                      const { cx = 0, cy = 0, payload } = props;
                      const sev = payload?.severity ?? "LOW";
                      const r = sev === "HIGH" ? 7 : sev === "MEDIUM" ? 5 : 3.5;
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r}
                          fill={dotColor(sev)}
                          fillOpacity={0.8}
                          stroke={dotColor(sev)}
                          strokeWidth={1}
                          strokeOpacity={0.4}
                        />
                      );
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-4 text-[10px] text-gray-400 mt-2">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" /> HIGH</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block" /> MED</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-gray-400 inline-block" /> LOW</span>
            </div>
          </div>

        </div>
      )}

      {/* ── Anomaly Cards (existing) ──────────────────────────────────────── */}
      <AnomalyTable anomalies={anomalies} />

    </div>
  );
}

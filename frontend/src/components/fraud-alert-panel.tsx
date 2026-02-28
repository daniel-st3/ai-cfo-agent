"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, ShieldAlert, ShieldCheck, AlertOctagon, TrendingUp, TrendingDown } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { FraudAlert } from "@/lib/types";

interface Props { alerts: FraudAlert[] }

const PATTERN_LABEL: Record<string, string> = {
  round_number:     "Round Numbers",
  velocity_spike:   "Velocity Spike",
  duplicate_amount: "Duplicates",
  zero_revenue_week:"Zero Revenue",
  contractor_ratio: "Contractor Ratio",
};

const SEV_META = {
  HIGH: {
    order: 0,
    cardCls: "border-l-4 border-l-red-500 border-t border-r border-b border-red-200 bg-red-50",
    badgeCls: "bg-red-600 text-white",
    textCls:  "text-red-800",
    barColor: "#ef4444",
    icon: <AlertOctagon className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />,
    devColor: "text-red-700",
  },
  MEDIUM: {
    order: 1,
    cardCls: "border-l-4 border-l-amber-400 border-t border-r border-b border-amber-200 bg-amber-50",
    badgeCls: "bg-amber-500 text-white",
    textCls:  "text-amber-900",
    barColor: "#f59e0b",
    icon: <TrendingUp className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />,
    devColor: "text-amber-700",
  },
  LOW: {
    order: 2,
    cardCls: "border border-gray-200 bg-gray-50",
    badgeCls: "bg-gray-400 text-white",
    textCls:  "text-gray-700",
    barColor: "#9ca3af",
    icon: <TrendingDown className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />,
    devColor: "text-gray-600",
  },
} as const;

function fmtAmt(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function AlertCard({ alert }: { alert: FraudAlert }) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEV_META[alert.severity] ?? SEV_META.LOW;
  const patternLabel = PATTERN_LABEL[alert.pattern] ?? alert.pattern.replace(/_/g, " ");

  return (
    <div className={`rounded-2xl overflow-hidden transition-all duration-200 ${sev.cardCls}`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-4 py-4 flex items-start gap-3"
      >
        {sev.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-black uppercase tracking-wide ${sev.textCls}`}>
              {patternLabel}
            </span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black tracking-wider ${sev.badgeCls}`}>
              {alert.severity}
            </span>
            {alert.severity === "HIGH" && (
              <span className="inline-flex items-center rounded-full bg-red-200 text-red-800 px-2 py-0.5 text-[10px] font-bold animate-pulse">
                FLAGGED
              </span>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className={`font-black text-2xl font-mono tabular-nums ${sev.devColor}`}>
              {fmtAmt(alert.amount)}
            </span>
            <span className="text-xs text-gray-500 font-mono">{alert.week_start}</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            category: {alert.category.replace(/_/g, " ")}
          </div>
        </div>
        <div className="flex-shrink-0 text-gray-400 mt-1">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && alert.description && (
        <div className="px-4 pb-4 pt-1 border-t border-black/5 space-y-2">
          <p className="text-xs text-gray-600 leading-relaxed">{alert.description}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 uppercase tracking-wide">Pattern:</span>
            <span className="text-[10px] font-mono bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded">
              {alert.pattern.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function FraudAlertPanel({ alerts }: Props) {
  const [showLow, setShowLow] = useState(false);

  if (!alerts.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <ShieldCheck className="h-12 w-12 text-green-500 opacity-60" />
        <div className="text-sm font-semibold text-green-700">No suspicious patterns detected</div>
        <div className="text-xs text-gray-400">All transactions are within expected norms</div>
      </div>
    );
  }

  const sorted = [...alerts].sort(
    (a, b) => (SEV_META[a.severity]?.order ?? 2) - (SEV_META[b.severity]?.order ?? 2)
  );

  const highAlerts   = sorted.filter(a => a.severity === "HIGH");
  const medAlerts    = sorted.filter(a => a.severity === "MEDIUM");
  const lowAlerts    = sorted.filter(a => a.severity === "LOW");

  const hasHigh = highAlerts.length > 0;

  const overallBadge = hasHigh
    ? { cls: "border-red-300 bg-red-50 text-red-800 animate-pulse", label: `${highAlerts.length + medAlerts.length} SUSPICIOUS PATTERNS`, icon: <ShieldAlert className="h-4 w-4 text-red-600" /> }
    : medAlerts.length > 0
    ? { cls: "border-amber-300 bg-amber-50 text-amber-800", label: `${medAlerts.length} PATTERNS FLAGGED`, icon: <ShieldAlert className="h-4 w-4 text-amber-500" /> }
    : { cls: "border-green-200 bg-green-50 text-green-700", label: "LOW RISK ONLY", icon: <ShieldCheck className="h-4 w-4 text-green-600" /> };

  // Chart data: count per pattern
  const patternCounts: Record<string, { count: number; topSev: keyof typeof SEV_META }> = {};
  for (const a of alerts) {
    if (!patternCounts[a.pattern]) {
      patternCounts[a.pattern] = { count: 0, topSev: a.severity as keyof typeof SEV_META };
    }
    patternCounts[a.pattern].count++;
    const cur = patternCounts[a.pattern].topSev;
    if ((SEV_META[a.severity as keyof typeof SEV_META]?.order ?? 2) < (SEV_META[cur]?.order ?? 2)) {
      patternCounts[a.pattern].topSev = a.severity as keyof typeof SEV_META;
    }
  }
  const chartData = Object.entries(patternCounts).map(([pattern, { count, topSev }]) => ({
    name: PATTERN_LABEL[pattern] ?? pattern,
    count,
    color: SEV_META[topSev]?.barColor ?? "#9ca3af",
  })).sort((a, b) => b.count - a.count);

  return (
    <div>
      {/* Header badge */}
      <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 mb-5 ${overallBadge.cls}`}>
        {overallBadge.icon}
        <span className="text-sm font-black tracking-wide">{overallBadge.label}</span>
        <div className="flex-1" />
        <div className="flex gap-2 text-[10px] font-semibold">
          {highAlerts.length > 0 && <span className="bg-red-600 text-white rounded-full px-2 py-0.5">{highAlerts.length} HIGH</span>}
          {medAlerts.length > 0  && <span className="bg-amber-500 text-white rounded-full px-2 py-0.5">{medAlerts.length} MEDIUM</span>}
          {lowAlerts.length > 0  && <span className="bg-gray-400 text-white rounded-full px-2 py-0.5">{lowAlerts.length} LOW</span>}
        </div>
      </div>

      {/* Pattern frequency bar chart */}
      {chartData.length > 0 && (
        <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Alerts by Pattern</p>
          <ResponsiveContainer width="100%" height={Math.max(chartData.length * 36, 80)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fontSize: 11, fill: "#6b7280", fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg text-xs font-semibold text-gray-700">
                      {payload[0].payload.name}: {payload[0].value} alerts
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={22}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* HIGH alerts */}
      {highAlerts.length > 0 && (
        <div className="space-y-2 mb-3">
          {highAlerts.map((a, i) => <AlertCard key={i} alert={a} />)}
        </div>
      )}

      {/* MEDIUM alerts */}
      {medAlerts.length > 0 && (
        <div className="space-y-2 mb-3">
          {medAlerts.map((a, i) => <AlertCard key={i} alert={a} />)}
        </div>
      )}

      {/* LOW alerts — collapsed */}
      {lowAlerts.length > 0 && (
        <>
          <button
            onClick={() => setShowLow(s => !s)}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors flex items-center justify-center gap-2 mb-2"
          >
            {showLow ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showLow ? "Hide" : "Show"} minor patterns ({lowAlerts.length})
          </button>
          {showLow && (
            <div className="space-y-2">
              {lowAlerts.map((a, i) => <AlertCard key={i} alert={a} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

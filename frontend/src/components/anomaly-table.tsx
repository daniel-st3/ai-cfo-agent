"use client";
import { useState } from "react";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, ShieldAlert, ShieldCheck, AlertOctagon } from "lucide-react";
import type { Anomaly } from "@/lib/types";

interface Props { anomalies: Anomaly[] }

const METRIC_LABEL: Record<string, string> = {
  mrr:          "MRR",
  arr:          "ARR",
  burn_rate:    "Burn Rate",
  gross_margin: "Gross Margin",
  churn_rate:   "Churn Rate",
  cac:          "CAC",
  ltv:          "LTV",
};

const SEV_META = {
  HIGH: {
    order: 0,
    cardCls: "border-l-4 border-l-red-500 border-t border-r border-b border-red-200 bg-red-50",
    badgeCls: "bg-red-600 text-white",
    textCls: "text-red-800",
    icon: <AlertOctagon className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />,
    devColor: "text-red-700",
  },
  MEDIUM: {
    order: 1,
    cardCls: "border-l-4 border-l-amber-400 border-t border-r border-b border-amber-200 bg-amber-50",
    badgeCls: "bg-amber-500 text-white",
    textCls: "text-amber-900",
    icon: <TrendingUp className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />,
    devColor: "text-amber-700",
  },
  LOW: {
    order: 2,
    cardCls: "border border-gray-200 bg-gray-50",
    badgeCls: "bg-gray-400 text-white",
    textCls: "text-gray-700",
    icon: <TrendingDown className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />,
    devColor: "text-gray-600",
  },
};

function fmtVal(v: number): string {
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  if (Math.abs(v) < 1 && v !== 0) return `${(v * 100).toFixed(2)}%`;
  return v.toFixed(1);
}

function pctDev(actual: number, median: number): string {
  if (!median) return "";
  const pct = ((actual - median) / Math.abs(median)) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}% vs expected`;
}

function AnomalyCard({ anomaly }: { anomaly: Anomaly }) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEV_META[anomaly.severity] ?? SEV_META.LOW;
  const label = METRIC_LABEL[anomaly.metric] ?? anomaly.metric.replace(/_/g, " ");
  const actual = Number(anomaly.actual_value);
  const median = anomaly.expected_range?.median ?? 0;
  const hi     = anomaly.expected_range?.high ?? 0;
  const lo     = anomaly.expected_range?.low  ?? 0;
  const isAbove = actual > median;
  const deviation = pctDev(actual, median);
  const isHigh = anomaly.severity === "HIGH";

  return (
    <div className={`rounded-2xl overflow-hidden transition-all duration-200 ${sev.cardCls}`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-4 py-4 flex items-start gap-3"
      >
        {sev.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-black uppercase tracking-wide ${sev.textCls}`}>{label}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black tracking-wider ${sev.badgeCls}`}>
              {anomaly.severity}
            </span>
            {isHigh && (
              <span className="inline-flex items-center rounded-full bg-red-200 text-red-800 px-2 py-0.5 text-[10px] font-bold animate-pulse">
                ● ACTIVE
              </span>
            )}
          </div>

          {/* Large deviation number */}
          <div className="mt-2 flex items-baseline gap-3">
            <span className={`font-black text-2xl font-mono tabular-nums ${sev.devColor}`}>
              {fmtVal(actual)}
            </span>
            {deviation && (
              <span className={`text-xs font-bold ${sev.devColor} opacity-75`}>{deviation}</span>
            )}
          </div>

          <div className="text-xs text-gray-500 mt-1">
            expected range: {fmtVal(lo)} – {fmtVal(hi)}
          </div>
        </div>

        <div className="flex-shrink-0 text-gray-400 mt-1">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && anomaly.description && (
        <div className="px-4 pb-4 pt-1 border-t border-black/5 space-y-2">
          <p className="text-xs text-gray-600 leading-relaxed">{anomaly.description}</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 uppercase tracking-wide">Detection:</span>
            <span className="text-[10px] font-mono bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded">
              {anomaly.source.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function AnomalyTable({ anomalies }: Props) {
  const [showLow, setShowLow] = useState(false);

  if (!anomalies.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <ShieldCheck className="h-12 w-12 text-green-500 opacity-60" />
        <div className="text-sm font-semibold text-green-700">No anomalies detected</div>
        <div className="text-xs text-gray-400">All metrics are within expected ranges</div>
      </div>
    );
  }

  // Deduplicate by (metric, severity) and keep highest-value outliers
  const seen = new Set<string>();
  const deduped: Anomaly[] = [];
  const sorted = [...anomalies].sort((a, b) =>
    (SEV_META[a.severity]?.order ?? 2) - (SEV_META[b.severity]?.order ?? 2)
  );
  for (const a of sorted) {
    const key = `${a.metric}__${a.severity}`;
    if (!seen.has(key)) { seen.add(key); deduped.push(a); }
  }

  const highAnoms = deduped.filter(a => a.severity === "HIGH");
  const medAnoms  = deduped.filter(a => a.severity === "MEDIUM");
  const lowAnoms  = deduped.filter(a => a.severity === "LOW");

  const hasHighRisk = highAnoms.length > 0;

  const overallBadge = hasHighRisk
    ? { cls: "border-red-300 bg-red-50 text-red-800 animate-pulse", label: `${highAnoms.length + medAnoms.length} THREATS ACTIVE`, icon: <ShieldAlert className="h-4 w-4 text-red-600" /> }
    : medAnoms.length > 0
    ? { cls: "border-amber-300 bg-amber-50 text-amber-800", label: `${medAnoms.length} WARNINGS DETECTED`, icon: <ShieldAlert className="h-4 w-4 text-amber-500" /> }
    : { cls: "border-green-200 bg-green-50 text-green-700", label: "ALL CLEAR", icon: <ShieldCheck className="h-4 w-4 text-green-600" /> };

  return (
    <div>
      {/* Threat level header */}
      <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 mb-5 ${overallBadge.cls}`}>
        {overallBadge.icon}
        <span className="text-sm font-black tracking-wide">{overallBadge.label}</span>
        <div className="flex-1" />
        <div className="flex gap-2 text-[10px] font-semibold">
          {highAnoms.length > 0 && <span className="bg-red-600 text-white rounded-full px-2 py-0.5">{highAnoms.length} HIGH</span>}
          {medAnoms.length > 0 && <span className="bg-amber-500 text-white rounded-full px-2 py-0.5">{medAnoms.length} MEDIUM</span>}
          {lowAnoms.length > 0 && <span className="bg-gray-400 text-white rounded-full px-2 py-0.5">{lowAnoms.length} LOW</span>}
        </div>
      </div>

      {/* HIGH anomalies — always visible */}
      {highAnoms.length > 0 && (
        <div className="space-y-2 mb-3">
          {highAnoms.map((a, i) => <AnomalyCard key={i} anomaly={a} />)}
        </div>
      )}

      {/* MEDIUM anomalies — always visible */}
      {medAnoms.length > 0 && (
        <div className="space-y-2 mb-3">
          {medAnoms.map((a, i) => <AnomalyCard key={i} anomaly={a} />)}
        </div>
      )}

      {/* LOW anomalies — collapsed */}
      {lowAnoms.length > 0 && (
        <>
          <button
            onClick={() => setShowLow(s => !s)}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors flex items-center justify-center gap-2 mb-2"
          >
            {showLow ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showLow ? "Hide" : "Show"} minor alerts ({lowAnoms.length})
          </button>
          {showLow && (
            <div className="space-y-2">
              {lowAnoms.map((a, i) => <AnomalyCard key={i} anomaly={a} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

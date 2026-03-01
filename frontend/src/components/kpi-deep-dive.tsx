"use client";
import { useMemo } from "react";
import {
  ComposedChart, AreaChart, Area, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, X } from "lucide-react";
import type { KPISnapshot } from "@/lib/types";

interface Props {
  metric: string;
  snapshots: KPISnapshot[];
  onClose: () => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function fmtK(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}
function fmtPct(v: number): string { return `${(v * 100).toFixed(2)}%`; }
function short(d: string): string { return d.slice(5); } // "2024-03-04" → "03-04"

function rolling4(arr: number[]): (number | null)[] {
  return arr.map((_, i) => {
    if (i < 3) return null;
    return (arr[i] + arr[i - 1] + arr[i - 2] + arr[i - 3]) / 4;
  });
}

function DeltaChip({ label, value }: { label: string; value: number | undefined }) {
  if (value === undefined || isNaN(value)) return null;
  const up   = value > 0.0005;
  const down = value < -0.0005;
  return (
    <div className={`flex flex-col items-center rounded-xl px-3 py-2 min-w-[72px] ${up ? "bg-green-50 border border-green-100" : down ? "bg-red-50 border border-red-100" : "bg-gray-50 border border-gray-100"}`}>
      <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400">{label}</span>
      <div className={`flex items-center gap-0.5 mt-0.5 text-sm font-black ${up ? "text-green-600" : down ? "text-red-500" : "text-gray-400"}`}>
        {up ? <TrendingUp className="h-3 w-3" /> : down ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
        {up ? "+" : ""}{(value * 100).toFixed(1)}%
      </div>
    </div>
  );
}

const TOOLTIP_STYLE = { fontSize: 11, borderRadius: 10, border: "1px solid #e5e7eb", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" };

// ── metric configs ────────────────────────────────────────────────────────────
const METRIC_META: Record<string, { label: string; fmt: (v: number) => string; color: string; lowerBetter?: boolean }> = {
  mrr:          { label: "MRR (Weekly)",    fmt: fmtK,   color: "#0071e3" },
  arr:          { label: "ARR",             fmt: fmtK,   color: "#5ac8fa" },
  burn_rate:    { label: "Burn Rate",       fmt: fmtK,   color: "#ef4444", lowerBetter: true },
  gross_margin: { label: "Gross Margin",    fmt: fmtPct, color: "#30d158" },
  churn_rate:   { label: "Churn Rate",      fmt: fmtPct, color: "#ff9f0a", lowerBetter: true },
  cac:          { label: "CAC",             fmt: fmtK,   color: "#bf5af2", lowerBetter: true },
  ltv:          { label: "LTV",             fmt: fmtK,   color: "#0071e3" },
};

// ── per-metric chart components ───────────────────────────────────────────────

function MRRChart({ snapshots }: { snapshots: KPISnapshot[] }) {
  const data = snapshots.map((s, i) => ({
    week: short(s.week_start),
    mrr:  s.mrr,
    avg4: rolling4(snapshots.map(x => x.mrr))[i],
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#9ca3af" }} interval={Math.floor(data.length / 8)} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={44} />
        <Tooltip formatter={(v: number, n: string) => [fmtK(v), n === "mrr" ? "Weekly MRR" : "4-wk Avg"]} labelStyle={{ fontSize: 10 }} contentStyle={TOOLTIP_STYLE} />
        <defs>
          <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0071e3" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#0071e3" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="mrr" fill="url(#mrrGrad)" stroke="#0071e3" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="avg4" stroke="#ff6b35" strokeWidth={2} dot={false} strokeDasharray="4 2" name="4-wk Rolling Avg" connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ARRChart({ snapshots }: { snapshots: KPISnapshot[] }) {
  const growthRates = snapshots.slice(1).map((s, i) => (snapshots[i].arr > 0 ? (s.arr - snapshots[i].arr) / snapshots[i].arr : 0));
  const avgGrowth   = growthRates.length ? growthRates.reduce((a, b) => a + b, 0) / growthRates.length : 0;
  const latestArr   = snapshots[snapshots.length - 1]?.arr ?? 0;
  const projected   = latestArr * Math.pow(1 + avgGrowth, 52); // 52 weeks out

  const data = snapshots.map(s => ({ week: short(s.week_start), arr: s.arr }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#9ca3af" }} interval={Math.floor(data.length / 8)} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={44} />
        <Tooltip formatter={(v: number) => [fmtK(v), "ARR"]} labelStyle={{ fontSize: 10 }} contentStyle={TOOLTIP_STYLE} />
        <defs>
          <linearGradient id="arrGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#5ac8fa" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#5ac8fa" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="arr" fill="url(#arrGrad)" stroke="#5ac8fa" strokeWidth={2} dot={false} />
        {projected > 0 && (
          <ReferenceLine y={projected} stroke="#0071e3" strokeDasharray="5 3" label={{ value: `${fmtK(projected)} projected`, position: "insideTopRight", fontSize: 9, fill: "#0071e3" }} />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function BurnChart({ snapshots }: { snapshots: KPISnapshot[] }) {
  const data = snapshots.map((s, i) => ({
    week:  short(s.week_start),
    burn:  s.burn_rate,
    avg4:  rolling4(snapshots.map(x => x.burn_rate))[i],
  }));
  const median = [...snapshots.map(s => s.burn_rate)].sort((a, b) => a - b)[Math.floor(snapshots.length / 2)] ?? 0;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#9ca3af" }} interval={Math.floor(data.length / 8)} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={44} />
        <Tooltip formatter={(v: number, n: string) => [fmtK(v), n === "burn" ? "Weekly Burn" : "4-wk Avg"]} labelStyle={{ fontSize: 10 }} contentStyle={TOOLTIP_STYLE} />
        <defs>
          <linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="burn" fill="url(#burnGrad)" stroke="#ef4444" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="avg4" stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="4 2" connectNulls />
        <ReferenceLine y={median} stroke="#9ca3af" strokeDasharray="4 4" label={{ value: "median", position: "insideTopLeft", fontSize: 9, fill: "#9ca3af" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function GrossMarginChart({ snapshots }: { snapshots: KPISnapshot[] }) {
  const data = snapshots.map(s => ({
    week:    short(s.week_start),
    revenue: s.mrr,
    cogs:    s.mrr * (1 - Math.max(0, s.gross_margin)),
    margin:  s.gross_margin * 100,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#9ca3af" }} interval={Math.floor(data.length / 8)} axisLine={false} tickLine={false} />
        <YAxis yAxisId="left"  tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={44} />
        <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={36} />
        <Tooltip formatter={(v: number, n: string) => [n === "margin" ? `${v.toFixed(1)}%` : fmtK(v), n === "margin" ? "Gross Margin" : n === "revenue" ? "Revenue (MRR)" : "COGS est."]} labelStyle={{ fontSize: 10 }} contentStyle={TOOLTIP_STYLE} />
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#30d158" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#30d158" stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <Area yAxisId="left" type="monotone" dataKey="revenue" fill="url(#revGrad)" stroke="#30d158" strokeWidth={2} dot={false} stackId="a" />
        <Area yAxisId="left" type="monotone" dataKey="cogs"    fill="rgba(239,68,68,0.15)" stroke="#ef4444" strokeWidth={1} dot={false} stackId={undefined} />
        <Line yAxisId="right" type="monotone" dataKey="margin" stroke="#0071e3" strokeWidth={2} dot={false} />
        <ReferenceLine yAxisId="right" y={70} stroke="#30d158" strokeDasharray="4 4" label={{ value: "70% target", position: "insideTopRight", fontSize: 9, fill: "#30d158" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function ChurnChart({ snapshots }: { snapshots: KPISnapshot[] }) {
  const data = snapshots.map(s => ({ week: short(s.week_start), churn: s.churn_rate * 100 }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#9ca3af" }} interval={Math.floor(data.length / 8)} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={40} />
        <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, "Churn Rate"]} labelStyle={{ fontSize: 10 }} contentStyle={TOOLTIP_STYLE} />
        <defs>
          <linearGradient id="churnGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ff9f0a" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#ff9f0a" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="churn" fill="url(#churnGrad)" stroke="#ff9f0a" strokeWidth={2} dot={false} />
        <ReferenceLine y={2}  stroke="#30d158" strokeDasharray="4 4" label={{ value: "2% good",    position: "insideTopRight", fontSize: 9, fill: "#30d158"  }} />
        <ReferenceLine y={5}  stroke="#ef4444" strokeDasharray="4 4" label={{ value: "5% danger",  position: "insideTopRight", fontSize: 9, fill: "#ef4444"  }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function CACChart({ snapshots }: { snapshots: KPISnapshot[] }) {
  const data = snapshots
    .filter(s => s.cac > 0 && s.ltv > 0)
    .map(s => ({
      week:  short(s.week_start),
      cac:   s.cac,
      ratio: parseFloat((s.ltv / s.cac).toFixed(2)),
    }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#9ca3af" }} interval={Math.floor(data.length / 8)} axisLine={false} tickLine={false} />
        <YAxis yAxisId="left"  tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={44} />
        <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}x`} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={32} />
        <Tooltip formatter={(v: number, n: string) => [n === "ratio" ? `${v}x` : fmtK(v), n === "ratio" ? "LTV:CAC" : "CAC"]} labelStyle={{ fontSize: 10 }} contentStyle={TOOLTIP_STYLE} />
        <defs>
          <linearGradient id="cacGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#bf5af2" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#bf5af2" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Bar yAxisId="left" dataKey="cac" fill="url(#cacGrad)" stroke="#bf5af2" strokeWidth={0} radius={[3, 3, 0, 0]} maxBarSize={12} />
        <Line yAxisId="right" type="monotone" dataKey="ratio" stroke="#0071e3" strokeWidth={2} dot={false} />
        <ReferenceLine yAxisId="right" y={3} stroke="#30d158" strokeDasharray="4 4" label={{ value: "3x healthy", position: "insideTopRight", fontSize: 9, fill: "#30d158" }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function LTVChart({ snapshots }: { snapshots: KPISnapshot[] }) {
  const data = snapshots
    .filter(s => s.ltv > 0 && s.cac > 0)
    .map(s => ({
      week:    short(s.week_start),
      ltv:     s.ltv,
      payback: s.mrr > 0 ? Math.round((s.cac / (s.mrr / Math.max(1, 1))) * 4.33) : null, // approximate months payback
    }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="week" tick={{ fontSize: 9, fill: "#9ca3af" }} interval={Math.floor(data.length / 8)} axisLine={false} tickLine={false} />
        <YAxis yAxisId="left"  tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={52} />
        <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}mo`} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={36} />
        <Tooltip formatter={(v: number, n: string) => [n === "payback" ? `${v} months` : fmtK(v), n === "payback" ? "Payback Period" : "LTV"]} labelStyle={{ fontSize: 10 }} contentStyle={TOOLTIP_STYLE} />
        <defs>
          <linearGradient id="ltvGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0071e3" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#0071e3" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area yAxisId="left" type="monotone" dataKey="ltv" fill="url(#ltvGrad)" stroke="#0071e3" strokeWidth={2} dot={false} />
        <Bar yAxisId="right" dataKey="payback" fill="rgba(191,90,242,0.2)" stroke="#bf5af2" strokeWidth={0.5} radius={[3, 3, 0, 0]} maxBarSize={8} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const CHART_MAP: Record<string, React.ComponentType<{ snapshots: KPISnapshot[] }>> = {
  mrr:          MRRChart,
  arr:          ARRChart,
  burn_rate:    BurnChart,
  gross_margin: GrossMarginChart,
  churn_rate:   ChurnChart,
  cac:          CACChart,
  ltv:          LTVChart,
};

const CHART_INSIGHT: Record<string, (s: KPISnapshot[]) => string> = {
  mrr: (s) => {
    const last = s[s.length - 1];
    const prev = s[s.length - 5];
    if (!prev || !last) return "";
    const growth = ((last.mrr - prev.mrr) / prev.mrr * 100).toFixed(1);
    return `4-week MRR growth: ${growth}%. Orange dashed line = rolling average to smooth weekly noise.`;
  },
  arr: (s) => {
    const last = s[s.length - 1];
    if (!last) return "";
    const growthRates = s.slice(1).map((x, i) => s[i].arr > 0 ? (x.arr - s[i].arr) / s[i].arr : 0);
    const avgGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
    return `At current growth rate (${(avgGrowth * 100).toFixed(2)}%/wk), projected ARR in 12 months is shown as the blue reference line.`;
  },
  burn_rate: (s) => {
    const last = s[s.length - 1];
    if (!last) return "";
    return `Current burn: ${(last.burn_rate / 1000).toFixed(1)}K/week. Gray dashed = median burn. Spikes above median are worth investigating.`;
  },
  gross_margin: (s) => {
    const last = s[s.length - 1];
    if (!last) return "";
    return `Green area = MRR. Red area = estimated COGS (${((1 - last.gross_margin) * 100).toFixed(0)}% of MRR). Blue line = gross margin %. Target: 70%+.`;
  },
  churn_rate: (s) => {
    const last = s[s.length - 1];
    if (!last) return "";
    const status = last.churn_rate < 0.02 ? "Healthy" : last.churn_rate < 0.05 ? "Monitor" : "Urgent";
    return `Current churn: ${(last.churn_rate * 100).toFixed(2)}%/week. Status: ${status}. Green line = 2% target, red = 5% danger threshold.`;
  },
  cac: (s) => {
    const last = s.filter(x => x.cac > 0 && x.ltv > 0).pop();
    if (!last) return "";
    const ratio = (last.ltv / last.cac).toFixed(1);
    return `LTV:CAC ratio (blue line) currently at ${ratio}x. Benchmark: 3x+ for Series A. Purple bars = CAC over time.`;
  },
  ltv: (s) => {
    const last = s.filter(x => x.ltv > 0 && s.length > 0).pop();
    if (!last) return "";
    return `LTV (blue area) grows as retention improves. Purple bars = payback period in months. Lower payback = faster cash recovery.`;
  },
};

// ── main export ───────────────────────────────────────────────────────────────
export function KPIDeepDive({ metric, snapshots, onClose }: Props) {
  const meta = METRIC_META[metric];
  const ChartComponent = CHART_MAP[metric];
  const latest  = snapshots[snapshots.length - 1];
  const insight = useMemo(() => CHART_INSIGHT[metric]?.(snapshots) ?? "", [metric, snapshots]);

  if (!meta || !ChartComponent || !latest) return null;

  const currentVal = latest[metric as keyof KPISnapshot] as number;
  const wow = latest.wow_delta?.[metric];
  const mom = latest.mom_delta?.[metric];

  // QoQ: compare to 13 weeks ago
  const qoqSnap  = snapshots[Math.max(0, snapshots.length - 14)];
  const qoqPrev  = qoqSnap?.[metric as keyof KPISnapshot] as number | undefined;
  const qoq      = qoqPrev && currentVal && qoqPrev !== 0 ? (currentVal - qoqPrev) / Math.abs(qoqPrev) : undefined;

  return (
    <div className="mt-4 rounded-2xl border border-blue-100 bg-white shadow-lg overflow-hidden animate-in slide-in-from-top-2 duration-300">
      {/* header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 bg-gray-50/60">
        <div>
          <h3 className="text-sm font-black text-gray-900">{meta.label} Deep Dive</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">{snapshots.length} weekly periods · click X to close</p>
        </div>
        <div className="flex-1" />

        {/* period delta chips */}
        <div className="flex items-center gap-2">
          <DeltaChip label="WoW"  value={meta.lowerBetter ? (wow !== undefined ? -wow : undefined) : wow} />
          <DeltaChip label="MoM"  value={meta.lowerBetter ? (mom !== undefined ? -mom : undefined) : mom} />
          <DeltaChip label="QoQ"  value={meta.lowerBetter ? (qoq !== undefined ? -qoq : undefined) : qoq} />
        </div>

        {/* current value badge */}
        <div className="text-center ml-2">
          <div className="text-[10px] text-gray-400 font-semibold">Current</div>
          <div className="text-xl font-black" style={{ color: meta.color }}>{meta.fmt(currentVal)}</div>
        </div>

        <button onClick={onClose} className="ml-2 rounded-full p-1.5 hover:bg-gray-100 transition-colors text-gray-400">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* chart */}
      <div className="px-6 pt-5 pb-4">
        <ChartComponent snapshots={snapshots} />
      </div>

      {/* insight footer */}
      {insight && (
        <div className="px-6 pb-4">
          <p className="text-[11px] text-gray-500 leading-relaxed bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
            {insight}
          </p>
        </div>
      )}
    </div>
  );
}

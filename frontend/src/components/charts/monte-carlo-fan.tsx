"use client";
import { useMemo } from "react";
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip } from "recharts";
import type { KPISnapshot, ScenarioResult } from "@/lib/types";
import { fmtK } from "@/lib/utils";

interface Props {
  snapshots: KPISnapshot[];
  scenarios: ScenarioResult[];
  latestMRR: number;
}

// Box-Muller transform for Gaussian noise
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

const MONTHS = 18;
const N_PATHS = 200;
const VOLATILITY = 0.09; // monthly MRR growth volatility

export function MonteCarloFan({ snapshots, scenarios, latestMRR }: Props) {
  const data = useMemo(() => {
    if (!latestMRR || latestMRR <= 0 || !scenarios.length) return [];

    // Derive base monthly growth rate from scenarios
    const baseScenario = scenarios.find(s => s.scenario === "base") ?? scenarios[0];
    const bearScenario = scenarios.find(s => s.scenario === "bear");
    const bullScenario = scenarios.find(s => s.scenario === "bull");

    const baseTarget = baseScenario.projected_mrr_6mo || latestMRR * 1.15;
    const monthlyGrowth = Math.pow(baseTarget / latestMRR, 1 / 6) - 1;
    const clampedGrowth = Math.max(-0.1, Math.min(0.3, monthlyGrowth));

    // Seeded paths for consistency (reset Math.random via deterministic seed)
    // We can't truly seed Math.random, but useMemo ensures stable render
    const paths: number[][] = [];
    for (let i = 0; i < N_PATHS; i++) {
      const path: number[] = [latestMRR];
      for (let m = 1; m <= MONTHS; m++) {
        const prev = path[m - 1];
        const noise = randn() * VOLATILITY;
        const next = Math.max(0, prev * (1 + clampedGrowth + noise));
        path.push(next);
      }
      paths.push(path);
    }

    // Build percentile bands per month
    const result = [];
    for (let m = 0; m <= MONTHS; m++) {
      const monthVals = paths.map(p => p[m]);
      result.push({
        month: m === 0 ? "Now" : `M${m}`,
        p10:   percentile(monthVals, 10),
        p25:   percentile(monthVals, 25),
        p50:   percentile(monthVals, 50),
        p75:   percentile(monthVals, 75),
        p90:   percentile(monthVals, 90),
        bear:  bearScenario && m === 6 ? bearScenario.projected_mrr_6mo : undefined,
        bull:  bullScenario && m === 6 ? bullScenario.projected_mrr_6mo : undefined,
      });
    }
    return result;
  }, [latestMRR, scenarios]);

  if (!data.length) return null;

  const bearTarget = scenarios.find(s => s.scenario === "bear")?.projected_mrr_6mo;
  const bullTarget = scenarios.find(s => s.scenario === "bull")?.projected_mrr_6mo;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5 text-xs">
        <div className="font-bold text-gray-700 mb-1.5">{label}</div>
        <div className="space-y-0.5">
          <div className="flex justify-between gap-4"><span className="text-gray-400">90th pct</span><span className="font-mono font-semibold text-green-600">{fmtK(d.p90)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-gray-400">75th pct</span><span className="font-mono font-semibold text-blue-500">{fmtK(d.p75)}</span></div>
          <div className="flex justify-between gap-4"><span className="font-semibold text-gray-700">Median</span><span className="font-mono font-bold text-blue-700">{fmtK(d.p50)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-gray-400">25th pct</span><span className="font-mono font-semibold text-blue-400">{fmtK(d.p25)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-gray-400">10th pct</span><span className="font-mono font-semibold text-red-400">{fmtK(d.p10)}</span></div>
        </div>
      </div>
    );
  };

  return (
    <div className="card-brutal p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Monte Carlo Revenue Simulation</div>
          <div className="text-sm font-semibold text-gray-900 mt-0.5">{N_PATHS} paths · 18-month horizon · volatility {(VOLATILITY * 100).toFixed(0)}%</div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-semibold">
          <div className="flex items-center gap-1.5"><div className="h-2 w-6 rounded bg-blue-300 opacity-60" /> <span className="text-gray-500">Probability fan</span></div>
          <div className="flex items-center gap-1.5"><div className="h-0.5 w-6 bg-blue-600" /> <span className="text-gray-500">Median</span></div>
          {bearTarget && <div className="flex items-center gap-1.5"><div className="h-0.5 w-6 bg-red-400 border-dashed border-t" /> <span className="text-gray-500">Bear</span></div>}
          {bullTarget && <div className="flex items-center gap-1.5"><div className="h-0.5 w-6 bg-green-500 border-dashed border-t" /> <span className="text-gray-500">Bull</span></div>}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ left: 8, right: 16, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="fanGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0071e3" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#0071e3" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" vertical={false} />
          <XAxis dataKey="month" tickLine={false} axisLine={false}
                 tick={{ fontSize: 9, fill: "#9ca3af" }} minTickGap={20} />
          <YAxis tickLine={false} axisLine={false}
                 tick={{ fontSize: 9, fill: "#9ca3af" }} tickFormatter={fmtK} width={52} />
          <Tooltip content={<CustomTooltip />} />

          {/* P10-P90 outer band */}
          <Area dataKey="p90" type="monotone" stroke="none" fill="#0071e3" fillOpacity={0.08} />
          <Area dataKey="p10" type="monotone" stroke="none" fill="white" fillOpacity={1} />

          {/* P25-P75 inner band */}
          <Area dataKey="p75" type="monotone" stroke="none" fill="#0071e3" fillOpacity={0.12} />
          <Area dataKey="p25" type="monotone" stroke="none" fill="white" fillOpacity={1} />

          {/* Median line */}
          <Line dataKey="p50" type="monotone" stroke="#0071e3" strokeWidth={2.5} dot={false} />

          {/* Bear/Bull reference lines at M6 */}
          {bearTarget && (
            <ReferenceLine
              x="M6" stroke="#ff3b30" strokeDasharray="5 3" strokeWidth={1.5}
              label={{ value: `Bear: ${fmtK(bearTarget)}`, position: "insideTopRight", fontSize: 9, fill: "#ff3b30" }}
            />
          )}
          {bullTarget && (
            <ReferenceLine
              x="M6" stroke="#34c759" strokeDasharray="5 3" strokeWidth={1.5}
              label={{ value: `Bull: ${fmtK(bullTarget)}`, position: "insideBottomRight", fontSize: 9, fill: "#34c759" }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-3 text-[10px] text-gray-400 text-center">
        Simulated using base scenario growth rate · Shaded region = 10th–90th percentile range · Bold line = median outcome
      </div>
    </div>
  );
}

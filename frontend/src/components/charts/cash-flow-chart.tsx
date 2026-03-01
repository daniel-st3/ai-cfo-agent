"use client";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CashFlowForecastWeek } from "@/lib/types";
import { fmtK } from "@/lib/utils";

interface Props {
  forecast: CashFlowForecastWeek[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: CashFlowForecastWeek }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-1 min-w-[190px]">
      <div className="font-semibold text-gray-700 mb-1.5">{label}</div>
      <div className="flex justify-between gap-4">
        <span className="text-gray-400">Optimistic (P90)</span>
        <span className="font-mono font-semibold text-green-600">{fmtK(d.predicted_balance_p90)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-gray-400">Median (P50)</span>
        <span className="font-mono font-semibold text-blue-600">{fmtK(d.predicted_balance_p50)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-gray-400">Stressed (P10)</span>
        <span className="font-mono font-semibold text-red-500">{fmtK(d.predicted_balance_p10)}</span>
      </div>
      <div className="border-t border-gray-100 pt-1.5 mt-1 space-y-0.5">
        <div className="flex justify-between gap-4">
          <span className="text-green-600">↑ Inflows</span>
          <span className="font-mono">{fmtK(d.expected_inflows)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-red-400">↓ Outflows</span>
          <span className="font-mono">{fmtK(d.expected_outflows)}</span>
        </div>
      </div>
    </div>
  );
}

export function CashFlowChart({ forecast }: Props) {
  // Add band_lo (transparent base) and band_hi (width of band) for stacked area trick
  const data = forecast.map((w) => ({
    ...w,
    label: `Wk ${w.week_offset}`,
    band_lo: w.predicted_balance_p10,                                              // base of shaded band
    band_hi: Math.max(0, w.predicted_balance_p90 - w.predicted_balance_p10),      // band width
  }));

  const allValues = data.flatMap((d) => [d.predicted_balance_p10, d.predicted_balance_p90]);
  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(...allValues) * 1.12;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ left: 8, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 9, fill: "#9ca3af" }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 9, fill: "#9ca3af" }}
          tickFormatter={(v) => fmtK(v)}
          domain={[minVal, maxVal]}
          width={54}
        />
        {/* Zero-cash line — neutral gray, clearly labelled */}
        <ReferenceLine
          y={0}
          stroke="#94a3b8"
          strokeDasharray="6 3"
          strokeWidth={1}
          label={{ value: "Zero cash", position: "insideTopLeft", fontSize: 9, fill: "#94a3b8", dy: -2 }}
        />
        <Tooltip content={<CustomTooltip />} />

        {/* ── Confidence band: transparent base + filled top ── */}
        {/* band_lo is rendered invisible (fillOpacity 0, no stroke) so it acts as an anchor */}
        <Area
          dataKey="band_lo"
          stackId="band"
          fill="transparent"
          stroke="none"
          legendType="none"
          isAnimationActive={false}
        />
        {/* band_hi sits on top of band_lo → appears as P10→P90 shaded region */}
        <Area
          dataKey="band_hi"
          stackId="band"
          fill="#0071e3"
          fillOpacity={0.12}
          stroke="none"
          name="P10–P90 range"
          isAnimationActive={false}
        />

        {/* ── Lines ── */}
        <Line
          dataKey="predicted_balance_p50"
          stroke="#0071e3"
          strokeWidth={2.5}
          dot={false}
          name="Median (P50)"
          isAnimationActive={false}
        />
        <Line
          dataKey="predicted_balance_p90"
          stroke="#22c55e"
          strokeWidth={1}
          strokeDasharray="4 2"
          dot={false}
          name="Optimistic (P90)"
          isAnimationActive={false}
        />
        <Line
          dataKey="predicted_balance_p10"
          stroke="#ef4444"
          strokeWidth={1}
          strokeDasharray="4 2"
          dot={false}
          name="Stressed (P10)"
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

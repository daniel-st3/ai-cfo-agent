"use client";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
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

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as CashFlowForecastWeek & { p50: number; p10: number; p90: number };
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs space-y-1 min-w-[180px]">
      <div className="font-semibold text-gray-700 mb-1">{label}</div>
      <div className="flex justify-between gap-4">
        <span className="text-gray-400">P90 (Optimistic)</span>
        <span className="font-mono text-green-600">{fmtK(d.predicted_balance_p90)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-gray-400">P50 (Median)</span>
        <span className="font-mono text-blue-600 font-semibold">{fmtK(d.predicted_balance_p50)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-gray-400">P10 (Stressed)</span>
        <span className="font-mono text-red-500">{fmtK(d.predicted_balance_p10)}</span>
      </div>
      <div className="border-t border-gray-100 pt-1 mt-1 space-y-0.5">
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
  const data = forecast.map((w) => ({
    ...w,
    label: `Wk ${w.week_offset}`,
    net: w.expected_inflows - w.expected_outflows,
    outflows_neg: -w.expected_outflows,
  }));

  const allValues = data.flatMap((d) => [d.predicted_balance_p10, d.predicted_balance_p90]);
  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(...allValues) * 1.1;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
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
          width={52}
        />
        <ReferenceLine y={0} stroke="#ff3b30" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: "Zero cash", position: "insideLeft", fontSize: 9, fill: "#ff3b30" }} />
        <Tooltip content={<CustomTooltip />} />

        {/* P10–P90 band */}
        <Area
          dataKey="predicted_balance_p90"
          fill="#0071e3"
          fillOpacity={0.10}
          stroke="none"
          name="P90"
        />
        <Area
          dataKey="predicted_balance_p50"
          fill="#0071e3"
          fillOpacity={0.15}
          stroke="#0071e3"
          strokeWidth={2}
          name="P50 (median)"
        />
        <Area
          dataKey="predicted_balance_p10"
          fill="#ffffff"
          fillOpacity={1}
          stroke="#ff3b30"
          strokeWidth={1}
          strokeDasharray="3 2"
          name="P10 (stressed)"
        />
        <Legend
          iconType="line"
          wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
          formatter={(value) => <span className="text-gray-500">{value}</span>}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

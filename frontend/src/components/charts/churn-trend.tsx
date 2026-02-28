"use client";
import { Line, LineChart, CartesianGrid, XAxis, YAxis, ReferenceLine, ReferenceArea } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { KPISnapshot } from "@/lib/types";
import { fmtK } from "@/lib/utils";

const churnConfig: ChartConfig = {
  churn_rate: { label: "Churn %", color: "#ff9500" },
};

interface Props { snapshots: KPISnapshot[] }

export function ChurnTrendChart({ snapshots }: Props) {
  const data = snapshots.slice(-16).map(s => ({
    date:       new Date(s.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    churn_rate: +(Number(s.churn_rate) * 100).toFixed(2),
    ltv:        Number(s.ltv),
    cac:        Number(s.cac),
  }));

  const latest = data[data.length - 1];
  const ltvCacRatio = latest?.ltv && latest?.cac
    ? (latest.ltv / latest.cac).toFixed(1)
    : null;

  return (
    <div className="card-brutal p-5 flex flex-col h-full">
      <div className="mb-3">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Churn Rate</div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className={`text-2xl font-bold ${(latest?.churn_rate ?? 0) <= 3 ? "text-green-600" : (latest?.churn_rate ?? 0) <= 5 ? "text-amber-600" : "text-red-500"}`}>
            {(latest?.churn_rate ?? 0).toFixed(1)}%
          </span>
          <span className="text-xs text-gray-400">threshold: 5%</span>
        </div>
      </div>

      <ChartContainer config={churnConfig} className="h-[140px] w-full">
        <LineChart data={data} margin={{ left: -4, right: 4, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false}
                 tick={{ fontSize: 9, fill: "#9ca3af" }} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false}
                 tick={{ fontSize: 9, fill: "#9ca3af" }} tickFormatter={v => `${v}%`} width={28} />
          <ReferenceArea y1={5} y2={100} fill="#ff3b30" fillOpacity={0.06} />
          <ReferenceLine y={5} stroke="#ff3b30" strokeDasharray="4 2" strokeWidth={1} />
          <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v}%`} indicator="dot" />} />
          <Line dataKey="churn_rate" stroke="#ff9500" strokeWidth={2.5} dot={false}
            animationDuration={1000} animationEasing="ease-out" animationBegin={100} />
        </LineChart>
      </ChartContainer>

      {/* LTV vs CAC */}
      <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
        <div className="text-center">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">LTV</div>
          <div className={`font-bold text-sm mt-0.5 ${(latest?.ltv ?? 0) > 0 ? "text-blue-600" : "text-gray-400"}`}>
            {(latest?.ltv ?? 0) > 0 ? fmtK(latest.ltv) : "N/A"}
          </div>
        </div>
        <div className="text-gray-300 text-lg font-light">÷</div>
        <div className="text-center">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">CAC</div>
          <div className={`font-bold text-sm mt-0.5 ${(latest?.cac ?? 0) > 0 ? "text-red-500" : "text-gray-400"}`}>
            {(latest?.cac ?? 0) > 0 ? fmtK(latest.cac) : "N/A"}
          </div>
        </div>
        <div className="h-8 w-px bg-gray-200" />
        <div className="text-center">
          <div className="text-[10px] text-gray-400 uppercase tracking-wide">Ratio</div>
          <div className={`font-bold text-base mt-0.5 ${ltvCacRatio && Number(ltvCacRatio) >= 3 ? "text-green-600" : ltvCacRatio ? "text-amber-600" : "text-gray-400"}`}>
            {ltvCacRatio ? `${ltvCacRatio}×` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

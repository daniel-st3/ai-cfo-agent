"use client";
import { useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";
import type { KPISnapshot } from "@/lib/types";
import { fmtK } from "@/lib/utils";

const config: ChartConfig = {
  mrr:       { label: "MRR",  color: "#0071e3" },
  arr:       { label: "ARR",  color: "#6366f1" },
  burn_rate: { label: "Burn", color: "#ff3b30" },
};

const RANGES = ["4W", "8W", "ALL"] as const;
interface Props { snapshots: KPISnapshot[] }

export function RevenueAreaChart({ snapshots }: Props) {
  const [range, setRange] = useState<typeof RANGES[number]>("ALL");
  const sliced = range === "4W" ? snapshots.slice(-4) : range === "8W" ? snapshots.slice(-8) : snapshots;

  const data = sliced.map(s => ({
    date:      new Date(s.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    mrr:       Number(s.mrr),
    arr:       Number(s.arr),
    burn_rate: Math.abs(Number(s.burn_rate)),
  }));

  return (
    <div className="card-brutal p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Revenue Trends</div>
          <div className="text-sm font-semibold text-gray-900 mt-0.5">MRR · ARR · Burn Rate</div>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${range === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0">
      <ChartContainer config={config} className="h-[280px] w-full">
        <AreaChart data={data} margin={{ left: 8, right: 8, top: 4, bottom: 8 }}>
          <defs>
            <linearGradient id="fillMrr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#0071e3" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#0071e3" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fillBurn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#ff3b30" stopOpacity={0.12} />
              <stop offset="95%" stopColor="#ff3b30" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8}
                 tick={{ fontSize: 10, fill: "#9ca3af" }} minTickGap={20} />
          <YAxis tickLine={false} axisLine={false}
                 tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={fmtK} width={52} />
          <ChartTooltip content={<ChartTooltipContent formatter={(v) => fmtK(Number(v))} indicator="dot" />} />
          <Area dataKey="mrr"       type="monotone" fill="url(#fillMrr)"  stroke="#0071e3" strokeWidth={2.5} dot={false}
            animationDuration={1200} animationEasing="ease-out" animationBegin={100} />
          <Area dataKey="burn_rate" type="monotone" fill="url(#fillBurn)" stroke="#ff3b30" strokeWidth={2}   dot={false} strokeDasharray="5 3"
            animationDuration={1400} animationEasing="ease-out" animationBegin={200} />
          <Area dataKey="arr"       type="monotone" fill="none"           stroke="#6366f1" strokeWidth={1.5} dot={false}
            animationDuration={1600} animationEasing="ease-out" animationBegin={300} />
          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>
      </div>
    </div>
  );
}

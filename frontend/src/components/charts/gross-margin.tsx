"use client";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ReferenceLine, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { KPISnapshot } from "@/lib/types";

const config: ChartConfig = {
  gross_margin: { label: "Gross Margin %", color: "#34c759" },
};

interface Props { snapshots: KPISnapshot[] }

export function GrossMarginChart({ snapshots }: Props) {
  const data = snapshots.slice(-16).map(s => ({
    date:         new Date(s.week_start).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    gross_margin: +(Number(s.gross_margin) * 100).toFixed(1),
  }));

  const latest = data[data.length - 1]?.gross_margin ?? 0;

  return (
    <div className="card-brutal p-5 flex flex-col h-full">
      <div className="mb-3">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Gross Margin</div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className={`text-2xl font-bold ${latest >= 60 ? "text-green-600" : latest >= 40 ? "text-amber-600" : "text-red-500"}`}>
            {latest.toFixed(1)}%
          </span>
          <span className="text-xs text-gray-400">target: 60%</span>
        </div>
      </div>
      <ChartContainer config={config} className="h-[160px] w-full">
        <BarChart data={data} margin={{ left: -4, right: 4, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false}
                 tick={{ fontSize: 9, fill: "#9ca3af" }} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false}
                 tick={{ fontSize: 9, fill: "#9ca3af" }} tickFormatter={v => `${v}%`} domain={[0, 100]} width={36} />
          <ReferenceLine y={60} stroke="#0071e3" strokeDasharray="4 2" strokeWidth={1.5} />
          <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v}%`} indicator="dot" />} />
          <Bar dataKey="gross_margin" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.gross_margin >= 60 ? "#34c759" : entry.gross_margin >= 40 ? "#ff9500" : "#ff3b30"} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

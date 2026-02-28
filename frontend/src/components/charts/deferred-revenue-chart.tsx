"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DeferredRevenueMonth } from "@/lib/types";
import { fmtK } from "@/lib/utils";

interface Props {
  schedule: DeferredRevenueMonth[];
}

export function DeferredRevenueChart({ schedule }: Props) {
  const data = schedule.map((m) => ({
    ...m,
    label: new Date(m.month_start + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="defGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0071e3" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#0071e3" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="recGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#34c759" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#34c759" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 9, fill: "#9ca3af" }}
          minTickGap={20}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 9, fill: "#9ca3af" }}
          tickFormatter={(v) => fmtK(v)}
          width={48}
        />
        <Tooltip
          formatter={(value: number, name: string) => [fmtK(value), name]}
          contentStyle={{ fontSize: 11, borderRadius: 10, border: "1px solid #d2d2d7" }}
        />
        <Area
          type="monotone"
          dataKey="deferred_balance"
          name="Deferred Balance"
          fill="url(#defGrad)"
          stroke="#0071e3"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="recognized_revenue"
          name="Monthly Recognized"
          fill="url(#recGrad)"
          stroke="#34c759"
          strokeWidth={1.5}
        />
        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

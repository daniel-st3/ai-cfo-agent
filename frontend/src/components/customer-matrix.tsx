"use client";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import type { CustomerProfile } from "@/lib/types";

interface Props { profiles: CustomerProfile[] }

const SEG_COLOR: Record<string, string> = {
  Enterprise: "#7c3aed",
  Mid:        "#2563eb",
  SMB:        "#9ca3af",
};

const SEG_BADGE: Record<string, string> = {
  Enterprise: "bg-purple-100 text-purple-800",
  Mid:        "bg-blue-100 text-blue-800",
  SMB:        "bg-gray-100 text-gray-600",
};

function fmtRev(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Quadrant label positions
const QUADRANT_LABELS = [
  { x: "97%", y: "4%",  text: "Stars",    cls: "text-purple-700 font-black" },
  { x: "3%",  y: "4%",  text: "At Risk",  cls: "text-red-600 font-black" },
  { x: "97%", y: "96%", text: "Growing",  cls: "text-green-700 font-black" },
  { x: "3%",  y: "96%", text: "Watch",    cls: "text-amber-600 font-black" },
];

interface TooltipPayload {
  payload: CustomerProfile & { x: number; y: number };
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-lg text-xs">
      <p className="font-black text-gray-800 mb-1">{d.customer_id}</p>
      <div className="space-y-0.5 text-gray-600">
        <div>Avg weekly: <span className="font-semibold text-gray-800">{fmtRev(d.avg_weekly_revenue)}</span></div>
        <div>Weeks active: <span className="font-semibold text-gray-800">{d.weeks_active}</span></div>
        <div>Total: <span className="font-semibold text-gray-800">{fmtRev(d.total_revenue)}</span></div>
        <div>Revenue share: <span className="font-semibold text-gray-800">{(d.revenue_pct * 100).toFixed(1)}%</span></div>
        {d.churn_flag && <div className="text-red-600 font-bold">CHURNED</div>}
      </div>
    </div>
  );
}

export function CustomerMatrix({ profiles }: Props) {
  if (!profiles.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="text-sm font-semibold text-gray-500">No customer data available</div>
        <div className="text-xs text-gray-400">Run analysis to see customer profitability</div>
      </div>
    );
  }

  const medX = median(profiles.map(p => p.avg_weekly_revenue));
  const medY = median(profiles.map(p => p.weeks_active));

  // Fire list: churned or < 4 weeks active, sorted by total_revenue desc
  const fireList = profiles
    .filter(p => p.churn_flag || p.weeks_active < 4)
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, 10);

  const scatterData = profiles.map(p => ({ ...p, x: p.avg_weekly_revenue, y: p.weeks_active }));

  return (
    <div className="space-y-6">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {(["Enterprise", "Mid", "SMB"] as const).map(seg => {
          const count = profiles.filter(p => p.segment === seg).length;
          return (
            <span key={seg} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${SEG_BADGE[seg]}`}>
              <span className="h-2 w-2 rounded-full" style={{ background: SEG_COLOR[seg] }} />
              {seg} ({count})
            </span>
          );
        })}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 text-red-700 px-3 py-1 text-xs font-semibold">
          {fireList.length} at-risk
        </span>
      </div>

      {/* Scatter chart */}
      <div className="relative rounded-2xl border border-gray-100 bg-white p-4">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Avg Weekly Revenue vs Weeks Active
        </p>

        {/* Quadrant labels — absolutely positioned */}
        <div className="relative">
          {QUADRANT_LABELS.map(({ x, y, text, cls }) => (
            <span
              key={text}
              className={`absolute text-[10px] tracking-wide pointer-events-none z-10 ${cls}`}
              style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}
            >
              {text}
            </span>
          ))}
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 16, right: 16, bottom: 16, left: 8 }}>
              <XAxis
                type="number"
                dataKey="x"
                name="Avg Weekly Revenue"
                tickFormatter={v => `$${(v / 1000).toFixed(0)}K`}
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                label={{ value: "Avg Weekly Revenue", position: "insideBottom", offset: -8, fontSize: 10, fill: "#9ca3af" }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Weeks Active"
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                label={{ value: "Weeks Active", angle: -90, position: "insideLeft", offset: 12, fontSize: 10, fill: "#9ca3af" }}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine x={medX} stroke="#e5e7eb" strokeDasharray="4 4" />
              <ReferenceLine y={medY} stroke="#e5e7eb" strokeDasharray="4 4" />
              <Scatter data={scatterData} isAnimationActive={false}>
                {scatterData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={SEG_COLOR[entry.segment] ?? "#9ca3af"}
                    fillOpacity={entry.churn_flag ? 0.3 : 0.8}
                    stroke={entry.churn_flag ? "#ef4444" : "transparent"}
                    strokeWidth={entry.churn_flag ? 1.5 : 0}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2 justify-center">
          {(["Enterprise", "Mid", "SMB"] as const).map(seg => (
            <span key={seg} className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: SEG_COLOR[seg] }} />
              {seg}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="h-2.5 w-2.5 rounded-full border border-red-400 bg-red-100" />
            Churned
          </span>
        </div>
      </div>

      {/* Fire list */}
      {fireList.length > 0 && (
        <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4">
          <p className="text-[11px] font-black text-red-600 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span>At-Risk Customers</span>
            <span className="rounded-full bg-red-600 text-white text-[10px] px-2 py-0.5">{fireList.length}</span>
          </p>
          <div className="space-y-2">
            {fireList.map(p => (
              <div
                key={p.customer_id}
                className="flex items-center justify-between rounded-xl border border-red-100 bg-white px-3 py-2.5 gap-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono font-semibold text-gray-700 truncate">{p.customer_id}</span>
                  <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold ${SEG_BADGE[p.segment]}`}>
                    {p.segment}
                  </span>
                  {p.churn_flag && (
                    <span className="inline-flex rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-bold">
                      CHURNED
                    </span>
                  )}
                  {!p.churn_flag && p.weeks_active < 4 && (
                    <span className="inline-flex rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px] font-bold">
                      NEW
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-right">
                  <div>
                    <div className="text-xs font-black text-gray-800">{fmtRev(p.total_revenue)}</div>
                    <div className="text-[10px] text-gray-400">{(p.revenue_pct * 100).toFixed(1)}% of ARR</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

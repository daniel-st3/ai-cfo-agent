"use client";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, LabelList, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { ScenarioResult } from "@/lib/types";
import { fmtK } from "@/lib/utils";

const config: ChartConfig = {
  months_runway: { label: "Runway (months)" },
};

const SCENARIO_META = {
  bear: { color: "#ff3b30", bg: "bg-red-50",   border: "border-red-200",   text: "text-red-600",   label: "Bear Case" },
  base: { color: "#0071e3", bg: "bg-blue-50",  border: "border-blue-200",  text: "text-blue-600",  label: "Base Case" },
  bull: { color: "#34c759", bg: "bg-green-50", border: "border-green-200", text: "text-green-700", label: "Bull Case" },
};

const READINESS_BADGE: Record<string, { label: string; cls: string }> = {
  READY:     { label: "Series A Ready",  cls: "bg-green-100 text-green-700 border-green-200" },
  "6_MONTHS":{ label: "6 Months Away",   cls: "bg-amber-100 text-amber-700 border-amber-200" },
  NOT_READY: { label: "Not Ready",       cls: "bg-red-100   text-red-600   border-red-200"   },
};

interface Props { scenarios: ScenarioResult[] }

export function ScenarioBarsChart({ scenarios }: Props) {
  const data = scenarios.map(s => ({
    name:          s.scenario === "bear" ? "BEAR" : s.scenario === "bull" ? "BULL" : "BASE",
    months_runway: +s.months_runway.toFixed(1),
    fill:          SCENARIO_META[s.scenario]?.color ?? "#0071e3",
  }));

  return (
    <div className="card-brutal p-5 flex flex-col h-full">
      <div className="mb-3">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Scenario Stress Test</div>
        <div className="text-sm font-semibold text-gray-900 mt-0.5">Runway forecast · Bear / Base / Bull</div>
      </div>

      <div className="flex-1 min-h-[180px]">
      <ChartContainer config={config} className="h-full w-full">
        <BarChart data={data} margin={{ left: 0, right: 8, top: 20, bottom: 4 }} barSize={52}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f5" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false}
                 tick={{ fontSize: 11, fill: "#6b7280", fontWeight: 700, letterSpacing: "0.05em" }} />
          <YAxis tickLine={false} axisLine={false}
                 tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={v => `${v}mo`} width={36} />
          <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v} months`} />} />
          <Bar dataKey="months_runway" radius={[6, 6, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} fillOpacity={0.9} />
            ))}
            <LabelList dataKey="months_runway" position="top"
              formatter={(v: number) => `${v}mo`}
              style={{ fontSize: 12, fontWeight: 700, fill: "#1d1d1f" }} />
          </Bar>
        </BarChart>
      </ChartContainer>
      </div>
    </div>
  );
}

export function ScenarioCards({ scenarios }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {scenarios.map(s => {
        const meta    = SCENARIO_META[s.scenario] ?? SCENARIO_META.base;
        const badge   = READINESS_BADGE[s.series_a_readiness] ?? READINESS_BADGE.NOT_READY;
        return (
          <div key={s.scenario} className={`rounded-2xl border ${meta.border} ${meta.bg} p-5`}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className={`text-xs font-bold uppercase tracking-wide ${meta.text}`}>{meta.label}</div>
                <div className="text-2xl font-bold text-gray-900 mt-0.5">{s.months_runway.toFixed(1)} <span className="text-base font-normal text-gray-500">mo runway</span></div>
                <div className="text-xs text-gray-500 mt-0.5">6mo MRR forecast: <span className="font-semibold text-gray-700">{fmtK(s.projected_mrr_6mo)}</span></div>
              </div>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold ${badge.cls}`}>
                {badge.label}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {s.key_risks.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Key Risks</div>
                  <ul className="space-y-1.5">
                    {s.key_risks.map((r, i) => (
                      <li key={i} className="flex gap-2 text-xs text-gray-600 leading-snug">
                        <span className="text-red-400 mt-0.5 flex-shrink-0">▸</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {s.recommended_actions.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Actions</div>
                  <ul className="space-y-1.5">
                    {s.recommended_actions.map((a, i) => (
                      <li key={i} className="flex gap-2 text-xs text-gray-600 leading-snug">
                        <span className="text-green-500 mt-0.5 flex-shrink-0">▸</span>{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

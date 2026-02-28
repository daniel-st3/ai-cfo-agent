"use client";
import { useEffect, useState } from "react";
import { RadialBar, RadialBarChart, PolarGrid, PolarRadiusAxis, Label } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { SurvivalAnalysis } from "@/lib/types";

const LABEL_COLOR: Record<string, string> = {
  SAFE:          "#34c759",
  LOW_RISK:      "#30d158",
  MODERATE_RISK: "#ff9500",
  HIGH_RISK:     "#ff3b30",
  CRITICAL:      "#ff2d55",
};
const LABEL_TEXT: Record<string, string> = {
  SAFE:          "Safe",
  LOW_RISK:      "Low Risk",
  MODERATE_RISK: "Moderate Risk",
  HIGH_RISK:     "High Risk",
  CRITICAL:      "Critical",
};
const LABEL_BG: Record<string, string> = {
  SAFE:          "bg-green-50 border-green-200 text-green-700",
  LOW_RISK:      "bg-green-50 border-green-200 text-green-700",
  MODERATE_RISK: "bg-amber-50 border-amber-200 text-amber-700",
  HIGH_RISK:     "bg-red-50 border-red-200 text-red-700",
  CRITICAL:      "bg-red-100 border-red-300 text-red-800",
};

interface Props { survival: SurvivalAnalysis }

export function SurvivalRadialChart({ survival }: Props) {
  const score = survival.score;
  const color = LABEL_COLOR[survival.label] ?? "#0071e3";
  const config: ChartConfig = { score: { label: "Survival Score", color } };
  const data = [{ score, fill: color }];

  // Count-up animation for the displayed score
  const [displayScore, setDisplayScore] = useState(0);
  useEffect(() => {
    let start = 0;
    const duration = 1200;
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * score);
      setDisplayScore(current);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [score]);

  const ruinColor = (pct: number) =>
    pct < 0.05 ? "text-green-600" : pct < 0.2 ? "text-amber-600" : "text-red-600";

  return (
    <div className="card-brutal p-5 flex flex-col items-center h-full">
      <div className="w-full mb-2">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Survival Score</div>
        <div className="text-sm font-semibold text-gray-900 mt-0.5">Monte Carlo · 1,000 simulations</div>
      </div>

      <ChartContainer config={config} className="h-[180px] w-[180px]">
        <RadialBarChart data={data} startAngle={90} endAngle={90 - (360 * score / 100)} innerRadius={65} outerRadius={88}>
          <PolarGrid gridType="circle" radialLines={false} stroke="none"
            className="first:fill-gray-100 last:fill-white" polarRadius={[70, 60]} />
          <RadialBar dataKey="score" background={{ fill: "#f3f4f6" }} cornerRadius={8}
            animationDuration={1200} animationEasing="ease-out" animationBegin={100} />
          <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
            <Label content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox)) return null;
              return (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 5} fill="#1d1d1f" fontSize={38} fontWeight={700} fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif">
                    {displayScore}
                  </tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 18} fill="#8e8e93" fontSize={11}>
                    / 100
                  </tspan>
                </text>
              );
            }} />
          </PolarRadiusAxis>
        </RadialBarChart>
      </ChartContainer>

      {/* Label badge */}
      <div className={`mt-1 px-3 py-1 rounded-full border text-xs font-semibold ${LABEL_BG[survival.label] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
        {LABEL_TEXT[survival.label]}
      </div>

      {/* Ruin probabilities */}
      <div className="mt-4 w-full grid grid-cols-3 gap-2 text-center">
        {[
          { label: "90D", value: survival.probability_ruin_90d },
          { label: "180D", value: survival.probability_ruin_180d },
          { label: "365D", value: survival.probability_ruin_365d },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-gray-50 border border-gray-100 p-2">
            <div className={`font-bold text-sm ${ruinColor(value)}`}>
              {(value * 100).toFixed(0)}%
            </div>
            <div className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">{label} Ruin</div>
          </div>
        ))}
      </div>

      {/* Deadline warning */}
      {survival.fundraising_deadline && (
        <div className="mt-3 w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 font-medium flex items-center gap-2">
          <span>⚡</span>
          Raise by {survival.fundraising_deadline}
        </div>
      )}
      {survival.expected_zero_cash_day > 0 && (
        <div className="mt-2 text-xs text-gray-400">
          Zero-cash day: <span className="font-mono font-semibold text-gray-600">{survival.expected_zero_cash_day}</span>
        </div>
      )}
    </div>
  );
}

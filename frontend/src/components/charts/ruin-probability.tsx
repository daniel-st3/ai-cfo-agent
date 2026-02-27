"use client";
import type { SurvivalAnalysis } from "@/lib/types";

interface Props { survival: SurvivalAnalysis }

export function RuinProbabilityChart({ survival }: Props) {
  const horizons = [
    { label: "90 Days",  value: survival.probability_ruin_90d,  barColor: "bg-red-500",    bigColor: "text-red-600" },
    { label: "180 Days", value: survival.probability_ruin_180d, barColor: "bg-orange-400", bigColor: "text-orange-500" },
    { label: "1 Year",   value: survival.probability_ruin_365d, barColor: "bg-purple-500", bigColor: "text-purple-600" },
  ];
  const allZero = horizons.every(h => h.value < 0.001);

  // Estimate zero-cash date from expected_zero_cash_day
  const zeroCashDate = survival.expected_zero_cash_day > 0 && !allZero
    ? new Date(Date.now() + survival.expected_zero_cash_day * 86400 * 1000)
        .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="card-brutal p-5 flex flex-col h-full">
      <div className="mb-4">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Ruin Probability</div>
        <div className="text-sm font-semibold text-gray-900 mt-0.5">Monte Carlo · 1,000 simulations</div>
      </div>

      {allZero ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-4">
          <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center text-3xl">✓</div>
          <div className="text-center">
            <div className="text-sm font-semibold text-green-700">Runway Secure</div>
            <div className="text-xs text-gray-400 mt-1">0% ruin probability across all horizons</div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {horizons.map(({ label, value, barColor, bigColor }) => {
            const pct = +(value * 100).toFixed(1);
            const isPulsing = pct >= 20;
            const textColor = pct < 5 ? "text-green-600" : pct < 20 ? "text-amber-600" : "text-red-600";
            return (
              <div key={label}>
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="text-xs font-medium text-gray-500">{label}</span>
                  <span className={`font-black text-xl font-mono tabular-nums leading-none ${bigColor} ${isPulsing ? "animate-pulse" : ""}`}>
                    {pct}%
                  </span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                       style={{ width: `${Math.max(pct, 0.5)}%`, opacity: 0.85 }} />
                </div>
                {pct >= 20 && (
                  <div className={`text-[10px] font-semibold mt-1 ${textColor}`}>
                    HIGH RISK — fundraising required
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {zeroCashDate && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-red-500">Estimated Cash-Zero</div>
          <div className="text-sm font-black text-red-700 font-mono mt-0.5">{zeroCashDate}</div>
          <div className="text-[10px] text-red-400 mt-0.5">median of 1,000 Monte Carlo paths</div>
        </div>
      )}
    </div>
  );
}

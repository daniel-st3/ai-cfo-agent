"use client";
import { useEffect, useState } from "react";
import { fmtK } from "@/lib/utils";

interface Props {
  /** Base months of runway (from base scenario or expected_zero_cash_day / 30.44) */
  monthsRunway: number;
  /** Latest weekly burn rate in dollars (for dollar-impact display) */
  latestBurn?: number;
  /** Latest weekly MRR in dollars (for dollar-impact display) */
  latestMRR?: number;
}

export function RunwayClock({ monthsRunway, latestBurn = 0, latestMRR = 0 }: Props) {
  const [burnPct, setBurnPct] = useState(0);
  const [mrrPct,  setMrrPct]  = useState(0);
  const [tick,    setTick]    = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Adjust months: more revenue extends runway, lower burn extends runway
  const adjustedMonths = monthsRunway
    * (1 + mrrPct  / 100)
    / Math.max(1 - burnPct / 100, 0.1);

  const totalSec = Math.max(0, adjustedMonths * 30.44 * 24 * 3600);
  const days  = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins  = Math.floor((totalSec % 3600)  / 60);
  const secs  = Math.floor(totalSec % 60);

  const isRed   = adjustedMonths < 3;
  const isAmber = adjustedMonths >= 3 && adjustedMonths < 6;
  const isGreen = !isRed && !isAmber;

  const cardCls = isRed
    ? "border-red-200 bg-gradient-to-br from-red-50 to-white"
    : isAmber
    ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white"
    : "border-green-200 bg-gradient-to-br from-green-50 to-white";

  const numCls = isRed ? "text-red-600" : isAmber ? "text-amber-600" : "text-green-600";
  const accentCls = isRed ? "text-red-500" : isAmber ? "text-amber-500" : "text-green-500";
  const badge = isRed ? "bg-red-100 text-red-700 border-red-200" : isAmber ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-green-100 text-green-700 border-green-200";
  const badgeLabel = isRed ? "CRITICAL" : isAmber ? "WARNING" : "SAFE";

  const pad = (n: number) => String(n).padStart(2, "0");
  const burnSaved = latestBurn * (burnPct / 100);
  const mrrGained = latestMRR * (mrrPct / 100);
  const changed = burnPct > 0 || mrrPct > 0;

  return (
    <div className={`card-brutal p-6 ${cardCls}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          Cash Runway · Live Countdown
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black tracking-wider ${badge}`}>
          {isRed ? "☠" : isAmber ? "⚠" : "✓"} {badgeLabel}
        </span>
      </div>

      {/* Hero countdown */}
      <div className="flex flex-col items-center py-5 gap-1">
        <div className={`font-black tabular-nums text-7xl sm:text-8xl leading-none tracking-tight ${numCls}`}>
          {days.toLocaleString()}
        </div>
        <div className="text-sm font-semibold text-gray-500 -mt-1">days remaining</div>
        <div className={`font-mono text-xl tabular-nums font-semibold mt-2 ${numCls} opacity-80`}>
          {pad(hours)}<span className="opacity-40 mx-0.5">:</span>{pad(mins)}<span className="opacity-40 mx-0.5">:</span>{pad(secs)}
        </div>
        <div className="text-xs text-gray-400 mt-1">
          until estimated cash-zero · {adjustedMonths.toFixed(1)} months
        </div>
        {changed && (
          <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold ${badge}`}>
            {monthsRunway < adjustedMonths ? "▲" : "▼"} {Math.abs(adjustedMonths - monthsRunway).toFixed(1)} months adjusted
          </div>
        )}
      </div>

      {/* What-if sliders */}
      <div className="border-t border-black/5 pt-4 space-y-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 text-center mb-3">
          ── What if you... ──
        </div>

        {/* Burn slider */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-base">✂</span>
              <span className="text-xs font-semibold text-gray-700">Cut burn</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-black font-mono ${accentCls}`}>−{burnPct}%</span>
              {burnSaved > 0 && (
                <span className="text-[10px] text-green-600 font-semibold bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                  saving {fmtK(burnSaved)}/wk
                </span>
              )}
            </div>
          </div>
          <input
            type="range" min={0} max={60} step={1} value={burnPct}
            onChange={e => setBurnPct(Number(e.target.value))}
            className="w-full h-2 rounded-full cursor-pointer accent-green-500"
          />
          <div className="flex justify-between text-[9px] text-gray-400 mt-1">
            <span>0%</span><span>20%</span><span>40%</span><span>60%</span>
          </div>
        </div>

        {/* MRR slider */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-base">↑</span>
              <span className="text-xs font-semibold text-gray-700">Grow MRR</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black font-mono text-blue-500">+{mrrPct}%</span>
              {mrrGained > 0 && (
                <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                  adding {fmtK(mrrGained)}/wk
                </span>
              )}
            </div>
          </div>
          <input
            type="range" min={0} max={100} step={1} value={mrrPct}
            onChange={e => setMrrPct(Number(e.target.value))}
            className="w-full h-2 rounded-full cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-[9px] text-gray-400 mt-1">
            <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>+100%</span>
          </div>
        </div>
      </div>

      {/* Urgency hint */}
      {isRed && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-100/60 px-4 py-2.5 text-xs text-red-700 font-semibold flex items-start gap-2">
          <span className="text-base flex-shrink-0">⚡</span>
          <span>Critical — less than 90 days at current burn. Use the sliders above to model emergency scenarios, then act immediately.</span>
        </div>
      )}
      {isAmber && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-100/60 px-4 py-2.5 text-xs text-amber-700 font-semibold flex items-start gap-2">
          <span className="text-base flex-shrink-0">⚠</span>
          <span>Caution — begin fundraising conversations within 60 days. Drag the sliders to explore your options.</span>
        </div>
      )}
      {isGreen && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-100/40 px-4 py-2.5 text-xs text-green-700 font-medium flex items-start gap-2">
          <span className="text-base flex-shrink-0">💡</span>
          <span>Healthy runway. Drag the sliders to model growth scenarios and see how your runway changes.</span>
        </div>
      )}
    </div>
  );
}

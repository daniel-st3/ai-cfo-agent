"use client";
import { useState } from "react";
import { fmtK } from "@/lib/utils";

interface Props {
  monthsRunway: number;
  latestBurn?: number;
  latestMRR?: number;
}

const MAX = 24;

// ── Impact chip ─────────────────────────────────────────────────────────────
function ImpactChip({ delta }: { delta: number }) {
  if (Math.abs(delta) < 0.1) return null;
  const pos = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
      pos ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
    }`}>
      {pos ? "▲" : "▼"} {Math.abs(delta).toFixed(1)} mo
    </span>
  );
}

// ── Horizontal fuel gauge ─────────────────────────────────────────────────
// Red 0–3m · Amber 3–6m · Green 6–24m
// White dim overlay fades the "future" portion after current position.
// Thumb dot slides to show current position.
function RunwayBar({
  current,
  base,
  accent,
}: {
  current: number;
  base: number;
  accent: string;
}) {
  const pct      = Math.min(Math.max(current / MAX, 0), 1) * 100;
  const basePct  = Math.min(Math.max(base    / MAX, 0), 1) * 100;
  const dangerPct  = (3  / MAX) * 100;   // 12.5 %
  const warningPct = (6  / MAX) * 100;   // 25 %
  const changed    = Math.abs(current - base) > 0.05;

  return (
    <div className="space-y-2.5">
      {/* Bar */}
      <div className="relative" style={{ height: 32 }}>
        {/* Zone colour bands */}
        <div className="absolute inset-0 rounded-full overflow-hidden flex">
          <div className="h-full bg-red-300/70"   style={{ width: `${dangerPct}%` }} />
          <div className="h-full bg-amber-300/70" style={{ width: `${warningPct - dangerPct}%` }} />
          <div className="h-full flex-1 bg-green-300/70" />
        </div>

        {/* Dim overlay — fades everything after current position */}
        <div
          className="absolute top-0 bottom-0 rounded-r-full"
          style={{ left: `${pct}%`, right: 0, background: "rgba(255,255,255,0.78)" }}
        />

        {/* Baseline tick when adjusted */}
        {changed && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-gray-400/50 rounded-full"
            style={{ left: `${basePct}%`, transform: "translateX(-50%)" }}
          />
        )}

        {/* Sliding thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.18)] transition-[left] duration-300 ease-out"
          style={{
            left: `${pct}%`,
            transform: "translate(-50%, -50%)",
            width: 32,
            height: 32,
            border: `3px solid ${accent}`,
          }}
        />
      </div>

      {/* Axis */}
      <div className="relative h-4 text-[9px] text-gray-400 select-none">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2 text-red-400 font-semibold"
          style={{ left: `${dangerPct}%` }}>3m</span>
        <span className="absolute -translate-x-1/2 text-amber-500 font-semibold"
          style={{ left: `${warningPct}%` }}>6m</span>
        <span className="absolute -translate-x-1/2"
          style={{ left: "50%" }}>12m</span>
        <span className="absolute right-0">24m</span>
      </div>
    </div>
  );
}

// ── Lever row ────────────────────────────────────────────────────────────────
function Lever({
  icon, title, sub, value, min, max, step, onChange,
  display, displayColor, saving, trackColor, ticks, impactDelta,
}: {
  icon: string; title: string; sub: string;
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
  display: string; displayColor: string; saving?: string;
  trackColor: string; ticks: string[]; impactDelta: number;
}) {
  const p = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-base shadow-sm">
            {icon}
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-800">{title}</div>
            <div className="text-[10px] text-gray-400">{sub}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className={`text-sm font-black tabular-nums ${displayColor}`}>{display}</div>
            {saving && <div className="text-[10px] text-green-600 font-semibold">{saving}</div>}
          </div>
          <ImpactChip delta={impactDelta} />
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-3 rounded-full cursor-pointer"
        style={{
          appearance: "none",
          background: `linear-gradient(to right, ${trackColor} ${p}%, #e5e7eb ${p}%)`,
        }}
      />
      <div className="flex justify-between text-[9px] text-gray-400 px-0.5">
        {ticks.map(t => <span key={t}>{t}</span>)}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function RunwayExplorer({ monthsRunway, latestBurn = 0, latestMRR = 0 }: Props) {
  const [burnPct, setBurnPct] = useState(0);
  const [mrrPct,  setMrrPct]  = useState(0);

  const adjusted    = monthsRunway * (1 + mrrPct / 100) / Math.max(1 - burnPct / 100, 0.1);
  const display     = parseFloat(Math.min(adjusted, MAX * 1.5).toFixed(1));
  const delta       = adjusted - monthsRunway;
  const burnSaved   = latestBurn * (burnPct / 100);
  const mrrGained   = latestMRR  * (mrrPct  / 100);
  const burnDelta   = monthsRunway * (1 / Math.max(1 - burnPct / 100, 0.1) - 1);
  const mrrDelta    = monthsRunway * (mrrPct / 100);

  const isRed   = display < 3;
  const isAmber = !isRed && display < 6;

  const accent  = isRed ? "#ef4444" : isAmber ? "#f59e0b" : "#22c55e";
  const border  = isRed ? "border-red-200"   : isAmber ? "border-amber-200"   : "border-green-200";
  const bg      = isRed ? "from-red-50/40"   : isAmber ? "from-amber-50/40"   : "from-green-50/40";

  const cashDate = (months: number) => {
    const d = new Date();
    d.setDate(d.getDate() + Math.round(months * 30.44));
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  const changed = burnPct > 0 || mrrPct > 0;

  return (
    <div className={`card-brutal p-6 bg-gradient-to-br ${bg} to-white ${border}`}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Runway Explorer</div>
          <div className="text-xs text-gray-500 mt-0.5">Drag the levers to model scenarios</div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[10px] font-black tracking-wider ${
          isRed   ? "bg-red-100 text-red-700 border-red-200"
          : isAmber ? "bg-amber-100 text-amber-700 border-amber-200"
          : "bg-green-100 text-green-700 border-green-200"
        }`}>
          {isRed ? "☠ CRITICAL" : isAmber ? "⚠ WARNING" : "✓ SAFE"}
        </span>
      </div>

      {/* Big number */}
      <div className="flex items-end gap-4 mb-6">
        <div
          className="text-[80px] font-black leading-none tabular-nums"
          style={{ color: accent, transition: "color 0.4s" }}
        >
          {display}
        </div>
        <div className="pb-3">
          <div className="text-base font-semibold text-gray-600">months runway</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {changed ? `adjusted: ${cashDate(display)}` : `zero cash: ${cashDate(monthsRunway)}`}
          </div>
          {changed && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-gray-400 line-through">{monthsRunway.toFixed(1)} mo</span>
              <span className="text-gray-300 text-xs">→</span>
              <span className="text-sm font-black" style={{ color: accent }}>{display} mo</span>
              <ImpactChip delta={delta} />
            </div>
          )}
        </div>
      </div>

      {/* Fuel gauge bar */}
      <RunwayBar current={display} base={monthsRunway} accent={accent} />

      {/* Levers */}
      <div className="mt-6 space-y-5 border-t border-black/5 pt-5">
        <Lever
          icon="✂" title="Cut burn rate" sub="reduce weekly spend"
          value={burnPct} min={0} max={60} step={1} onChange={setBurnPct}
          display={`−${burnPct}%`} displayColor="text-rose-600"
          saving={burnSaved > 0 ? `saving ${fmtK(burnSaved)}/wk` : undefined}
          trackColor="#22c55e"
          ticks={["0%", "20%", "40%", "−60% max"]}
          impactDelta={burnDelta}
        />
        <Lever
          icon="↑" title="Grow MRR" sub="increase weekly revenue"
          value={mrrPct} min={0} max={100} step={1} onChange={setMrrPct}
          display={`+${mrrPct}%`} displayColor="text-blue-600"
          saving={mrrGained > 0 ? `+${fmtK(mrrGained)}/wk` : undefined}
          trackColor="#3b82f6"
          ticks={["0%", "+25%", "+50%", "+75%", "+100%"]}
          impactDelta={mrrDelta}
        />
      </div>

      {/* Reset or hint */}
      <div className="mt-4">
        {changed ? (
          <button
            onClick={() => { setBurnPct(0); setMrrPct(0); }}
            className="w-full rounded-xl border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors"
          >
            Reset to baseline
          </button>
        ) : (
          <div className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-start gap-2 ${
            isRed   ? "border-red-200 bg-red-50 text-red-700"
            : isAmber ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-green-200 bg-green-50 text-green-700"
          }`}>
            <span className="flex-shrink-0">{isRed ? "⚡" : isAmber ? "⚠️" : "💡"}</span>
            <span>
              {isRed
                ? "Critical — less than 90 days. Move the levers above to model emergency scenarios immediately."
                : isAmber
                ? "Begin fundraising conversations now. Use the levers to see how operational changes extend your runway."
                : "Healthy runway. Drag the levers to explore what-if scenarios and find your optimal path."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

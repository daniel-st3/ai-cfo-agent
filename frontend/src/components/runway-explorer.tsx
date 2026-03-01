"use client";
import { useState } from "react";
import { fmtK } from "@/lib/utils";

interface Props {
  monthsRunway: number;
  latestBurn?: number;
  latestMRR?: number;
}

// ── Gauge geometry ──────────────────────────────────────────────────────────
// viewBox : 0 0 200 118   R=78, CX=100, CY=95
// Arc top : CY-R = 17  (17 px headroom above arc)
// SW      : 16  (strokeWidth for all arc layers — uniform, no overlap mess)

const R   = 78;
const CX  = 100;
const CY  = 95;
const MAX = 24;
const SW  = 16;

function monthsToXY(months: number) {
  const pct      = Math.min(Math.max(months / MAX, 0), 0.9999);
  const angleDeg = 180 - pct * 180;
  const rad      = (angleDeg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY - R * Math.sin(rad) };
}

function arcTo(months: number) {
  const { x, y } = monthsToXY(months);
  return `A ${R} ${R} 0 0 0 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

// Full background track (two-quarter split avoids degenerate SVG semicircle)
const TRACK = [
  `M ${CX - R} ${CY}`,
  `A ${R} ${R} 0 0 0 ${CX} ${CY - R}`,
  `A ${R} ${R} 0 0 0 ${CX + R} ${CY}`,
].join(" ");

// Zone arcs — full spectrum from 0 to MAX
const zone3 = monthsToXY(3);
const zone6 = monthsToXY(6);
const RED_ZONE   = `M ${CX - R} ${CY} ${arcTo(3)}`;
const AMBER_ZONE = `M ${zone3.x.toFixed(2)} ${zone3.y.toFixed(2)} ${arcTo(6)}`;
const GREEN_ZONE = `M ${zone6.x.toFixed(2)} ${zone6.y.toFixed(2)} ${arcTo(MAX)}`;

// White dim overlay: fades zone arcs AFTER the current position
// so only the "achieved" portion shows at full brightness
function dimPath(months: number): string {
  if (months <= 0 || months >= MAX) return "";
  const { x, y } = monthsToXY(months);
  return `M ${x.toFixed(2)} ${y.toFixed(2)} A ${R} ${R} 0 0 0 ${CX + R} ${CY}`;
}

// ── Tick marks — labels INSIDE the arc to avoid clipping at top ─────────────
function TickMark({ months, label }: { months: number; label: string }) {
  const rad  = ((180 - (months / MAX) * 180) * Math.PI) / 180;
  const outerX = CX + R * Math.cos(rad);
  const outerY = CY - R * Math.sin(rad);
  const innerX = CX + (R - SW / 2 - 1) * Math.cos(rad);
  const innerY = CY - (R - SW / 2 - 1) * Math.sin(rad);
  const labelX = CX + (R - SW / 2 - 13) * Math.cos(rad);
  const labelY = CY - (R - SW / 2 - 13) * Math.sin(rad);
  return (
    <g>
      <line
        x1={outerX.toFixed(1)} y1={outerY.toFixed(1)}
        x2={innerX.toFixed(1)} y2={innerY.toFixed(1)}
        stroke="rgba(255,255,255,0.8)" strokeWidth="1.5"
      />
      <text
        x={labelX.toFixed(1)} y={labelY.toFixed(1)}
        textAnchor="middle" dominantBaseline="middle"
        fontSize="6.5" fill="#6b7280" fontWeight="600"
      >{label}</text>
    </g>
  );
}

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

// ── Slider ──────────────────────────────────────────────────────────────────
function Slider({
  icon, title, sub, value, min, max, step,
  displayValue, displayColor, savingLine,
  trackColor, tickLabels, onChange, impactDelta,
}: {
  icon: string; title: string; sub: string;
  value: number; min: number; max: number; step: number;
  displayValue: string; displayColor: string; savingLine?: string;
  trackColor: string; tickLabels: string[]; onChange: (v: number) => void;
  impactDelta: number;
}) {
  const pct = ((value - min) / (max - min)) * 100;
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
            <div className={`text-sm font-black tabular-nums ${displayColor}`}>{displayValue}</div>
            {savingLine && <div className="text-[10px] text-green-600 font-semibold">{savingLine}</div>}
          </div>
          <ImpactChip delta={impactDelta} />
        </div>
      </div>
      <div>
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-3 rounded-full cursor-pointer"
          style={{
            appearance: "none",
            background: `linear-gradient(to right, ${trackColor} ${pct}%, #e5e7eb ${pct}%)`,
          }}
        />
        <div className="flex justify-between text-[9px] text-gray-400 mt-1 px-0.5">
          {tickLabels.map(t => <span key={t}>{t}</span>)}
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function RunwayExplorer({ monthsRunway, latestBurn = 0, latestMRR = 0 }: Props) {
  const [burnPct, setBurnPct] = useState(0);
  const [mrrPct,  setMrrPct]  = useState(0);

  const adjustedMonths = monthsRunway
    * (1 + mrrPct / 100)
    / Math.max(1 - burnPct / 100, 0.1);

  const displayMonths = parseFloat(Math.min(adjustedMonths, MAX * 1.5).toFixed(1));
  const deltaMonths   = adjustedMonths - monthsRunway;
  const burnSaved     = latestBurn * (burnPct / 100);
  const mrrGained     = latestMRR  * (mrrPct  / 100);
  const burnDelta     = monthsRunway * (1 / Math.max(1 - burnPct / 100, 0.1) - 1);
  const mrrDelta      = monthsRunway * (mrrPct / 100);

  const isRed   = displayMonths < 3;
  const isAmber = !isRed && displayMonths < 6;

  const accentFill = isRed ? "#ef4444" : isAmber ? "#f59e0b" : "#22c55e";
  const cardBorder = isRed ? "border-red-200" : isAmber ? "border-amber-200" : "border-green-200";
  const cardBg     = isRed ? "from-red-50/40"  : isAmber ? "from-amber-50/40"  : "from-green-50/40";

  const zeroCashDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + Math.round(displayMonths * 30.44));
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  })();
  const baseCashDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + Math.round(monthsRunway * 30.44));
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  })();

  const changed  = burnPct > 0 || mrrPct > 0;
  const gaugeVal = Math.min(Math.max(displayMonths, 0.001), MAX - 0.001);
  const dotPos   = monthsToXY(gaugeVal);
  const basePos  = changed ? monthsToXY(Math.min(Math.max(monthsRunway, 0.001), MAX - 0.001)) : null;

  return (
    <div className={`card-brutal p-6 bg-gradient-to-br ${cardBg} to-white ${cardBorder}`}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5">
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

      {/* ── Body: gauge left + sliders right on desktop ─────────────────────── */}
      <div className="flex flex-col md:flex-row gap-6 items-stretch">

        {/* Gauge column */}
        <div className="flex-shrink-0 flex flex-col items-center">
          <svg
            viewBox="0 0 200 118"
            className="w-full md:w-[260px]"
            aria-label={`Runway gauge: ${displayMonths} months`}
          >
            {/* 1. Gray background track */}
            <path d={TRACK} fill="none" stroke="#e5e7eb" strokeWidth={SW} />

            {/* 2. Colored zone spectrum (full arc, always visible) */}
            <path d={RED_ZONE}   fill="none" stroke="#fca5a5" strokeWidth={SW} strokeLinecap="butt" />
            <path d={AMBER_ZONE} fill="none" stroke="#fcd34d" strokeWidth={SW} strokeLinecap="butt" />
            <path d={GREEN_ZONE} fill="none" stroke="#86efac" strokeWidth={SW} strokeLinecap="butt" />

            {/* 3. White dim overlay fades zones AFTER current position */}
            {gaugeVal < MAX - 0.5 && (
              <path
                d={dimPath(gaugeVal)}
                fill="none" stroke="white" strokeWidth={SW + 1}
                strokeLinecap="butt" opacity="0.75"
              />
            )}

            {/* 4. Tick marks (drawn on top so they show on both zones + dim) */}
            <TickMark months={6}  label="6m"  />
            <TickMark months={12} label="12m" />
            <TickMark months={18} label="18m" />

            {/* 5. Endpoint labels */}
            <text x={CX - R - 6} y={CY + 5} textAnchor="end"   fontSize="7" fill="#9ca3af">0</text>
            <text x={CX + R + 6} y={CY + 5} textAnchor="start" fontSize="7" fill="#9ca3af">24m</text>

            {/* 6. Baseline dot when sliders are active */}
            {basePos && monthsRunway > 0 && (
              <g opacity="0.55">
                <circle cx={basePos.x.toFixed(2)} cy={basePos.y.toFixed(2)} r="5.5"
                  fill="white" stroke="#9ca3af" strokeWidth="1.5" />
                <text x={basePos.x.toFixed(2)} y={(basePos.y + 13).toFixed(2)}
                  textAnchor="middle" fontSize="5.5" fill="#9ca3af">base</text>
              </g>
            )}

            {/* 7. Current position dot */}
            <g>
              <circle cx={dotPos.x.toFixed(2)} cy={dotPos.y.toFixed(2)}
                r="10" fill="white" stroke="#e5e7eb" strokeWidth="1.5" />
              <circle cx={dotPos.x.toFixed(2)} cy={dotPos.y.toFixed(2)}
                r="6" fill={accentFill} />
            </g>

            {/* 8. Center: large runway number */}
            <text x={CX} y={CY - 30} textAnchor="middle" fontSize="30" fontWeight="900"
              fill={accentFill} style={{ transition: "fill 0.4s ease" }}>
              {displayMonths}
            </text>
            <text x={CX} y={CY - 12} textAnchor="middle" fontSize="8.5" fill="#6b7280" fontWeight="600">
              months runway
            </text>
            <text x={CX} y={CY + 8} textAnchor="middle" fontSize="7.5" fill="#9ca3af">
              {changed ? `adjusted: ${zeroCashDate}` : `zero cash: ${baseCashDate}`}
            </text>
          </svg>

          {/* Before → after comparison row */}
          {changed && (
            <div className="flex items-center justify-center gap-2 text-xs mt-1">
              <span className="text-gray-400 line-through">{monthsRunway.toFixed(1)} mo</span>
              <span className="text-gray-300">→</span>
              <span className={`font-black ${
                isRed ? "text-red-600" : isAmber ? "text-amber-600" : "text-green-600"
              }`}>{displayMonths} mo</span>
              <ImpactChip delta={deltaMonths} />
            </div>
          )}
        </div>

        {/* Sliders column */}
        <div className="flex-1 flex flex-col justify-between border-t md:border-t-0 md:border-l border-black/5 pt-5 md:pt-0 md:pl-6 gap-5">

          <Slider
            icon="✂" title="Cut burn rate" sub="reduce weekly spend"
            value={burnPct} min={0} max={60} step={1}
            displayValue={`−${burnPct}%`} displayColor="text-rose-600"
            savingLine={burnSaved > 0 ? `saving ${fmtK(burnSaved)}/wk` : undefined}
            trackColor="#22c55e"
            tickLabels={["0%", "20%", "40%", "−60% max"]}
            onChange={setBurnPct}
            impactDelta={burnDelta}
          />

          <Slider
            icon="↑" title="Grow MRR" sub="increase weekly revenue"
            value={mrrPct} min={0} max={100} step={1}
            displayValue={`+${mrrPct}%`} displayColor="text-blue-600"
            savingLine={mrrGained > 0 ? `+${fmtK(mrrGained)}/wk` : undefined}
            trackColor="#3b82f6"
            tickLabels={["0%", "+25%", "+50%", "+75%", "+100%"]}
            onChange={setMrrPct}
            impactDelta={mrrDelta}
          />

          {/* Reset */}
          {changed && (
            <button
              onClick={() => { setBurnPct(0); setMrrPct(0); }}
              className="w-full rounded-xl border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors">
              Reset to baseline
            </button>
          )}

          {/* Urgency hint */}
          {!changed && (
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
    </div>
  );
}

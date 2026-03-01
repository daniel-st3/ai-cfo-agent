"use client";
import { useState } from "react";
import { fmtK } from "@/lib/utils";

interface Props {
  monthsRunway: number;
  latestBurn?: number;
  latestMRR?: number;
}

// ── Gauge geometry ─────────────────────────────────────────────────────────────
//  viewBox  : 0 0 200 118   (generous vertical room)
//  R = 78   : arc radius
//  CX = 100 : horizontal centre
//  CY = 95  : arc baseline  →  arc top at CY-R = 17  (17 px headroom)
//  MAX = 24 : maximum months displayed

const R   = 78;
const CX  = 100;
const CY  = 95;
const MAX = 24;

function monthsToXY(months: number) {
  const pct      = Math.min(Math.max(months / MAX, 0), 0.9999);
  const angleDeg = 180 - pct * 180;
  const rad      = (angleDeg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY - R * Math.sin(rad), pct };
}

function arcTo(months: number) {
  const { x, y } = monthsToXY(months);
  return `A ${R} ${R} 0 0 0 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

// Two-quarter background track (split to avoid SVG degenerate semicircle)
const TRACK = [
  `M ${CX - R} ${CY}`,
  `A ${R} ${R} 0 0 0 ${CX} ${CY - R}`,
  `A ${R} ${R} 0 0 0 ${CX + R} ${CY}`,
].join(" ");

// Coloured zone arcs
const RED_ZONE   = `M ${CX - R} ${CY} ${arcTo(3)}`;
const AMBER_ZONE = `M ${monthsToXY(3).x.toFixed(2)} ${monthsToXY(3).y.toFixed(2)} ${arcTo(6)}`;
const GREEN_ZONE = `M ${monthsToXY(6).x.toFixed(2)} ${monthsToXY(6).y.toFixed(2)} ${arcTo(MAX)}`;

function fillPath(months: number) {
  if (months <= 0) return "";
  return `M ${CX - R} ${CY} ${arcTo(months)}`;
}

// ── Tick marks — labels placed INSIDE the arc at R-26 from centre ──────────────
//   This avoids label clipping at the arc top (12 o'clock position).
function TickMark({ months, label }: { months: number; label: string }) {
  const { x: ox, y: oy } = monthsToXY(months);
  const rad = ((180 - (months / MAX) * 180) * Math.PI) / 180;
  // outer tick tip (on arc)
  const tx1 = CX + R * Math.cos(rad);
  const ty1 = CY - R * Math.sin(rad);
  // inner tick base (R-9 from centre)
  const tx2 = CX + (R - 9) * Math.cos(rad);
  const ty2 = CY - (R - 9) * Math.sin(rad);
  // label at R-26 from centre (clearly inside the arc)
  const lx = CX + (R - 26) * Math.cos(rad);
  const ly = CY - (R - 26) * Math.sin(rad);
  return (
    <g>
      <line x1={tx1.toFixed(1)} y1={ty1.toFixed(1)}
            x2={tx2.toFixed(1)} y2={ty2.toFixed(1)}
            stroke="#d1d5db" strokeWidth="1.5" />
      <text x={lx.toFixed(1)} y={ly.toFixed(1)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize="6.5" fill="#9ca3af" fontWeight="600">{label}</text>
    </g>
  );
}

// ── Marker dot on arc ──────────────────────────────────────────────────────────
function MarkerDot({ months, color, label }: { months: number; color: string; label: string }) {
  const { x, y } = monthsToXY(months);
  return (
    <g>
      <circle cx={x.toFixed(2)} cy={y.toFixed(2)} r="5.5" fill={color} opacity="0.9" />
      <circle cx={x.toFixed(2)} cy={y.toFixed(2)} r="2.5" fill="white" />
      {label && (
        <text x={x.toFixed(2)} y={(y + 12).toFixed(2)}
              textAnchor="middle" fontSize="6" fill={color} fontWeight="700">{label}</text>
      )}
    </g>
  );
}

// ── Impact chip ────────────────────────────────────────────────────────────────
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

// ── Main component ─────────────────────────────────────────────────────────────
export function RunwayExplorer({ monthsRunway, latestBurn = 0, latestMRR = 0 }: Props) {
  const [burnPct, setBurnPct] = useState(0);
  const [mrrPct,  setMrrPct]  = useState(0);

  const adjustedMonths = monthsRunway
    * (1 + mrrPct / 100)
    / Math.max(1 - burnPct / 100, 0.1);

  const displayMonths = parseFloat(adjustedMonths.toFixed(1));
  const deltaMonths   = adjustedMonths - monthsRunway;
  const burnSaved     = latestBurn * (burnPct / 100);
  const mrrGained     = latestMRR  * (mrrPct  / 100);
  const burnDelta     = monthsRunway * (1 / Math.max(1 - burnPct / 100, 0.1) - 1);
  const mrrDelta      = monthsRunway * (mrrPct / 100);

  const isRed   = displayMonths < 3;
  const isAmber = !isRed && displayMonths < 6;
  const isGreen = !isRed && !isAmber;

  const accentFill = isRed ? "#ef4444" : isAmber ? "#f59e0b" : "#22c55e";
  const cardBorder = isRed ? "border-red-200" : isAmber ? "border-amber-200" : "border-green-200";
  const cardBg     = isRed ? "from-red-50/40" : isAmber ? "from-amber-50/40" : "from-green-50/40";

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

  const changed = burnPct > 0 || mrrPct > 0;

  return (
    <div className={`card-brutal p-6 bg-gradient-to-br ${cardBg} to-white ${cardBorder}`}>

      {/* Header */}
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

      {/* SVG gauge — roomy viewBox, inside tick labels */}
      <div className="flex justify-center mb-3">
        <svg
          viewBox="0 0 200 118"
          className="w-full max-w-[360px]"
          aria-label={`Runway gauge: ${displayMonths} months`}
        >
          {/* Zone arcs — thick, vivid background rings */}
          <path d={RED_ZONE}   fill="none" stroke="#fca5a5" strokeWidth="12" strokeLinecap="butt" />
          <path d={AMBER_ZONE} fill="none" stroke="#fcd34d" strokeWidth="12" strokeLinecap="butt" />
          <path d={GREEN_ZONE} fill="none" stroke="#86efac" strokeWidth="12" strokeLinecap="butt" />

          {/* Thin track outline */}
          <path d={TRACK} fill="none" stroke="#e5e7eb" strokeWidth="0.75" />

          {/* Active progress fill */}
          {displayMonths > 0 && (
            <path d={fillPath(Math.min(displayMonths, MAX))}
              fill="none" stroke={accentFill} strokeWidth="7"
              strokeLinecap="round"
              style={{ transition: "stroke 0.4s ease" }} />
          )}

          {/* Baseline marker when sliders adjusted */}
          {changed && monthsRunway > 0 && (
            <MarkerDot months={Math.min(monthsRunway, MAX)} color="#9ca3af" label="base" />
          )}

          {/* Current / adjusted marker */}
          {displayMonths > 0 && (
            <MarkerDot months={Math.min(displayMonths, MAX)} color={accentFill}
              label={changed ? "now" : ""} />
          )}

          {/* Tick marks at 6, 12, 18 months — labels inside the arc */}
          <TickMark months={6}  label="6m" />
          <TickMark months={12} label="12m" />
          <TickMark months={18} label="18m" />

          {/* Endpoint labels */}
          <text x={CX - R - 7} y={CY + 5} textAnchor="end"   fontSize="7" fill="#9ca3af">0</text>
          <text x={CX + R + 7} y={CY + 5} textAnchor="start" fontSize="7" fill="#9ca3af">24m</text>

          {/* Centre: big month number */}
          <text x={CX} y={CY - 30} textAnchor="middle" fontSize="30" fontWeight="900"
            fill={accentFill} style={{ transition: "fill 0.4s ease" }}>
            {displayMonths}
          </text>
          <text x={CX} y={CY - 12} textAnchor="middle" fontSize="8.5" fill="#6b7280" fontWeight="600">
            months runway
          </text>

          {/* Zero-cash date */}
          <text x={CX} y={CY + 8} textAnchor="middle" fontSize="7.5" fill="#9ca3af">
            {changed ? `adjusted: ${zeroCashDate}` : `zero cash: ${baseCashDate}`}
          </text>
        </svg>
      </div>

      {/* Before/after row when sliders are moved */}
      {changed && (
        <div className="flex items-center justify-center gap-3 mb-4">
          <span className="text-gray-400 line-through text-xs">{monthsRunway.toFixed(1)} mo ({baseCashDate})</span>
          <span className="text-gray-300 text-sm">→</span>
          <span className={`font-black text-base ${isRed ? "text-red-600" : isAmber ? "text-amber-600" : "text-green-600"}`}>
            {displayMonths} mo
          </span>
          <ImpactChip delta={deltaMonths} />
        </div>
      )}

      {/* ── Sliders ───────────────────────────────────────────────────────── */}
      <div className="space-y-6 border-t border-black/5 pt-5">

        {/* Cut burn lever */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-base shadow-sm">✂</div>
              <div>
                <div className="text-xs font-semibold text-gray-800">Cut burn rate</div>
                <div className="text-[10px] text-gray-400">reduce weekly spend</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-sm font-black text-rose-600 tabular-nums">−{burnPct}%</div>
                {burnSaved > 0 && (
                  <div className="text-[10px] text-green-600 font-semibold">saving {fmtK(burnSaved)}/wk</div>
                )}
              </div>
              <ImpactChip delta={burnDelta} />
            </div>
          </div>

          <div>
            <input type="range" min={0} max={60} step={1} value={burnPct}
              onChange={e => setBurnPct(Number(e.target.value))}
              className="w-full h-3 rounded-full cursor-pointer"
              style={{
                appearance: "none",
                background: `linear-gradient(to right, #22c55e ${burnPct / 60 * 100}%, #e5e7eb ${burnPct / 60 * 100}%)`,
              }} />
            <div className="flex justify-between text-[9px] text-gray-400 mt-1.5 px-0.5">
              <span>0%</span><span>20%</span><span>40%</span><span>−60% max</span>
            </div>
          </div>
        </div>

        {/* Grow MRR lever */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-base shadow-sm">↑</div>
              <div>
                <div className="text-xs font-semibold text-gray-800">Grow MRR</div>
                <div className="text-[10px] text-gray-400">increase weekly revenue</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-sm font-black text-blue-600 tabular-nums">+{mrrPct}%</div>
                {mrrGained > 0 && (
                  <div className="text-[10px] text-blue-600 font-semibold">+{fmtK(mrrGained)}/wk</div>
                )}
              </div>
              <ImpactChip delta={mrrDelta} />
            </div>
          </div>

          <div>
            <input type="range" min={0} max={100} step={1} value={mrrPct}
              onChange={e => setMrrPct(Number(e.target.value))}
              className="w-full h-3 rounded-full cursor-pointer"
              style={{
                appearance: "none",
                background: `linear-gradient(to right, #3b82f6 ${mrrPct}%, #e5e7eb ${mrrPct}%)`,
              }} />
            <div className="flex justify-between text-[9px] text-gray-400 mt-1.5 px-0.5">
              <span>0%</span><span>+25%</span><span>+50%</span><span>+75%</span><span>+100%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Reset button */}
      {changed && (
        <button
          onClick={() => { setBurnPct(0); setMrrPct(0); }}
          className="mt-5 w-full rounded-xl border border-gray-200 bg-white py-2 text-xs font-semibold text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors">
          Reset to baseline
        </button>
      )}

      {/* Urgency hint */}
      {!changed && (
        <div className={`mt-5 rounded-xl border px-4 py-3 text-xs font-medium flex items-start gap-2 ${
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
  );
}

"use client";
import { useMemo, useEffect, useState } from "react";
import type { KPISnapshot, ScenarioResult } from "@/lib/types";
import { fmtK } from "@/lib/utils";

// ── Simulation config ───────────────────────────────────────────────────────
const N_SIM      = 1_000;
const N_DISPLAY  = 55;
const MONTHS     = 18;
const VOLATILITY = 0.09;

// ── SVG layout ───────────────────────────────────────────────────────────────
const VW = 900, VH = 260;
const PL = 64, PR = 20, PT = 18, PB = 36;
const CW = VW - PL - PR;
const CH = VH - PT - PB;

function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pct(arr: number[], p: number): number {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(Math.floor((p / 100) * s.length), s.length - 1)];
}

interface Props {
  snapshots: KPISnapshot[];
  scenarios: ScenarioResult[];
  latestMRR: number;
}

export function MonteCarloFan({ snapshots, scenarios, latestMRR }: Props) {
  const [visible,   setVisible]   = useState(false);
  const [pathCount, setPathCount] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!visible) return;
    let n = 0;
    const step = Math.ceil(N_SIM / 55);
    const id = setInterval(() => {
      n = Math.min(n + step, N_SIM);
      setPathCount(n);
      if (n >= N_SIM) clearInterval(id);
    }, 22);
    return () => clearInterval(id);
  }, [visible]);

  const { displayPaths, bands, yTicks, minV, maxV } = useMemo(() => {
    if (!latestMRR || latestMRR <= 0 || !scenarios.length)
      return { displayPaths: [], bands: [], yTicks: [], minV: 0, maxV: 1 };

    const base   = scenarios.find(s => s.scenario === "base") ?? scenarios[0];
    const target = base.projected_mrr_6mo || latestMRR * 1.15;
    const growth = Math.max(-0.1, Math.min(0.3, Math.pow(target / latestMRR, 1 / 6) - 1));

    const all: number[][] = [];
    for (let i = 0; i < N_SIM; i++) {
      const path = [latestMRR];
      for (let m = 1; m <= MONTHS; m++)
        path.push(Math.max(0, path[m - 1] * (1 + growth + randn() * VOLATILITY)));
      all.push(path);
    }

    const bands_: Array<Record<string, number>> = [];
    for (let m = 0; m <= MONTHS; m++) {
      const vals = all.map(p => p[m]);
      bands_.push({
        p5:  pct(vals, 5),  p10: pct(vals, 10),
        p25: pct(vals, 25), p50: pct(vals, 50),
        p75: pct(vals, 75), p90: pct(vals, 90), p95: pct(vals, 95),
      });
    }

    const stride = Math.max(1, Math.floor(N_SIM / N_DISPLAY));
    const displayPaths_ = all.filter((_, i) => i % stride === 0).slice(0, N_DISPLAY);

    const allVals = bands_.flatMap(b => [b.p5, b.p95]);
    const minV_   = Math.max(0, Math.min(...allVals) * 0.92);
    const maxV_   = Math.max(...allVals) * 1.06;
    const range   = maxV_ - minV_;
    const mag     = Math.pow(10, Math.floor(Math.log10(range / 4)));
    const tickSz  = mag * (range / mag < 20 ? 2 : 5);
    const ticks_: number[] = [];
    for (let t = Math.ceil(minV_ / tickSz) * tickSz; t <= maxV_ + tickSz * 0.1; t += tickSz)
      ticks_.push(t);

    return { displayPaths: displayPaths_, bands: bands_, yTicks: ticks_, minV: minV_, maxV: maxV_ };
  }, [latestMRR, scenarios]);

  if (!bands.length) return null;

  const xS = (m: number) => PL + (m / MONTHS) * CW;
  const yS = (v: number) => PT + CH - ((v - minV) / (maxV - minV)) * CH;

  const pathD = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${xS(i).toFixed(1)},${yS(v).toFixed(1)}`).join(" ");

  const areaD = (upper: number[], lower: number[]) => {
    const top = upper.map((v, i) => `${i === 0 ? "M" : "L"}${xS(i).toFixed(1)},${yS(v).toFixed(1)}`).join(" ");
    const bot = [...lower].reverse().map((v, i) =>
      `L${xS(MONTHS - i).toFixed(1)},${yS(v).toFixed(1)}`).join(" ");
    return `${top} ${bot} Z`;
  };

  const p5v  = bands.map(b => b.p5);
  const p10v = bands.map(b => b.p10);
  const p25v = bands.map(b => b.p25);
  const p50v = bands.map(b => b.p50);
  const p75v = bands.map(b => b.p75);
  const p90v = bands.map(b => b.p90);
  const p95v = bands.map(b => b.p95);

  const bear = scenarios.find(s => s.scenario === "bear");
  const bull = scenarios.find(s => s.scenario === "bull");

  return (
    <div className="card-brutal p-5 overflow-hidden">

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Monte Carlo Revenue Simulation
          </div>
          <div className="flex items-center gap-2.5 mt-1 flex-wrap">
            <span className="text-sm font-bold text-gray-900">18-month MRR probability fan</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-600">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
              {pathCount.toLocaleString()} / {N_SIM.toLocaleString()} paths
            </span>
            <span className="text-[10px] text-gray-400 font-medium">
              σ = {(VOLATILITY * 100).toFixed(0)}% / mo
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          {[
            { w: 24, h: 8,   fill: "#6366f1", opacity: 0.14, label: "P5 to P95"   },
            { w: 24, h: 8,   fill: "#0071e3", opacity: 0.28, label: "P25 to P75"  },
            { w: 24, h: 2.5, fill: "#0071e3", opacity: 1.0,  label: "Median"   },
            { w: 24, h: 1,   fill: "#6366f1", opacity: 0.35, label: "Sim path" },
          ].map(({ w, h, fill, opacity, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-[10px] text-gray-400">
              <svg width={w} height={10}>
                <rect x={0} y={(10 - h) / 2} width={w} height={h} rx={1}
                  fill={fill} fillOpacity={opacity} />
              </svg>
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* SVG Chart */}
      <div className="w-full" style={{ aspectRatio: `${VW}/${VH}` }}>
        <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full h-full">
          <defs>
            <linearGradient id="mcOuter" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#6366f1" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#0071e3" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="mcInner" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#0071e3" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0.07} />
            </linearGradient>
            <filter id="medianGlow" x="-5%" y="-80%" width="110%" height="260%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <clipPath id="chartClip">
              <rect x={PL} y={PT} width={CW} height={CH} />
            </clipPath>
          </defs>

          {/* Grid */}
          {yTicks.map((v, i) => (
            <line key={i}
              x1={PL} y1={yS(v).toFixed(1)} x2={VW - PR} y2={yS(v).toFixed(1)}
              stroke="#f0f0f5" strokeWidth={1}
            />
          ))}

          {/* Individual sim paths */}
          <g clipPath="url(#chartClip)">
            {displayPaths.map((path, i) => (
              <path key={i}
                d={pathD(path)}
                stroke="#6366f1"
                strokeWidth={0.7}
                fill="none"
                opacity={visible ? 0.095 : 0}
                style={{
                  transition: `opacity ${0.5 + (i % 18) * 0.04}s ease ${(i % 12) * 0.035}s`,
                }}
              />
            ))}
          </g>

          {/* P5–P95 band */}
          <path d={areaD(p95v, p5v)} fill="url(#mcOuter)" clipPath="url(#chartClip)" />

          {/* P25–P75 band */}
          <path d={areaD(p75v, p25v)} fill="url(#mcInner)" clipPath="url(#chartClip)" />

          {/* P10 / P90 dashed boundary */}
          <path d={pathD(p90v)} stroke="#0071e3" strokeWidth={1} fill="none"
            opacity={0.2} strokeDasharray="3 5" clipPath="url(#chartClip)" />
          <path d={pathD(p10v)} stroke="#0071e3" strokeWidth={1} fill="none"
            opacity={0.2} strokeDasharray="3 5" clipPath="url(#chartClip)" />

          {/* Median — animated draw */}
          <path
            d={pathD(p50v)}
            stroke="#0071e3" strokeWidth={2.5} fill="none"
            filter="url(#medianGlow)"
            clipPath="url(#chartClip)"
            style={{
              strokeDasharray: 3000,
              strokeDashoffset: visible ? 0 : 3000,
              transition: visible
                ? "stroke-dashoffset 2.4s cubic-bezier(0.25,0.46,0.45,0.94) 0.2s"
                : "none",
            }}
          />

          {/* Bear marker */}
          {bear && bear.projected_mrr_6mo && (
            <>
              <line
                x1={xS(6).toFixed(1)} y1={PT}
                x2={xS(6).toFixed(1)} y2={PT + CH}
                stroke="#ff3b30" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.5}
              />
              <text x={xS(6) + 5} y={yS(bear.projected_mrr_6mo) - 5}
                fontSize={9} fill="#ff3b30" fontWeight={700}>
                Bear {fmtK(bear.projected_mrr_6mo)}
              </text>
            </>
          )}

          {/* Bull label */}
          {bull && bull.projected_mrr_6mo && (
            <text x={xS(6) + 5} y={yS(bull.projected_mrr_6mo) + 14}
              fontSize={9} fill="#34c759" fontWeight={700}>
              Bull {fmtK(bull.projected_mrr_6mo)}
            </text>
          )}

          {/* Y-axis labels */}
          {yTicks.map((v, i) => (
            <text key={i} x={PL - 7} y={yS(v) + 3.5}
              textAnchor="end" fontSize={9} fill="#9ca3af">
              {fmtK(v)}
            </text>
          ))}

          {/* X-axis labels */}
          {Array.from({ length: MONTHS + 1 }, (_, m) => m)
            .filter(m => m % 3 === 0)
            .map(m => (
              <text key={m} x={xS(m)} y={PT + CH + 16}
                textAnchor="middle" fontSize={9} fill="#9ca3af">
                {m === 0 ? "Now" : `M${m}`}
              </text>
            ))}

          {/* Left axis spine */}
          <line x1={PL} y1={PT} x2={PL} y2={PT + CH} stroke="#e5e7eb" strokeWidth={1} />
        </svg>
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[10px] text-gray-400">
        <span>Shaded = P5 to P95 probability envelope · inner band = P25 to P75</span>
        <span>Bold line = P50 median · {N_SIM.toLocaleString()} Monte Carlo paths</span>
      </div>
    </div>
  );
}

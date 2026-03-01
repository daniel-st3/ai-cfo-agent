"use client";
import { useEffect, useRef, useState } from "react";
import { fmtK, fmtPct } from "@/lib/utils";
import type { KPISnapshot, SurvivalAnalysis, ScenarioResult } from "@/lib/types";

// ── Section definitions ──────────────────────────────────────────────────────

interface Section {
  id: string;
  label: string;
  icon: string;
  getValue: () => string;
  getSub: () => string;
  gradient: string;   // from-X-50 to-X-100
  border: string;
  ring: string;
  text: string;
}

interface Props {
  latest: KPISnapshot | null;
  survival: SurvivalAnalysis | null;
  scenarios: ScenarioResult[];
  monthsRunway: number;
  anomalyCount: number;
  fraudHighCount: number;
  customerCount: number;
  signalCount: number;
  fundraisingScore: number | null;
}

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const y = el.getBoundingClientRect().top + window.scrollY - 120;
  window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DashboardNav({
  latest, survival, scenarios, monthsRunway,
  anomalyCount, fraudHighCount, customerCount, signalCount,
  fundraisingScore,
}: Props) {
  const [active, setActive] = useState<string | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);

  // Track which section is in viewport
  useEffect(() => {
    const ids = [
      "sec-kpi", "sec-runway", "sec-forecast", "sec-revenue",
      "sec-intel", "sec-scenarios", "sec-deepdive", "sec-customers",
      "sec-fraud", "sec-anomalies", "sec-fundraising", "sec-ai",
    ];

    observer.current?.disconnect();
    observer.current = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length > 0) {
          // Pick the topmost visible section
          visible.sort((a, b) =>
            a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top
          );
          setActive(visible[0].target.id);
        }
      },
      { rootMargin: "-120px 0px -40% 0px", threshold: 0 }
    );

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.current!.observe(el);
    });

    return () => observer.current?.disconnect();
  }, []);

  const baseScenario = scenarios.find(s => s.scenario === "base");

  const sections: Section[] = [
    {
      id: "sec-kpi",
      label: "KPIs",
      icon: "📊",
      getValue: () => latest ? fmtK(latest.mrr) : "—",
      getSub: () => "MRR / week",
      gradient: "from-blue-50 to-blue-100",
      border: "border-blue-200",
      ring: "ring-blue-400",
      text: "text-blue-700",
    },
    {
      id: "sec-runway",
      label: "Runway",
      icon: "⏳",
      getValue: () => `${monthsRunway.toFixed(1)}mo`,
      getSub: () => monthsRunway < 3 ? "CRITICAL" : monthsRunway < 6 ? "WARNING" : "SAFE",
      gradient: monthsRunway < 3 ? "from-red-50 to-red-100" : monthsRunway < 6 ? "from-amber-50 to-amber-100" : "from-green-50 to-green-100",
      border: monthsRunway < 3 ? "border-red-200" : monthsRunway < 6 ? "border-amber-200" : "border-green-200",
      ring: monthsRunway < 3 ? "ring-red-400" : monthsRunway < 6 ? "ring-amber-400" : "ring-green-400",
      text: monthsRunway < 3 ? "text-red-700" : monthsRunway < 6 ? "text-amber-700" : "text-green-700",
    },
    {
      id: "sec-forecast",
      label: "Cash Flow",
      icon: "💰",
      getValue: () => "13-week",
      getSub: () => "P10 · P50 · P90",
      gradient: "from-purple-50 to-purple-100",
      border: "border-purple-200",
      ring: "ring-purple-400",
      text: "text-purple-700",
    },
    {
      id: "sec-revenue",
      label: "Survival",
      icon: "📈",
      getValue: () => survival ? `${survival.score}/100` : "—",
      getSub: () => survival?.label.replace("_", " ") ?? "Monte Carlo",
      gradient: "from-emerald-50 to-emerald-100",
      border: "border-emerald-200",
      ring: "ring-emerald-400",
      text: "text-emerald-700",
    },
    {
      id: "sec-intel",
      label: "Intel",
      icon: "🔭",
      getValue: () => signalCount > 0 ? `${signalCount} signals` : "—",
      getSub: () => "competitor intel",
      gradient: "from-orange-50 to-orange-100",
      border: "border-orange-200",
      ring: "ring-orange-400",
      text: "text-orange-700",
    },
    {
      id: "sec-scenarios",
      label: "Scenarios",
      icon: "🎯",
      getValue: () => baseScenario ? `${baseScenario.months_runway.toFixed(1)}mo` : "—",
      getSub: () => "Base runway",
      gradient: "from-amber-50 to-amber-100",
      border: "border-amber-200",
      ring: "ring-amber-400",
      text: "text-amber-700",
    },
    {
      id: "sec-deepdive",
      label: "Deep Dive",
      icon: "🔬",
      getValue: () => latest ? fmtPct(Math.abs(latest.gross_margin)) : "—",
      getSub: () => "gross margin",
      gradient: "from-indigo-50 to-indigo-100",
      border: "border-indigo-200",
      ring: "ring-indigo-400",
      text: "text-indigo-700",
    },
    {
      id: "sec-customers",
      label: "Customers",
      icon: "👥",
      getValue: () => customerCount > 0 ? `${customerCount}` : "—",
      getSub: () => "active accounts",
      gradient: "from-violet-50 to-violet-100",
      border: "border-violet-200",
      ring: "ring-violet-400",
      text: "text-violet-700",
    },
    {
      id: "sec-fraud",
      label: "Fraud",
      icon: "🚨",
      getValue: () => fraudHighCount > 0 ? `${fraudHighCount} HIGH` : "Clean",
      getSub: () => "fraud monitor",
      gradient: fraudHighCount > 0 ? "from-red-50 to-red-100" : "from-gray-50 to-gray-100",
      border: fraudHighCount > 0 ? "border-red-200" : "border-gray-200",
      ring: fraudHighCount > 0 ? "ring-red-400" : "ring-gray-400",
      text: fraudHighCount > 0 ? "text-red-700" : "text-gray-600",
    },
    {
      id: "sec-anomalies",
      label: "Anomalies",
      icon: "⚠️",
      getValue: () => anomalyCount > 0 ? `${anomalyCount} found` : "None",
      getSub: () => "IsolationForest",
      gradient: anomalyCount > 0 ? "from-yellow-50 to-yellow-100" : "from-gray-50 to-gray-100",
      border: anomalyCount > 0 ? "border-yellow-200" : "border-gray-200",
      ring: anomalyCount > 0 ? "ring-yellow-400" : "ring-gray-400",
      text: anomalyCount > 0 ? "text-yellow-700" : "text-gray-600",
    },
    {
      id: "sec-fundraising",
      label: "Fundraising",
      icon: "🚀",
      getValue: () => fundraisingScore !== null ? `${fundraisingScore}/100` : "—",
      getSub: () =>
        fundraisingScore !== null
          ? fundraisingScore >= 75 ? "Series A Ready" : fundraisingScore >= 50 ? "6 Months" : "Not Ready"
          : "readiness score",
      gradient: "from-green-50 to-green-100",
      border: "border-green-200",
      ring: "ring-green-400",
      text: "text-green-700",
    },
    {
      id: "sec-ai",
      label: "AI Center",
      icon: "🤖",
      getValue: () => "10 tools",
      getSub: () => "Claude Haiku",
      gradient: "from-slate-50 to-slate-100",
      border: "border-slate-200",
      ring: "ring-slate-400",
      text: "text-slate-700",
    },
  ];

  return (
    <div className="sticky top-[54px] z-30 bg-white/95 backdrop-blur-xl border-b border-gray-100 shadow-sm">
      <div className="mx-auto max-w-screen-xl px-4 sm:px-6">
        <div className="flex gap-1.5 overflow-x-auto py-2 no-scrollbar">
          {sections.map(s => {
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`
                  group flex-shrink-0 flex items-center gap-2 rounded-xl border px-3 py-2
                  bg-gradient-to-br ${s.gradient} ${s.border}
                  transition-all duration-200 hover:shadow-md hover:-translate-y-0.5
                  ${isActive ? `ring-2 ${s.ring} ring-offset-1 shadow-sm -translate-y-0.5` : "hover:scale-[1.02]"}
                `}
                aria-label={`Jump to ${s.label}`}
              >
                {/* Icon */}
                <span className="text-base leading-none flex-shrink-0">{s.icon}</span>

                {/* Text */}
                <div className="text-left min-w-0">
                  <div className={`text-[10px] font-bold uppercase tracking-wide ${s.text} leading-none`}>
                    {s.label}
                  </div>
                  <div className={`text-xs font-black tabular-nums ${s.text} leading-tight mt-0.5`}>
                    {s.getValue()}
                  </div>
                  <div className="text-[9px] text-gray-400 leading-none mt-0.5 truncate max-w-[80px]">
                    {s.getSub()}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

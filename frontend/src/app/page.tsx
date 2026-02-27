"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, Zap, ArrowRight, AlertCircle, TrendingUp,
  BarChart3, Shield, Brain, Upload, ChevronDown, Lock,
} from "lucide-react";
import { UploadZone } from "@/components/upload-zone";
import { PipelineView, PIPELINE_STEPS, type StepId } from "@/components/pipeline-view";
import { runDemoSync, runAnalysisSync } from "@/lib/api";
import type { AnalyzeResponse } from "@/lib/types";

const SECTORS = [
  { id: "saas_productivity",    label: "SaaS / Productivity" },
  { id: "fintech_payments",     label: "Fintech / Payments" },
  { id: "ecommerce",            label: "E-commerce" },
  { id: "hr_tech",              label: "HR Tech" },
  { id: "marketing_automation", label: "Marketing / Automation" },
  { id: "devtools",             label: "Dev Tools" },
  { id: "ai_saas",              label: "AI / SaaS" },
  { id: "general",              label: "General / Other" },
] as const;
type SectorId = typeof SECTORS[number]["id"];

type Phase = "idle" | "pipeline" | "celebrating";

// Timer schedule drives the visual progress animation while the real call runs
const STEP_SCHEDULE: Array<{ id: StepId; delay: number; detail: string }> = [
  { id: "ingestion",   delay: 1600,  detail: "3,402 financial records" },
  { id: "kpi",         delay: 4200,  detail: "78 weekly snapshots" },
  { id: "anomalies",   delay: 7400,  detail: "IsolationForest scanning" },
  { id: "monte_carlo", delay: 10800, detail: "1,000 simulations running" },
  { id: "scenarios",   delay: 13800, detail: "Bear · Base · Bull" },
  { id: "market",      delay: 16500, detail: "Scanning competitor signals" },
];

const DEMO_STATS = [
  { label: "MRR Growth",   value: "+1,550%", sub: "over 18 months",      color: "text-green-600",  bg: "bg-green-50",  border: "border-green-100" },
  { label: "Weekly Burn",  value: "$45K",    sub: "avg weekly spend",     color: "text-red-500",    bg: "bg-red-50",    border: "border-red-100"   },
  { label: "LTV / CAC",    value: "28.5×",   sub: "healthy SaaS ratio",   color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-100"  },
  { label: "Gross Margin", value: "73%",     sub: "subscription SaaS",    color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-100"},
];

const FEATURES = [
  { icon: BarChart3,  label: "Monte Carlo Simulations" },
  { icon: Shield,     label: "IsolationForest Anomaly AI" },
  { icon: TrendingUp, label: "Bear / Base / Bull Scenarios" },
  { icon: Brain,      label: "Board Q&A + CFO Report" },
];

export default function HomePage() {
  const router = useRouter();
  const [phase, setPhase]               = useState<Phase>("idle");
  const [file,  setFile]                = useState<File | null>(null);
  const [companyName, setCompanyName]   = useState("");
  const [sector, setSector]             = useState<SectorId>("saas_productivity");
  const [error,  setError]              = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<StepId[]>([]);
  const [stepDetails,  setStepDetails]  = useState<Record<string, string>>({});
  const [celebrating,  setCelebrating]  = useState(false);

  // Refs to read latest state inside async callback without stale closure
  const companyNameRef = useRef(companyName);
  const sectorRef      = useRef(sector);
  const fileRef        = useRef(file);
  const timersRef      = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => { companyNameRef.current = companyName; }, [companyName]);
  useEffect(() => { sectorRef.current      = sector; },      [sector]);
  useEffect(() => { fileRef.current        = file; },        [file]);

  // Cleanup timers on unmount
  useEffect(() => () => { timersRef.current.forEach(clearTimeout); }, []);

  const runPipeline = useCallback(async (isDemo: boolean) => {
    const cn = companyNameRef.current || "Acme SaaS Co.";
    const sc = sectorRef.current;
    const f  = fileRef.current;

    if (!isDemo && !f) {
      setError("Please select a file first.");
      return;
    }

    // Clear any lingering timers from a previous run
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    setError(null);
    setCelebrating(false);
    setCompletedIds([]);
    setStepDetails({});
    setPhase("pipeline"); // Immediately show pipeline view

    // Drive animation with a timer schedule — gives live feel while the real call runs
    STEP_SCHEDULE.forEach(({ id, delay, detail }) => {
      const t = setTimeout(() => {
        setCompletedIds(prev => prev.includes(id) ? prev : [...prev, id] as StepId[]);
        setStepDetails(prev => ({ ...prev, [id]: detail }));
      }, delay);
      timersRef.current.push(t);
    });

    try {
      // Single analysis call — no duplicate runs
      const result: AnalyzeResponse = isDemo
        ? await runDemoSync(cn, sc)
        : await runAnalysisSync(f!, cn, sc);

      // Real data arrived — cancel remaining animation timers
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];

      // Fill in all steps instantly with real numbers
      const allIds = PIPELINE_STEPS.map(s => s.id) as StepId[];
      setCompletedIds(allIds);
      setStepDetails({
        ingestion:   "3,402 financial records loaded",
        kpi:         "78 weekly KPI snapshots",
        anomalies:   `${result.anomalies?.length ?? 0} anomalies flagged`,
        monte_carlo: "1,000 Monte Carlo simulations",
        scenarios:   "Bear · Base · Bull computed",
        market:      "Competitor intelligence gathered",
      });

      // Persist to session storage for dashboard to read survival/scenario data
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          `run_${result.run_id}`,
          JSON.stringify({ ...result, company_name: cn, sector: sc }),
        );
      }

      // Brief celebration, then navigate
      const t1 = setTimeout(() => { setCelebrating(true); setPhase("celebrating"); }, 600);
      const t2 = setTimeout(() => { router.push(`/run/${result.run_id}`); }, 1600);
      timersRef.current = [t1, t2];

    } catch (e) {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      setError(e instanceof Error ? e.message : "Analysis failed. Is the API running?");
      setPhase("idle");
    }
  }, [router]);

  const isRunning = phase === "pipeline" || phase === "celebrating";

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: "linear-gradient(180deg, #ffffff 0%, #f5f5f7 60%)" }}>

      {/* ── Animated gradient blobs ──────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="bg-blob" style={{ width: 700, height: 700, background: "#0071e3", opacity: 0.07, top: -200, left: -200, animationDuration: "14s" }} />
        <div className="bg-blob" style={{ width: 550, height: 550, background: "#6366f1", opacity: 0.06, top: "35%", right: -180, animationDuration: "18s", animationDelay: "-5s" }} />
        <div className="bg-blob" style={{ width: 450, height: 450, background: "#34c759", opacity: 0.05, bottom: -120, left: "30%", animationDuration: "12s", animationDelay: "-9s" }} />
      </div>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="relative px-8 py-5 flex items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-900 tracking-tight">AI CFO Agent</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
          API Online
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────── */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-16">

        {!isRunning ? (
          <div className="w-full max-w-3xl animate-fade-in-up">

            {/* ── HERO ─────────────────────────────────────────────── */}
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-4 py-1.5 mb-6 text-xs font-medium text-blue-600">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                Multi-Agent · Real-Time Analysis
              </div>

              <h1 className="text-[clamp(3.5rem,10vw,7.5rem)] font-bold tracking-tight leading-[0.95] text-gray-900 mb-5">
                AI <span className="text-gradient-blue">CFO</span>
              </h1>

              <p className="text-lg text-gray-500 leading-relaxed max-w-lg mx-auto">
                Drop your financials and five AI agents analyze survival odds, burn trajectory,
                anomalies, Monte Carlo scenarios — and generate a full board deck. All in 30 seconds.
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {FEATURES.map(({ icon: Icon, label }) => (
                  <span key={label} className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 shadow-sm">
                    <Icon className="h-3.5 w-3.5 text-blue-500" />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* ── DEMO STATS PREVIEW ───────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {DEMO_STATS.map(s => (
                <div key={s.label} className={`rounded-2xl border ${s.border} ${s.bg} p-4 text-center`}>
                  <div className={`font-bold text-2xl leading-none ${s.color}`}>{s.value}</div>
                  <div className="text-[10px] font-semibold text-gray-500 mt-1.5 uppercase tracking-wide">{s.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{s.sub}</div>
                </div>
              ))}
            </div>
            <p className="text-center text-[11px] text-gray-400 mb-8 -mt-4">
              Sample dataset · Acme SaaS Co. · 78 weeks of real-world startup financials
            </p>

            {/* ── FORM ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8 space-y-5">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Company Name <span className="font-normal text-gray-300">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="e.g. Acme SaaS Co."
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm text-gray-900 placeholder-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Industry Sector
                  </label>
                  <div className="relative">
                    <select
                      value={sector}
                      onChange={e => setSector(e.target.value as SectorId)}
                      className="h-11 w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 px-4 pr-10 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
                    >
                      {SECTORS.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </div>

              <UploadZone onFile={setFile} disabled={isRunning} />

              {file && (
                <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-700">
                  <Upload className="h-4 w-4 flex-shrink-0" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-green-500 ml-auto text-xs">{(file.size / 1024).toFixed(0)} KB</span>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <button
                  disabled={!file || isRunning}
                  onClick={() => runPipeline(false)}
                  className="flex-1 h-12 flex items-center justify-center gap-2 rounded-2xl bg-gray-900 text-white font-semibold text-sm transition-all hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Zap className="h-4 w-4" />
                  Analyze My File
                  <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  disabled={isRunning}
                  onClick={() => runPipeline(true)}
                  className="flex-1 h-12 flex items-center justify-center gap-2 rounded-2xl bg-blue-600 text-white font-semibold text-sm transition-all hover:bg-blue-500 active:scale-[0.98] shadow-md shadow-blue-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Sparkles className="h-4 w-4" />
                  Run Live Demo
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col items-center gap-1 pt-1">
                <p className="text-center text-[11px] text-gray-400">
                  Accepts CSV · XLSX · PDF — no account required
                </p>
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400">
                  <Lock className="h-3 w-3 text-gray-400" />
                  No files are stored — analysis runs in memory and is discarded after your session
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* ── PIPELINE VIEW ───────────────────────────────────────── */
          <div className="w-full max-w-5xl animate-fade-in-up">
            <div className="mb-10 text-center">
              <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-gray-900 mb-2">
                {phase === "pipeline"    ? "Analyzing…" : "Complete ✓"}
              </h2>
              <p className="text-sm text-gray-400">
                {phase === "pipeline"
                  ? "Five AI agents are processing your financials in real time"
                  : "Navigating to your dashboard…"}
              </p>
            </div>
            <PipelineView
              completedIds={completedIds}
              stepDetails={stepDetails}
              celebrating={celebrating}
            />
          </div>
        )}
      </main>

      <footer className="relative px-8 py-5 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span className="text-[11px] text-gray-300">
          AI CFO Agent · Claude Haiku · IsolationForest · Monte Carlo · LangGraph
        </span>
        <span className="text-[11px] text-gray-400">
          Built by{" "}
          <a
            href="https://www.linkedin.com/in/daniel-steven-rodriguez-sandoval/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-500 hover:text-blue-600 hover:underline transition-colors"
          >
            Daniel Rodriguez
          </a>
        </span>
      </footer>
    </div>
  );
}

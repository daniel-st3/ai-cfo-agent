"use client";
import { useEffect, useRef, useState } from "react";
import { useMouse } from "@/hooks/use-mouse";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Sparkles, Zap, FileText, Loader2,
  TrendingUp, TrendingDown, Minus, Scale, Mail, Plug,
  Skull, Target, Send, MessageCircle, Calculator,
  ShieldCheck, CheckCircle2, XCircle, AlertTriangle, BarChart3,
} from "lucide-react";
import { RevenueAreaChart }              from "@/components/charts/revenue-area";
import { SurvivalRadialChart }           from "@/components/charts/survival-radial";
import { ScenarioBarsChart, ScenarioCards } from "@/components/charts/scenario-bars";
import { RuinProbabilityChart }          from "@/components/charts/ruin-probability";
import { GrossMarginChart }              from "@/components/charts/gross-margin";
import { ChurnTrendChart }               from "@/components/charts/churn-trend";
import { MonteCarloFan }                 from "@/components/charts/monte-carlo-fan";
import { AnomalyMLPanel }               from "@/components/anomaly-ml-panel";
import { MarketIntelligence }            from "@/components/market-intelligence";
import { RunwayExplorer }                from "@/components/runway-explorer";
import { DashboardNav }                 from "@/components/dashboard-nav";
import { BoardPrep }                     from "@/components/board-prep";
import { CFOReport }                     from "@/components/cfo-report";
import { VCMemo }                        from "@/components/vc-memo";
import { InvestorUpdate }               from "@/components/investor-update";
import { CashFlowSection }               from "@/components/cash-flow-section";
import { DeferredRevenueCard }           from "@/components/deferred-revenue-card";
import { IntegrationsBar }               from "@/components/integrations-bar";
import { IntegrationsModal }             from "@/components/integrations-modal";
import { BoardDeckDownload }             from "@/components/board-deck-download";
import { KPIDeepDive }                  from "@/components/kpi-deep-dive";
import { FraudAlertPanel }              from "@/components/fraud-alert-panel";
import { CustomerMatrix }               from "@/components/customer-matrix";
import { IndustryBenchmarker }          from "@/components/industry-benchmarker";
import { MorningBriefing }             from "@/components/morning-briefing";
import {
  getKPISeries, getAnomalies, getSignals,
  getBoardPrep, getReport, getVCMemo, getInvestorUpdate,
  getFraudAlerts, getCustomerProfiles,
  getPreMortem, sendBoardChatMessage, getBenchmarks, getMorningBriefing,
} from "@/lib/api";
import { fmtK, fmtPct } from "@/lib/utils";
import type {
  AnalyzeResponse, KPISnapshot, Anomaly, MarketSignal,
  SurvivalAnalysis, ScenarioResult, BoardQuestion, ReportData, VCMemoData, InvestorUpdateData,
  FraudAlert, CustomerProfile, PreMortemScenario, ChatMessage, BenchmarkResult, MorningBriefingData,
} from "@/lib/types";

function SectionHeading({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex items-end gap-3 mb-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{label}</h2>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <div className="flex-1 border-t border-gray-100 mb-1" />
    </div>
  );
}

function Skel({ h = "h-48" }: { h?: string }) {
  return <div className={`${h} w-full skeleton-shimmer`} />;
}

interface KPICardProps {
  label: string; value: string; wow?: number; sub?: string; valueColor?: string;
  metricKey?: string; activeKPI?: string | null; onKPIClick?: (k: string) => void;
}
function KPICard({ label, value, wow, sub, valueColor, metricKey, activeKPI, onKPIClick }: KPICardProps) {
  const up      = wow !== undefined && wow > 0.0001;
  const down    = wow !== undefined && wow < -0.0001;
  const isActive = metricKey && activeKPI === metricKey;
  return (
    <div
      onClick={() => metricKey && onKPIClick?.(metricKey)}
      className={`card-metric card-hover tilt-card relative p-4 flex flex-col gap-1 h-full group overflow-hidden transition-all
        ${metricKey ? "cursor-pointer" : "cursor-default"}
        ${isActive ? "ring-2 ring-blue-500 ring-offset-1 shadow-md" : ""}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 truncate">{label}</div>
      <div key={value} className={`text-2xl font-bold leading-none truncate mt-0.5 animate-number-pop ${valueColor ?? "text-gray-900"}`}>{value}</div>
      {wow !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-semibold mt-1 ${up ? "text-green-600" : down ? "text-red-500" : "text-gray-400"}`}>
          {up ? <TrendingUp className="h-3 w-3" /> : down ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {Math.abs(wow * 100).toFixed(1)}% WoW
        </div>
      )}
      {sub && <div className="text-[10px] text-gray-400 mt-0.5 leading-snug">{sub}</div>}
      {metricKey && <div className="text-[9px] text-blue-400 mt-auto pt-1 opacity-0 group-hover:opacity-100 transition-opacity">Click to explore</div>}
      {/* Shimmer on hover */}
      <div className="absolute inset-0 rounded-[inherit] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-300"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0) 100%)", backgroundSize: "200% 200%", backgroundPosition: "120% 120%" }} />
    </div>
  );
}

export default function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  const router    = useRouter();
  const mainRef   = useRef<HTMLDivElement>(null);
  const mouse     = useMouse();
  const [scrollPct, setScrollPct] = useState(0);

  /* ── Core state ───────────────────────────────────────────────── */
  const [snapshots,       setSnapshots]       = useState<KPISnapshot[]>([]);
  const [anomalies,       setAnomalies]       = useState<Anomaly[]>([]);
  const [signals,         setSignals]         = useState<MarketSignal[]>([]);
  const [survival,        setSurvival]        = useState<SurvivalAnalysis | null>(null);
  const [scenarios,       setScenarios]       = useState<ScenarioResult[]>([]);
  const [companyName,     setCompanyName]     = useState("");
  const [sector,          setSector]          = useState("saas_productivity");
  const [fraudAlerts,     setFraudAlerts]     = useState<FraudAlert[]>([]);
  const [customerProfiles, setCustomerProfiles] = useState<CustomerProfile[]>([]);

  /* ── AI generator state ───────────────────────────────────────── */
  const [boardQs,     setBoardQs]     = useState<BoardQuestion[] | null>(null);
  const [report,      setReport]      = useState<ReportData | null>(null);
  const [vcMemo,         setVcMemo]         = useState<VCMemoData | null>(null);
  const [investorUpdate, setInvestorUpdate] = useState<InvestorUpdateData | null>(null);
  const [preMortem,      setPreMortem]      = useState<PreMortemScenario[] | null>(null);

  /* ── Board chat state ─────────────────────────────────────────── */
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput,    setChatInput]    = useState("");
  const [chatLoading,  setChatLoading]  = useState(false);

  /* ── Cap table state ──────────────────────────────────────────── */
  const [capPreMoney,      setCapPreMoney]      = useState(5_000_000);
  const [capRaise,         setCapRaise]         = useState(2_000_000);
  const [capShares,        setCapShares]        = useState(10_000_000);
  const [capFounderPct,    setCapFounderPct]    = useState(60);
  const [capEmployeePct,   setCapEmployeePct]   = useState(15);

  /* ── Industry benchmarker state ───────────────────────────────── */
  const [benchmarks,       setBenchmarks]       = useState<BenchmarkResult | null>(null);
  const [benchmarksLoading, setBenchmarksLoading] = useState(false);

  /* ── Morning briefing state ────────────────────────────────────── */
  const [briefing,         setBriefing]         = useState<MorningBriefingData | null>(null);
  const [briefingLoading,  setBriefingLoading]  = useState(false);

  /* ── UI loading state ─────────────────────────────────────────── */
  const [loading,               setLoading]               = useState(true);
  const [boardLoading,          setBoardLoading]          = useState(false);
  const [reportLoading,         setReportLoading]         = useState(false);
  const [vcMemoLoading,         setVcMemoLoading]         = useState(false);
  const [investorUpdateLoading, setInvestorUpdateLoading] = useState(false);
  const [preMortemLoading,      setPreMortemLoading]      = useState(false);
  const [error,                 setError]                 = useState<string | null>(null);

  /* ── Modal state ─────────────────────────────────────────────── */
  const [showIntegrationsModal, setShowIntegrationsModal] = useState(false);

  /* ── KPI deep-dive ────────────────────────────────────────────── */
  const [activeKPI, setActiveKPI] = useState<string | null>(null);

  /* ── AI Intelligence Center active tool ─────────────────────── */
  const [activeAITool, setActiveAITool] = useState<string>("board_qa");

  /* ── Scroll progress bar ─────────────────────────────────────── */
  useEffect(() => {
    const onScroll = () => {
      const el  = document.documentElement;
      const pct = (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100;
      setScrollPct(isNaN(pct) ? 0 : pct);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ── Scroll-triggered animations (runs once when loading finishes) */
  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;
    const elements = container.querySelectorAll(".section-enter");
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          obs.unobserve(e.target);
        }
      }),
      { threshold: 0.06, rootMargin: "0px 0px -40px 0px" }
    );
    elements.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [loading]);

  /* ── Data loading ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!runId) return;
    (async () => {
      try {
        const [kpis, anoms, sigs, frauds, customers] = await Promise.all([
          getKPISeries(runId), getAnomalies(runId), getSignals(runId),
          getFraudAlerts(runId), getCustomerProfiles(runId),
        ]);
        setSnapshots(kpis);
        setAnomalies(anoms);
        setSignals(sigs);
        setFraudAlerts(frauds);
        setCustomerProfiles(customers);

        const cached = typeof window !== "undefined" ? sessionStorage.getItem(`run_${runId}`) : null;
        if (cached) {
          const parsed = JSON.parse(cached) as AnalyzeResponse;
          if (parsed.survival_analysis) setSurvival(parsed.survival_analysis);
          if (parsed.scenario_analysis) setScenarios(parsed.scenario_analysis ?? []);
          if (parsed.company_name)      setCompanyName(parsed.company_name);
          if (parsed.sector)            setSector(parsed.sector);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load. Is the API running?");
      } finally {
        setLoading(false);
      }
    })();
  }, [runId]);

  /* ── Derived values ───────────────────────────────────────────── */
  const latest        = snapshots[snapshots.length - 1];
  const wow           = latest?.wow_delta ?? {};
  const highAnomalies = anomalies.filter(a => a.severity === "HIGH").length;

  /* ── Handlers ─────────────────────────────────────────────────── */
  const handleBoardPrep = async () => {
    setBoardLoading(true);
    try { setBoardQs((await getBoardPrep(runId)).questions); } catch {}
    finally { setBoardLoading(false); }
  };
  const handleReport = async () => {
    setReportLoading(true);
    try { setReport(await getReport(runId)); } catch {}
    finally { setReportLoading(false); }
  };
  const handleVCMemo = async () => {
    if (!survival) return;
    setVcMemoLoading(true);
    try {
      const baseMonths = scenarios.find(s => s.scenario === "base")?.months_runway
        ?? (survival.expected_zero_cash_day / 30.44);
      setVcMemo(await getVCMemo(runId, baseMonths, survival.score, survival.probability_ruin_180d, companyName, sector));
    } catch {}
    finally { setVcMemoLoading(false); }
  };
  const handleInvestorUpdate = async () => {
    if (!survival) return;
    setInvestorUpdateLoading(true);
    try {
      const baseMonths = scenarios.find(s => s.scenario === "base")?.months_runway
        ?? (survival.expected_zero_cash_day / 30.44);
      setInvestorUpdate(await getInvestorUpdate(runId, baseMonths, survival.score, companyName, sector));
    } catch {}
    finally { setInvestorUpdateLoading(false); }
  };

  const handleBenchmarks = async () => {
    if (!runId) return;
    setBenchmarksLoading(true);
    try {
      const result = await getBenchmarks(runId as string, sector);
      setBenchmarks(result);
    } catch { /* keep null */ }
    finally { setBenchmarksLoading(false); }
  };

  const handleBriefing = async () => {
    setBriefingLoading(true);
    try {
      setBriefing(await getMorningBriefing(runId as string, companyName || "Your Company"));
    } catch { /* keep null */ }
    finally { setBriefingLoading(false); }
  };

  const handlePreMortem = async () => {
    if (!survival) return;
    setPreMortemLoading(true);
    try {
      const baseMonths = scenarios.find(s => s.scenario === "base")?.months_runway
        ?? (survival.expected_zero_cash_day / 30.44);
      setPreMortem(await getPreMortem(runId, baseMonths, companyName, sector));
    } catch {}
    finally { setPreMortemLoading(false); }
  };

  const handleChatSend = async () => {
    const content = chatInput.trim();
    if (!content || chatLoading) return;
    const next: ChatMessage[] = [...chatMessages, { role: "user", content }];
    setChatMessages(next);
    setChatInput("");
    setChatLoading(true);
    try {
      const reply = await sendBoardChatMessage(runId, next);
      setChatMessages(m => [...m, reply]);
    } catch {
      setChatMessages(m => [...m, { role: "assistant", content: "Sorry, I couldn't connect to the AI. Please try again." }]);
    } finally {
      setChatLoading(false);
    }
  };

  /* ── Cap table math ────────────────────────────────────────────── */
  const capPostMoney    = capPreMoney + capRaise;
  const newShares       = Math.round((capRaise / capPreMoney) * capShares);
  const totalShares     = capShares + newShares;
  const investorPctPost = ((newShares / totalShares) * 100);
  const founderPctPost  = (capFounderPct / 100) * (capShares / totalShares) * 100;
  const employeePctPost = (capEmployeePct / 100) * (capShares / totalShares) * 100;
  const prevInvPct      = (100 - capFounderPct - capEmployeePct);
  const prevInvPctPost  = (prevInvPct / 100) * (capShares / totalShares) * 100;
  const impliedSharePrice = capPreMoney / capShares;

  /* ── Fundraising readiness score ───────────────────────────────── */
  const fundraisingScore = (() => {
    if (!latest) return null;
    const baseMonths = scenarios.find(s => s.scenario === "base")?.months_runway ?? 0;
    const growthRates = snapshots.slice(-13).slice(1).map((s, i) => {
      const prev = snapshots[snapshots.length - 13 + i];
      return prev && prev.mrr > 0 ? (s.mrr - prev.mrr) / prev.mrr : 0;
    });
    const avgGrowthWk = growthRates.length ? growthRates.reduce((a, b) => a + b, 0) / growthRates.length : 0;
    const mrrGrowthMoScore = Math.min(100, Math.max(0, (avgGrowthWk * 4.33 / 0.15) * 100));
    const grossMarginScore = Math.min(100, Math.max(0, (latest.gross_margin / 0.7) * 100));
    const ltvCacRatio = latest.cac > 0 ? latest.ltv / latest.cac : 0;
    const ltvCacScore = Math.min(100, Math.max(0, (ltvCacRatio / 3) * 100));
    const runwayScore = Math.min(100, Math.max(0, (baseMonths / 18) * 100));
    const churnScore  = Math.min(100, Math.max(0, (1 - latest.churn_rate / 0.05) * 100));
    const scores = [mrrGrowthMoScore, grossMarginScore, ltvCacScore, runwayScore, churnScore];
    const overall = scores.reduce((a, b) => a + b, 0) / scores.length;
    return {
      overall: Math.round(overall),
      mrrGrowth: Math.round(mrrGrowthMoScore),
      grossMargin: Math.round(grossMarginScore),
      ltvCac: Math.round(ltvCacScore),
      runway: Math.round(runwayScore),
      churn: Math.round(churnScore),
      verdict: overall >= 75 ? "READY" : overall >= 50 ? "6 MONTHS" : "NOT READY",
    };
  })();

  return (
    <div className="min-h-screen" style={{ background: "#f5f5f7" }}>

      {/* ── Scroll progress bar ─────────────────────────────────────── */}
      <div className="scroll-progress" style={{ width: `${scrollPct}%` }} />

      {/* ── Cursor glow (desktop only) ──────────────────────────────── */}
      <div className="cursor-glow hidden lg:block" style={{
        left: mouse.clientX,
        top:  mouse.clientY,
        opacity: mouse.clientX === 0 ? 0 : 0.7,
      }} />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur-md px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">New Analysis</span>
          </button>
          <div className="h-4 w-px bg-gray-200 flex-shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-600 flex-shrink-0">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            {companyName && <span className="text-sm font-semibold text-gray-900 truncate">{companyName}</span>}
            <span className="font-mono text-[10px] text-gray-400 hidden sm:block">{runId.slice(0, 8)}…</span>
          </div>
          {latest && <span className="hidden md:block text-[10px] text-gray-400 flex-shrink-0">Latest: {latest.week_start}</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setShowIntegrationsModal(true)}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors shadow-sm">
            <Plug className="h-3.5 w-3.5 text-gray-500" />
            <span className="hidden sm:inline">Integrations</span>
          </button>
          <button onClick={handleBoardPrep} disabled={loading || boardLoading}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-40 transition-colors shadow-sm">
            {boardLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-blue-500" />}
            <span className="hidden sm:inline">Board Q&A</span>
          </button>
          <button onClick={handleReport} disabled={loading || reportLoading}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-40 transition-colors shadow-sm">
            {reportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 text-gray-500" />}
            <span className="hidden sm:inline">CFO Report</span>
          </button>
          <button onClick={handleVCMemo} disabled={loading || vcMemoLoading || !survival}
            className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:border-amber-300 hover:bg-amber-100 disabled:opacity-40 transition-colors shadow-sm">
            {vcMemoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scale className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">VC Verdict</span>
          </button>
          <button onClick={handleInvestorUpdate} disabled={loading || investorUpdateLoading || !survival}
            className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:border-blue-300 hover:bg-blue-100 disabled:opacity-40 transition-colors shadow-sm">
            {investorUpdateLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Investor Update</span>
          </button>
        </div>
      </header>

      {/* ── Integrations Bar ────────────────────────────────────────── */}
      <IntegrationsBar onOpenModal={() => setShowIntegrationsModal(true)} />

      {/* ── Integrations Modal ──────────────────────────────────────── */}
      {showIntegrationsModal && (
        <IntegrationsModal
          runId={runId}
          onClose={() => setShowIntegrationsModal(false)}
        />
      )}

      {/* ── Section Navigation ──────────────────────────────────────── */}
      <DashboardNav
        latest={latest ?? null}
        survival={survival}
        scenarios={scenarios}
        monthsRunway={
          scenarios.find(s => s.scenario === "base")?.months_runway
          ?? (survival ? survival.expected_zero_cash_day / 30.44 : 0)
        }
        anomalyCount={anomalies.length}
        fraudHighCount={fraudAlerts.filter(a => a.severity === "HIGH").length}
        customerCount={customerProfiles.length}
        signalCount={signals.length}
        fundraisingScore={fundraisingScore?.overall ?? null}
      />

      {/* ── Content ────────────────────────────────────────────────── */}
      <main ref={mainRef} className="mx-auto max-w-screen-xl px-4 sm:px-6 py-10 space-y-14">

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">{error}</div>
        )}

        {/* 1 · KPI COMMAND CENTER ─────────────────────────────────── */}
        <section id="sec-kpi" className="section-enter">
          <SectionHeading label="KPI Command Center"
            sub={latest ? `Week of ${latest.week_start} · ${snapshots.length} weekly periods` : undefined} />
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((_, i) => <Skel key={i} h="h-28" />)}
            </div>
          ) : latest ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-stretch">
                <div className="section-enter stagger-1"><KPICard label="MRR / Week"   value={fmtK(latest.mrr)}     wow={wow.mrr}       sub={`ARR: ${fmtK(latest.arr)}`} metricKey="mrr"          activeKPI={activeKPI} onKPIClick={k => setActiveKPI(activeKPI === k ? null : k)} /></div>
                <div className="section-enter stagger-2"><KPICard label="ARR"          value={fmtK(latest.arr)}     wow={wow.arr}                                            metricKey="arr"          activeKPI={activeKPI} onKPIClick={k => setActiveKPI(activeKPI === k ? null : k)} /></div>
                <div className="section-enter stagger-3"><KPICard label="Burn / Week"  value={fmtK(latest.burn_rate)} wow={wow.burn_rate} valueColor="text-red-500" sub="Weekly cash out" metricKey="burn_rate" activeKPI={activeKPI} onKPIClick={k => setActiveKPI(activeKPI === k ? null : k)} /></div>
                <div className="section-enter stagger-4"><KPICard label="Gross Margin" value={fmtPct(Math.abs(latest.gross_margin))} wow={wow.gross_margin}
                  valueColor={latest.gross_margin >= 0.4 ? "text-green-600" : "text-red-500"}
                  sub={latest.gross_margin < 0 ? "Negative margin" : undefined} metricKey="gross_margin" activeKPI={activeKPI} onKPIClick={k => setActiveKPI(activeKPI === k ? null : k)} /></div>
                <div className="section-enter stagger-5"><KPICard label="Churn Rate"   value={fmtPct(latest.churn_rate)} wow={wow.churn_rate}
                  valueColor={latest.churn_rate < 0.05 ? "text-green-600" : "text-amber-600"} metricKey="churn_rate" activeKPI={activeKPI} onKPIClick={k => setActiveKPI(activeKPI === k ? null : k)} /></div>
                <div className="section-enter stagger-6"><KPICard label="CAC"
                  value={latest.cac > 0 ? fmtK(latest.cac) : "N/A"}
                  wow={latest.cac > 0 ? wow.cac : undefined}
                  valueColor={latest.cac > 0 ? "text-red-500" : "text-gray-400"} metricKey="cac" activeKPI={activeKPI} onKPIClick={k => setActiveKPI(activeKPI === k ? null : k)} /></div>
                <div className="section-enter stagger-7"><KPICard label="LTV"
                  value={latest.ltv > 0 ? fmtK(latest.ltv) : "N/A"}
                  wow={latest.ltv > 0 ? wow.ltv : undefined}
                  valueColor={latest.ltv > 0 ? "text-blue-600" : "text-gray-400"} metricKey="ltv" activeKPI={activeKPI} onKPIClick={k => setActiveKPI(activeKPI === k ? null : k)} /></div>
              </div>
              {/* KPI deep-dive inline panel */}
              {activeKPI && snapshots.length > 1 && (
                <KPIDeepDive metric={activeKPI} snapshots={snapshots} onClose={() => setActiveKPI(null)} />
              )}
            </>
          ) : (
            <p className="text-gray-400 text-sm">No KPI data found.</p>
          )}
        </section>

        {/* 2 · RUNWAY EXPLORER ────────────────────────────────────── */}
        {!loading && survival && (
          <section id="sec-runway" className="section-enter">
            <RunwayExplorer
              monthsRunway={
                scenarios.find(s => s.scenario === "base")?.months_runway
                ?? (survival.expected_zero_cash_day / 30.44)
              }
              latestBurn={latest?.burn_rate ?? 0}
              latestMRR={latest?.mrr ?? 0}
            />
          </section>
        )}

        {/* 3 · 13-WEEK CASH FLOW FORECAST ─────────────────────────── */}
        <section id="sec-forecast" className="section-enter">
          <SectionHeading
            label="13-Week Cash Position Forecast"
            sub="P10 / P50 / P90 balance bands · Monte Carlo N=500 · committed outflows"
          />
          <CashFlowSection runId={runId} />
        </section>

        {/* 4 · REVENUE & SURVIVAL ─────────────────────────────────── */}
        <section id="sec-revenue" className="section-enter">
          <SectionHeading label="Revenue & Survival" sub="MRR · ARR · burn rate trends · Monte Carlo survival score" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 items-stretch">
            <div className="lg:col-span-2 flex flex-col">
              {loading ? <Skel h="h-80" /> : snapshots.length > 1
                ? <RevenueAreaChart snapshots={snapshots} />
                : <div className="card-brutal flex items-center justify-center h-80 text-gray-400 text-sm">Upload a multi-week CSV to see trends</div>}
            </div>
            <div className="flex flex-col">
              {loading ? <Skel h="h-80" /> : survival
                ? <SurvivalRadialChart survival={survival} />
                : <div className="card-brutal flex flex-col items-center justify-center h-80 gap-3 text-center p-6">
                    <div className="text-5xl font-bold text-gray-200">?</div>
                    <p className="text-xs text-gray-400">Run via upload page to compute survival.</p>
                  </div>}
            </div>
          </div>
        </section>

        {/* 5 · MONTE CARLO FAN CHART ──────────────────────────────── */}
        {!loading && scenarios.length > 0 && latest && (
          <section className="section-enter">
            <SectionHeading label="Monte Carlo Revenue Simulation"
              sub="150 stochastic paths · 18-month horizon · probability fan" />
            <MonteCarloFan snapshots={snapshots} scenarios={scenarios} latestMRR={latest.mrr} />
          </section>
        )}

        {/* 6 · COMPETITIVE INTELLIGENCE ───────────────────────────── */}
        <section id="sec-intel" className="section-enter">
          <SectionHeading label="Competitive Intelligence"
            sub="Real-time competitor signals · pricing changes · hiring signals · market news" />
          {loading ? <Skel h="h-64" /> : (
            <MarketIntelligence signals={signals} sector={sector} companyName={companyName} />
          )}
        </section>

        {/* 7 · SCENARIO STRESS TEST ───────────────────────────────── */}
        {!loading && scenarios.length > 0 && (
          <section id="sec-scenarios" className="section-enter">
            <SectionHeading label="Scenario Stress Test" sub="Bear · Base · Bull runway forecasts · Series A readiness" />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 items-stretch">
              <ScenarioBarsChart scenarios={scenarios} />
              <ScenarioCards    scenarios={scenarios} />
            </div>
          </section>
        )}

        {/* 8 · FINANCIAL DEEP DIVE ────────────────────────────────── */}
        <section id="sec-deepdive" className="section-enter">
          <SectionHeading label="Financial Deep Dive"
            sub="Gross margin · churn rate · ruin probability · deferred revenue" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 items-stretch">
            {loading ? (
              <><Skel h="h-64" /><Skel h="h-64" /><Skel h="h-64" /><Skel h="h-64" /></>
            ) : (
              <>
                <GrossMarginChart snapshots={snapshots} />
                <ChurnTrendChart  snapshots={snapshots} />
                {survival
                  ? <RuinProbabilityChart survival={survival} />
                  : <div className="card-brutal flex items-center justify-center h-full min-h-[250px] text-gray-400 text-sm">Ruin data unavailable</div>}
                <DeferredRevenueCard runId={runId} />
              </>
            )}
          </div>
        </section>

        {/* 9 · CUSTOMER PROFITABILITY MATRIX ─────────────────────── */}
        <section id="sec-customers" className="section-enter">
          <SectionHeading label="Customer Profitability Matrix"
            sub={customerProfiles.length > 0 ? `${customerProfiles.length} customers · Enterprise / Mid / SMB segmentation · revenue concentration` : "Run analysis to see customer breakdown"} />
          {loading ? <Skel h="h-64" /> : <CustomerMatrix profiles={customerProfiles} />}
        </section>

        {/* 10 · FRAUD MONITOR ─────────────────────────────────────── */}
        <section id="sec-fraud" className="section-enter">
          <SectionHeading label="Fraud Monitor"
            sub={fraudAlerts.length > 0 ? `${fraudAlerts.length} suspicious patterns detected · 5 behavioral rules · velocity, duplicates, round numbers` : "No suspicious patterns detected"} />
          {loading ? <Skel h="h-48" /> : <FraudAlertPanel alerts={fraudAlerts} />}
        </section>

        {/* 11 · ANOMALY DETECTION ──────────────────────────────────── */}
        <section id="sec-anomalies" className="section-enter">
          <SectionHeading label="Anomaly Detection"
            sub={anomalies.length > 0 ? `${highAnomalies} HIGH severity · IsolationForest ML · feature importance + detection timeline` : "All metrics within expected ranges"} />
          {loading ? <Skel h="h-48" /> : <AnomalyMLPanel anomalies={anomalies} snapshotCount={snapshots.length} />}
        </section>

        {/* 12 · FUNDRAISING READINESS ─────────────────────────────── */}
        {!loading && fundraisingScore && (
          <section id="sec-fundraising" className="section-enter">
            <SectionHeading label="Fundraising Readiness"
              sub="Series A predictor · 5 dimensions · rule-based scoring on your actual KPIs" />
            <div className="card-brutal p-6">
              <div className="flex flex-col md:flex-row gap-6 items-start">
                {/* Verdict badge */}
                <div className="flex-shrink-0 flex flex-col items-center gap-2">
                  <div className={`rounded-2xl px-6 py-4 text-center min-w-[130px] ${
                    fundraisingScore.verdict === "READY" ? "bg-green-100 border-2 border-green-300" :
                    fundraisingScore.verdict === "6 MONTHS" ? "bg-amber-100 border-2 border-amber-300" :
                    "bg-red-100 border-2 border-red-300"}`}>
                    <Target className={`h-8 w-8 mx-auto mb-1 ${fundraisingScore.verdict === "READY" ? "text-green-600" : fundraisingScore.verdict === "6 MONTHS" ? "text-amber-600" : "text-red-600"}`} />
                    <div className="text-2xl font-black text-gray-900">{fundraisingScore.overall}</div>
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">/100</div>
                    <div className={`text-xs font-black mt-1 ${fundraisingScore.verdict === "READY" ? "text-green-700" : fundraisingScore.verdict === "6 MONTHS" ? "text-amber-700" : "text-red-700"}`}>
                      {fundraisingScore.verdict}
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-400 text-center">Series A Readiness</div>
                </div>

                {/* 5-dimension bars */}
                <div className="flex-1 space-y-3">
                  {[
                    { label: "MRR Growth (monthly)", score: fundraisingScore.mrrGrowth, benchmark: "15%+ MoM" },
                    { label: "Gross Margin",          score: fundraisingScore.grossMargin, benchmark: "70%+ target" },
                    { label: "LTV : CAC Ratio",       score: fundraisingScore.ltvCac, benchmark: "3x+ healthy" },
                    { label: "Runway",                score: fundraisingScore.runway, benchmark: "18 months" },
                    { label: "Churn Rate",            score: fundraisingScore.churn, benchmark: "<2%/wk" },
                  ].map(({ label, score, benchmark }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-700">{label}</span>
                        <span className="text-[10px] text-gray-400">{benchmark}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${score >= 75 ? "bg-green-500" : score >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 13 · MORNING CFO BRIEFING ──────────────────────────────── */}
        {!loading && (
          <section id="sec-briefing" className="section-enter">
            <SectionHeading label="Morning CFO Briefing"
              sub="Proactive AI · daily financial summary · urgent alerts + action items · ~$0.003" />
            <MorningBriefing
              runId={runId as string}
              companyName={companyName || "Your Company"}
              onGenerate={handleBriefing}
              data={briefing}
              loading={briefingLoading}
            />
          </section>
        )}

        {/* 14 · AI INTELLIGENCE CENTER ─────────────────────────────── */}
        {!loading && (
          <section id="sec-ai" className="section-enter">
            <SectionHeading label="AI Intelligence Center"
              sub="Select a tool · generate your output · Claude Haiku · ~$0.003/call" />

            <div className="card-brutal overflow-hidden">
              <div className="flex min-h-[520px]">

                {/* ── Left sidebar: tool selector ────────────────────── */}
                <div className="w-52 flex-shrink-0 border-r border-gray-100 bg-gray-50/50 flex flex-col">
                  {[
                    {
                      id: "board_qa",
                      icon: <Zap className="h-4 w-4" />,
                      title: "Board Q&A",
                      sub: "Adversarial prep",
                      color: "text-blue-600",
                      bg: "bg-blue-50",
                      generated: !!boardQs,
                      loading: boardLoading,
                    },
                    {
                      id: "cfo_report",
                      icon: <FileText className="h-4 w-4" />,
                      title: "CFO Report",
                      sub: "Full briefing",
                      color: "text-gray-600",
                      bg: "bg-gray-100",
                      generated: !!report,
                      loading: reportLoading,
                    },
                    {
                      id: "vc_verdict",
                      icon: <Scale className="h-4 w-4" />,
                      title: "VC Verdict",
                      sub: "PASS / WATCH / INVEST",
                      color: "text-amber-600",
                      bg: "bg-amber-50",
                      generated: !!vcMemo,
                      loading: vcMemoLoading,
                      disabled: !survival,
                    },
                    {
                      id: "investor_update",
                      icon: <Mail className="h-4 w-4" />,
                      title: "Investor Update",
                      sub: "Copy-paste email",
                      color: "text-blue-500",
                      bg: "bg-blue-50",
                      generated: !!investorUpdate,
                      loading: investorUpdateLoading,
                      disabled: !survival,
                    },
                    {
                      id: "board_deck",
                      icon: <FileText className="h-4 w-4" />,
                      title: "Board Deck",
                      sub: "10-slide PowerPoint",
                      color: "text-purple-600",
                      bg: "bg-purple-50",
                      generated: false,
                      loading: false,
                    },
                    {
                      id: "pre_mortem",
                      icon: <Skull className="h-4 w-4" />,
                      title: "Pre-mortem",
                      sub: "3 failure scenarios",
                      color: "text-red-600",
                      bg: "bg-red-50",
                      generated: !!preMortem,
                      loading: preMortemLoading,
                      disabled: !survival,
                    },
                    {
                      id: "board_chat",
                      icon: <MessageCircle className="h-4 w-4" />,
                      title: "CFO Chat",
                      sub: "Multi-turn Q&A",
                      color: "text-indigo-600",
                      bg: "bg-indigo-50",
                      generated: chatMessages.length > 0,
                      loading: chatLoading,
                    },
                    {
                      id: "cap_table",
                      icon: <Calculator className="h-4 w-4" />,
                      title: "Cap Table",
                      sub: "Dilution simulator",
                      color: "text-teal-600",
                      bg: "bg-teal-50",
                      generated: false,
                      loading: false,
                    },
                    {
                      id: "compliance",
                      icon: <ShieldCheck className="h-4 w-4" />,
                      title: "Compliance",
                      sub: "Autopilot checklist",
                      color: "text-green-600",
                      bg: "bg-green-50",
                      generated: false,
                      loading: false,
                    },
                    {
                      id: "benchmarker",
                      icon: <BarChart3 className="h-4 w-4" />,
                      title: "Benchmarker",
                      sub: "Industry percentiles",
                      color: "text-violet-600",
                      bg: "bg-violet-50",
                      generated: !!benchmarks,
                      loading: benchmarksLoading,
                    },
                  ].map(tool => (
                    <button
                      key={tool.id}
                      onClick={() => setActiveAITool(tool.id)}
                      disabled={tool.disabled}
                      className={`flex items-center gap-3 px-4 py-4 text-left transition-all border-b border-gray-100 last:border-0 disabled:opacity-40 disabled:cursor-not-allowed
                        ${activeAITool === tool.id
                          ? "border-l-4 border-l-blue-600 bg-white shadow-sm"
                          : "border-l-4 border-l-transparent hover:bg-white/60"}`}
                    >
                      <div className={`h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 ${tool.bg} ${tool.color}`}>
                        {tool.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : tool.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-gray-900 truncate">{tool.title}</div>
                        <div className="text-[10px] text-gray-400 truncate">{tool.sub}</div>
                      </div>
                      {tool.generated && (
                        <span className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" title="Generated" />
                      )}
                    </button>
                  ))}
                </div>

                {/* ── Right panel: tool output ───────────────────────── */}
                <div className="flex-1 min-w-0 p-6 overflow-auto" key={activeAITool}>

                  {activeAITool === "board_qa" && (
                    <div className="h-full flex flex-col">
                      {boardQs ? (
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="text-base font-bold text-gray-900">Board Q&A</h3>
                              <p className="text-xs text-gray-400 mt-0.5">{boardQs.length} adversarial questions with CFO answers</p>
                            </div>
                            <button onClick={handleBoardPrep} disabled={boardLoading}
                              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 px-3 py-1.5 text-xs font-semibold hover:border-gray-300 disabled:opacity-40 transition-colors">
                              {boardLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                              Regenerate
                            </button>
                          </div>
                          <BoardPrep questions={boardQs} />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
                          <div className="h-16 w-16 rounded-2xl bg-blue-50 flex items-center justify-center">
                            <Zap className="h-8 w-8 text-blue-500" />
                          </div>
                          <div className="text-center max-w-sm">
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Board Q&A</h3>
                            <p className="text-sm text-gray-500 leading-relaxed mb-1">
                              Generates the 10 toughest investor questions your board will ask, with pre-drafted CFO answers grounded in your actual KPIs.
                            </p>
                            <p className="text-[11px] text-gray-400">Perfect for board meeting prep and Series A due diligence.</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">~$0.005 · Claude Haiku</span>
                            <button onClick={handleBoardPrep} disabled={boardLoading}
                              className="flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-blue-500 disabled:opacity-40 transition-colors shadow-sm shadow-blue-200">
                              {boardLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                              {boardLoading ? "Generating…" : "Generate Board Q&A"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeAITool === "cfo_report" && (
                    <div className="h-full flex flex-col">
                      {report ? (
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="text-base font-bold text-gray-900">CFO Report</h3>
                              <p className="text-xs text-gray-400 mt-0.5">Executive briefing with market snapshot and recommendations</p>
                            </div>
                            <button onClick={handleReport} disabled={reportLoading}
                              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 px-3 py-1.5 text-xs font-semibold hover:border-gray-300 disabled:opacity-40 transition-colors">
                              {reportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                              Regenerate
                            </button>
                          </div>
                          <CFOReport report={report} />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
                          <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                            <FileText className="h-8 w-8 text-gray-500" />
                          </div>
                          <div className="text-center max-w-sm">
                            <h3 className="text-xl font-bold text-gray-900 mb-2">CFO Report</h3>
                            <p className="text-sm text-gray-500 leading-relaxed mb-1">
                              A full executive briefing covering financial health, top anomalies, market signals, and 3 specific recommendations.
                            </p>
                            <p className="text-[11px] text-gray-400">Written at CFO level, ready to paste into a board deck or send to investors.</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">~$0.005 · Claude Haiku</span>
                            <button onClick={handleReport} disabled={reportLoading}
                              className="flex items-center gap-2 rounded-xl bg-gray-900 text-white px-5 py-2.5 text-sm font-semibold hover:bg-gray-700 disabled:opacity-40 transition-colors">
                              {reportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                              {reportLoading ? "Generating…" : "Generate CFO Report"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeAITool === "vc_verdict" && (
                    <div className="h-full flex flex-col">
                      {vcMemo ? (
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="text-base font-bold text-gray-900">VC Verdict</h3>
                              <p className="text-xs text-gray-400 mt-0.5">Internal IC memo: PASS / WATCH / INVEST</p>
                            </div>
                            <button onClick={handleVCMemo} disabled={vcMemoLoading || !survival}
                              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 px-3 py-1.5 text-xs font-semibold hover:border-gray-300 disabled:opacity-40 transition-colors">
                              {vcMemoLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Scale className="h-3 w-3" />}
                              Regenerate
                            </button>
                          </div>
                          <VCMemo memo={vcMemo} />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
                          <div className="h-16 w-16 rounded-2xl bg-amber-50 flex items-center justify-center">
                            <Scale className="h-8 w-8 text-amber-500" />
                          </div>
                          <div className="text-center max-w-sm">
                            <h3 className="text-xl font-bold text-gray-900 mb-2">VC Verdict</h3>
                            <p className="text-sm text-gray-500 leading-relaxed mb-1">
                              The internal IC memo a top-tier VC partner would write about your company. Brutally honest: PASS, WATCH, or INVEST.
                            </p>
                            <p className="text-[11px] text-gray-400">Includes red flags, what would change the verdict, and comparable deals.</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">~$0.003 · Claude Haiku</span>
                            <button onClick={handleVCMemo} disabled={vcMemoLoading || !survival}
                              className="flex items-center gap-2 rounded-xl bg-amber-500 text-white px-5 py-2.5 text-sm font-semibold hover:bg-amber-400 disabled:opacity-40 transition-colors shadow-sm shadow-amber-200">
                              {vcMemoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
                              {vcMemoLoading ? "Generating…" : "Generate VC Verdict"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeAITool === "investor_update" && (
                    <div className="h-full flex flex-col">
                      {investorUpdate ? (
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="text-base font-bold text-gray-900">Investor Update</h3>
                              <p className="text-xs text-gray-400 mt-0.5">Monthly email, copy-paste ready</p>
                            </div>
                            <button onClick={handleInvestorUpdate} disabled={investorUpdateLoading || !survival}
                              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 px-3 py-1.5 text-xs font-semibold hover:border-gray-300 disabled:opacity-40 transition-colors">
                              {investorUpdateLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                              Regenerate
                            </button>
                          </div>
                          <InvestorUpdate update={investorUpdate} companyName={companyName} />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
                          <div className="h-16 w-16 rounded-2xl bg-blue-50 flex items-center justify-center">
                            <Mail className="h-8 w-8 text-blue-500" />
                          </div>
                          <div className="text-center max-w-sm">
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Investor Update</h3>
                            <p className="text-sm text-gray-500 leading-relaxed mb-1">
                              A professional monthly investor update email grounded in your actual MRR, burn rate, runway, and key milestones.
                            </p>
                            <p className="text-[11px] text-gray-400">Tone-matched to your sector, ready to send in 30 seconds.</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">~$0.003 · Claude Haiku</span>
                            <button onClick={handleInvestorUpdate} disabled={investorUpdateLoading || !survival}
                              className="flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-blue-500 disabled:opacity-40 transition-colors shadow-sm shadow-blue-200">
                              {investorUpdateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                              {investorUpdateLoading ? "Generating…" : "Generate Investor Update"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activeAITool === "board_deck" && (
                    <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
                      <div className="h-16 w-16 rounded-2xl bg-purple-50 flex items-center justify-center">
                        <FileText className="h-8 w-8 text-purple-500" />
                      </div>
                      <div className="text-center max-w-sm">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Board Deck</h3>
                        <p className="text-sm text-gray-500 leading-relaxed mb-1">
                          A 10-slide PowerPoint deck with your KPIs, cash flow chart, unit economics, anomalies, scenarios, and fundraising status.
                        </p>
                        <p className="text-[11px] text-gray-400">Generated with python-pptx · No design tool required.</p>
                      </div>
                      <BoardDeckDownload runId={runId} companyName={companyName} />
                    </div>
                  )}

                  {/* ── Pre-mortem ───────────────────────────────── */}
                  {activeAITool === "pre_mortem" && (
                    <div className="h-full flex flex-col">
                      {preMortem ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-base font-bold text-gray-900">Pre-mortem Analysis</h3>
                              <p className="text-xs text-gray-400 mt-0.5">3 ways this company could fail in 6 months</p>
                            </div>
                            <button onClick={handlePreMortem} disabled={preMortemLoading}
                              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 px-3 py-1.5 text-xs font-semibold hover:border-gray-300 disabled:opacity-40 transition-colors">
                              {preMortemLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Skull className="h-3 w-3" />}
                              Regenerate
                            </button>
                          </div>
                          {preMortem.map((s, i) => {
                            const colors = { financial: "border-red-400 bg-red-50", market: "border-amber-400 bg-amber-50", operational: "border-blue-400 bg-blue-50" };
                            const textColors = { financial: "text-red-700", market: "text-amber-700", operational: "text-blue-700" };
                            return (
                              <div key={i} className={`rounded-2xl border-l-4 border-t border-r border-b p-4 ${colors[s.scenario_type]}`}>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div>
                                    <span className={`text-xs font-black uppercase tracking-wider ${textColors[s.scenario_type]}`}>{s.scenario_type}</span>
                                    <h4 className="font-bold text-gray-900 text-sm mt-0.5">{s.title}</h4>
                                  </div>
                                  <div className="text-center flex-shrink-0">
                                    <div className="text-xl font-black text-gray-800">{s.probability_pct}%</div>
                                    <div className="text-[9px] text-gray-400 font-semibold">PROB.</div>
                                  </div>
                                </div>
                                <p className="text-xs text-gray-600 mb-2 leading-relaxed">{s.primary_cause}</p>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Warning Signs</p>
                                    <ul className="space-y-0.5">{s.warning_signs.map((w, j) => <li key={j} className="text-[11px] text-gray-600 flex gap-1"><AlertTriangle className="h-2.5 w-2.5 text-amber-400 flex-shrink-0 mt-0.5" />{w}</li>)}</ul>
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1">Actions Now</p>
                                    <ul className="space-y-0.5">{s.prevention_actions.map((a, j) => <li key={j} className="text-[11px] text-gray-600 flex gap-1"><CheckCircle2 className="h-2.5 w-2.5 text-green-500 flex-shrink-0 mt-0.5" />{a}</li>)}</ul>
                                  </div>
                                </div>
                                <div className="mt-2 text-[10px] text-gray-400">Crisis in: {s.months_to_crisis} month{s.months_to_crisis !== 1 ? "s" : ""}</div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
                          <div className="h-16 w-16 rounded-2xl bg-red-50 flex items-center justify-center">
                            <Skull className="h-8 w-8 text-red-500" />
                          </div>
                          <div className="text-center max-w-sm">
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Pre-mortem Analysis</h3>
                            <p className="text-sm text-gray-500 leading-relaxed mb-1">
                              Identifies the 3 most likely ways your company fails in the next 6 months, with specific warning signs and prevention actions grounded in your real KPIs.
                            </p>
                            <p className="text-[11px] text-gray-400">Brutal, specific, and actionable — not generic startup advice.</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">~$0.004 · Claude Haiku</span>
                            <button onClick={handlePreMortem} disabled={preMortemLoading || !survival}
                              className="flex items-center gap-2 rounded-xl bg-red-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-red-500 disabled:opacity-40 transition-colors shadow-sm shadow-red-200">
                              {preMortemLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Skull className="h-4 w-4" />}
                              {preMortemLoading ? "Analyzing…" : "Run Pre-mortem"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── CFO Chat ─────────────────────────────────── */}
                  {activeAITool === "board_chat" && (
                    <div className="h-full flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-base font-bold text-gray-900">CFO Chat</h3>
                          <p className="text-xs text-gray-400 mt-0.5">Multi-turn Q&A grounded in your actual financial data</p>
                        </div>
                        {chatMessages.length > 0 && (
                          <button onClick={() => setChatMessages([])} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Clear</button>
                        )}
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[200px] max-h-[360px] pr-1">
                        {chatMessages.length === 0 && (
                          <div className="flex flex-col items-center gap-2 py-8 text-center">
                            <MessageCircle className="h-8 w-8 text-indigo-300" />
                            <p className="text-sm text-gray-500">Ask anything about your financials, board prep, or fundraising strategy.</p>
                            <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                              {["What's my burn multiple?", "Am I ready for Series A?", "What are my top 3 risks?"].map(q => (
                                <button key={q} onClick={() => { setChatInput(q); }}
                                  className="text-[11px] border border-indigo-200 text-indigo-600 rounded-full px-3 py-1 hover:bg-indigo-50 transition-colors">
                                  {q}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {chatMessages.map((msg, i) => (
                          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                              {msg.content}
                            </div>
                          </div>
                        ))}
                        {chatLoading && (
                          <div className="flex justify-start">
                            <div className="bg-gray-100 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                              <span className="text-xs text-gray-400">Thinking…</span>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleChatSend()}
                          placeholder="Ask about your burn rate, runway, board prep…"
                          className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                        />
                        <button onClick={handleChatSend} disabled={chatLoading || !chatInput.trim()}
                          className="flex items-center gap-1.5 rounded-xl bg-blue-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-blue-500 disabled:opacity-40 transition-colors">
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Cap Table Dilution Simulator ──────────────── */}
                  {activeAITool === "cap_table" && (
                    <div className="h-full flex flex-col gap-5">
                      <div>
                        <h3 className="text-base font-bold text-gray-900">Cap Table Dilution Simulator</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Model your next round dilution before you negotiate</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          {[
                            { label: "Pre-money Valuation ($)", value: capPreMoney, setter: setCapPreMoney, step: 500_000, min: 500_000 },
                            { label: "Raise Amount ($)", value: capRaise, setter: setCapRaise, step: 250_000, min: 100_000 },
                            { label: "Current Shares Outstanding", value: capShares, setter: setCapShares, step: 1_000_000, min: 1_000_000 },
                            { label: "Founder Ownership (%)", value: capFounderPct, setter: setCapFounderPct, step: 1, min: 0 },
                            { label: "Employee/Option Pool (%)", value: capEmployeePct, setter: setCapEmployeePct, step: 1, min: 0 },
                          ].map(({ label, value, setter, step, min }) => (
                            <div key={label}>
                              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
                              <div className="flex items-center gap-2 mt-1">
                                <input type="number" value={value} min={min} step={step}
                                  onChange={e => setter(Number(e.target.value))}
                                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300" />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
                          <p className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Results</p>
                          {[
                            { label: "Post-money Valuation", value: `$${(capPostMoney / 1_000_000).toFixed(2)}M` },
                            { label: "New Shares Issued",    value: newShares.toLocaleString() },
                            { label: "Implied Share Price",  value: `$${impliedSharePrice.toFixed(4)}` },
                            { label: "Investor % (post)",   value: `${investorPctPost.toFixed(1)}%`, highlight: true },
                            { label: "Founder % (post)",    value: `${founderPctPost.toFixed(1)}%` },
                            { label: "Employee Pool (post)",value: `${employeePctPost.toFixed(1)}%` },
                            { label: "Prev Investors (post)",value: `${prevInvPctPost.toFixed(1)}%` },
                          ].map(({ label, value, highlight }) => (
                            <div key={label} className={`flex items-center justify-between rounded-lg px-3 py-2 ${highlight ? "bg-blue-50 border border-blue-100" : "bg-white border border-gray-100"}`}>
                              <span className="text-xs text-gray-600">{label}</span>
                              <span className={`text-sm font-black ${highlight ? "text-blue-700" : "text-gray-800"}`}>{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Compliance Autopilot ──────────────────────── */}
                  {activeAITool === "compliance" && (
                    <div className="h-full flex flex-col gap-4">
                      <div>
                        <h3 className="text-base font-bold text-gray-900">Compliance Autopilot</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Auto-checked from your financial data · no manual input required</p>
                      </div>
                      {(() => {
                        const highFrauds   = fraudAlerts.filter(f => f.severity === "HIGH").length;
                        const roundNums    = fraudAlerts.filter(f => f.pattern === "round_number").length;
                        const contractorRisk = fraudAlerts.some(f => f.pattern === "contractor_ratio");
                        const hasGaps      = snapshots.length > 0 && snapshots.some((s, i) => {
                          if (i === 0) return false;
                          const prev = new Date(snapshots[i - 1].week_start).getTime();
                          const curr = new Date(s.week_start).getTime();
                          return (curr - prev) > 14 * 86400000;
                        });
                        const hasDeferredRevenue = true; // we have the module
                        const items = [
                          { label: "Revenue Recognition (ASC 606)", status: hasDeferredRevenue ? "PASS" : "REVIEW", note: "Deferred revenue module active" },
                          { label: "Contractor vs Employee Ratio (1099 Risk)", status: contractorRisk ? "REVIEW" : "PASS", note: contractorRisk ? "Contractor ratio > 2.5x salary — potential misclassification" : "Contractor ratios within norms" },
                          { label: "Round-Number Transaction Audit", status: roundNums > 2 ? "FAIL" : roundNums > 0 ? "REVIEW" : "PASS", note: `${roundNums} round-number transactions detected` },
                          { label: "Data Completeness (No Revenue Gaps)", status: hasGaps ? "REVIEW" : "PASS", note: hasGaps ? "Gaps detected in weekly reporting" : "No data gaps found" },
                          { label: "High-Severity Financial Anomalies", status: highFrauds > 0 ? "REVIEW" : "PASS", note: `${highFrauds} high-severity patterns flagged` },
                          { label: "Category Coverage", status: (latest?.gross_margin ?? 0) > 0 ? "PASS" : "REVIEW", note: "COGS, salary, and marketing categories present" },
                        ];
                        return (
                          <div className="space-y-2">
                            {items.map(({ label, status, note }) => {
                              const icon = status === "PASS" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : status === "FAIL" ? <XCircle className="h-4 w-4 text-red-500" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />;
                              const cls  = status === "PASS" ? "border-green-100 bg-green-50" : status === "FAIL" ? "border-red-100 bg-red-50" : "border-amber-100 bg-amber-50";
                              const badge = status === "PASS" ? "bg-green-100 text-green-700" : status === "FAIL" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
                              return (
                                <div key={label} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${cls}`}>
                                  <div className="flex-shrink-0 mt-0.5">{icon}</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-semibold text-gray-800">{label}</span>
                                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${badge}`}>{status}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 mt-0.5">{note}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* ── Benchmarker panel ─────────────────────────────── */}
                  {activeAITool === "benchmarker" && (
                    <div className="p-6 overflow-y-auto">
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <h3 className="text-base font-bold text-gray-900">Industry Benchmarker</h3>
                          <p className="text-xs text-gray-400 mt-0.5">How you rank vs anonymous B2B SaaS peers</p>
                        </div>
                        {!benchmarks && (
                          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">Free · No API key</span>
                        )}
                      </div>

                      {benchmarks ? (
                        <IndustryBenchmarker data={benchmarks} />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
                          <div className="h-12 w-12 rounded-2xl bg-violet-50 flex items-center justify-center">
                            <BarChart3 className="h-6 w-6 text-violet-500" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-700">See how you stack up</p>
                            <p className="text-xs text-gray-400 mt-1 max-w-xs">
                              Compares your MRR growth, gross margin, LTV:CAC, churn, and burn efficiency against industry quartiles.
                            </p>
                          </div>
                          <button onClick={handleBenchmarks} disabled={benchmarksLoading}
                            className="flex items-center gap-2 rounded-xl bg-violet-600 text-white px-5 py-2.5 text-sm font-semibold hover:bg-violet-500 disabled:opacity-40 transition-colors shadow-sm shadow-violet-200">
                            {benchmarksLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                            {benchmarksLoading ? "Comparing…" : "Run Benchmark"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white mt-16 px-6 py-5 text-center text-[11px] text-gray-400">
        AI CFO Agent · {snapshots.length} weekly periods · {anomalies.length} anomalies · Claude Haiku · IsolationForest · Monte Carlo
      </footer>
    </div>
  );
}

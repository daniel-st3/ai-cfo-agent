"use client";
import { useEffect, useRef, useState } from "react";
import { useMouse } from "@/hooks/use-mouse";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Sparkles, Zap, FileText, Loader2,
  TrendingUp, TrendingDown, Minus, Scale, Mail, Plug,
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
import { RunwayClock }                   from "@/components/runway-clock";
import { BoardPrep }                     from "@/components/board-prep";
import { CFOReport }                     from "@/components/cfo-report";
import { VCMemo }                        from "@/components/vc-memo";
import { InvestorUpdate }               from "@/components/investor-update";
import { CashFlowSection }               from "@/components/cash-flow-section";
import { DeferredRevenueCard }           from "@/components/deferred-revenue-card";
import { IntegrationsBar }               from "@/components/integrations-bar";
import { IntegrationsModal }             from "@/components/integrations-modal";
import { BoardDeckDownload }             from "@/components/board-deck-download";
import {
  getKPISeries, getAnomalies, getSignals,
  getBoardPrep, getReport, getVCMemo, getInvestorUpdate,
} from "@/lib/api";
import { fmtK, fmtPct } from "@/lib/utils";
import type {
  AnalyzeResponse, KPISnapshot, Anomaly, MarketSignal,
  SurvivalAnalysis, ScenarioResult, BoardQuestion, ReportData, VCMemoData, InvestorUpdateData,
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
}
function KPICard({ label, value, wow, sub, valueColor }: KPICardProps) {
  const up   = wow !== undefined && wow > 0.0001;
  const down = wow !== undefined && wow < -0.0001;
  return (
    <div className="card-metric card-hover tilt-card relative p-4 flex flex-col gap-1 h-full group cursor-default overflow-hidden">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 truncate">{label}</div>
      <div key={value} className={`text-2xl font-bold leading-none truncate mt-0.5 animate-number-pop ${valueColor ?? "text-gray-900"}`}>{value}</div>
      {wow !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-semibold mt-1 ${up ? "text-green-600" : down ? "text-red-500" : "text-gray-400"}`}>
          {up ? <TrendingUp className="h-3 w-3" /> : down ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {Math.abs(wow * 100).toFixed(1)}% WoW
        </div>
      )}
      {sub && <div className="text-[10px] text-gray-400 mt-0.5 leading-snug">{sub}</div>}
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
  const [snapshots,   setSnapshots]   = useState<KPISnapshot[]>([]);
  const [anomalies,   setAnomalies]   = useState<Anomaly[]>([]);
  const [signals,     setSignals]     = useState<MarketSignal[]>([]);
  const [survival,    setSurvival]    = useState<SurvivalAnalysis | null>(null);
  const [scenarios,   setScenarios]   = useState<ScenarioResult[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [sector,      setSector]      = useState("saas_productivity");

  /* ── AI generator state ───────────────────────────────────────── */
  const [boardQs,     setBoardQs]     = useState<BoardQuestion[] | null>(null);
  const [report,      setReport]      = useState<ReportData | null>(null);
  const [vcMemo,         setVcMemo]         = useState<VCMemoData | null>(null);
  const [investorUpdate, setInvestorUpdate] = useState<InvestorUpdateData | null>(null);

  /* ── UI loading state ─────────────────────────────────────────── */
  const [loading,               setLoading]               = useState(true);
  const [boardLoading,          setBoardLoading]          = useState(false);
  const [reportLoading,         setReportLoading]         = useState(false);
  const [vcMemoLoading,         setVcMemoLoading]         = useState(false);
  const [investorUpdateLoading, setInvestorUpdateLoading] = useState(false);
  const [error,                 setError]                 = useState<string | null>(null);

  /* ── Modal state ─────────────────────────────────────────────── */
  const [showIntegrationsModal, setShowIntegrationsModal] = useState(false);

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
        const [kpis, anoms, sigs] = await Promise.all([
          getKPISeries(runId), getAnomalies(runId), getSignals(runId),
        ]);
        setSnapshots(kpis);
        setAnomalies(anoms);
        setSignals(sigs);

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

      {/* ── Content ────────────────────────────────────────────────── */}
      <main ref={mainRef} className="mx-auto max-w-screen-xl px-4 sm:px-6 py-10 space-y-14">

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">{error}</div>
        )}

        {/* 1 · KPI COMMAND CENTER ─────────────────────────────────── */}
        <section className="section-enter">
          <SectionHeading label="KPI Command Center"
            sub={latest ? `Week of ${latest.week_start} · ${snapshots.length} weekly periods` : undefined} />
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((_, i) => <Skel key={i} h="h-28" />)}
            </div>
          ) : latest ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-stretch">
              <div className="section-enter stagger-1"><KPICard label="MRR / Week"   value={fmtK(latest.mrr)}     wow={wow.mrr}       sub={`ARR: ${fmtK(latest.arr)}`} /></div>
              <div className="section-enter stagger-2"><KPICard label="ARR"          value={fmtK(latest.arr)}     wow={wow.arr} /></div>
              <div className="section-enter stagger-3"><KPICard label="Burn / Week"  value={fmtK(latest.burn_rate)} wow={wow.burn_rate} valueColor="text-red-500" sub="Weekly cash out" /></div>
              <div className="section-enter stagger-4"><KPICard label="Gross Margin" value={fmtPct(Math.abs(latest.gross_margin))} wow={wow.gross_margin}
                valueColor={latest.gross_margin >= 0.4 ? "text-green-600" : "text-red-500"}
                sub={latest.gross_margin < 0 ? "Negative margin" : undefined} /></div>
              <div className="section-enter stagger-5"><KPICard label="Churn Rate"   value={fmtPct(latest.churn_rate)} wow={wow.churn_rate}
                valueColor={latest.churn_rate < 0.05 ? "text-green-600" : "text-amber-600"} /></div>
              <div className="section-enter stagger-6"><KPICard label="CAC"
                value={latest.cac > 0 ? fmtK(latest.cac) : "N/A"}
                wow={latest.cac > 0 ? wow.cac : undefined}
                valueColor={latest.cac > 0 ? "text-red-500" : "text-gray-400"} /></div>
              <div className="section-enter stagger-7"><KPICard label="LTV"
                value={latest.ltv > 0 ? fmtK(latest.ltv) : "N/A"}
                wow={latest.ltv > 0 ? wow.ltv : undefined}
                valueColor={latest.ltv > 0 ? "text-blue-600" : "text-gray-400"} /></div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No KPI data found.</p>
          )}
        </section>

        {/* 2 · RUNWAY COUNTDOWN ───────────────────────────────────── */}
        {!loading && survival && (
          <section className="section-enter">
            <RunwayClock
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
        <section className="section-enter">
          <SectionHeading
            label="13-Week Cash Position Forecast"
            sub="P10 / P50 / P90 balance bands · Monte Carlo N=500 · committed outflows"
          />
          <CashFlowSection runId={runId} />
        </section>

        {/* 4 · REVENUE & SURVIVAL ─────────────────────────────────── */}
        <section className="section-enter">
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
        <section className="section-enter">
          <SectionHeading label="Competitive Intelligence"
            sub="Real-time competitor signals · pricing changes · hiring signals · market news" />
          {loading ? <Skel h="h-64" /> : (
            <MarketIntelligence signals={signals} sector={sector} companyName={companyName} />
          )}
        </section>

        {/* 7 · SCENARIO STRESS TEST ───────────────────────────────── */}
        {!loading && scenarios.length > 0 && (
          <section className="section-enter">
            <SectionHeading label="Scenario Stress Test" sub="Bear · Base · Bull runway forecasts · Series A readiness" />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 items-stretch">
              <ScenarioBarsChart scenarios={scenarios} />
              <ScenarioCards    scenarios={scenarios} />
            </div>
          </section>
        )}

        {/* 8 · FINANCIAL DEEP DIVE ────────────────────────────────── */}
        <section className="section-enter">
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

        {/* 9 · ANOMALY DETECTION ──────────────────────────────────── */}
        <section className="section-enter">
          <SectionHeading label="Anomaly Detection"
            sub={anomalies.length > 0 ? `${highAnomalies} HIGH severity · IsolationForest ML · feature importance + detection timeline` : "All metrics within expected ranges"} />
          {loading ? <Skel h="h-48" /> : <AnomalyMLPanel anomalies={anomalies} snapshotCount={snapshots.length} />}
        </section>

        {/* 10 · AI INTELLIGENCE CENTER ─────────────────────────────── */}
        {!loading && (
          <section className="section-enter">
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

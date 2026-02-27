"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Sparkles, Zap, FileText, Loader2,
  TrendingUp, TrendingDown, Minus, Scale, Mail,
} from "lucide-react";
import { RevenueAreaChart }              from "@/components/charts/revenue-area";
import { SurvivalRadialChart }           from "@/components/charts/survival-radial";
import { ScenarioBarsChart, ScenarioCards } from "@/components/charts/scenario-bars";
import { RuinProbabilityChart }          from "@/components/charts/ruin-probability";
import { GrossMarginChart }              from "@/components/charts/gross-margin";
import { ChurnTrendChart }               from "@/components/charts/churn-trend";
import { MonteCarloFan }                 from "@/components/charts/monte-carlo-fan";
import { AnomalyTable }                  from "@/components/anomaly-table";
import { MarketIntelligence }            from "@/components/market-intelligence";
import { RunwayClock }                   from "@/components/runway-clock";
import { BoardPrep }                     from "@/components/board-prep";
import { CFOReport }                     from "@/components/cfo-report";
import { VCMemo }                        from "@/components/vc-memo";
import { InvestorUpdate }               from "@/components/investor-update";
import { getKPISeries, getAnomalies, getSignals, getBoardPrep, getReport, getVCMemo, getInvestorUpdate } from "@/lib/api";
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
  return <div className={`${h} w-full rounded-2xl bg-gray-100 animate-pulse`} />;
}

interface KPICardProps {
  label: string; value: string; wow?: number; sub?: string; valueColor?: string;
}
function KPICard({ label, value, wow, sub, valueColor }: KPICardProps) {
  const up   = wow !== undefined && wow > 0.0001;
  const down = wow !== undefined && wow < -0.0001;
  return (
    <div className="card-metric p-4 flex flex-col gap-1">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 truncate">{label}</div>
      <div className={`text-2xl font-bold leading-none truncate mt-0.5 ${valueColor ?? "text-gray-900"}`}>{value}</div>
      {wow !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-semibold mt-1 ${up ? "text-green-600" : down ? "text-red-500" : "text-gray-400"}`}>
          {up ? <TrendingUp className="h-3 w-3" /> : down ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {Math.abs(wow * 100).toFixed(1)}% WoW
        </div>
      )}
      {sub && <div className="text-[10px] text-gray-400 mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
}

export default function RunPage() {
  const { runId } = useParams<{ runId: string }>();
  const router    = useRouter();
  const mainRef   = useRef<HTMLDivElement>(null);

  const [snapshots,   setSnapshots]   = useState<KPISnapshot[]>([]);
  const [anomalies,   setAnomalies]   = useState<Anomaly[]>([]);
  const [signals,     setSignals]     = useState<MarketSignal[]>([]);
  const [survival,    setSurvival]    = useState<SurvivalAnalysis | null>(null);
  const [scenarios,   setScenarios]   = useState<ScenarioResult[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [sector,      setSector]      = useState("saas_productivity");
  const [boardQs,     setBoardQs]     = useState<BoardQuestion[] | null>(null);
  const [report,      setReport]      = useState<ReportData | null>(null);
  const [vcMemo,         setVcMemo]         = useState<VCMemoData | null>(null);
  const [investorUpdate, setInvestorUpdate] = useState<InvestorUpdateData | null>(null);
  const [loading,              setLoading]              = useState(true);
  const [boardLoading,         setBoardLoading]         = useState(false);
  const [reportLoading,        setReportLoading]        = useState(false);
  const [vcMemoLoading,        setVcMemoLoading]        = useState(false);
  const [investorUpdateLoading,setInvestorUpdateLoading]= useState(false);
  const [error,                setError]                = useState<string | null>(null);

  // Scroll-triggered animations — observe all .section-enter elements
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
      { threshold: 0.08 }
    );
    elements.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  });

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

  const latest = snapshots[snapshots.length - 1];
  const wow    = latest?.wow_delta ?? {};
  const highAnomalies = anomalies.filter(a => a.severity === "HIGH").length;

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

      {/* ── Header ─────────────────────────────────────────────── */}
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

      {/* ── Content ────────────────────────────────────────────── */}
      <main ref={mainRef} className="mx-auto max-w-screen-xl px-4 sm:px-6 py-10 space-y-14">

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-600">{error}</div>
        )}

        {/* KPI COMMAND CENTER */}
        <section className="section-enter">
          <SectionHeading label="KPI Command Center"
            sub={latest ? `Week of ${latest.week_start} · ${snapshots.length} weekly periods` : undefined} />
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((_, i) => <Skel key={i} h="h-28" />)}
            </div>
          ) : latest ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
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

        {/* RUNWAY COUNTDOWN */}
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

        {/* REVENUE & SURVIVAL */}
        <section className="section-enter">
          <SectionHeading label="Revenue & Survival" sub="MRR · ARR · burn rate trends · Monte Carlo survival score" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 items-stretch">
            <div className="lg:col-span-2 h-full">
              {loading ? <Skel h="h-80" /> : snapshots.length > 1
                ? <RevenueAreaChart snapshots={snapshots} />
                : <div className="card-brutal flex items-center justify-center h-80 text-gray-400 text-sm">Upload a multi-week CSV to see trends</div>}
            </div>
            <div className="h-full">
              {loading ? <Skel h="h-80" /> : survival
                ? <SurvivalRadialChart survival={survival} />
                : <div className="card-brutal flex flex-col items-center justify-center h-80 gap-3 text-center p-6">
                    <div className="text-5xl font-bold text-gray-200">—</div>
                    <p className="text-xs text-gray-400">Run via upload page to compute survival.</p>
                  </div>}
            </div>
          </div>
        </section>

        {/* MONTE CARLO FAN CHART */}
        {!loading && scenarios.length > 0 && latest && (
          <section className="section-enter">
            <SectionHeading label="Monte Carlo Revenue Simulation"
              sub="150 stochastic paths · 18-month horizon · probability fan" />
            <MonteCarloFan snapshots={snapshots} scenarios={scenarios} latestMRR={latest.mrr} />
          </section>
        )}

        {/* COMPETITIVE INTELLIGENCE — elevated position */}
        <section className="section-enter">
          <SectionHeading label="Competitive Intelligence"
            sub="Real-time competitor signals · pricing changes · hiring signals · market news" />
          {loading ? <Skel h="h-64" /> : (
            <MarketIntelligence signals={signals} sector={sector} companyName={companyName} />
          )}
        </section>

        {/* SCENARIO STRESS TEST */}
        {!loading && scenarios.length > 0 && (
          <section className="section-enter">
            <SectionHeading label="Scenario Stress Test" sub="Bear · Base · Bull runway forecasts · Series A readiness" />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 items-stretch">
              <ScenarioBarsChart scenarios={scenarios} />
              <ScenarioCards    scenarios={scenarios} />
            </div>
          </section>
        )}

        {/* FINANCIAL DEEP DIVE */}
        <section className="section-enter">
          <SectionHeading label="Financial Deep Dive" sub="Gross margin · churn rate · ruin probability" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-stretch">
            {loading ? (
              <><Skel h="h-64" /><Skel h="h-64" /><Skel h="h-64" /></>
            ) : (
              <>
                <GrossMarginChart snapshots={snapshots} />
                <ChurnTrendChart  snapshots={snapshots} />
                {survival
                  ? <RuinProbabilityChart survival={survival} />
                  : <div className="card-brutal flex items-center justify-center h-64 text-gray-400 text-sm">Ruin data unavailable</div>}
              </>
            )}
          </div>
        </section>

        {/* ANOMALY DETECTION */}
        <section className="section-enter">
          <SectionHeading label="Anomaly Detection"
            sub={anomalies.length > 0 ? `${highAnomalies} HIGH severity · IsolationForest ML model` : "All metrics within expected ranges"} />
          {loading ? <Skel h="h-48" /> : <AnomalyTable anomalies={anomalies} />}
        </section>

        {/* AI INTELLIGENCE CENTER — all 4 generators side-by-side */}
        {!loading && (
          <section className="section-enter">
            <SectionHeading label="AI Intelligence Center"
              sub="Board Q&A · CFO Report · VC Verdict · Investor Update · Claude Haiku · ~$0.003/call" />

            {/* 4-card generator grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/* Board Q&A */}
              <div className="card-brutal p-5 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Zap className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">Board Q&A</div>
                    <div className="text-[10px] text-gray-400">Adversarial prep</div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 leading-snug flex-1">
                  Generates tough investor questions with pre-drafted CFO answers.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">~$0.005 · Haiku</span>
                  <button onClick={handleBoardPrep} disabled={boardLoading || loading}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-[11px] font-semibold hover:bg-blue-500 disabled:opacity-40 transition-colors">
                    {boardLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                    {boardLoading ? "…" : boardQs ? "Regenerate" : "Generate"}
                  </button>
                </div>
              </div>

              {/* CFO Report */}
              <div className="card-brutal p-5 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-gray-600" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">CFO Report</div>
                    <div className="text-[10px] text-gray-400">Full briefing</div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 leading-snug flex-1">
                  Executive briefing with market snapshot, risks, and recommendations.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">~$0.005 · Haiku</span>
                  <button onClick={handleReport} disabled={reportLoading || loading}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 px-3 py-1.5 text-[11px] font-semibold hover:border-gray-300 disabled:opacity-40 transition-colors">
                    {reportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                    {reportLoading ? "…" : report ? "Regenerate" : "Generate"}
                  </button>
                </div>
              </div>

              {/* VC Verdict */}
              <div className={`card-brutal p-5 flex flex-col gap-3 ${!survival ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Scale className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">VC Verdict</div>
                    <div className="text-[10px] text-gray-400">PASS / WATCH / INVEST</div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 leading-snug flex-1">
                  Internal IC memo a top-tier VC would write. Brutally honest.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">~$0.003 · Haiku</span>
                  <button onClick={handleVCMemo} disabled={vcMemoLoading || !survival}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-500 text-white px-3 py-1.5 text-[11px] font-semibold hover:bg-amber-400 disabled:opacity-40 transition-colors">
                    {vcMemoLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Scale className="h-3 w-3" />}
                    {vcMemoLoading ? "…" : vcMemo ? "Regenerate" : "Generate"}
                  </button>
                </div>
              </div>

              {/* Investor Update */}
              <div className={`card-brutal p-5 flex flex-col gap-3 ${!survival ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                    <Mail className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">Investor Update</div>
                    <div className="text-[10px] text-gray-400">Copy-paste ready email</div>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 leading-snug flex-1">
                  Monthly investor email grounded in your actual MRR, burn, and runway.
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">~$0.003 · Haiku</span>
                  <button onClick={handleInvestorUpdate} disabled={investorUpdateLoading || !survival}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-[11px] font-semibold hover:bg-blue-500 disabled:opacity-40 transition-colors">
                    {investorUpdateLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                    {investorUpdateLoading ? "…" : investorUpdate ? "Regenerate" : "Generate"}
                  </button>
                </div>
              </div>
            </div>

            {/* Generated outputs — full-width panels */}
            <div className="space-y-6">
              {boardQs && <BoardPrep questions={boardQs} />}
              {report   && <CFOReport report={report} />}
              {vcMemo   && <VCMemo memo={vcMemo} />}
              {investorUpdate && <InvestorUpdate update={investorUpdate} companyName={companyName} />}
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

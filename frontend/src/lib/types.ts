export interface KPIData {
  mrr: number;
  arr: number;
  churn_rate: number;
  burn_rate: number;
  gross_margin: number;
  cac: number;
  ltv: number;
  wow_delta: Record<string, number>;
  mom_delta: Record<string, number>;
  week_start?: string;
}

export interface KPISnapshot extends KPIData {
  week_start: string;
}

export interface Anomaly {
  metric: string;
  actual_value: number;
  expected_range: { low: number; median: number; high: number };
  severity: "LOW" | "MEDIUM" | "HIGH";
  source: string;
  description: string;
}

export interface SurvivalAnalysis {
  score: number;
  label: "SAFE" | "LOW_RISK" | "MODERATE_RISK" | "HIGH_RISK" | "CRITICAL";
  probability_ruin_90d: number;
  probability_ruin_180d: number;
  probability_ruin_365d: number;
  expected_zero_cash_day: number;
  fundraising_deadline: string | null;
}

export interface ScenarioResult {
  scenario: "bear" | "base" | "bull";
  months_runway: number;
  projected_mrr_6mo: number;
  series_a_readiness: "READY" | "6_MONTHS" | "NOT_READY";
  key_risks: string[];
  recommended_actions: string[];
}

export interface MarketSignal {
  competitor_name: string;
  signal_type: "pricing_change" | "job_posting" | "news";
  summary: string;
  raw_source_url: string | null;
  date: string;
}

export interface BoardQuestion {
  question: string;
  danger: "RED" | "YELLOW" | "GREEN";
  answer: string;
  follow_up: string;
}

export interface AnalyzeResponse {
  run_id: string;
  kpis: KPIData;
  anomalies: Anomaly[];
  survival_analysis: SurvivalAnalysis | null;
  scenario_analysis: ScenarioResult[] | null;
  status: string;
  company_name?: string;
  sector?: string;
}

export interface CompetitorProfile {
  name: string;
  domain: string;
  sector: string;
  logo_url: string;          // https://logo.clearbit.com/{domain}
  description: string;       // Wikipedia short description
  extract: string;           // Wikipedia extract (first 280 chars)
  thumbnail: string | null;  // Wikipedia image
  pricing_url: string | null;
}

export interface PipelineStep {
  id: string;
  label: string;
  detail: string;
}

export interface PipelineStatus {
  run_id: string;
  steps: PipelineStep[];
  complete: boolean;
  raw_count: number;
  kpi_count: number;
}

export interface ReportData {
  run_id: string;
  executive_summary: string;
  full_report_markdown: string;
  looker_url: string;
}

export interface BoardPrepResponse {
  run_id: string;
  questions: BoardQuestion[];
}

export interface VCMemoData {
  recommendation: "PASS" | "WATCH" | "INVEST";
  headline: string;
  memo: string;
  red_flags: string[];
  what_would_change_our_mind: string[];
}

export interface InvestorUpdateData {
  subject: string;
  greeting: string;
  metrics_block: string;
  wins: string[];
  challenges: string[];
  next_30_days: string[];
  asks: string[];
  closing: string;
}

// ── Cash Flow Forecast ─────────────────────────────────────────────────────

export interface CashFlowForecastWeek {
  week_offset: number;
  week_start: string;
  predicted_balance_p10: number;
  predicted_balance_p50: number;
  predicted_balance_p90: number;
  expected_inflows: number;
  expected_outflows: number;
}

export interface CashFlowCommittedExpense {
  id: string;
  name: string;
  amount: number;
  frequency: "weekly" | "monthly" | "quarterly" | "annual";
  next_payment_date: string;
  category: string;
}

export interface CashFlowSectionData {
  run_id: string;
  current_cash: number;
  total_committed_weekly: number;
  weeks_until_zero_p50: number | null;
  forecast: CashFlowForecastWeek[];
  committed_expenses: CashFlowCommittedExpense[];
}

// ── Deferred Revenue ───────────────────────────────────────────────────────

export interface DeferredRevenueMonth {
  month_start: string;
  recognized_revenue: number;
  deferred_balance: number;
}

export interface ContractItem {
  id: string;
  run_id: string;
  customer_id: string;
  total_value: number;
  start_date: string;
  end_date: string;
  payment_terms: string;
}

export interface DeferredRevenueSummary {
  run_id: string;
  total_deferred_balance: number;
  current_month_recognized: number;
  contract_count: number;
  schedule_next_12_months: DeferredRevenueMonth[];
  contracts: ContractItem[];
}

// ── Board Deck ─────────────────────────────────────────────────────────────

export interface BoardDeckStatus {
  deck_id: string | null;
  run_id: string;
  status: "not_started" | "generating" | "ready" | "failed";
  generated_at: string | null;
  download_url: string | null;
}

// ── Integrations ───────────────────────────────────────────────────────────

export interface IntegrationStatus {
  platform: "stripe" | "quickbooks";
  status: "active" | "pending" | "error" | "not_connected";
  company_name?: string;
  last_sync_at: string | null;
  rows_synced: number;
}

// ── Fraud Detection ─────────────────────────────────────────────────────────

export interface FraudAlert {
  week_start: string;
  category: string;
  pattern: "round_number" | "velocity_spike" | "duplicate_amount" | "zero_revenue_week" | "contractor_ratio";
  severity: "LOW" | "MEDIUM" | "HIGH";
  amount: number;
  description: string;
}

// ── Pre-mortem ─────────────────────────────────────────────────────────────

export interface PreMortemScenario {
  scenario_type: "financial" | "market" | "operational";
  title: string;
  probability_pct: number;
  primary_cause: string;
  warning_signs: string[];
  prevention_actions: string[];
  months_to_crisis: number;
}

// ── Board Chat ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Industry Benchmarker ────────────────────────────────────────────────────

export interface BenchmarkMetric {
  p25: number;
  p50: number;
  p75: number;
  higher_better: boolean;
  label: string;
  unit: string;
}

export interface BenchmarkResult {
  sector: string;
  benchmarks: Record<string, BenchmarkMetric>;
  your_metrics: Record<string, number>;
  percentiles: Record<string, number>;
}

// ── Customer Profitability ──────────────────────────────────────────────────

export interface CustomerProfile {
  customer_id: string;
  total_revenue: number;
  weeks_active: number;
  avg_weekly_revenue: number;
  first_seen: string;
  last_seen: string;
  churn_flag: boolean;
  segment: "Enterprise" | "Mid" | "SMB";
  revenue_pct: number;
}

// ── Morning CFO Briefing ────────────────────────────────────────────────────

export interface MorningBriefingData {
  company_name: string;
  runway_months: number;
  burn_rate: number;
  prev_burn: number;
  mrr: number;
  prev_mrr: number;
  burn_change_pct: number;
  mrr_change_pct: number;
  gross_margin_pct: number;
  churn_pct: number;
  ltv_cac: number;
  urgent: string[];
  good_news: string[];
  actions: string[];
  week_start: string;
}

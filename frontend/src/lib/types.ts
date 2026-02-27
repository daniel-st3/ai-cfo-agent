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

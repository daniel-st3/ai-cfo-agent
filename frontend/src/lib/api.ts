import type {
  AnalyzeResponse,
  BoardDeckStatus,
  CashFlowSectionData,
  DeferredRevenueSummary,
  IntegrationStatus,
  PipelineStatus,
  BoardPrepResponse,
  ReportData,
  CompetitorProfile,
  VCMemoData,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Check if API is reachable */
export async function checkHealth(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/health`, { cache: "no-store" });
    return r.ok;
  } catch {
    return false;
  }
}

/** Start demo in background → returns run_id immediately */
export async function startDemo(
  companyName = "",
  sector = "saas_productivity",
): Promise<{ run_id: string; status: string }> {
  return apiFetch("/demo/async", { method: "POST" });
}

/** Start file analysis in background → returns run_id immediately */
export async function startAnalysis(
  file: File,
  companyName = "",
  sector = "saas_productivity",
): Promise<{ run_id: string; status: string }> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch("/analyze/async", { method: "POST", body: form });
}

/** Run demo synchronously (for dashboard data after pipeline done) */
export async function runDemoSync(
  companyName = "Acme SaaS Co.",
  sector = "saas_productivity",
): Promise<AnalyzeResponse> {
  const params = new URLSearchParams({ company_name: companyName, sector });
  return apiFetch(`/demo?${params}`, { method: "POST" });
}

/** Run file analysis synchronously */
export async function runAnalysisSync(
  file: File,
  companyName = "",
  sector = "saas_productivity",
): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("company_name", companyName);
  form.append("sector", sector);
  return apiFetch("/analyze", { method: "POST", body: form });
}

/** Poll pipeline status */
export async function pollStatus(runId: string): Promise<PipelineStatus> {
  return apiFetch(`/runs/${runId}/status`);
}

/** Get board prep Q&A */
export async function getBoardPrep(runId: string): Promise<BoardPrepResponse> {
  return apiFetch("/board-prep", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId }),
  });
}

/** Get CFO report */
export async function getReport(runId: string): Promise<ReportData> {
  return apiFetch("/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ run_id: runId }),
  });
}

/** Get full KPI time series for a run (all weekly snapshots) */
export async function getKPISeries(runId: string): Promise<import("./types").KPISnapshot[]> {
  return apiFetch(`/runs/${runId}/kpis`);
}

/** Get all anomalies for a run */
export async function getAnomalies(runId: string): Promise<import("./types").Anomaly[]> {
  return apiFetch(`/runs/${runId}/anomalies`);
}

/** Get all market signals for a run */
export async function getSignals(runId: string): Promise<import("./types").MarketSignal[]> {
  return apiFetch(`/runs/${runId}/signals`);
}

/** Get competitor profiles for a sector — Wikipedia + Clearbit logos, fully free */
export async function getSectorCompetitors(sector: string): Promise<CompetitorProfile[]> {
  return apiFetch(`/sectors/${sector}/competitors`);
}

/** Generate a ready-to-send monthly investor update email — uses Claude Haiku (~$0.003/call) */
export async function getInvestorUpdate(
  runId: string,
  monthsRunway: number,
  survivalScore: number,
  companyName: string,
  sector: string,
): Promise<import("./types").InvestorUpdateData> {
  return apiFetch("/investor-update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      run_id: runId,
      company_name: companyName,
      sector,
      months_runway: monthsRunway,
      survival_score: survivalScore,
    }),
  });
}

/** Generate a VC investment committee memo — uses Claude Haiku (~$0.003/call) */
export async function getVCMemo(
  runId: string,
  monthsRunway: number,
  survivalScore: number,
  ruinProb6m: number,
  companyName: string,
  sector: string,
): Promise<VCMemoData> {
  return apiFetch("/vc-memo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      run_id: runId,
      company_name: companyName,
      sector,
      months_runway: monthsRunway,
      survival_score: survivalScore,
      ruin_probability_6m: ruinProb6m,
    }),
  });
}

// ── Cash Flow Forecast ─────────────────────────────────────────────────────

/** Get the 13-week cash flow forecast (auto-computed from KPI + committed expenses) */
export async function getCashFlow(runId: string): Promise<CashFlowSectionData> {
  return apiFetch(`/runs/${runId}/forecast/cash-flow`);
}

/** Set current cash balance */
export async function setCashBalance(
  runId: string,
  balance: number,
  asOfDate?: string,
): Promise<void> {
  await apiFetch(`/runs/${runId}/cash-balance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ balance, as_of_date: asOfDate ?? new Date().toISOString().split("T")[0] }),
  });
}

/** Add a recurring committed expense */
export async function addCommittedExpense(
  runId: string,
  expense: {
    name: string;
    amount: number;
    frequency: "weekly" | "monthly" | "quarterly" | "annual";
    next_payment_date: string;
    category?: string;
  },
): Promise<void> {
  await apiFetch(`/runs/${runId}/committed-expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(expense),
  });
}

/** Refresh the 13-week forecast from latest data */
export async function refreshForecast(runId: string): Promise<CashFlowSectionData> {
  return apiFetch(`/runs/${runId}/forecast/refresh`, { method: "POST" });
}

// ── Deferred Revenue ───────────────────────────────────────────────────────

/** Get deferred revenue summary and 12-month schedule */
export async function getDeferredRevenue(runId: string): Promise<DeferredRevenueSummary> {
  return apiFetch(`/runs/${runId}/deferred-revenue`);
}

/** Create a new annual/multi-year contract */
export async function addContract(
  runId: string,
  contract: {
    customer_id: string;
    total_value: number;
    start_date: string;
    end_date: string;
    payment_terms: "annual" | "quarterly" | "monthly";
  },
): Promise<{ id: string; customer_id: string }> {
  return apiFetch(`/runs/${runId}/contracts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(contract),
  });
}

// ── Board Deck ─────────────────────────────────────────────────────────────

/** Trigger async board deck generation */
export async function generateBoardDeck(
  runId: string,
  companyName?: string,
): Promise<{ deck_id: string; run_id: string; status: string }> {
  const params = companyName ? `?company_name=${encodeURIComponent(companyName)}` : "";
  return apiFetch(`/runs/${runId}/board-deck/generate${params}`, { method: "POST" });
}

/** Poll board deck generation status */
export async function getBoardDeckStatus(runId: string): Promise<BoardDeckStatus> {
  return apiFetch(`/runs/${runId}/board-deck/status`);
}

/** Return the download URL for the generated board deck */
export function getBoardDeckDownloadUrl(runId: string): string {
  const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return `${BASE}/runs/${runId}/board-deck/download`;
}

// ── Integrations ───────────────────────────────────────────────────────────

/** Get status of all integrations */
export async function getIntegrations(): Promise<IntegrationStatus[]> {
  return apiFetch("/integrations/status");
}

/** Get Stripe OAuth authorization URL */
export async function getStripeAuthUrl(): Promise<{ authorization_url: string; demo_mode: boolean }> {
  return apiFetch("/integrations/stripe/authorize");
}

/** Get QuickBooks OAuth authorization URL */
export async function getQuickBooksAuthUrl(): Promise<{ authorization_url: string; demo_mode: boolean }> {
  return apiFetch("/integrations/quickbooks/authorize");
}

/** Sync Stripe data for a run */
export async function syncStripe(runId: string): Promise<{ rows_synced: number; status: string; message: string }> {
  return apiFetch(`/runs/${runId}/integrations/stripe/sync`, { method: "POST" });
}

/** Sync QuickBooks data for a run */
export async function syncQuickBooks(runId: string): Promise<{ rows_synced: number; status: string; message: string }> {
  return apiFetch(`/runs/${runId}/integrations/quickbooks/sync`, { method: "POST" });
}

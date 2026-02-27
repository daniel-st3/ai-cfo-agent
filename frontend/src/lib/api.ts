import type {
  AnalyzeResponse,
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

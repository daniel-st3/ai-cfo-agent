"use client";
import { useCallback, useEffect, useState } from "react";
import { Bot, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { getHealthScore } from "@/lib/api";
import type { HealthScoreData } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(isoTimestamp: string): string {
  const diff = Math.floor((Date.now() - new Date(isoTimestamp).getTime()) / 1000);
  if (diff < 10)  return "just now";
  if (diff < 60)  return `${diff} seconds ago`;
  if (diff < 120) return "1 minute ago";
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  return `${Math.floor(diff / 3600)} hours ago`;
}

type Status = HealthScoreData["status"];

const STATUS_META: Record<Status, { label: string; emoji: string; text: string; bg: string; border: string; progress: string }> = {
  healthy:  { label: "Healthy",  emoji: "✅", text: "text-green-700", bg: "bg-green-50",  border: "border-green-200", progress: "bg-green-500" },
  warning:  { label: "Warning",  emoji: "⚠️", text: "text-amber-700", bg: "bg-amber-50",  border: "border-amber-200", progress: "bg-amber-500"  },
  critical: { label: "Critical", emoji: "🚨", text: "text-red-700",   bg: "bg-red-50",    border: "border-red-200",   progress: "bg-red-500"    },
};

function pillColor(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-700 border-green-200";
  if (score >= 60) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-red-100 text-red-700 border-red-200";
}

const COMPONENT_LABELS: Record<keyof HealthScoreData["components"], string> = {
  runway:          "Runway",
  burn_stability:  "Burn",
  revenue_growth:  "Revenue",
  unit_economics:  "Unit Econ",
  risk_factors:    "Risk",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  runId: string;
}

export function HealthScoreCard({ runId }: Props) {
  const [data, setData]       = useState<HealthScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick]       = useState(0); // triggers timestamp re-render

  const fetchScore = useCallback(async (force = false) => {
    try {
      if (force) setRefreshing(true);
      const result = await getHealthScore(runId, force);
      setData(result);
    } catch {
      // keep previous data on error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [runId]);

  useEffect(() => {
    fetchScore();
  }, [fetchScore]);

  // Re-render timestamp every 30 seconds
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-md bg-gray-200 animate-pulse" />
            <div className="h-4 w-44 rounded bg-gray-200 animate-pulse" />
          </div>
        </div>
        <div className="flex items-end gap-4 mb-4">
          <div className="h-14 w-28 rounded-lg bg-gray-200 animate-pulse" />
          <div className="flex-1 h-3 rounded-full bg-gray-200 animate-pulse" />
          <div className="h-7 w-20 rounded-full bg-gray-200 animate-pulse" />
        </div>
        <div className="flex gap-2 mb-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-6 w-20 rounded-full bg-gray-100 animate-pulse" />
          ))}
        </div>
        <div className="h-20 rounded-xl bg-purple-50 animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  const meta = STATUS_META[data.status];

  return (
    <div className={cn("rounded-2xl border bg-white p-6 shadow-sm transition-all", meta.border)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className={cn("flex h-6 w-6 items-center justify-center rounded-lg", meta.bg)}>
            <span className="text-sm">💯</span>
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Financial Health Score</h2>
          {data.cached && (
            <span className="text-[10px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
              cached
            </span>
          )}
        </div>
        <button
          onClick={() => fetchScore(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-all hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Score row */}
      <div className="flex items-center gap-4 mb-4">
        {/* Large score number */}
        <div className={cn("text-5xl font-bold tabular-nums leading-none", meta.text)}>
          {data.score}
          <span className="text-xl font-normal text-gray-400">/100</span>
        </div>

        {/* Progress bar */}
        <div className="flex-1">
          <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700", meta.progress)}
              style={{ width: `${data.score}%` }}
            />
          </div>
        </div>

        {/* Status badge */}
        <span className={cn(
          "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
          meta.bg, meta.border, meta.text,
        )}>
          <span>{meta.emoji}</span>
          {meta.label}
        </span>
      </div>

      {/* Component breakdown pills */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(Object.entries(data.components) as [keyof HealthScoreData["components"], number][]).map(([key, val]) => (
          <span
            key={key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              pillColor(val),
            )}
          >
            <span className="text-[10px] font-normal text-current opacity-70">{COMPONENT_LABELS[key]}</span>
            {val}
          </span>
        ))}
      </div>

      {/* AI Reasoning box */}
      <div className="rounded-xl border border-purple-200 bg-purple-50 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-purple-100">
          <Bot className="h-3.5 w-3.5 text-purple-600 flex-shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-purple-700">
            Live Agent Analysis
          </span>
          <span className="ml-auto flex items-center gap-1 text-[10px] font-mono text-purple-500">
            <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse inline-block" />
            Claude Haiku
          </span>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm leading-relaxed text-purple-900">{data.reasoning}</p>
          <p className="mt-2 text-[10px] text-purple-400 font-mono" suppressHydrationWarning>
            Last updated: {relativeTime(data.timestamp)}
          </p>
        </div>
      </div>
    </div>
  );
}

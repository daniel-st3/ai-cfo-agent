"use client";
import { useCallback, useEffect, useState } from "react";
import { Bot, CheckCircle, Clock, RefreshCw, XCircle, AlertTriangle, Zap } from "lucide-react";
import {
  approveAgentAction,
  getAgentStatus,
  rejectAgentAction,
  triggerAgentCycle,
} from "@/lib/api";
import type { AgentActionItem, AgentCycleResult, AgentStatus } from "@/lib/types";
import { fmtK } from "@/lib/utils";

interface Props {
  runId: string;
  companyName: string;
  sector: string;
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ running, planType }: { running: boolean; planType: string }) {
  if (running) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[10px] font-black tracking-wider bg-blue-100 text-blue-700 border-blue-200">
        <RefreshCw className="h-2.5 w-2.5 animate-spin" /> RUNNING
      </span>
    );
  }
  if (planType === "critical_runway") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[10px] font-black tracking-wider bg-red-100 text-red-700 border-red-200">
        ☠ CRITICAL
      </span>
    );
  }
  if (planType === "warning_runway" || planType === "burn_spike") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[10px] font-black tracking-wider bg-amber-100 text-amber-700 border-amber-200">
        ⚠ WARNING
      </span>
    );
  }
  if (planType === "all_clear") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[10px] font-black tracking-wider bg-green-100 text-green-700 border-green-200">
        ✓ ALL CLEAR
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[10px] font-black tracking-wider bg-gray-100 text-gray-500 border-gray-200">
      IDLE
    </span>
  );
}

// ── Action status badge ───────────────────────────────────────────────────────
function ActionBadge({ status }: { status: AgentActionItem["status"] }) {
  const map: Record<string, { color: string; label: string }> = {
    executed:         { color: "bg-green-100 text-green-700", label: "Executed" },
    pending_approval: { color: "bg-amber-100 text-amber-700", label: "Awaiting approval" },
    approved:         { color: "bg-blue-100 text-blue-700", label: "Approved" },
    rejected:         { color: "bg-gray-100 text-gray-500", label: "Rejected" },
    failed:           { color: "bg-red-100 text-red-600", label: "Failed" },
    skipped:          { color: "bg-gray-100 text-gray-400", label: "Skipped" },
  };
  const { color, label } = map[status] ?? map.skipped;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${color}`}>{label}</span>
  );
}

// ── Action type label ─────────────────────────────────────────────────────────
function actionLabel(type: string): string {
  const labels: Record<string, string> = {
    log_alert:                "Alert logged",
    send_slack_webhook:       "Slack notification",
    send_email:               "Email sent",
    generate_vc_memo:         "VC memo generated",
    generate_investor_update: "Investor update generated",
    create_approval:          "Approval requested",
  };
  return labels[type] ?? type.replace(/_/g, " ");
}

// ── Approval card ─────────────────────────────────────────────────────────────
function ApprovalCard({
  action,
  onApprove,
  onReject,
}: {
  action: AgentActionItem;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="text-xs font-bold text-amber-800 mb-0.5">Awaiting Your Approval</div>
          <div className="text-[11px] text-amber-700 leading-relaxed">
            {action.approval_message ?? "Agent wants to take an action requiring your approval."}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={async () => {
            setBusy(true);
            await onApprove(action.id);
            setBusy(false);
          }}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-green-600 py-2 text-[11px] font-bold text-white hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          <CheckCircle className="h-3 w-3" /> Approve
        </button>
        <button
          onClick={async () => {
            setBusy(true);
            await onReject(action.id);
            setBusy(false);
          }}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white py-2 text-[11px] font-semibold text-gray-600 hover:border-gray-300 transition-colors disabled:opacity-50"
        >
          <XCircle className="h-3 w-3" /> Reject
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function AutonomousAgentSection({ runId, companyName, sector }: Props) {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [lastResult, setLastResult] = useState<AgentCycleResult | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await getAgentStatus(runId);
      setStatus(s);
    } catch {
      // API not yet active — show empty state
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleRunCycle = async () => {
    setRunning(true);
    try {
      const result = await triggerAgentCycle(runId, companyName, sector);
      setLastResult(result);
      await fetchStatus();
    } catch {
      // show error in UI
    } finally {
      setRunning(false);
    }
  };

  const handleApprove = async (actionId: string) => {
    await approveAgentAction(actionId);
    await fetchStatus();
  };

  const handleReject = async (actionId: string) => {
    await rejectAgentAction(actionId);
    await fetchStatus();
  };

  const obs = status?.latest_observation;
  const pending = status?.pending_approvals ?? [];
  const recentActions = status?.recent_actions ?? [];
  const planType = lastResult?.plan_type ?? "idle";

  return (
    <div className="grid grid-cols-3 gap-5 items-start">
      {/* ── Left: Observation + Controls ─────────────────────────────────── */}
      <div className="col-span-1 space-y-4">
        {/* Header card */}
        <div className="card-brutal p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                <Bot className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Autonomous CFO</div>
                <div className="text-xs text-gray-500">AI agent monitoring 24/7</div>
              </div>
            </div>
            <StatusPill running={running} planType={planType} />
          </div>

          {/* Latest observation metrics */}
          {obs ? (
            <div className="space-y-2.5 mb-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-2.5">
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide">Runway</div>
                  <div className={`text-sm font-black tabular-nums ${
                    obs.runway_months < 3 ? "text-red-500" :
                    obs.runway_months < 6 ? "text-amber-500" : "text-green-600"
                  }`}>
                    {obs.runway_months.toFixed(1)} mo
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-2.5">
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide">Burn</div>
                  <div className="text-sm font-black tabular-nums text-gray-800">
                    {fmtK(obs.burn_rate)}/wk
                  </div>
                  <div className={`text-[9px] font-semibold ${obs.burn_change_pct > 0 ? "text-red-400" : "text-green-500"}`}>
                    {obs.burn_change_pct > 0 ? "+" : ""}{obs.burn_change_pct.toFixed(1)}% WoW
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-2.5">
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide">MRR</div>
                  <div className="text-sm font-black tabular-nums text-gray-800">
                    {fmtK(obs.mrr)}/wk
                  </div>
                  <div className={`text-[9px] font-semibold ${obs.mrr_change_pct >= 0 ? "text-green-500" : "text-red-400"}`}>
                    {obs.mrr_change_pct >= 0 ? "+" : ""}{obs.mrr_change_pct.toFixed(1)}% WoW
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-2.5">
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide">Signals</div>
                  <div className="text-sm font-black tabular-nums text-gray-800">
                    {obs.active_anomalies_count} anomal
                  </div>
                  <div className="text-[9px] text-gray-400">
                    {obs.fraud_alerts_count} fraud alert{obs.fraud_alerts_count !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
              <div className="text-[9px] text-gray-400 text-center">
                Last observed {new Date(obs.observed_at).toLocaleString("en-US", {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </div>
            </div>
          ) : loading ? (
            <div className="text-xs text-gray-400 text-center py-4">Loading agent state...</div>
          ) : (
            <div className="text-xs text-gray-400 text-center py-4">
              No observations yet. Run your first agent cycle below.
            </div>
          )}

          {/* Run button */}
          <button
            onClick={handleRunCycle}
            disabled={running}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {running ? (
              <><RefreshCw className="h-3 w-3 animate-spin" /> Agent is thinking...</>
            ) : (
              <><Zap className="h-3 w-3" /> Run Agent Cycle</>
            )}
          </button>

          {lastResult && (
            <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 p-3 text-[10px] text-gray-500 space-y-0.5">
              <div><span className="font-semibold text-gray-700">Decision:</span> {lastResult.decision_tool.replace(/_/g, " ")}</div>
              <div><span className="font-semibold text-gray-700">Plan:</span> {lastResult.plan_goal || lastResult.plan_type}</div>
              {lastResult.decision_reasoning && (
                <div className="text-gray-400 italic mt-1">{lastResult.decision_reasoning}</div>
              )}
              <div className="flex gap-3 mt-1.5">
                <span className="text-green-600">{lastResult.actions_executed} executed</span>
                {lastResult.actions_pending_approval > 0 && (
                  <span className="text-amber-600">{lastResult.actions_pending_approval} pending</span>
                )}
                {lastResult.actions_failed > 0 && (
                  <span className="text-red-500">{lastResult.actions_failed} failed</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Pending approvals */}
        {pending.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 px-0.5">
              Awaiting Approval ({pending.length})
            </div>
            {pending.map(action => (
              <ApprovalCard
                key={action.id}
                action={action}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Right: Action Feed ─────────────────────────────────────────────── */}
      <div className="col-span-2 card-brutal p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Action Feed</div>
            <div className="text-xs text-gray-500 mt-0.5">Everything the agent has done</div>
          </div>
          <button
            onClick={fetchStatus}
            className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-gray-600 transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>

        {recentActions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="h-10 w-10 text-gray-200 mb-3" />
            <div className="text-sm font-semibold text-gray-400">No actions yet</div>
            <div className="text-xs text-gray-300 mt-1">
              Click &ldquo;Run Agent Cycle&rdquo; to start autonomous monitoring
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {recentActions.map(action => (
              <div
                key={action.id}
                className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3"
              >
                {/* Icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {action.status === "executed" ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : action.status === "pending_approval" ? (
                    <Clock className="h-4 w-4 text-amber-500" />
                  ) : action.status === "rejected" ? (
                    <XCircle className="h-4 w-4 text-gray-400" />
                  ) : action.status === "failed" ? (
                    <XCircle className="h-4 w-4 text-red-400" />
                  ) : (
                    <Bot className="h-4 w-4 text-blue-400" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-gray-700">
                      {actionLabel(action.action_type)}
                    </span>
                    <ActionBadge status={action.status} />
                  </div>

                  {/* Alert details */}
                  {action.action_type === "log_alert" && action.result?.data != null && (
                    <div className="text-[10px] text-gray-500 mt-0.5 truncate">
                      {((action.result.data as Record<string, unknown>).title as string) || ""}
                    </div>
                  )}

                  {/* Result message */}
                  {action.result?.message != null && (
                    <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                      {String(action.result.message as string)}
                    </div>
                  )}

                  {/* Timestamp */}
                  <div className="text-[9px] text-gray-300 mt-1">
                    {new Date(action.created_at).toLocaleString("en-US", {
                      month: "short", day: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                    {action.executed_at && action.executed_at !== action.created_at && (
                      <span className="ml-1">
                        · completed {new Date(action.executed_at).toLocaleString("en-US", {
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Architecture note */}
        <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-[10px] text-gray-400 leading-relaxed">
          <span className="font-semibold text-gray-500">How it works:</span>{" "}
          Each cycle runs Claude Haiku (~$0.003) with tool_use to analyze the financial snapshot.
          Claude picks from: <em>create_action_plan</em>, <em>send_immediate_alert</em>, or <em>do_nothing</em>.
          High-stakes actions require your approval before execution.
        </div>
      </div>
    </div>
  );
}

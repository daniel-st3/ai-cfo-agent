"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Database, BarChart3, ScanSearch, Dices, TrendingUp, Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const PIPELINE_STEPS = [
  { id: "ingestion",   label: "Ingestion",      sub: "Loading & parsing data",          Icon: Database,   color: "#0071e3" },
  { id: "kpi",         label: "KPI Compute",    sub: "Calculating weekly KPI snapshots", Icon: BarChart3,  color: "#6366f1" },
  { id: "anomalies",   label: "Anomaly AI",     sub: "IsolationForest detection",       Icon: ScanSearch, color: "#ff9500" },
  { id: "monte_carlo", label: "Monte Carlo",    sub: "1,000 survival simulations",      Icon: Dices,      color: "#af52de" },
  { id: "scenarios",   label: "Stress Test",    sub: "Bear / Base / Bull scenarios",    Icon: TrendingUp, color: "#34c759" },
  { id: "market",      label: "Market Intel",   sub: "Scanning competitors",            Icon: Globe2,     color: "#5ac8fa" },
] as const;

export type StepId = typeof PIPELINE_STEPS[number]["id"];

function AnimDots() {
  const [dot, setDot] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDot(d => (d + 1) % 3), 400);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="inline-flex gap-0.5 ml-1">
      {[0, 1, 2].map(i => (
        <span key={i} className={cn("h-1 w-1 rounded-full transition-opacity duration-200", i <= dot ? "opacity-100" : "opacity-20")}
              style={{ background: "currentColor" }} />
      ))}
    </span>
  );
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMs(Date.now() - startedAt), 100);
    return () => clearInterval(t);
  }, [startedAt]);
  return <span className="font-mono">{(ms / 1000).toFixed(1)}s</span>;
}

interface Props {
  completedIds: StepId[];
  stepDetails: Record<string, string>;
  celebrating?: boolean;
}

export function PipelineView({ completedIds, stepDetails, celebrating = false }: Props) {
  const doneSet = new Set(completedIds);
  const allStepIds = PIPELINE_STEPS.map(s => s.id);
  const runningId = allStepIds.find(id => !doneSet.has(id)) ?? null;

  const startTimesRef = useRef<Partial<Record<StepId, number>>>({});
  useEffect(() => {
    if (runningId && !startTimesRef.current[runningId]) {
      startTimesRef.current[runningId] = Date.now();
    }
  }, [runningId]);

  return (
    <div className="w-full px-4 py-6">
      <div className="relative flex items-start justify-between">
        {PIPELINE_STEPS.map((step, idx) => {
          const isDone    = doneSet.has(step.id);
          const isRunning = step.id === runningId;
          const isPending = !isDone && !isRunning;
          const startedAt = startTimesRef.current[step.id] ?? Date.now();
          const isLast    = idx === PIPELINE_STEPS.length - 1;

          return (
            <div key={step.id} className="flex flex-1 flex-col items-center relative">
              {/* Connector */}
              {!isLast && (
                <div className="absolute top-[28px] left-1/2 w-full h-px overflow-hidden" style={{ zIndex: 0 }}>
                  <div className="absolute inset-0 border-t-2 border-dashed border-gray-200" />
                  {isDone && (
                    <div
                      className="absolute inset-0 animate-sweep-right"
                      style={{ background: `linear-gradient(to right, ${step.color}, ${PIPELINE_STEPS[idx+1].color})` }}
                    />
                  )}
                  {isRunning && (
                    <div
                      className="absolute inset-0 animate-pulse"
                      style={{ background: `linear-gradient(to right, ${step.color}60, transparent)` }}
                    />
                  )}
                </div>
              )}

              {/* Node card */}
              <div
                className={cn(
                  "relative z-10 flex flex-col items-center gap-2 rounded-2xl border p-3 transition-all duration-500 w-[130px] sm:w-[148px]",
                  isPending && "border-gray-200 bg-white opacity-50",
                  isRunning && "border-2 bg-white shadow-lg scale-105",
                  isDone && !celebrating && "border-green-200 bg-green-50",
                  isDone && celebrating  && "border-green-400 bg-green-50 scale-105",
                )}
                style={isRunning ? { borderColor: step.color, boxShadow: `0 4px 20px ${step.color}30` } : undefined}
              >
                {/* Glow ring */}
                {isRunning && (
                  <div className="absolute inset-0 rounded-2xl pointer-events-none animate-pulse"
                       style={{ boxShadow: `0 0 0 4px ${step.color}20` }} />
                )}

                {/* Icon */}
                <div className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                  isPending && "bg-gray-100",
                  isRunning && "bg-white shadow-sm",
                  isDone    && "bg-green-100",
                )}>
                  {isDone ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <step.Icon
                      className={cn("h-5 w-5", isPending && "text-gray-300")}
                      style={isRunning ? { color: step.color } : undefined}
                    />
                  )}
                </div>

                {/* Label */}
                <div className="text-center">
                  <div className={cn("text-[10px] font-bold uppercase tracking-wide leading-tight",
                    isPending && "text-gray-300",
                    isRunning && "text-gray-800",
                    isDone    && "text-green-700",
                  )}>
                    {step.label}
                  </div>

                  <div className={cn("mt-0.5 text-[9px]",
                    isPending  && "text-gray-300",
                    isRunning  && "text-gray-500",
                    isDone     && "text-green-600 font-semibold",
                  )}>
                    {isPending && "Waiting"}
                    {isRunning && <span className="flex items-center justify-center" style={{ color: step.color }}>Running<AnimDots /></span>}
                    {isDone    && "Done ✓"}
                  </div>

                  {isRunning && (
                    <div className="mt-0.5 text-[9px] text-gray-400">
                      <ElapsedTimer startedAt={startedAt} />
                    </div>
                  )}

                  {isDone && stepDetails[step.id] && (
                    <div className="mt-1 text-[9px] text-green-600 animate-fade-in-up leading-tight">
                      {stepDetails[step.id]}
                    </div>
                  )}
                </div>
              </div>

              <div className={cn("mt-2 h-1.5 w-1.5 rounded-full transition-colors",
                isPending  && "bg-gray-200",
                isRunning  && "bg-blue-500 animate-pulse",
                isDone     && "bg-green-500",
              )} />
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-6 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-700 ease-out"
          style={{ width: `${(completedIds.length / PIPELINE_STEPS.length) * 100}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-gray-400">
        <span>0%</span>
        <span>{completedIds.length}/{PIPELINE_STEPS.length} complete</span>
        <span>100%</span>
      </div>
    </div>
  );
}

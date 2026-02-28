"use client";
import { useEffect, useState } from "react";
import { RefreshCw, TrendingDown, TrendingUp, Wallet, Plus, X } from "lucide-react";
import { CashFlowChart } from "@/components/charts/cash-flow-chart";
import { getCashFlow, refreshForecast, setCashBalance, addCommittedExpense } from "@/lib/api";
import type { CashFlowSectionData } from "@/lib/types";
import { fmtK } from "@/lib/utils";

interface Props {
  runId: string;
}

export function CashFlowSection({ runId }: Props) {
  const [data, setData] = useState<CashFlowSectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showCashForm, setShowCashForm] = useState(false);
  const [expenseName, setExpenseName] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseFreq, setExpenseFreq] = useState<"weekly" | "monthly" | "quarterly" | "annual">("monthly");
  const [cashAmount, setCashAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getCashFlow(runId)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [runId]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const updated = await refreshForecast(runId);
      setData(updated);
    } catch {}
    setRefreshing(false);
  }

  async function handleAddExpense() {
    if (!expenseName || !expenseAmount) return;
    setSubmitting(true);
    try {
      await addCommittedExpense(runId, {
        name: expenseName,
        amount: parseFloat(expenseAmount),
        frequency: expenseFreq,
        next_payment_date: new Date().toISOString().split("T")[0],
      });
      setExpenseName("");
      setExpenseAmount("");
      setShowExpenseForm(false);
      const updated = await refreshForecast(runId);
      setData(updated);
    } catch {}
    setSubmitting(false);
  }

  async function handleSetCash() {
    if (!cashAmount) return;
    setSubmitting(true);
    try {
      await setCashBalance(runId, parseFloat(cashAmount));
      setShowCashForm(false);
      setCashAmount("");
      const updated = await refreshForecast(runId);
      setData(updated);
    } catch {}
    setSubmitting(false);
  }

  const weeksUntilZero = data?.weeks_until_zero_p50;
  const urgencyColor = weeksUntilZero == null ? "text-green-600" :
    weeksUntilZero < 8 ? "text-red-500" :
    weeksUntilZero < 20 ? "text-amber-600" : "text-green-600";

  return (
    <div className="grid grid-cols-3 gap-5 items-stretch">
      {/* ── Left: Chart ─────────────────────────────────────────────────────── */}
      <div className="col-span-2 card-brutal p-5 flex flex-col h-full">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
              13-WEEK CASH POSITION
            </div>
            <div className="text-sm font-semibold text-gray-700">P10 / P50 / P90 Balance Forecast</div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 hover:text-gray-600 transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        <div className="flex-1 min-h-0 h-[220px]">
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-300 text-xs">
              Computing forecast...
            </div>
          ) : data?.forecast?.length ? (
            <CashFlowChart forecast={data.forecast} />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-300 text-xs">
              No KPI data available
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Stats + Controls ──────────────────────────────────────────── */}
      <div className="card-brutal p-5 flex flex-col gap-4 h-full">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Cash Position</div>

        {/* Current cash */}
        <div>
          <div className="text-[10px] text-gray-400 mb-0.5 flex items-center gap-1">
            <Wallet className="h-3 w-3" /> Cash on hand
          </div>
          {showCashForm ? (
            <div className="space-y-1.5">
              <input
                type="number"
                placeholder="Enter cash balance"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleSetCash}
                  disabled={submitting}
                  className="flex-1 text-[10px] font-semibold bg-blue-500 text-white rounded-lg py-1.5 hover:bg-blue-600 transition-colors"
                >
                  Save
                </button>
                <button onClick={() => setShowCashForm(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCashForm(true)}
              className="group w-full text-left"
            >
              <div className="text-2xl font-black tabular-nums text-gray-900">
                {data ? fmtK(data.current_cash) : "—"}
              </div>
              <div className="text-[9px] text-gray-400 group-hover:text-blue-500 transition-colors">
                {data ? "estimated" : ""} · click to update
              </div>
            </button>
          )}
        </div>

        {/* Committed weekly outflow */}
        <div>
          <div className="text-[10px] text-gray-400 mb-0.5 flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-red-400" /> Committed weekly
          </div>
          <div className="text-lg font-bold text-red-500 tabular-nums">
            {data ? fmtK(data.total_committed_weekly) : "—"}
          </div>
          <div className="text-[9px] text-gray-400">recurring outflows</div>
        </div>

        {/* Weeks until zero */}
        <div>
          <div className="text-[10px] text-gray-400 mb-0.5 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> P50 runway
          </div>
          <div className={`text-lg font-bold tabular-nums ${urgencyColor}`}>
            {weeksUntilZero == null ? ">13 weeks" : `${weeksUntilZero} weeks`}
          </div>
          <div className="text-[9px] text-gray-400">median scenario</div>
        </div>

        {/* Committed expenses list */}
        {data?.committed_expenses && data.committed_expenses.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              Committed Expenses
            </div>
            <div className="space-y-1">
              {data.committed_expenses.slice(0, 3).map((e) => (
                <div key={e.id} className="flex justify-between items-center text-[10px]">
                  <span className="text-gray-600 truncate max-w-[100px]">{e.name}</span>
                  <span className="font-mono text-gray-500">{fmtK(e.amount)}/{e.frequency.slice(0, 2)}</span>
                </div>
              ))}
              {data.committed_expenses.length > 3 && (
                <div className="text-[9px] text-gray-400">+{data.committed_expenses.length - 3} more</div>
              )}
            </div>
          </div>
        )}

        {/* Add expense form */}
        <div className="border-t border-gray-100 pt-3">
          {showExpenseForm ? (
            <div className="space-y-1.5">
              <input
                type="text"
                placeholder="Expense name (e.g. AWS)"
                value={expenseName}
                onChange={(e) => setExpenseName(e.target.value)}
                className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <div className="flex gap-1.5">
                <input
                  type="number"
                  placeholder="Amount"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <select
                  value={expenseFreq}
                  onChange={(e) => setExpenseFreq(e.target.value as typeof expenseFreq)}
                  className="text-[10px] border border-gray-200 rounded-lg px-1 py-1.5 focus:outline-none"
                >
                  <option value="weekly">Wk</option>
                  <option value="monthly">Mo</option>
                  <option value="quarterly">Qtr</option>
                  <option value="annual">Yr</option>
                </select>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={handleAddExpense}
                  disabled={submitting}
                  className="flex-1 text-[10px] font-semibold bg-blue-500 text-white rounded-lg py-1.5 hover:bg-blue-600 transition-colors"
                >
                  Add
                </button>
                <button onClick={() => setShowExpenseForm(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowExpenseForm(true)}
              className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-500 hover:text-blue-700 transition-colors"
            >
              <Plus className="h-3 w-3" /> Add committed expense
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

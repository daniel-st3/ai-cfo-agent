"use client";
import { useEffect, useState } from "react";
import { BookOpen, Plus, X } from "lucide-react";
import { DeferredRevenueChart } from "@/components/charts/deferred-revenue-chart";
import { getDeferredRevenue, addContract } from "@/lib/api";
import type { DeferredRevenueSummary } from "@/lib/types";
import { fmtK } from "@/lib/utils";

interface Props {
  runId: string;
}

export function DeferredRevenueCard({ runId }: Props) {
  const [data, setData] = useState<DeferredRevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [custId, setCustId] = useState("");
  const [totalValue, setTotalValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState<"annual" | "quarterly" | "monthly">("annual");

  useEffect(() => {
    getDeferredRevenue(runId)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [runId]);

  async function handleAdd() {
    if (!custId || !totalValue || !startDate || !endDate) return;
    setSubmitting(true);
    try {
      await addContract(runId, {
        customer_id: custId,
        total_value: parseFloat(totalValue),
        start_date: startDate,
        end_date: endDate,
        payment_terms: paymentTerms,
      });
      const updated = await getDeferredRevenue(runId);
      setData(updated);
      setShowForm(false);
      setCustId("");
      setTotalValue("");
    } catch {}
    setSubmitting(false);
  }

  return (
    <div className="card-brutal p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
            <BookOpen className="h-3 w-3" /> Deferred Revenue
          </div>
          <div className="text-[9px] text-gray-400 mt-0.5">GAAP recognition schedule</div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-[10px] font-semibold text-blue-500 hover:text-blue-700 transition-colors"
        >
          <Plus className="h-3 w-3" /> Contract
        </button>
      </div>

      {/* Hero metrics */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="text-[9px] text-gray-400 mb-0.5">Total deferred</div>
          <div className="text-xl font-black tabular-nums text-blue-600">
            {data ? fmtK(data.total_deferred_balance) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[9px] text-gray-400 mb-0.5">This month recognized</div>
          <div className="text-xl font-black tabular-nums text-green-600">
            {data ? fmtK(data.current_month_recognized) : "—"}
          </div>
        </div>
      </div>

      {/* Contract count */}
      <div className="text-[10px] text-gray-400 mb-3">
        {data ? `${data.contract_count} active contract${data.contract_count !== 1 ? "s" : ""}` : "No contracts"}
      </div>

      {/* Chart */}
      {!showForm && (
        <div className="flex-1 min-h-0 h-[120px]">
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-300 text-xs">Loading...</div>
          ) : data?.schedule_next_12_months?.length ? (
            <DeferredRevenueChart schedule={data.schedule_next_12_months} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-300 text-xs gap-1">
              <BookOpen className="h-6 w-6 opacity-30" />
              <span>Add contracts to see recognition schedule</span>
            </div>
          )}
        </div>
      )}

      {/* Add contract form */}
      {showForm && (
        <div className="space-y-2 mt-2">
          <div className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">New Contract</div>
          <input
            type="text"
            placeholder="Customer ID"
            value={custId}
            onChange={(e) => setCustId(e.target.value)}
            className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <input
            type="number"
            placeholder="Total contract value ($)"
            value={totalValue}
            onChange={(e) => setTotalValue(e.target.value)}
            className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="flex gap-1.5">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="flex-1 text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
            />
          </div>
          <select
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value as typeof paymentTerms)}
            className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
          >
            <option value="annual">Annual payment</option>
            <option value="quarterly">Quarterly payment</option>
            <option value="monthly">Monthly payment</option>
          </select>
          <div className="flex gap-1.5">
            <button
              onClick={handleAdd}
              disabled={submitting}
              className="flex-1 text-[10px] font-semibold bg-blue-500 text-white rounded-lg py-1.5 hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Add Contract"}
            </button>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

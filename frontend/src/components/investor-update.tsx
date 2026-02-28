"use client";
import { useState } from "react";
import { Copy, Check, Mail } from "lucide-react";
import type { InvestorUpdateData } from "@/lib/types";

interface Props {
  update: InvestorUpdateData;
  companyName?: string;
}

export function InvestorUpdate({ update, companyName }: Props) {
  const [copied, setCopied] = useState(false);

  const fullText = [
    `Subject: ${update.subject}`,
    ``,
    update.greeting,
    ``,
    `📊 KEY METRICS`,
    update.metrics_block,
    ``,
    `🚀 WINS`,
    ...update.wins.map(w => `• ${w}`),
    ``,
    `⚠️ CHALLENGES`,
    ...update.challenges.map(c => `• ${c}`),
    ``,
    `🎯 NEXT 30 DAYS`,
    ...update.next_30_days.map(p => `• ${p}`),
    ``,
    `💰 ASKS FROM YOU`,
    ...update.asks.map(a => `• ${a}`),
    ``,
    update.closing,
    ``,
    `${companyName || "Founder"}`,
  ].join("\n");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">

      {/* ── Email client chrome ───────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 bg-gray-50 border-b border-gray-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-amber-400" />
            <span className="h-3 w-3 rounded-full bg-green-400" />
          </div>
          <Mail className="h-3.5 w-3.5 text-blue-500 ml-2" />
          <span className="text-xs font-semibold text-gray-600">Monthly Investor Update</span>
          <span className="text-[10px] text-gray-400">· Claude Haiku · ~$0.003</span>
        </div>
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            copied
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
          }`}
        >
          {copied ? (
            <><Check className="h-3.5 w-3.5" /> Copied!</>
          ) : (
            <><Copy className="h-3.5 w-3.5" /> Copy email</>
          )}
        </button>
      </div>

      {/* ── Subject line ──────────────────────────────────────────── */}
      <div className="border-b border-gray-100 px-5 py-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Subject</div>
        <div className="text-sm font-semibold text-gray-900">{update.subject}</div>
      </div>

      {/* ── Email body ────────────────────────────────────────────── */}
      <div className="px-6 py-5 space-y-5 text-sm text-gray-700">

        <p>{update.greeting}</p>

        {/* Metrics snapshot */}
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">📊 Key Metrics</div>
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
            {update.metrics_block}
          </pre>
        </div>

        {/* Wins */}
        {update.wins.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-green-600 mb-2">🚀 Wins</div>
            <ul className="space-y-1.5">
              {update.wins.map((w, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700 leading-snug">
                  <span className="text-green-500 flex-shrink-0">•</span>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Challenges */}
        {update.challenges.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-2">⚠️ Challenges</div>
            <ul className="space-y-1.5">
              {update.challenges.map((c, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700 leading-snug">
                  <span className="text-amber-500 flex-shrink-0">•</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Next 30 days */}
        {update.next_30_days.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mb-2">🎯 Next 30 Days</div>
            <ul className="space-y-1.5">
              {update.next_30_days.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-700 leading-snug">
                  <span className="text-blue-400 font-bold flex-shrink-0">{i + 1}.</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Asks */}
        {update.asks.length > 0 && (
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-blue-600 mb-2">💰 Asks From You</div>
            <ul className="space-y-1.5">
              {update.asks.map((a, i) => (
                <li key={i} className="flex gap-2 text-sm text-blue-800 leading-snug">
                  <span className="text-blue-400 flex-shrink-0">→</span>
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-2 border-t border-gray-100">
          <p className="text-sm text-gray-600">{update.closing}</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">{companyName || "Founder"}</p>
        </div>
      </div>

      <div className="border-t border-gray-100 px-5 py-2 text-[10px] text-gray-400 text-right">
        Generated by AI CFO Agent · Review numbers before sending · For illustrative purposes
      </div>
    </div>
  );
}

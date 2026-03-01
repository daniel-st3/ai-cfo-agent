"use client";
import { useState } from "react";
import { Loader2, Sparkles, Copy, Check, Bell, Zap } from "lucide-react";
import { fmtK } from "@/lib/utils";
import type { MorningBriefingData } from "@/lib/types";

interface Props {
  runId: string;
  companyName: string;
  onGenerate: () => Promise<void>;
  data: MorningBriefingData | null;
  loading: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function runwayColor(months: number) {
  if (months < 3)  return { text: "text-red-600",   bg: "bg-red-50",   border: "border-red-200",   badge: "bg-red-100 text-red-700 border-red-200" };
  if (months < 6)  return { text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-700 border-amber-200" };
  return             { text: "text-green-600",  bg: "bg-green-50",  border: "border-green-200",  badge: "bg-green-100 text-green-700 border-green-200" };
}

function deltaBadge(pct: number, invertBetter = false) {
  const positive = invertBetter ? pct < 0 : pct > 0;
  const abs = Math.abs(pct).toFixed(1);
  if (Math.abs(pct) < 0.5) return null;
  return (
    <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 border ${
      positive ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
    }`}>
      {pct > 0 ? "▲" : "▼"} {abs}%
    </span>
  );
}

// ── Message bubble (iMessage-style) ──────────────────────────────────────────
function BriefingMessage({ d }: { d: MorningBriefingData }) {
  const [copied, setCopied] = useState(false);
  const c = runwayColor(d.runway_months);

  const plainText = [
    `🏦 Good morning ${d.company_name} — your AI CFO here.`,
    ``,
    `💰 CASH STATUS: ${d.runway_months.toFixed(1)} months runway`,
    d.burn_change_pct !== 0
      ? `   Burn: $${d.burn_rate.toLocaleString()}/wk (${d.burn_change_pct > 0 ? "+" : ""}${d.burn_change_pct.toFixed(1)}% WoW)`
      : `   Burn: $${d.burn_rate.toLocaleString()}/wk`,
    `   MRR: $${d.mrr.toLocaleString()}/wk (${d.mrr_change_pct > 0 ? "+" : ""}${d.mrr_change_pct.toFixed(1)}% WoW)`,
    ``,
    d.urgent.length ? `🚨 URGENT:` : null,
    ...d.urgent.map(u => `• ${u}`),
    ``,
    d.good_news.length ? `✅ GOOD NEWS:` : null,
    ...d.good_news.map(g => `• ${g}`),
    ``,
    `📊 TODAY'S ACTIONS:`,
    ...d.actions.map((a, i) => `${i + 1}. ${a}`),
    ``,
    `Reply "details" for full dashboard link.`,
    `Reply "chat" to ask me anything.`,
  ].filter(l => l !== null).join("\n");

  const copyToClipboard = () => {
    navigator.clipboard.writeText(plainText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative">
      {/* Copy button */}
      <button
        onClick={copyToClipboard}
        className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/90 px-2 py-1 text-[10px] font-semibold text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors shadow-sm"
      >
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied!" : "Copy"}
      </button>

      {/* Phone mockup */}
      <div className="flex justify-center">
        <div className="w-full max-w-sm">
          {/* Status bar */}
          <div className="rounded-t-2xl bg-gray-900 px-5 py-2 flex items-center justify-between">
            <span className="text-white text-[11px] font-semibold">9:07 AM</span>
            <div className="text-white text-[10px] font-bold tracking-wide">AI CFO</div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-1.5 rounded-full bg-green-400" />
              <span className="text-white text-[10px]">●●●●</span>
            </div>
          </div>

          {/* Message thread */}
          <div className="bg-gray-50 border-l border-r border-gray-200 px-4 py-4 space-y-3 min-h-[420px]">

            {/* Header bubble */}
            <div className="flex justify-start">
              <div className="bg-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]">
                <div className="text-sm font-black text-gray-900">🏦 Good morning</div>
                <div className="text-xs text-gray-600 mt-0.5">
                  <span className="font-semibold">{d.company_name}</span> — your AI CFO is here.
                </div>
              </div>
            </div>

            {/* Cash status bubble */}
            <div className="flex justify-start">
              <div className={`${c.bg} ${c.border} border rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%]`}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">💰 Cash Status</div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className={`text-2xl font-black tabular-nums ${c.text}`}>{d.runway_months.toFixed(1)}</span>
                  <span className="text-sm text-gray-600 font-semibold">months runway</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-400">Burn</span>
                    <span className="text-[11px] font-bold text-gray-700">{fmtK(d.burn_rate)}/wk</span>
                    {deltaBadge(d.burn_change_pct, true)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-400">MRR</span>
                    <span className="text-[11px] font-bold text-gray-700">{fmtK(d.mrr)}/wk</span>
                    {deltaBadge(d.mrr_change_pct)}
                  </div>
                  {d.gross_margin_pct > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-400">GM</span>
                      <span className="text-[11px] font-bold text-gray-700">{d.gross_margin_pct.toFixed(0)}%</span>
                    </div>
                  )}
                  {d.ltv_cac > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-gray-400">LTV:CAC</span>
                      <span className="text-[11px] font-bold text-gray-700">{d.ltv_cac.toFixed(1)}x</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Urgent alerts bubble */}
            {d.urgent.length > 0 && (
              <div className="flex justify-start">
                <div className="bg-red-50 border border-red-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-red-500 mb-1.5">🚨 Urgent</div>
                  <ul className="space-y-1">
                    {d.urgent.map((u, i) => (
                      <li key={i} className="text-[11px] text-red-800 leading-snug flex gap-1.5">
                        <span className="flex-shrink-0 mt-0.5">•</span>
                        <span>{u}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Good news bubble */}
            {d.good_news.length > 0 && (
              <div className="flex justify-start">
                <div className="bg-green-50 border border-green-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-green-600 mb-1.5">✅ Good News</div>
                  <ul className="space-y-1">
                    {d.good_news.map((g, i) => (
                      <li key={i} className="text-[11px] text-green-900 leading-snug flex gap-1.5">
                        <span className="flex-shrink-0 mt-0.5">•</span>
                        <span>{g}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Action items bubble */}
            {d.actions.length > 0 && (
              <div className="flex justify-start">
                <div className="bg-blue-50 border border-blue-200 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600 mb-1.5">📊 Today's Actions</div>
                  <ol className="space-y-1.5">
                    {d.actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-black flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-[11px] text-blue-900 leading-snug">{a}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}

            {/* Reply options bubble */}
            <div className="flex justify-start">
              <div className="bg-gray-200 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[85%]">
                <div className="text-[10px] text-gray-500 leading-relaxed">
                  Reply <span className="font-bold text-gray-700">"details"</span> for full dashboard.<br />
                  Reply <span className="font-bold text-gray-700">"chat"</span> to ask me anything.
                </div>
              </div>
            </div>

          </div>

          {/* Bottom bar */}
          <div className="rounded-b-2xl bg-gray-900 px-4 py-2 flex items-center gap-2">
            <div className="flex-1 rounded-full bg-gray-700 px-3 py-1.5 text-[11px] text-gray-400">Message</div>
            <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center">
              <span className="text-white text-xs">↑</span>
            </div>
          </div>
        </div>
      </div>

      {/* Week label */}
      {d.week_start && (
        <div className="text-center mt-2 text-[10px] text-gray-400">
          Based on data from week of {d.week_start}
        </div>
      )}
    </div>
  );
}

// ── Delivery setup panel ──────────────────────────────────────────────────────
function DeliveryPanel() {
  const [email,   setEmail]   = useState("");
  const [slack,   setSlack]   = useState("");
  const [saved,   setSaved]   = useState(false);

  const handleSave = () => {
    // In production: POST /briefing/subscribe with email + slack_webhook
    // For now, show confirmation
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="border-t border-gray-100 pt-5 mt-5">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-semibold text-gray-800">Schedule Daily Delivery</span>
        <span className="text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">
          7 AM every day
        </span>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Get this briefing delivered automatically every morning before you start your day.
        Add your API keys to <code className="bg-gray-100 px-1 rounded text-[11px]">.env</code> to activate delivery.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Email</label>
          <input
            type="email"
            placeholder="you@startup.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Slack Webhook URL</label>
          <input
            type="url"
            placeholder="https://hooks.slack.com/services/…"
            value={slack}
            onChange={e => setSlack(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleSave}
          disabled={!email && !slack}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {saved ? <Check className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
          {saved ? "Saved!" : "Save & Schedule"}
        </button>
        <span className="text-[10px] text-gray-400">
          Requires <code className="bg-gray-100 px-1 rounded">SENDGRID_API_KEY</code> or <code className="bg-gray-100 px-1 rounded">SLACK_WEBHOOK_URL</code> in .env
        </span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function MorningBriefing({ runId, companyName, onGenerate, data, loading }: Props) {
  return (
    <div className="card-brutal p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
              <span className="text-white text-base">🌅</span>
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">Morning CFO Briefing</div>
              <div className="text-[10px] text-gray-400">Proactive AI · Daily summary · Claude Haiku · ~$0.003</div>
            </div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black tracking-wider text-amber-700">
          <Zap className="h-3 w-3" /> NEW
        </span>
      </div>

      {/* Content */}
      {!data && !loading && (
        <div className="flex flex-col items-center py-10 text-center">
          <div className="text-5xl mb-4">🌅</div>
          <div className="text-base font-bold text-gray-900 mb-1">
            What would your AI CFO say this morning?
          </div>
          <div className="text-sm text-gray-400 mb-6 max-w-sm">
            Get a personalized briefing with urgent alerts, good news, and 3 specific
            action items — the way a co-founder always watching the numbers would deliver it.
          </div>
          <button
            onClick={onGenerate}
            disabled={loading}
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-bold text-white shadow-md hover:from-amber-600 hover:to-orange-600 hover:shadow-lg transition-all disabled:opacity-50"
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Sparkles className="h-4 w-4" />}
            Generate Today's Briefing
          </button>
        </div>
      )}

      {loading && !data && (
        <div className="flex flex-col items-center py-12 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <div className="text-sm font-semibold text-gray-600">
            Your AI CFO is reviewing the numbers…
          </div>
          <div className="text-xs text-gray-400">Scanning for urgent alerts + generating actions</div>
        </div>
      )}

      {data && (
        <>
          <BriefingMessage d={data} />
          <DeliveryPanel />
        </>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { X, RefreshCw, ExternalLink, CheckCircle2, AlertCircle } from "lucide-react";
import { getIntegrations, getStripeAuthUrl, getQuickBooksAuthUrl, syncStripe, syncQuickBooks } from "@/lib/api";
import type { IntegrationStatus } from "@/lib/types";

interface Props {
  runId: string;
  onClose: () => void;
}

export function IntegrationsModal({ runId, onClose }: Props) {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<Record<string, string>>({});

  useEffect(() => {
    getIntegrations().then(setIntegrations).catch(() => {});
  }, []);

  const stripe = integrations.find((i) => i.platform === "stripe");
  const qb = integrations.find((i) => i.platform === "quickbooks");

  async function handleConnect(platform: "stripe" | "quickbooks") {
    try {
      const { authorization_url, demo_mode } = platform === "stripe"
        ? await getStripeAuthUrl()
        : await getQuickBooksAuthUrl();

      if (demo_mode) {
        setMessage((m) => ({
          ...m,
          [platform]: "Demo mode: no credentials configured. Add STRIPE_CLIENT_ID to .env to connect.",
        }));
        return;
      }
      window.location.href = authorization_url;
    } catch {
      setMessage((m) => ({ ...m, [platform]: "Failed to get authorization URL." }));
    }
  }

  async function handleSync(platform: "stripe" | "quickbooks") {
    setSyncing((s) => ({ ...s, [platform]: true }));
    try {
      const result = platform === "stripe"
        ? await syncStripe(runId)
        : await syncQuickBooks(runId);
      setMessage((m) => ({ ...m, [platform]: result.message }));
      const updated = await getIntegrations();
      setIntegrations(updated);
    } catch (e: any) {
      setMessage((m) => ({ ...m, [platform]: e?.message ?? "Sync failed" }));
    }
    setSyncing((s) => ({ ...s, [platform]: false }));
  }

  function IntegrationCard({
    platform,
    logo,
    title,
    description,
    status,
  }: {
    platform: "stripe" | "quickbooks";
    logo: string;
    title: string;
    description: string;
    status: IntegrationStatus | undefined;
  }) {
    const isActive = status?.status === "active";
    const msg = message[platform];

    return (
      <div className={`card-brutal p-5 flex flex-col gap-3 ${isActive ? "border-green-200 bg-green-50/30" : ""}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt={title} className="h-6 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <span className="font-semibold text-sm text-gray-800">{title}</span>
          </div>
          {isActive ? (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
              Not connected
            </span>
          )}
        </div>

        <p className="text-xs text-gray-500">{description}</p>

        {isActive && status?.last_sync_at && (
          <div className="text-[10px] text-gray-400">
            Last synced: {new Date(status.last_sync_at).toLocaleString()} · {status.rows_synced} rows
          </div>
        )}

        {msg && (
          <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
            {msg}
          </div>
        )}

        <div className="flex gap-2">
          {!isActive && (
            <button
              onClick={() => handleConnect(platform)}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-blue-500 text-white rounded-xl py-2 hover:bg-blue-600 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Connect {title}
            </button>
          )}
          {isActive && (
            <button
              onClick={() => handleSync(platform)}
              disabled={syncing[platform]}
              className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-green-500 text-white rounded-xl py-2 hover:bg-green-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing[platform] ? "animate-spin" : ""}`} />
              {syncing[platform] ? "Syncing..." : "Sync Now"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 p-6 z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
              Data Sources
            </div>
            <div className="text-lg font-bold text-gray-900">Integrations</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <IntegrationCard
            platform="stripe"
            logo="https://logo.clearbit.com/stripe.com"
            title="Stripe"
            description="Sync real-time subscription data, MRR, and churn events directly from Stripe. Eliminates manual CSV uploads."
            status={stripe}
          />
          <IntegrationCard
            platform="quickbooks"
            logo="https://logo.clearbit.com/quickbooks.intuit.com"
            title="QuickBooks"
            description="Import P&L, balance sheet, and cash flow from QuickBooks Online. Ensures GAAP-compliant financial data."
            status={qb}
          />
        </div>

        <div className="mt-4 text-[10px] text-gray-400 text-center">
          Demo mode: add STRIPE_CLIENT_ID and QUICKBOOKS_CLIENT_ID to .env for live connections
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { getIntegrations } from "@/lib/api";
import type { IntegrationStatus } from "@/lib/types";

interface Props {
  onOpenModal: () => void;
}

export function IntegrationsBar({ onOpenModal }: Props) {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);

  useEffect(() => {
    getIntegrations()
      .then(setIntegrations)
      .catch(() => {});

    const interval = setInterval(() => {
      getIntegrations().then(setIntegrations).catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const stripe = integrations.find((i) => i.platform === "stripe");
  const qb = integrations.find((i) => i.platform === "quickbooks");

  function statusDot(status: string) {
    if (status === "active") return <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />;
    if (status === "error") return <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />;
    return <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />;
  }

  function statusLabel(s: IntegrationStatus | undefined, name: string) {
    if (!s || s.status === "not_connected") return `${name} · Not connected`;
    if (s.status === "active") {
      const sync = s.last_sync_at
        ? new Date(s.last_sync_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "synced";
      return `${name} · ${sync}`;
    }
    return `${name} · ${s.status}`;
  }

  return (
    <button
      onClick={onOpenModal}
      className="w-full flex items-center gap-3 px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl hover:bg-gray-100 transition-colors group"
    >
      <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Integrations</span>

      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          {statusDot(stripe?.status ?? "not_connected")}
          {statusLabel(stripe, "Stripe")}
        </span>
        <span className="text-gray-200">·</span>
        <span className="flex items-center gap-1 text-[10px] text-gray-500">
          {statusDot(qb?.status ?? "not_connected")}
          {statusLabel(qb, "QuickBooks")}
        </span>
      </div>

      <span className="ml-auto text-[9px] text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
        Manage →
      </span>
    </button>
  );
}

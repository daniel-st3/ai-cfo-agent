"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function QuickBooksCallbackPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const code     = searchParams.get("code");
    const realmId  = searchParams.get("realmId");
    const error    = searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage(error === "access_denied" ? "Access denied. Please try again." : `QuickBooks error: ${error}`);
      setTimeout(() => router.push("/"), 3000);
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage("No authorization code received from QuickBooks.");
      setTimeout(() => router.push("/"), 3000);
      return;
    }

    const params = new URLSearchParams({ code });
    if (realmId) params.set("realm_id", realmId);

    fetch(`${BASE}/integrations/quickbooks/callback?${params.toString()}`)
      .then(res => {
        if (!res.ok) throw new Error(`Backend returned ${res.status}`);
        return res.json();
      })
      .then(() => {
        setStatus("success");
        setMessage("QuickBooks connected! Redirecting…");
        setTimeout(() => router.push("/?connected=quickbooks"), 1500);
      })
      .catch(err => {
        setStatus("error");
        setMessage(err.message ?? "Failed to complete QuickBooks connection.");
        setTimeout(() => router.push("/"), 3000);
      });
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-10 max-w-sm w-full text-center">
        {status === "loading" && (
          <>
            <Loader2 className="h-10 w-10 text-[#2CA01C] animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 mb-1">Connecting QuickBooks</h2>
            <p className="text-sm text-gray-400">Exchanging authorization code…</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 mb-1">QuickBooks Connected!</h2>
            <p className="text-sm text-gray-400">{message}</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="h-10 w-10 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-gray-900 mb-1">Connection Failed</h2>
            <p className="text-sm text-gray-400">{message}</p>
            <p className="text-xs text-gray-300 mt-2">Redirecting back…</p>
          </>
        )}
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { Presentation, Download, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { generateBoardDeck, getBoardDeckStatus, getBoardDeckDownloadUrl } from "@/lib/api";
import type { BoardDeckStatus } from "@/lib/types";

interface Props {
  runId: string;
  companyName?: string;
}

export function BoardDeckDownload({ runId, companyName }: Props) {
  const [status, setStatus] = useState<BoardDeckStatus | null>(null);
  const [polling, setPolling] = useState(false);

  // Check status on mount
  useEffect(() => {
    getBoardDeckStatus(runId)
      .then((s) => setStatus(s))
      .catch(() => {});
  }, [runId]);

  // Poll while generating
  useEffect(() => {
    if (status?.status !== "generating") return;
    const id = setInterval(async () => {
      try {
        const s = await getBoardDeckStatus(runId);
        setStatus(s);
        if (s.status !== "generating") clearInterval(id);
      } catch {}
    }, 2000);
    return () => clearInterval(id);
  }, [status?.status, runId]);

  async function handleGenerate() {
    setPolling(true);
    try {
      await generateBoardDeck(runId, companyName);
      setStatus({ deck_id: null, run_id: runId, status: "generating", generated_at: null, download_url: null });
    } catch {
      setStatus({ deck_id: null, run_id: runId, status: "failed", generated_at: null, download_url: null });
    }
    setPolling(false);
  }

  const isGenerating = status?.status === "generating" || polling;
  const isReady = status?.status === "ready";
  const isFailed = status?.status === "failed";

  return (
    <div className="card-brutal p-5 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center flex-shrink-0">
          <Presentation className="h-4 w-4 text-purple-600" />
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-800 leading-tight">Board Deck</div>
          <div className="text-[9px] text-gray-400">10-slide PowerPoint</div>
        </div>
      </div>

      <p className="text-[10px] text-gray-500 leading-relaxed mb-3">
        Auto-generate a branded board deck with KPIs, cash flow charts, scenario analysis, and competitive landscape.
      </p>

      <div className="flex items-center gap-1.5 mb-4">
        <span className="text-[9px] font-semibold text-purple-600 bg-purple-50 border border-purple-100 rounded-full px-2 py-0.5">
          Free · python-pptx
        </span>
        <span className="text-[9px] text-gray-400">~10 seconds</span>
      </div>

      {/* Status */}
      {isFailed && (
        <div className="flex items-center gap-1.5 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 mb-3">
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          Generation failed. Try again.
        </div>
      )}

      {isReady && status?.generated_at && (
        <div className="text-[9px] text-green-600 mb-2">
          Generated {new Date(status.generated_at).toLocaleTimeString()}
        </div>
      )}

      <div className="mt-auto space-y-2">
        {/* Generate button */}
        {!isReady && (
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full flex items-center justify-center gap-2 text-xs font-semibold rounded-xl py-2.5 border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors disabled:opacity-60"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating slides...
              </>
            ) : (
              <>
                <Presentation className="h-3.5 w-3.5" />
                {isFailed ? "Retry Generation" : "Generate Deck"}
              </>
            )}
          </button>
        )}

        {/* Download button */}
        {isReady && (
          <>
            <a
              href={getBoardDeckDownloadUrl(runId)}
              download={`board_deck_${runId}.pptx`}
              className="w-full flex items-center justify-center gap-2 text-xs font-semibold rounded-xl py-2.5 bg-purple-600 text-white hover:bg-purple-700 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download .pptx
            </a>
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full flex items-center justify-center gap-1.5 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Regenerate
            </button>
          </>
        )}
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReportData } from "@/lib/types";

interface Props { report: ReportData }

export function CFOReport({ report }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-zinc-600" />
          <CardTitle>CFO Board Report</CardTitle>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          {expanded ? <><ChevronUp className="h-3 w-3" /> Collapse</> : <><ChevronDown className="h-3 w-3" /> Expand</>}
        </button>
      </CardHeader>

      <CardContent>
        {/* Executive summary — always visible */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-2">Executive Summary</div>
          <div className="text-sm leading-relaxed text-zinc-300 whitespace-pre-line">{report.executive_summary}</div>
        </div>

        {/* Full report — expandable */}
        {expanded && report.full_report_markdown && (
          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 animate-fade-in-up">
            <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-3">Full Report</div>
            <div className="prose prose-invert prose-sm max-w-none
                [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-white [&_h1]:mb-2
                [&_h2]:text-sm  [&_h2]:font-bold [&_h2]:text-zinc-200 [&_h2]:mb-1.5 [&_h2]:mt-4
                [&_h3]:text-xs  [&_h3]:font-semibold [&_h3]:text-zinc-400
                [&_p]:text-zinc-400 [&_p]:text-xs [&_p]:leading-relaxed
                [&_ul]:text-zinc-500 [&_ul]:text-xs [&_ul]:list-disc [&_ul]:pl-4
                [&_li]:mb-0.5 [&_strong]:text-zinc-200">
              {/* Simple markdown-ish render: split by lines */}
              {report.full_report_markdown.split("\n").map((line, i) => {
                if (line.startsWith("# "))  return <h1 key={i}>{line.slice(2)}</h1>;
                if (line.startsWith("## ")) return <h2 key={i}>{line.slice(3)}</h2>;
                if (line.startsWith("### ")) return <h3 key={i}>{line.slice(4)}</h3>;
                if (line.startsWith("- "))  return <li key={i} className="text-zinc-500 text-xs">{line.slice(2)}</li>;
                if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="font-semibold text-zinc-200 text-xs">{line.slice(2, -2)}</p>;
                if (line.trim() === "")    return <div key={i} className="h-2" />;
                return <p key={i} className="text-zinc-400 text-xs leading-relaxed">{line}</p>;
              })}
            </div>
          </div>
        )}

        {report.looker_url && (
          <div className="mt-3 flex items-center justify-between rounded border border-zinc-900 bg-zinc-950 px-3 py-2">
            <span className="text-[10px] text-zinc-700 uppercase tracking-widest">Looker Studio Dashboard</span>
            <a href={report.looker_url} target="_blank" rel="noopener noreferrer"
               className="text-[10px] text-blue-600 hover:text-blue-400 font-mono transition-colors">
              Open →
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

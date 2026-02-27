"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { BoardQuestion } from "@/lib/types";

const DANGER_LABEL: Record<string, string> = {
  RED:    "High Pressure",
  YELLOW: "Moderate",
  GREEN:  "Positive",
};

interface QuestionCardProps { q: BoardQuestion; idx: number; defaultOpen?: boolean }

function QuestionCard({ q, idx, defaultOpen }: QuestionCardProps) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm transition-all hover:shadow-md">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-start gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-shrink-0 font-mono text-xs font-bold text-gray-400 mt-0.5">Q{idx + 1}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant={q.danger}>{DANGER_LABEL[q.danger]}</Badge>
          </div>
          <p className="text-sm font-medium text-gray-800 leading-snug line-clamp-2">{q.question}</p>
        </div>
        <div className="flex-shrink-0 text-gray-300">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-4 animate-fade-in-up">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Board Question</div>
            <p className="text-sm text-gray-700 leading-relaxed">{q.question}</p>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3.5">
            <div className="text-[9px] font-bold uppercase tracking-widest text-blue-500 mb-1.5">CFO Answer</div>
            <p className="text-sm text-gray-700 leading-relaxed">{q.answer}</p>
          </div>

          {q.follow_up && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Likely Follow-up</div>
              <p className="text-xs text-gray-500 italic leading-relaxed">&ldquo;{q.follow_up}&rdquo;</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props { questions: BoardQuestion[] }

export function BoardPrep({ questions }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Board Interrogation Deck</h3>
          <p className="text-xs text-gray-400 mt-0.5">Adversarial questions a Sequoia partner would ask — with pre-drafted CFO answers</p>
        </div>
        <div className="flex gap-1.5">
          <Badge variant="red">{questions.filter(q => q.danger === "RED").length} critical</Badge>
          <Badge variant="amber">{questions.filter(q => q.danger === "YELLOW").length} moderate</Badge>
        </div>
      </div>
      <div className="space-y-2">
        {questions.map((q, i) => (
          <QuestionCard key={i} q={q} idx={i} defaultOpen={i === 0} />
        ))}
      </div>
    </div>
  );
}

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { KPIData } from "@/lib/types";
import { fmt$, fmtK, fmtPct } from "@/lib/utils";

interface MetricDef {
  key:      keyof KPIData;
  label:    string;
  format:   (v: number) => string;
  inverse?: boolean; // true = lower is better
}

const METRICS: MetricDef[] = [
  { key: "mrr",          label: "MRR",          format: fmtK },
  { key: "arr",          label: "ARR",          format: fmtK },
  { key: "burn_rate",    label: "Burn Rate",     format: v => fmtK(Math.abs(v)) + "/wk", inverse: true },
  { key: "gross_margin", label: "Gross Margin",  format: v => fmtPct(v) },
  { key: "churn_rate",   label: "Churn Rate",    format: v => fmtPct(v), inverse: true },
  { key: "cac",          label: "CAC",           format: fmtK, inverse: true },
  { key: "ltv",          label: "LTV",           format: fmtK },
];

interface Props { kpis: KPIData }

export function KPICards({ kpis }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3 lg:grid-cols-7">
      {METRICS.map(({ key, label, format, inverse }) => {
        const value = Number(kpis[key] ?? 0);
        const wow   = Number(kpis.wow_delta?.[key] ?? 0);
        const mom   = Number(kpis.mom_delta?.[key] ?? 0);

        const positive = inverse ? wow < 0 : wow > 0;
        const negative = inverse ? wow > 0 : wow < 0;

        return (
          <Card key={key} className="flex flex-col gap-1 p-4">
            <CardContent className="p-0">
              <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">{label}</div>
              <div className="mt-1 font-mono text-2xl font-bold leading-none text-white">
                {format(value)}
              </div>

              {/* WoW delta */}
              {wow !== 0 && (
                <div className={`mt-1.5 flex items-center gap-1 text-[10px] font-semibold
                  ${positive ? "text-green-400" : negative ? "text-red-400" : "text-zinc-600"}`}>
                  {positive ? <TrendingUp className="h-3 w-3" />
                   : negative ? <TrendingDown className="h-3 w-3" />
                   : <Minus className="h-3 w-3" />}
                  {Math.abs(wow * 100).toFixed(1)}% WoW
                </div>
              )}

              {/* MoM delta */}
              {mom !== 0 && (
                <div className="mt-0.5 text-[9px] text-zinc-700">
                  {mom > 0 ? "+" : ""}{(mom * 100).toFixed(1)}% MoM
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

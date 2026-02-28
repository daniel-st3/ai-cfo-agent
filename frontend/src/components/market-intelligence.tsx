"use client";
import { useEffect, useState } from "react";
import { ExternalLink, TrendingUp, TrendingDown, Users, Newspaper, Globe, Zap, AlertCircle, Clock, ChevronDown, ChevronUp, DollarSign } from "lucide-react";
import { getSectorCompetitors } from "@/lib/api";
import type { MarketSignal, CompetitorProfile } from "@/lib/types";

const SECTOR_LABEL: Record<string, string> = {
  saas_productivity:    "SaaS / Productivity",
  fintech_payments:     "Fintech / Payments",
  ecommerce:            "E-commerce",
  hr_tech:              "HR Tech",
  marketing_automation: "Marketing / Automation",
  devtools:             "Dev Tools",
  ai_saas:              "AI / SaaS",
  general:              "General / Other",
};

const SIGNAL_META = {
  pricing_change: { icon: TrendingUp, label: "Pricing Move",  color: "text-amber-600",  bg: "bg-amber-50 border-amber-200"  },
  job_posting:    { icon: Users,       label: "Hiring Signal", color: "text-blue-600",   bg: "bg-blue-50 border-blue-200"    },
  news:           { icon: Newspaper,   label: "News",          color: "text-gray-600",   bg: "bg-gray-50 border-gray-200"    },
};

function signalsByCompetitor(signals: MarketSignal[]): Record<string, MarketSignal[]> {
  const map: Record<string, MarketSignal[]> = {};
  for (const s of signals) {
    if (!map[s.competitor_name]) map[s.competitor_name] = [];
    map[s.competitor_name].push(s);
  }
  return map;
}

function threatScore(signals: MarketSignal[]): number {
  return signals.reduce((acc, s) => {
    if (s.signal_type === "pricing_change") return acc + 3;
    if (s.signal_type === "job_posting")    return acc + 2;
    return acc + 1;
  }, 0);
}

function CompetitorLogo({ profile }: { profile: CompetitorProfile }) {
  const [imgOk, setImgOk] = useState(true);
  const initials = profile.name.slice(0, 2).toUpperCase();
  const hues = [211, 262, 142, 32, 0, 191, 300, 55];
  const hue  = hues[profile.name.charCodeAt(0) % hues.length];

  if (!imgOk || !profile.logo_url) {
    return (
      <div className="h-10 w-10 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
           style={{ background: `hsl(${hue}, 65%, 50%)` }}>
        {initials}
      </div>
    );
  }
  return (
    <div className="h-10 w-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">
      <img src={profile.logo_url} alt={profile.name} className="h-8 w-8 object-contain"
           onError={() => setImgOk(false)} />
    </div>
  );
}

function ThreatBar({ score, max }: { score: number; max: number }) {
  const pct   = max > 0 ? Math.min(100, (score / max) * 100) : 0;
  const color = pct > 66 ? "bg-red-400" : pct > 33 ? "bg-amber-400" : "bg-green-400";
  const label = pct > 66 ? "High Activity" : pct > 33 ? "Moderate" : "Low";
  return (
    <div className="mt-2.5">
      <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={"h-full rounded-full transition-all duration-700 " + color} style={{ width: pct + "%" }} />
      </div>
      <div className="mt-1 text-[9px] text-gray-400 uppercase tracking-wide">{label} activity</div>
    </div>
  );
}

function SignalChip({ signal }: { signal: MarketSignal }) {
  const meta = SIGNAL_META[signal.signal_type as keyof typeof SIGNAL_META] ?? SIGNAL_META.news;
  const Icon = meta.icon;
  const Tag  = signal.raw_source_url ? "a" : "div";
  return (
    <Tag
      {...(signal.raw_source_url ? { href: signal.raw_source_url, target: "_blank", rel: "noopener noreferrer" } : {})}
      className={"flex items-start gap-2 rounded-xl border p-3 text-left hover:shadow-sm transition-shadow " + meta.bg + (signal.raw_source_url ? " cursor-pointer" : "")}
    >
      <Icon className={"h-3.5 w-3.5 flex-shrink-0 mt-0.5 " + meta.color} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
          <span className={"text-[9px] font-bold uppercase tracking-widest " + meta.color}>{meta.label}</span>
          <span className="text-[9px] text-gray-300">{signal.date}</span>
          {signal.raw_source_url && <ExternalLink className="h-2.5 w-2.5 text-gray-300" />}
        </div>
        <p className="text-[11px] text-gray-600 leading-relaxed line-clamp-2">{signal.summary}</p>
      </div>
    </Tag>
  );
}

function CompetitorCard({ profile, signals, maxThreat, rank }: {
  profile: CompetitorProfile; signals: MarketSignal[]; maxThreat: number; rank: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const score        = threatScore(signals);
  const pricingCount = signals.filter(s => s.signal_type === "pricing_change").length;
  const hiringCount  = signals.filter(s => s.signal_type === "job_posting").length;
  const newsCount    = signals.filter(s => s.signal_type === "news").length;

  return (
    <div className="card-brutal overflow-hidden hover:shadow-md transition-shadow">
      <button onClick={() => setExpanded(e => !e)} className="w-full text-left p-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-start gap-3">
          <CompetitorLogo profile={profile} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="font-semibold text-sm text-gray-900">{profile.name}</span>
              {rank <= 3 && (
                <span className={"text-[9px] font-bold px-1.5 py-0.5 rounded-full " + (rank === 1 ? "bg-red-100 text-red-600" : rank === 2 ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600")}>
                  #{rank} threat
                </span>
              )}
              {profile.pricing_url && (
                <a href={profile.pricing_url} target="_blank" rel="noopener noreferrer"
                   onClick={e => e.stopPropagation()}
                   className="text-[9px] text-blue-500 hover:text-blue-700 transition-colors">
                  Pricing ↗
                </a>
              )}
            </div>
            <p className="text-[10px] text-gray-400 line-clamp-1">
              {profile.description || profile.extract || profile.domain}
            </p>
          </div>
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
            <span className="font-bold text-lg text-gray-800">{signals.length}</span>
            <span className="text-[9px] text-gray-400 uppercase tracking-wide">signals</span>
          </div>
        </div>

        {signals.length > 0 && (
          <div className="flex gap-2 mt-2.5 flex-wrap">
            {pricingCount > 0 && (
              <span className="flex items-center gap-1 text-[9px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                <TrendingUp className="h-2.5 w-2.5" />{pricingCount} pricing
              </span>
            )}
            {hiringCount > 0 && (
              <span className="flex items-center gap-1 text-[9px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                <Users className="h-2.5 w-2.5" />{hiringCount} hiring
              </span>
            )}
            {newsCount > 0 && (
              <span className="flex items-center gap-1 text-[9px] font-semibold text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-200">
                <Newspaper className="h-2.5 w-2.5" />{newsCount} news
              </span>
            )}
          </div>
        )}

        <ThreatBar score={score} max={maxThreat} />
      </button>

      {profile.extract && (
        <div className="px-4 pb-3 border-t border-gray-50">
          <p className="text-[10px] text-gray-400 leading-relaxed mt-2 line-clamp-2">{profile.extract}</p>
        </div>
      )}

      {expanded && signals.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 p-3 space-y-2">
          <div className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1.5">
            <Zap className="h-3 w-3" /> Recent signals
          </div>
          {signals.slice(0, 5).map((s, i) => (
            <SignalChip key={i} signal={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function ThreatLeaderboard({ profiles, byCompetitor, maxThreat }: {
  profiles: CompetitorProfile[];
  byCompetitor: Record<string, MarketSignal[]>;
  maxThreat: number;
}) {
  const top5 = profiles.slice(0, 5);
  if (top5.length === 0) return null;

  return (
    <div className="card-brutal p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertCircle className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-semibold text-gray-900">Competitive Threat Radar</span>
        <span className="text-[10px] text-gray-400 ml-auto">higher score = more market activity</span>
      </div>
      <div className="space-y-3">
        {top5.map((p, i) => {
          const score = threatScore(byCompetitor[p.name] ?? []);
          const pct   = maxThreat > 0 ? (score / maxThreat) * 100 : 0;
          const barColor = i === 0 ? "bg-red-400" : i === 1 ? "bg-orange-400" : i === 2 ? "bg-amber-400" : "bg-blue-300";
          return (
            <div key={p.name} className="flex items-center gap-3">
              <span className="text-[10px] text-gray-400 w-4 flex-shrink-0 font-mono">{i+1}</span>
              <CompetitorLogo profile={p} />
              <span className="text-xs font-semibold text-gray-700 w-24 truncate flex-shrink-0">{p.name}</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={"h-full rounded-full transition-all duration-700 " + barColor} style={{ width: pct + "%" }} />
              </div>
              <span className="text-[10px] font-mono text-gray-500 w-6 text-right">{score}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Additional Intelligence: Hiring Velocity ──────────────────────────────
function HiringVelocity({ signals, profiles }: { signals: MarketSignal[]; profiles: CompetitorProfile[] }) {
  const hiringByCo = profiles.map(p => ({
    name: p.name,
    count: signals.filter(s => s.competitor_name === p.name && s.signal_type === "job_posting").length,
  })).filter(x => x.count > 0).sort((a, b) => b.count - a.count).slice(0, 6);

  if (hiringByCo.length === 0) {
    return <p className="text-xs text-gray-400 py-3 text-center">No hiring signals detected in current dataset.</p>;
  }

  const max = hiringByCo[0].count;
  return (
    <div className="space-y-2.5 mt-2">
      {hiringByCo.map(({ name, count }) => {
        const pct = (count / max) * 100;
        const color = count > 10 ? "bg-red-400" : count > 5 ? "bg-amber-400" : "bg-blue-300";
        const textColor = count > 10 ? "text-red-600" : count > 5 ? "text-amber-600" : "text-blue-500";
        return (
          <div key={name} className="flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-700 w-28 truncate flex-shrink-0">{name}</span>
            <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`text-xs font-black font-mono w-10 text-right ${textColor}`}>{count}</span>
          </div>
        );
      })}
      <p className="text-[9px] text-gray-400 pt-1">Signal count in current dataset period</p>
    </div>
  );
}

// ─── Additional Intelligence: Risk Score Cards ─────────────────────────────
function RiskScoreCards({ profiles, byCompetitor, maxThreat }: {
  profiles: CompetitorProfile[];
  byCompetitor: Record<string, MarketSignal[]>;
  maxThreat: number;
}) {
  const avgScore = profiles.length > 0
    ? profiles.reduce((s, p) => s + threatScore(byCompetitor[p.name] ?? []), 0) / profiles.length
    : 0;
  const pressureLabel = avgScore > 6 ? "CRITICAL" : avgScore > 4 ? "HIGH" : avgScore > 2 ? "ELEVATED" : "LOW";
  const pressureColor = avgScore > 6 ? "text-red-600" : avgScore > 4 ? "text-red-500" : avgScore > 2 ? "text-amber-600" : "text-green-600";

  return (
    <div className="mt-2">
      <div className={`flex items-center gap-2 mb-3 text-xs font-bold ${pressureColor}`}>
        <span>Overall market pressure:</span>
        <span className={`rounded-full border px-2 py-0.5 ${pressureColor} border-current`}>{pressureLabel}</span>
        {avgScore > 4 && <span className="text-gray-500 font-normal">Consider pricing review before Q3</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {profiles.slice(0, 6).map(p => {
          const score = threatScore(byCompetitor[p.name] ?? []);
          const normalized = maxThreat > 0 ? Math.round((score / maxThreat) * 10) : 0;
          const scoreColor = normalized > 6 ? "text-red-600" : normalized > 4 ? "text-amber-600" : "text-green-600";
          const dots = Array.from({ length: 10 }, (_, i) => i < normalized ? "●" : "○").join("");
          return (
            <div key={p.name} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
              <div className="text-xs font-semibold text-gray-800 truncate">{p.name}</div>
              <div className={`font-mono text-[11px] mt-1 tracking-tighter ${scoreColor}`}>{dots}</div>
              <div className={`text-[10px] font-bold mt-0.5 ${scoreColor}`}>{score} pts</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Additional Intelligence: Price Intelligence Feed ─────────────────────
function PriceIntelligenceFeed({ signals }: { signals: MarketSignal[] }) {
  const pricingSignals = signals.filter(s => s.signal_type === "pricing_change")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);

  if (pricingSignals.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-gray-400">
        <span className="text-green-500">✓</span>
        No pricing moves detected. Competitive pricing appears stable.
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-2">
      {pricingSignals.map((s, i) => {
        const isCut = s.summary.toLowerCase().includes("cut") || s.summary.toLowerCase().includes("reduc") || s.summary.toLowerCase().includes("lower") || s.summary.toLowerCase().includes("free");
        const arrow = isCut ? "↓" : "↑";
        const riskLabel = isCut ? "competitive threat" : "hold pricing";
        const cardColor = isCut ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200";
        const arrowColor = isCut ? "text-red-600" : "text-green-600";
        const Tag = s.raw_source_url ? "a" : "div";
        return (
          <Tag
            key={i}
            {...(s.raw_source_url ? { href: s.raw_source_url, target: "_blank", rel: "noopener noreferrer" } : {})}
            className={`flex items-start gap-3 rounded-xl border p-3 ${cardColor} ${s.raw_source_url ? "cursor-pointer hover:shadow-sm" : ""} transition-shadow`}
          >
            <span className={`text-xl font-black flex-shrink-0 leading-none mt-0.5 ${arrowColor}`}>{arrow}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-xs font-bold text-gray-900">{s.competitor_name}</span>
                <span className={`text-[9px] font-bold uppercase rounded-full px-1.5 py-0.5 ${isCut ? "bg-red-200 text-red-700" : "bg-green-200 text-green-700"}`}>{riskLabel}</span>
                <span className="text-[9px] text-gray-400">{s.date}</span>
                {s.raw_source_url && <ExternalLink className="h-2.5 w-2.5 text-gray-300" />}
              </div>
              <p className="text-[11px] text-gray-600 leading-snug line-clamp-2">{s.summary}</p>
            </div>
          </Tag>
        );
      })}
    </div>
  );
}

interface Props {
  signals: MarketSignal[];
  sector: string;
  companyName?: string;
}

export function MarketIntelligence({ signals, sector, companyName }: Props) {
  const [profiles, setProfiles] = useState<CompetitorProfile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showExtra, setShowExtra] = useState(false);
  const [activeTab, setActiveTab] = useState<"hiring" | "risk" | "price">("hiring");

  useEffect(() => {
    if (!sector) return;
    setLoading(true);
    getSectorCompetitors(sector)
      .then(setProfiles)
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }, [sector]);

  const byCompetitor = signalsByCompetitor(signals);
  const allScores    = profiles.map(p => threatScore(byCompetitor[p.name] ?? []));
  const maxThreat    = Math.max(1, ...allScores);
  const sorted       = [...profiles].sort((a, b) =>
    threatScore(byCompetitor[b.name] ?? []) - threatScore(byCompetitor[a.name] ?? [])
  );

  const totalPricing = signals.filter(s => s.signal_type === "pricing_change").length;
  const totalHiring  = signals.filter(s => s.signal_type === "job_posting").length;
  const totalNews    = signals.filter(s => s.signal_type === "news").length;
  const activeComps  = sorted.filter(p => (byCompetitor[p.name] ?? []).length > 0).length;

  const refreshedAt = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <span className="text-base font-semibold text-gray-900">
              {companyName ? companyName + ": " : ""}Competitive Landscape
            </span>
            {/* Timestamp pill */}
            <span className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 border border-gray-200 rounded-full px-2 py-0.5">
              <Clock className="h-2.5 w-2.5" />
              Last refreshed: {refreshedAt}
            </span>
          </div>
          <p className="text-xs text-gray-400">
            {SECTOR_LABEL[sector] ?? sector} · {profiles.length} competitors tracked · Real-time signals
          </p>
        </div>
        <div className="flex gap-5 flex-shrink-0">
          {[
            { n: totalPricing, label: "Pricing",  color: "text-amber-600" },
            { n: totalHiring,  label: "Hiring",   color: "text-blue-600"  },
            { n: totalNews,    label: "News",      color: "text-gray-600"  },
            { n: activeComps,  label: "Active",    color: "text-red-500"   },
          ].map(({ n, label, color }) => (
            <div key={label} className="text-center">
              <div className={"font-bold text-xl " + color}>{n}</div>
              <div className="text-[9px] text-gray-400 uppercase tracking-wide">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {signals.length === 0 && !loading && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-700">No competitor signals yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Set <code className="font-mono bg-gray-200 px-1 py-0.5 rounded text-[10px]">TAVILY_API_KEY</code> for richer data.
              DuckDuckGo &amp; HN are the free fallback.
            </p>
          </div>
        </div>
      )}

      {!loading && sorted.length > 0 && (
        <ThreatLeaderboard profiles={sorted} byCompetitor={byCompetitor} maxThreat={maxThreat} />
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3,4,5].map(i => <div key={i} className="card-brutal h-40 animate-pulse bg-gray-50" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((profile, idx) => (
            <CompetitorCard key={profile.name} profile={profile}
              signals={byCompetitor[profile.name] ?? []}
              maxThreat={maxThreat} rank={idx + 1} />
          ))}
        </div>
      )}

      {/* ── Additional Intelligence (expandable) ───────────────────────── */}
      {!loading && profiles.length > 0 && (
        <div className="card-brutal overflow-hidden">
          <button
            onClick={() => setShowExtra(e => !e)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-semibold text-gray-900">Additional Intelligence</span>
              <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">CFO-grade signals</span>
            </div>
            {showExtra ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>

          {showExtra && (
            <div className="border-t border-gray-100 px-5 pb-5">
              {/* Tab navigation */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mt-4 mb-4">
                {[
                  { id: "hiring" as const, label: "Hiring Velocity", icon: Users },
                  { id: "risk"   as const, label: "Risk Scores",     icon: AlertCircle },
                  { id: "price"  as const, label: "Price Intel",     icon: DollarSign },
                ].map(({ id, label, icon: Icon }) => (
                  <button key={id} onClick={() => setActiveTab(id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}>
                    <Icon className="h-3 w-3" />{label}
                  </button>
                ))}
              </div>

              {activeTab === "hiring" && (
                <HiringVelocity signals={signals} profiles={sorted} />
              )}
              {activeTab === "risk" && (
                <RiskScoreCards profiles={sorted} byCompetitor={byCompetitor} maxThreat={maxThreat} />
              )}
              {activeTab === "price" && (
                <PriceIntelligenceFeed signals={signals} />
              )}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-300 text-center">
        Logos via Clearbit · Profiles via Wikipedia · Signals via DuckDuckGo &amp; HN · all free
      </p>
    </div>
  );
}

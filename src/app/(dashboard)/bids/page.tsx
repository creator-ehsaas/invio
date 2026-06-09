"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Search,
  Loader2,
  Gavel,
  Radar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Star,
  ArrowUpRight,
  Settings,
  Sparkles,
  IndianRupee,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { GemBid, GemBidStatus } from "@/types/gem";
import { isElectron, gemScan } from "@/lib/electron";

const STATUS_CONFIG: Record<GemBidStatus, { label: string; color: string; bgColor: string; icon: any }> = {
  new:        { label: "New",        color: "text-blue-700 dark:text-blue-400",    bgColor: "bg-blue-50 dark:bg-blue-950/30",    icon: Sparkles },
  shortlisted:{ label: "Shortlisted",color: "text-violet-700 dark:text-violet-400",bgColor: "bg-violet-50 dark:bg-violet-950/30",icon: Sparkles },
  analyzing:  { label: "Analyzing",  color: "text-amber-700 dark:text-amber-400",  bgColor: "bg-amber-50 dark:bg-amber-950/30",  icon: Loader2 },
  analyzed:   { label: "Analyzed",   color: "text-purple-700 dark:text-purple-400",bgColor: "bg-purple-50 dark:bg-purple-950/30",icon: CheckCircle2 },
  interested: { label: "Interested", color: "text-emerald-700 dark:text-emerald-400",bgColor: "bg-emerald-50 dark:bg-emerald-950/30",icon: Star },
  applied:    { label: "Applied",    color: "text-sky-700 dark:text-sky-400",      bgColor: "bg-sky-50 dark:bg-sky-950/30",      icon: ArrowUpRight },
  won:        { label: "Won",        color: "text-green-700 dark:text-green-400",  bgColor: "bg-green-50 dark:bg-green-950/30",  icon: CheckCircle2 },
  lost:       { label: "Lost",       color: "text-red-700 dark:text-red-400",      bgColor: "bg-red-50 dark:bg-red-950/30",      icon: XCircle },
  expired:    { label: "Expired",    color: "text-gray-600 dark:text-gray-400",    bgColor: "bg-gray-100 dark:bg-gray-900/30",   icon: Clock },
};

const STATUS_TABS: (GemBidStatus | "all")[] = [
  "all", "shortlisted", "new", "analyzed", "interested", "applied", "won", "lost", "expired",
];

const PAGE_SIZE = 20;

export default function BidsPage() {
  const [bids, setBids] = useState<GemBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [shortlisting, setShortlisting] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GemBidStatus | "all">("all");
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const fetchBids = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: userData } = await supabase.from("users").select("business_id").eq("id", user.id).single();
    if (!userData?.business_id) return;

    let query = supabase
      .from("gem_bids")
      .select("*")
      .eq("business_id", userData.business_id)
      .order("scraped_at", { ascending: false });

    if (statusFilter !== "all") query = query.eq("status", statusFilter);

    const { data } = await query;
    setBids(data || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { fetchBids(); }, [fetchBids]);

  useEffect(() => {
    fetch("/api/gem-business-profile/save")
      .then((r) => r.json())
      .then((data) => setHasProfile(!!data?.setup_completed))
      .catch(() => setHasProfile(false));
  }, []);

  const handleScan = async () => {
    if (!isElectron()) {
      setScanResult("⚠️ GeM scanning requires the Invio desktop app.");
      return;
    }
    setScanning(true);
    setScanResult(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      let keywords: string[] = [];
      if (user) {
        const { data: userData } = await supabase.from("users").select("business_id").eq("id", user.id).single();
        if (userData?.business_id) {
          const { data: cfg } = await supabase.from("gem_config").select("keywords").eq("business_id", userData.business_id).single();
          keywords = cfg?.keywords ?? [];
        }
      }
      const result = await gemScan({ keywords, maxPages: 3 });
      if (!result) { setScanResult("❌ Native scan unavailable."); setScanning(false); return; }
      if (result.error) { setScanResult(`❌ Scan failed: ${result.error}`); setScanning(false); return; }
      const saveRes = await fetch("/api/gem-scraper/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docs: result.docs ?? [] }),
      });
      const saved = await saveRes.json();
      if (saved.error) {
        setScanResult(`❌ Scan failed to save: ${saved.error}`);
      } else {
        setScanResult(`✅ Scan complete! Found ${saved.bids_found} bids, ${saved.bids_new} new.`);
        fetchBids();
      }
    } catch (err: any) {
      setScanResult(`❌ Error: ${err.message}`);
    }
    setScanning(false);
  };

  const handleShortlist = async () => {
    setShortlisting(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/gem-scraper/shortlist", { method: "POST" });
      const result = await res.json();
      if (res.ok) {
        setScanResult(`✅ Shortlisting complete! ${result.shortlisted} of ${result.scored} bids matched your profile.`);
        fetchBids();
      } else {
        setScanResult(`❌ Shortlisting failed: ${result.error}`);
      }
    } catch (err: any) {
      setScanResult(`❌ Error: ${err.message}`);
    }
    setShortlisting(false);
  };

  const filteredBids = useMemo(() => {
    if (!search) return bids;
    const q = search.toLowerCase();
    return bids.filter((b) =>
      b.gem_bid_id.toLowerCase().includes(q) ||
      b.title.toLowerCase().includes(q) ||
      (b.department?.toLowerCase().includes(q) ?? false) ||
      (b.organization?.toLowerCase().includes(q) ?? false)
    );
  }, [bids, search]);

  const totalPages = Math.max(1, Math.ceil(filteredBids.length / PAGE_SIZE));
  const pagedBids = filteredBids.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = {
    total: bids.length,
    new: bids.filter((b) => b.status === "new").length,
    interested: bids.filter((b) => b.status === "interested").length,
    applied: bids.filter((b) => b.status === "applied").length,
    won: bids.filter((b) => b.status === "won").length,
  };

  const getCountdown = (endDate: string | null) => {
    if (!endDate) return null;
    const diff = new Date(endDate).getTime() - Date.now();
    if (diff <= 0) return { text: "Expired", urgent: true };
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    if (days === 0) return { text: `${hours}h left`, urgent: true };
    if (days <= 3) return { text: `${days}d ${hours}h left`, urgent: true };
    return { text: `${days} days left`, urgent: false };
  };

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-primary/10 shrink-0">
              <Gavel className="w-5 h-5 text-primary" />
            </div>
            GeM Bid Finder
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 ml-9">
            AI-powered tender discovery, analysis & document preparation
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/bids/settings">
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Settings className="w-3.5 h-3.5 mr-1" />
              Settings
            </Button>
          </Link>
          {hasProfile && (
            <Button
              onClick={handleShortlist}
              disabled={shortlisting}
              variant="outline"
              size="sm"
              className="h-8 text-xs"
            >
              {shortlisting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
              {shortlisting ? "Ranking..." : "Shortlist"}
            </Button>
          )}
          <Button
            onClick={handleScan}
            disabled={scanning}
            size="sm"
            className="h-8 text-xs"
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Radar className="w-3.5 h-3.5 mr-1" />}
            {scanning ? "Scanning..." : "Scan Now"}
          </Button>
        </div>
      </div>

      {/* ── Banner ── */}
      {scanResult && (
        <div className={`p-3 rounded-xl text-sm font-medium border flex items-start justify-between gap-2 ${
          scanResult.startsWith("✅") ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
          : scanResult.startsWith("⚠️") ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"
          : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"
        }`}>
          <span>{scanResult}</span>
          <button onClick={() => setScanResult(null)} className="text-xs underline opacity-70 hover:opacity-100 shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* ── Setup Banner ── */}
      {hasProfile === false && (
        <div className="p-4 rounded-xl border border-purple-200 dark:border-purple-800/50 bg-purple-50 dark:bg-purple-950/20 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Set up your business profile to get AI shortlisting</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Takes 3 minutes — we'll auto-analyze your invoices and suggest matching bids.
            </p>
          </div>
          <Link href="/bids/setup" className="shrink-0">
            <Button size="sm" className="w-full sm:w-auto">
              <Sparkles className="w-4 h-4 mr-1.5" /> Complete Setup
            </Button>
          </Link>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-5 gap-2 sm:gap-3">
        {([
          { label: "Total",     value: stats.total,     icon: Gavel,       color: "text-foreground" },
          { label: "New",       value: stats.new,       icon: Sparkles,    color: "text-blue-600" },
          { label: "Interested",value: stats.interested,icon: Star,        color: "text-emerald-600" },
          { label: "Applied",   value: stats.applied,   icon: ArrowUpRight,color: "text-sky-600" },
          { label: "Won",       value: stats.won,       icon: CheckCircle2,color: "text-green-600" },
        ] as const).map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-2 sm:p-3 flex flex-col items-center gap-0.5 sm:flex-row sm:items-start sm:gap-2.5 text-center sm:text-left">
            <stat.icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 mt-0.5 shrink-0 ${stat.color}`} />
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[11px] text-muted-foreground leading-none">{stat.label}</p>
              <p className={`text-sm sm:text-xl font-bold leading-tight ${stat.color}`}>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {/* Status tabs — horizontally scrollable */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 flex-1 min-w-0 scrollbar-none">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                statusFilter === tab
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
              }`}
            >
              {tab === "all" ? "All" : STATUS_CONFIG[tab].label}
              {tab !== "all" && (
                <span className="ml-1 opacity-60">
                  ({bids.filter((b) => b.status === tab).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-56 shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search bids..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {/* ── Bid List ── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : filteredBids.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Gavel className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">No bids found</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            {bids.length === 0
              ? 'Click "Scan Now" to discover new bids from the GeM portal.'
              : "No bids match your current filters."}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {pagedBids.map((bid) => <BidCard key={bid.id} bid={bid} getCountdown={getCountdown} />)}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between pt-1">
              <p className="text-xs text-muted-foreground order-2 sm:order-1">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredBids.length)} of {filteredBids.length} bids
              </p>
              <div className="flex items-center gap-1 order-1 sm:order-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 text-muted-foreground transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const n = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                  return (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`w-8 h-8 rounded-md text-xs font-medium transition-colors ${
                        page === n ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-md hover:bg-muted disabled:opacity-40 text-muted-foreground transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Bid Card ──────────────────────────────────────────────────────────────────
function BidCard({
  bid,
  getCountdown,
}: {
  bid: GemBid;
  getCountdown: (d: string | null) => { text: string; urgent: boolean } | null;
}) {
  const statusConf = STATUS_CONFIG[bid.status];
  const StatusIcon = statusConf.icon;
  const countdown = getCountdown(bid.end_date);
  const eligibility = bid.ai_eligibility;

  let summaryText: string | null = null;
  if (bid.ai_summary) {
    try {
      const parsed = JSON.parse(bid.ai_summary);
      summaryText = parsed?.summary || null;
    } catch {
      summaryText = bid.ai_summary;
    }
  }

  return (
    <Link
      href={`/bids/${bid.id}`}
      className="group block bg-card border border-border rounded-xl p-3 sm:p-4 hover:border-primary/40 hover:shadow-sm transition-all"
    >
      {/* Row 1: ID + badges (left) | value (right) */}
      <div className="flex items-start gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          <span className="text-[11px] font-mono text-primary font-semibold shrink-0">
            {bid.gem_bid_id}
          </span>
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${statusConf.bgColor} ${statusConf.color}`}>
            <StatusIcon className="w-2.5 h-2.5" />
            {statusConf.label}
          </span>
          {eligibility && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
              eligibility.eligible
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400"
            }`}>
              {eligibility.eligible
                ? <CheckCircle2 className="w-2.5 h-2.5" />
                : <AlertTriangle className="w-2.5 h-2.5" />}
              {eligibility.eligible ? "Eligible" : "Review"}
              <span className="opacity-60">·{eligibility.confidence}%</span>
            </span>
          )}
          {bid.ai_match_score != null && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
              bid.ai_match_score >= 70
                ? "bg-violet-100 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400"
                : "bg-muted text-muted-foreground"
            }`}>
              {bid.ai_match_score}% match
            </span>
          )}
        </div>

        {/* Value — top right */}
        {bid.estimated_value != null && (
          <div className="flex items-center gap-0.5 text-sm font-bold text-foreground shrink-0 ml-auto">
            <IndianRupee className="w-3.5 h-3.5" />
            {bid.estimated_value.toLocaleString("en-IN")}
          </div>
        )}
      </div>

      {/* Row 2: Title */}
      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors text-sm leading-snug line-clamp-2">
        {bid.title || "Untitled Bid"}
      </h3>

      {/* Row 3: Meta */}
      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
        {bid.department && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
            <Building2 className="w-3 h-3 shrink-0" />
            <span className="truncate max-w-[200px]">{bid.department}</span>
          </span>
        )}
        {bid.quantity && (
          <span className="text-xs text-muted-foreground shrink-0">
            Qty: {bid.quantity} {bid.uom || ""}
          </span>
        )}
        {countdown ? (
          <span className={`flex items-center gap-1 text-xs font-medium shrink-0 ${
            countdown.urgent ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
          }`}>
            <Clock className="w-3 h-3" />
            {countdown.text}
          </span>
        ) : bid.end_date ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Calendar className="w-3 h-3" />
            Closes {new Date(bid.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
        ) : null}
      </div>

      {/* Row 4: AI summary */}
      {summaryText && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
          {summaryText}
        </p>
      )}
    </Link>
  );
}

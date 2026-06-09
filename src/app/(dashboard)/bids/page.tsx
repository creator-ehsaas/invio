"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Search,
  Loader2,
  Gavel,
  Radar,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Star,
  ArrowUpRight,
  Filter,
  RefreshCw,
  Settings,
  Sparkles,
  IndianRupee,
  Building2,
  Calendar,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { GemBid, GemBidStatus } from "@/types/gem";
import { isElectron, gemScan } from "@/lib/electron";

const STATUS_CONFIG: Record<
  GemBidStatus,
  { label: string; color: string; bgColor: string; icon: any }
> = {
  new: { label: "New", color: "text-blue-700 dark:text-blue-400", bgColor: "bg-blue-50 dark:bg-blue-950/30", icon: Sparkles },
  shortlisted: { label: "Shortlisted", color: "text-violet-700 dark:text-violet-400", bgColor: "bg-violet-50 dark:bg-violet-950/30", icon: Sparkles },
  analyzing: { label: "Analyzing", color: "text-amber-700 dark:text-amber-400", bgColor: "bg-amber-50 dark:bg-amber-950/30", icon: Loader2 },
  analyzed: { label: "Analyzed", color: "text-purple-700 dark:text-purple-400", bgColor: "bg-purple-50 dark:bg-purple-950/30", icon: CheckCircle2 },
  interested: { label: "Interested", color: "text-emerald-700 dark:text-emerald-400", bgColor: "bg-emerald-50 dark:bg-emerald-950/30", icon: Star },
  applied: { label: "Applied", color: "text-sky-700 dark:text-sky-400", bgColor: "bg-sky-50 dark:bg-sky-950/30", icon: ArrowUpRight },
  won: { label: "Won", color: "text-green-700 dark:text-green-400", bgColor: "bg-green-50 dark:bg-green-950/30", icon: CheckCircle2 },
  lost: { label: "Lost", color: "text-red-700 dark:text-red-400", bgColor: "bg-red-50 dark:bg-red-950/30", icon: XCircle },
  expired: { label: "Expired", color: "text-gray-600 dark:text-gray-400", bgColor: "bg-gray-100 dark:bg-gray-900/30", icon: Clock },
};

const STATUS_TABS: (GemBidStatus | "all")[] = [
  "all", "shortlisted", "new", "analyzed", "interested", "applied", "won", "lost", "expired",
];

export default function BidsPage() {
  const [bids, setBids] = useState<GemBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [shortlisting, setShortlisting] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GemBidStatus | "all">("all");
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  const fetchBids = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (!userData?.business_id) return;

    let query = supabase
      .from("gem_bids")
      .select("*")
      .eq("business_id", userData.business_id)
      .order("scraped_at", { ascending: false });

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    const { data } = await query;
    setBids(data || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchBids();
  }, [fetchBids]);

  useEffect(() => {
    fetch("/api/gem-business-profile/save")
      .then((r) => r.json())
      .then((data) => setHasProfile(!!data?.setup_completed))
      .catch(() => setHasProfile(false));
  }, []);

  const handleScan = async () => {
    if (!isElectron()) {
      setScanResult("⚠️ GeM scanning requires the Invio desktop app. Download it to scan bids from your Indian network.");
      return;
    }

    setScanning(true);
    setScanResult(null);
    try {
      // Fetch keywords from settings
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      let keywords: string[] = [];
      if (user) {
        const { data: userData } = await supabase.from("users").select("business_id").eq("id", user.id).single();
        if (userData?.business_id) {
          const { data: cfg } = await supabase.from("gem_configs").select("keywords").eq("business_id", userData.business_id).single();
          keywords = cfg?.keywords ?? [];
        }
      }

      const result = await gemScan({ keywords, maxPages: 3 });
      if (!result) { setScanResult("❌ Native scan unavailable."); setScanning(false); return; }
      if (result.error) { setScanResult(`❌ Scan failed: ${result.error}`); setScanning(false); return; }

      // Save raw docs via API
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

  const filteredBids = bids.filter((bid) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      bid.gem_bid_id.toLowerCase().includes(q) ||
      bid.title.toLowerCase().includes(q) ||
      (bid.department?.toLowerCase().includes(q) ?? false) ||
      (bid.organization?.toLowerCase().includes(q) ?? false)
    );
  });

  // Stats
  const stats = {
    total: bids.length,
    new: bids.filter((b) => b.status === "new").length,
    interested: bids.filter((b) => b.status === "interested").length,
    applied: bids.filter((b) => b.status === "applied").length,
    won: bids.filter((b) => b.status === "won").length,
  };

  const getCountdown = (endDate: string | null) => {
    if (!endDate) return null;
    const now = new Date();
    const end = new Date(endDate);
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) return { text: "Expired", urgent: true };
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days === 0) return { text: `${hours}h left`, urgent: true };
    if (days <= 3) return { text: `${days}d ${hours}h left`, urgent: true };
    return { text: `${days} days left`, urgent: false };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Gavel className="w-6 h-6 text-primary" />
            </div>
            GeM Bid Finder
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered tender discovery, analysis & document preparation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/bids/settings">
            <Button variant="outline" size="sm" className="rounded-md">
              <Settings className="w-4 h-4 mr-1.5" />
              Settings
            </Button>
          </Link>
          {hasProfile && (
            <Button
              onClick={handleShortlist}
              disabled={shortlisting}
              variant="outline"
              className="rounded-full px-5"
            >
              {shortlisting ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-1.5" />
              )}
              {shortlisting ? "Ranking..." : "Shortlist Now"}
            </Button>
          )}
          <Button
            onClick={handleScan}
            disabled={scanning}
            className="rounded-full px-5 shadow-lg shadow-primary/20"
          >
            {scanning ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Radar className="w-4 h-4 mr-1.5" />
            )}
            {scanning ? "Scanning..." : "Scan Now"}
          </Button>
        </div>
      </div>

      {/* Scan Result Banner */}
      {scanResult && (
        <div
          className={`p-3 rounded-xl text-sm font-medium border ${
            scanResult.startsWith("✅")
              ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
              : scanResult.startsWith("⚠️")
              ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"
              : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"
          }`}
        >
          {scanResult}
          <button
            onClick={() => setScanResult(null)}
            className="ml-2 text-xs underline opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* No profile banner */}
      {hasProfile === false && (
        <div className="p-4 rounded-xl border border-purple-200 dark:border-purple-800/50 bg-purple-50 dark:bg-purple-950/20 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Set up your business profile to get AI shortlisting</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Takes 3 minutes — we'll auto-analyze your invoices and suggest matching bids.
            </p>
          </div>
          <Link href="/bids/setup">
            <Button size="sm" className="rounded-full shrink-0">
              <Sparkles className="w-4 h-4 mr-1.5" /> Complete Setup
            </Button>
          </Link>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total Bids", value: stats.total, icon: Gavel, color: "text-foreground" },
          { label: "New", value: stats.new, icon: Sparkles, color: "text-blue-600" },
          { label: "Interested", value: stats.interested, icon: Star, color: "text-emerald-600" },
          { label: "Applied", value: stats.applied, icon: ArrowUpRight, color: "text-sky-600" },
          { label: "Won", value: stats.won, icon: CheckCircle2, color: "text-green-600" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-card border border-border rounded-xl p-3.5 flex items-center gap-3"
          >
            <stat.icon className={`w-5 h-5 ${stat.color} shrink-0`} />
            <div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 flex-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === tab
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "all" ? "All" : STATUS_CONFIG[tab].label}
              {tab !== "all" && (
                <span className="ml-1 opacity-70">
                  ({bids.filter((b) => b.status === tab).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search bids..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8"
          />
        </div>
      </div>

      {/* Bid Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredBids.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Gavel className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">No bids found</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {bids.length === 0
              ? "Click \"Scan Now\" to discover new bids from the GeM portal."
              : "No bids match your current filters. Try adjusting your search."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredBids.map((bid) => {
            const statusConf = STATUS_CONFIG[bid.status];
            const StatusIcon = statusConf.icon;
            const countdown = getCountdown(bid.end_date);
            const eligibility = bid.ai_eligibility;

            return (
              <Link
                key={bid.id}
                href={`/bids/${bid.id}`}
                className="group bg-card border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-md transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  {/* Left */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-mono text-primary font-semibold">
                        {bid.gem_bid_id}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${statusConf.bgColor} ${statusConf.color}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {statusConf.label}
                      </span>
                      {eligibility && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            eligibility.eligible
                              ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                              : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400"
                          }`}
                        >
                          {eligibility.eligible ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <AlertTriangle className="w-3 h-3" />
                          )}
                          {eligibility.eligible ? "Eligible" : "Review Needed"}
                          <span className="opacity-60">({eligibility.confidence}%)</span>
                        </span>
                      )}
                    </div>

                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 text-sm">
                      {bid.title || "Untitled Bid"}
                    </h3>

                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                      {bid.department && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5" />
                          {bid.department.length > 40
                            ? bid.department.substring(0, 40) + "..."
                            : bid.department}
                        </span>
                      )}
                      {bid.quantity && (
                        <span>
                          Qty: {bid.quantity} {bid.uom || ""}
                        </span>
                      )}
                    </div>

                    {bid.ai_summary && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
                        {bid.ai_summary}
                      </p>
                    )}
                    {bid.ai_match_score !== null && bid.ai_match_score !== undefined && (
                      <div className="flex items-center gap-2 mt-2">
                        <div className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          bid.ai_match_score >= 70
                            ? "bg-violet-100 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {bid.ai_match_score}% match
                        </div>
                        {bid.ai_match_reason && (
                          <span className="text-[11px] text-muted-foreground line-clamp-1">
                            {bid.ai_match_reason}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right - Value & Dates */}
                  <div className="sm:text-right shrink-0 flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1.5">
                    {bid.estimated_value && (
                      <div className="flex items-center gap-1 text-sm font-bold text-foreground">
                        <IndianRupee className="w-3.5 h-3.5" />
                        {bid.estimated_value.toLocaleString("en-IN")}
                      </div>
                    )}
                    {countdown && (
                      <span
                        className={`text-[11px] font-medium flex items-center gap-1 ${
                          countdown.urgent
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        {countdown.text}
                      </span>
                    )}
                    {bid.end_date && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Closes{" "}
                        {new Date(bid.end_date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

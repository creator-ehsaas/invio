"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { FileText, Search, Plus, Loader2, CheckCircle2, Clock, XCircle, ArrowRight } from "lucide-react";

type EstimateStatus = "all" | "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted";

const tabs: { id: EstimateStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "accepted", label: "Accepted" },
  { id: "converted", label: "Converted" },
  { id: "rejected", label: "Rejected" },
];

interface Estimate {
  id: string;
  estimate_number: string;
  customer_name: string;
  total: number;
  estimate_date: string;
  valid_until: string | null;
  status: string;
  converted_invoice_id: string | null;
}

function getStatusStyle(status: string) {
  switch (status) {
    case "accepted": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
    case "sent": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "draft": return "bg-muted text-muted-foreground";
    case "converted": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    case "rejected": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "expired": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function EstimatesPage() {
  const [activeTab, setActiveTab] = useState<EstimateStatus>("all");
  const [search, setSearch] = useState("");
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEstimates();
  }, []);

  const fetchEstimates = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("estimates")
      .select("id, estimate_number, customer_name, total, estimate_date, valid_until, status, converted_invoice_id")
      .order("created_at", { ascending: false });
    if (data) setEstimates(data);
    setLoading(false);
  };

  const filtered = estimates.filter((e) => {
    if (activeTab !== "all" && e.status !== activeTab) return false;
    if (search && !e.customer_name?.toLowerCase().includes(search.toLowerCase()) &&
        !e.estimate_number?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalValue = estimates.reduce((s, e) => s + (e.total || 0), 0);
  const acceptedValue = estimates.filter(e => e.status === "accepted").reduce((s, e) => s + (e.total || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Estimates</h1>
          <p className="text-muted-foreground text-sm mt-1">Quotations and proposals for customers</p>
        </div>
        <Link
          href="/estimates/new"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Estimate
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Total Quotes</p>
          <p className="text-2xl font-bold mt-1">{estimates.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">Total Value</p>
          <p className="text-2xl font-bold mt-1">₹{totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 col-span-2 sm:col-span-1">
          <p className="text-sm text-muted-foreground">Accepted Value</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">₹{acceptedValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by customer or estimate number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No estimates found</p>
          <Link
            href="/estimates/new"
            className="mt-4 inline-flex items-center gap-2 text-primary hover:underline text-sm"
          >
            <Plus className="w-4 h-4" /> Create your first estimate
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((est) => (
            <Link
              key={est.id}
              href={`/estimates/${est.id}`}
              className="block bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{est.estimate_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${getStatusStyle(est.status)}`}>
                      {est.status}
                    </span>
                    {est.converted_invoice_id && (
                      <span className="text-xs text-purple-600 flex items-center gap-1">
                        <ArrowRight className="w-3 h-3" /> Invoice
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">{est.customer_name || "—"}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{new Date(est.estimate_date).toLocaleDateString("en-IN")}</span>
                    {est.valid_until && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Valid till {new Date(est.valid_until).toLocaleDateString("en-IN")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-foreground">₹{est.total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

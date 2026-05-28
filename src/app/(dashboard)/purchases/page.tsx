"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Plus,
  Search,
  ShoppingCart,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  Building2,
} from "lucide-react";
import type { PurchaseInvoice } from "@/types/database";
import { EmptyState } from "@/components/ui/empty-state";
import { Breadcrumb } from "@/components/ui/breadcrumb";

const statusConfig = {
  pending: { label: "Pending", icon: Clock, color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30" },
  partial: { label: "Partial", icon: AlertCircle, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
  paid: { label: "Paid", icon: CheckCircle, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "text-slate-500 bg-slate-100 dark:bg-slate-800" },
};

type StatusFilter = "all" | "pending" | "partial" | "paid" | "cancelled";

export default function PurchasesPage() {
  const router = useRouter();
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const fetchPurchases = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from("users")
        .select("business_id")
        .eq("id", user.id)
        .single();

      if (!userData?.business_id) return;

      const { data } = await supabase
        .from("purchase_invoices")
        .select("*")
        .eq("business_id", userData.business_id)
        .order("bill_date", { ascending: false });

      if (data) setPurchases(data);
    } catch (err) {
      console.error("Error fetching purchases:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  const filteredPurchases = purchases.filter((purchase) => {
    const matchesSearch =
      purchase.bill_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      purchase.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || purchase.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate totals
  const totalPending = purchases
    .filter((p) => p.status === "pending" || p.status === "partial")
    .reduce((sum, p) => sum + (p.total - p.amount_paid), 0);

  const totalThisMonth = purchases
    .filter((p) => {
      const billDate = new Date(p.bill_date);
      const now = new Date();
      return billDate.getMonth() === now.getMonth() && billDate.getFullYear() === now.getFullYear();
    })
    .reduce((sum, p) => sum + p.total, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Purchases" }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Purchases</h1>
          <p className="text-muted-foreground mt-1">Track bills and payments to suppliers</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/suppliers"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-muted text-foreground font-medium rounded-xl hover:bg-muted/80 transition-colors"
          >
            <Building2 className="w-4 h-4" />
            <span className="hidden sm:inline">Suppliers</span>
          </Link>
          <Link
            href="/purchases/new"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add Purchase</span>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Pending Payments</p>
          <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">
            ₹{totalPending.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">This Month</p>
          <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">
            ₹{totalThisMonth.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by bill number or supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-xl border border-slate-200/50 dark:border-slate-800/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
          {(["all", "pending", "partial", "paid"] as StatusFilter[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === status
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {status === "all" ? "All" : statusConfig[status].label}
            </button>
          ))}
        </div>
      </div>

      {/* Purchases List */}
      {filteredPurchases.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="w-8 h-8" />}
          title={searchQuery || statusFilter !== "all" ? "No purchases found" : "No purchase bills yet"}
          description={searchQuery || statusFilter !== "all"
            ? "Try adjusting your search query or status filter."
            : "Record your purchase bills from suppliers to track liabilities and claim input tax credit."}
          action={(!searchQuery && statusFilter === "all") ? { label: "Add Purchase", href: "/purchases/new" } : undefined}
          secondaryAction={searchQuery ? { label: "Clear search", onClick: () => setSearchQuery("") } : undefined}
          className="bg-white/70 dark:bg-slate-950/70 border border-slate-200/50 dark:border-slate-800/50 rounded-2xl"
        />
      ) : (
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200/50 dark:border-slate-800/50">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-4">
                    Bill #
                  </th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-4">
                    Supplier
                  </th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-4">
                    Date
                  </th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-4">
                    Amount
                  </th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-4">
                    Balance
                  </th>
                  <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-6 py-4">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                {filteredPurchases.map((purchase) => {
                  const status = statusConfig[purchase.status];
                  const StatusIcon = status.icon;
                  const balance = purchase.total - purchase.amount_paid;

                  return (
                    <tr
                      key={purchase.id}
                      className="hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/purchases/${purchase.id}`)}
                    >
                      <td className="px-6 py-4">
                        <span className="font-medium text-foreground">{purchase.bill_number}</span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {purchase.supplier_name || "—"}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {new Date(purchase.bill_date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-foreground">
                        ₹{purchase.total.toLocaleString("en-IN")}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={balance > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                          ₹{balance.toLocaleString("en-IN")}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {status.label}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="sm:hidden divide-y divide-slate-200/50 dark:divide-slate-800/50">
            {filteredPurchases.map((purchase) => {
              const status = statusConfig[purchase.status];
              const StatusIcon = status.icon;
              const balance = purchase.total - purchase.amount_paid;

              return (
                <Link
                  key={purchase.id}
                  href={`/purchases/${purchase.id}`}
                  className="block p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{purchase.bill_number}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {purchase.supplier_name || "Unknown Supplier"}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {status.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(purchase.bill_date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">₹{purchase.total.toLocaleString("en-IN")}</p>
                      {balance > 0 && (
                        <p className="text-xs text-amber-600">Due: ₹{balance.toLocaleString("en-IN")}</p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

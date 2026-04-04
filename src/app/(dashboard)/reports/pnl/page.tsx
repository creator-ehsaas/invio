"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, Loader2, TrendingUp, TrendingDown, Download, Calendar,
  Sparkles, DollarSign, ShoppingCart, Receipt, PieChart
} from "lucide-react";

type Period = "this_month" | "last_month" | "this_quarter" | "this_year";

const periods: { id: Period; label: string }[] = [
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "this_quarter", label: "This Quarter" },
  { id: "this_year", label: "This Year" },
];

interface PnLData {
  revenue: number;
  cogs: number;          // Cost of goods sold (purchases)
  grossProfit: number;
  expensesByCategory: { name: string; amount: number }[];
  totalExpenses: number;
  netProfit: number;
  invoiceCount: number;
  purchaseCount: number;
  expenseCount: number;
}

function getDateRange(period: Period): { start: Date; end: Date } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (period) {
    case "this_month":
      return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0, 23, 59, 59) };
    case "last_month":
      return { start: new Date(year, month - 1, 1), end: new Date(year, month, 0, 23, 59, 59) };
    case "this_quarter":
      const qs = Math.floor(month / 3) * 3;
      return { start: new Date(year, qs, 1), end: new Date(year, qs + 3, 0, 23, 59, 59) };
    case "this_year":
      const fy = month >= 3 ? year : year - 1;
      return { start: new Date(fy, 3, 1), end: new Date(fy + 1, 2, 31, 23, 59, 59) };
  }
}

export default function PnLPage() {
  const [period, setPeriod] = useState<Period>("this_month");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PnLData | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);

  useEffect(() => {
    fetchPnL();
  }, [period]);

  const fetchPnL = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userData } = await supabase.from("users").select("business_id").eq("id", user.id).single();
    if (!userData?.business_id) { setLoading(false); return; }

    const { start, end } = getDateRange(period);
    const startStr = start.toISOString().split("T")[0];
    const endStr = end.toISOString().split("T")[0];

    // Fetch all data in parallel
    const [{ data: invoices }, { data: purchases }, { data: expenses }] = await Promise.all([
      supabase.from("invoices")
        .select("total, status")
        .eq("business_id", userData.business_id)
        .gte("invoice_date", startStr)
        .lte("invoice_date", endStr)
        .in("status", ["paid", "sent"]),
      supabase.from("purchase_invoices")
        .select("total, status")
        .eq("business_id", userData.business_id)
        .gte("bill_date", startStr)
        .lte("bill_date", endStr)
        .neq("status", "cancelled"),
      supabase.from("expenses")
        .select("amount, category_name")
        .eq("business_id", userData.business_id)
        .gte("expense_date", startStr)
        .lte("expense_date", endStr),
    ]);

    const revenue = (invoices || []).filter(i => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
    const cogs = (purchases || []).reduce((s, p) => s + (p.total || 0), 0);
    const grossProfit = revenue - cogs;

    // Group expenses by category
    const catMap = new Map<string, number>();
    for (const e of expenses || []) {
      const cat = e.category_name || "Other";
      catMap.set(cat, (catMap.get(cat) || 0) + (e.amount || 0));
    }
    const expensesByCategory = Array.from(catMap.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    const totalExpenses = expensesByCategory.reduce((s, e) => s + e.amount, 0);
    const netProfit = grossProfit - totalExpenses;

    setData({
      revenue,
      cogs,
      grossProfit,
      expensesByCategory,
      totalExpenses,
      netProfit,
      invoiceCount: (invoices || []).length,
      purchaseCount: (purchases || []).length,
      expenseCount: (expenses || []).length,
    });
    setLoading(false);
  };

  const getAiInsight = async () => {
    if (!data || loadingInsight) return;
    setLoadingInsight(true);
    setAiInsight(null);
    try {
      const res = await fetch("/api/ai-pnl-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, period }),
      });
      if (res.ok) { const { insight } = await res.json(); setAiInsight(insight); }
    } catch { setAiInsight("Could not load insight."); }
    finally { setLoadingInsight(false); }
  };

  const downloadCSV = () => {
    if (!data) return;
    const rows = [
      ["Profit & Loss Statement", periods.find(p => p.id === period)?.label || ""],
      [""],
      ["Revenue (Sales)", `₹${data.revenue}`],
      ["Less: Cost of Goods Sold", `₹${data.cogs}`],
      ["Gross Profit", `₹${data.grossProfit}`],
      [""],
      ["Operating Expenses:"],
      ...data.expensesByCategory.map(e => [`  ${e.name}`, `₹${e.amount}`]),
      ["Total Operating Expenses", `₹${data.totalExpenses}`],
      [""],
      ["Net Profit/(Loss)", `₹${data.netProfit}`],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pnl-${period}.csv`;
    a.click();
  };

  const fmt = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const periodLabel = periods.find(p => p.id === period)?.label || "";

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/reports" className="p-2 hover:bg-muted rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Profit & Loss Statement</h1>
          <p className="text-muted-foreground text-sm">{periodLabel}</p>
        </div>
        <button
          onClick={downloadCSV}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl hover:bg-muted transition-colors text-sm"
        >
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Period filter */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
        {periods.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              period === p.id ? "bg-white dark:bg-slate-900 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 text-emerald-600 mb-2">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-medium">Revenue</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{fmt(data.revenue)}</p>
            <p className="text-xs text-muted-foreground">{data.invoiceCount} invoices paid</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 text-blue-600 mb-2">
              <ShoppingCart className="w-4 h-4" />
              <span className="text-xs font-medium">COGS</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{fmt(data.cogs)}</p>
            <p className="text-xs text-muted-foreground">{data.purchaseCount} purchases</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 text-amber-600 mb-2">
              <Receipt className="w-4 h-4" />
              <span className="text-xs font-medium">Expenses</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{fmt(data.totalExpenses)}</p>
            <p className="text-xs text-muted-foreground">{data.expenseCount} expenses</p>
          </div>
          <div className={`border rounded-2xl p-4 ${data.netProfit >= 0 ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"}`}>
            <div className={`flex items-center gap-2 mb-2 ${data.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {data.netProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="text-xs font-medium">Net {data.netProfit >= 0 ? "Profit" : "Loss"}</span>
            </div>
            <p className={`text-2xl font-bold ${data.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(data.netProfit)}</p>
            <p className="text-xs text-muted-foreground">
              {data.revenue > 0 ? `${((data.netProfit / data.revenue) * 100).toFixed(1)}% margin` : "—"}
            </p>
          </div>
        </div>
      )}

      {/* AI Insight */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border border-purple-200 dark:border-purple-800/50 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-purple-600 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">AI Profitability Analysis</p>
              {aiInsight ? (
                <p className="text-sm text-muted-foreground mt-1">{aiInsight}</p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">Get AI-powered insights on your profit margins, expense patterns, and optimization opportunities.</p>
              )}
            </div>
          </div>
          <button
            onClick={getAiInsight}
            disabled={loadingInsight || !data}
            className="shrink-0 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loadingInsight ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Analyze
          </button>
        </div>
      </div>

      {/* P&L Table */}
      {data && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {/* Revenue section */}
              <tr className="border-b border-border bg-emerald-50/50 dark:bg-emerald-950/20">
                <td className="px-6 py-4 font-semibold text-foreground">Revenue (Sales)</td>
                <td className="px-6 py-4 text-right font-semibold text-emerald-600">{fmt(data.revenue)}</td>
              </tr>

              {/* COGS */}
              <tr className="border-b border-border">
                <td className="px-6 py-3 text-muted-foreground pl-10">Less: Cost of Goods Sold (Purchases)</td>
                <td className="px-6 py-3 text-right text-red-600">({fmt(data.cogs)})</td>
              </tr>

              {/* Gross Profit */}
              <tr className="border-b border-border bg-muted/30">
                <td className="px-6 py-4 font-semibold text-foreground">Gross Profit</td>
                <td className={`px-6 py-4 text-right font-semibold ${data.grossProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {fmt(data.grossProfit)}
                </td>
              </tr>

              {/* Expenses */}
              <tr className="border-b border-border">
                <td colSpan={2} className="px-6 py-3 font-semibold text-foreground bg-muted/20">Operating Expenses</td>
              </tr>
              {data.expensesByCategory.map(e => (
                <tr key={e.name} className="border-b border-border/50">
                  <td className="px-6 py-2.5 text-muted-foreground pl-10">{e.name}</td>
                  <td className="px-6 py-2.5 text-right text-red-600">({fmt(e.amount)})</td>
                </tr>
              ))}
              {data.expensesByCategory.length === 0 && (
                <tr className="border-b border-border/50">
                  <td colSpan={2} className="px-6 py-3 text-center text-muted-foreground italic">No expenses recorded</td>
                </tr>
              )}
              <tr className="border-b border-border bg-muted/30">
                <td className="px-6 py-3 font-medium text-foreground">Total Operating Expenses</td>
                <td className="px-6 py-3 text-right font-medium text-red-600">({fmt(data.totalExpenses)})</td>
              </tr>

              {/* Net Profit */}
              <tr className={`${data.netProfit >= 0 ? "bg-emerald-100 dark:bg-emerald-950/40" : "bg-red-100 dark:bg-red-950/40"}`}>
                <td className="px-6 py-5 font-bold text-lg text-foreground">Net {data.netProfit >= 0 ? "Profit" : "Loss"}</td>
                <td className={`px-6 py-5 text-right font-bold text-lg ${data.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {data.netProfit >= 0 ? "" : "("}{fmt(data.netProfit)}{data.netProfit >= 0 ? "" : ")"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Expense breakdown chart placeholder */}
      {data && data.expensesByCategory.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <PieChart className="w-4 h-4" /> Expense Breakdown
          </h3>
          <div className="space-y-2">
            {data.expensesByCategory.map(e => {
              const pct = data.totalExpenses > 0 ? (e.amount / data.totalExpenses) * 100 : 0;
              return (
                <div key={e.name} className="flex items-center gap-3">
                  <span className="w-32 text-sm text-muted-foreground truncate">{e.name}</span>
                  <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary/70 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-20 text-right text-sm font-medium">{fmt(e.amount)}</span>
                  <span className="w-12 text-right text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

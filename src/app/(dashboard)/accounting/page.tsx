"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Scale, TrendingUp, TrendingDown, ArrowRightLeft, BookOpen, Building2, CreditCard, BarChart3, FileText, RefreshCw, Landmark } from "lucide-react";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/breadcrumb";

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const modules = [
  {
    title: "Balance Sheet",
    description: "Assets, liabilities, and equity at a glance",
    href: "/reports/balance-sheet",
    icon: Scale,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/20",
  },
  {
    title: "Trial Balance",
    description: "Debit/credit summary across all accounts",
    href: "/reports/trial-balance",
    icon: BarChart3,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/20",
  },
  {
    title: "Cash Flow Statement",
    description: "Cash inflows and outflows by period",
    href: "/reports/cashflow",
    icon: ArrowRightLeft,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
  },
  {
    title: "Sales Register",
    description: "Detailed sales invoice register with GST",
    href: "/reports/sales-register",
    icon: TrendingUp,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
  },
  {
    title: "Purchase Register",
    description: "Detailed purchase register with ITC",
    href: "/reports/purchase-register",
    icon: TrendingDown,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/20",
  },
  {
    title: "Bank Accounts",
    description: "Manage business bank and cash accounts",
    href: "/accounting/banks",
    icon: Building2,
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-50 dark:bg-sky-950/20",
  },
  {
    title: "Balance Sheet Items",
    description: "Fixed assets, loans, capital, advance/income tax",
    href: "/accounting/balances",
    icon: Landmark,
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-950/20",
  },
  {
    title: "P&L Statement",
    description: "Profit and loss with expense breakdown",
    href: "/reports/pnl",
    icon: FileText,
    color: "text-primary",
    bg: "bg-primary/5",
  },
  {
    title: "GSTR-3B",
    description: "Monthly/quarterly GST return with ITC",
    href: "/reports/gstr3b",
    icon: CreditCard,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-950/20",
  },
  {
    title: "GSTR-1",
    description: "Outward supplies return — B2B, B2CS, HSN",
    href: "/reports/gstr1",
    icon: FileText,
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/20",
  },
];

export default function AccountingPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalPurchases: 0,
    totalExpenses: 0,
    netProfit: 0,
    ar: 0,
    ap: 0,
    gstPayable: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: ud } = await supabase.from("users").select("business_id").eq("id", user.id).single();
      if (!ud?.business_id) { setLoading(false); return; }
      const bid = ud.business_id;

      const now = new Date();
      const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const fyStart = `${fy}-04-01`;
      const fyEnd = `${fy + 1}-03-31`;

      const [{ data: invoices }, { data: purchases }, { data: expenses }] = await Promise.all([
        supabase.from("invoices").select("total, subtotal, cgst, sgst, igst, status").eq("business_id", bid).neq("status", "cancelled").gte("invoice_date", fyStart).lte("invoice_date", fyEnd),
        supabase.from("purchase_invoices").select("total, subtotal, cgst, sgst, igst, amount_paid, status").eq("business_id", bid).neq("status", "cancelled").gte("bill_date", fyStart).lte("bill_date", fyEnd),
        supabase.from("expenses").select("amount").eq("business_id", bid).gte("expense_date", fyStart).lte("expense_date", fyEnd),
      ]);

      const totalRevenue = (invoices || []).reduce((s, i) => s + (i.subtotal || 0), 0);
      const totalPurchases = (purchases || []).reduce((s, p) => s + (p.subtotal || 0), 0);
      const totalExpenses = (expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
      const netProfit = totalRevenue - totalPurchases - totalExpenses;
      const ar = (invoices || []).filter((i) => i.status !== "paid").reduce((s, i) => s + (i.total || 0), 0);
      const ap = (purchases || []).filter((p) => p.status !== "paid").reduce((s, p) => s + ((p.total || 0) - (p.amount_paid || 0)), 0);
      const outputGst = (invoices || []).reduce((s, i) => s + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0), 0);
      const itc = (purchases || []).reduce((s, p) => s + (p.cgst || 0) + (p.sgst || 0) + (p.igst || 0), 0);

      setStats({ totalRevenue, totalPurchases, totalExpenses, netProfit, ar, ap, gstPayable: Math.max(0, outputGst - itc) });
      setLoading(false);
    };
    fetchStats();
  }, []);

  const fy = new Date().getMonth() >= 3 ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Accounting" }]} />

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Accounting</h1>
          <p className="text-sm text-muted-foreground">Financial year {fy} overview</p>
        </div>
      </div>

      {/* Key metrics */}
      {loading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Revenue", value: stats.totalRevenue, color: "text-emerald-600 dark:text-emerald-400" },
            { label: "Net Profit", value: stats.netProfit, color: stats.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400" },
            { label: "Receivables (AR)", value: stats.ar, color: "text-blue-600 dark:text-blue-400" },
            { label: "Payables (AP)", value: stats.ap, color: "text-amber-600 dark:text-amber-400" },
            { label: "Purchases (COGS)", value: stats.totalPurchases, color: "text-foreground" },
            { label: "Expenses", value: stats.totalExpenses, color: "text-foreground" },
            { label: "GST Payable", value: stats.gstPayable, color: "text-rose-600 dark:text-rose-400" },
            { label: "Net Cash (est.)", value: Math.max(0, stats.totalRevenue - stats.totalPurchases - stats.totalExpenses), color: "text-foreground" },
          ].map((m) => (
            <div key={m.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
              <p className={`text-lg font-bold ${m.color}`}>{fmt(m.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Module cards */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Accounting Modules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {modules.map((mod) => (
            <Link key={mod.href} href={mod.href}
              className="group bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition-all">
              <div className={`w-9 h-9 rounded-lg ${mod.bg} flex items-center justify-center mb-3`}>
                <mod.icon className={`h-4.5 w-4.5 ${mod.color}`} />
              </div>
              <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">{mod.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

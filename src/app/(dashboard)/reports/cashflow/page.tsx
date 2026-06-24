"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Download, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";

type Period = "this_month" | "last_month" | "this_quarter" | "this_year";
const periods: { id: Period; label: string }[] = [
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "this_quarter", label: "This Quarter" },
  { id: "this_year", label: "This Year" },
];

function getDateRange(period: Period) {
  const now = new Date();
  const y = now.getFullYear(); const m = now.getMonth();
  switch (period) {
    case "this_month": return { start: new Date(y, m, 1).toISOString().split("T")[0], end: new Date(y, m + 1, 0).toISOString().split("T")[0] };
    case "last_month": return { start: new Date(y, m - 1, 1).toISOString().split("T")[0], end: new Date(y, m, 0).toISOString().split("T")[0] };
    case "this_quarter": { const qs = Math.floor(m / 3) * 3; return { start: new Date(y, qs, 1).toISOString().split("T")[0], end: new Date(y, qs + 3, 0).toISOString().split("T")[0] }; }
    case "this_year": { const fy = m >= 3 ? y : y - 1; return { start: `${fy}-04-01`, end: `${fy + 1}-03-31` }; }
  }
}

function fmt(n: number) {
  const sign = n < 0 ? "−" : n > 0 ? "+" : "";
  return `${sign}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CashRow({ label, value, bold, indent, sub }: { label: string; value: number; bold?: boolean; indent?: boolean; sub?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${indent ? "pl-6" : ""}`}>
      <span className={`text-sm ${bold ? "font-semibold text-foreground" : sub ? "text-muted-foreground/80" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-sm font-mono font-medium ${value > 0 ? "text-emerald-600 dark:text-emerald-400" : value < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
        {fmt(value)}
      </span>
    </div>
  );
}

export default function CashFlowPage() {
  const [period, setPeriod] = useState<Period>("this_month");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    cashFromCustomers: number; pendingAR: number; cashToPurchases: number;
    pendingAP: number; cashToExpenses: number; expByCategory: Record<string, number>;
    netOperating: number; invoiceCount: number; paidInvoiceCount: number;
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: ud } = await supabase.from("users").select("business_id").eq("id", user.id).single();
    if (!ud?.business_id) { setLoading(false); return; }
    const bid = ud.business_id;
    const range = getDateRange(period);

    const [{ data: invoices }, { data: purchases }, { data: expenses }] = await Promise.all([
      supabase.from("invoices").select("total, status, invoice_date").eq("business_id", bid).gte("invoice_date", range.start).lte("invoice_date", range.end).neq("status", "cancelled"),
      supabase.from("purchase_invoices").select("total, amount_paid, bill_date, status").eq("business_id", bid).gte("bill_date", range.start).lte("bill_date", range.end).neq("status", "cancelled"),
      supabase.from("expenses").select("amount, category, expense_date").eq("business_id", bid).gte("expense_date", range.start).lte("expense_date", range.end),
    ]);

    // Operating cash inflows
    const cashFromCustomers = (invoices || []).filter((i) => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
    const pendingAR = (invoices || []).filter((i) => i.status !== "paid").reduce((s, i) => s + (i.total || 0), 0);

    // Operating cash outflows
    const cashToPurchases = (purchases || []).reduce((s, p) => s + (p.amount_paid || 0), 0);
    const pendingAP = (purchases || []).filter((p) => p.status !== "paid" && p.status !== "cancelled")
      .reduce((s, p) => s + ((p.total || 0) - (p.amount_paid || 0)), 0);
    const cashToExpenses = (expenses || []).reduce((s, e) => s + (e.amount || 0), 0);

    // By expense category
    const expByCategory: Record<string, number> = {};
    (expenses || []).forEach((e) => {
      const cat = e.category || "Other";
      expByCategory[cat] = (expByCategory[cat] || 0) + (e.amount || 0);
    });

    const netOperating = cashFromCustomers - cashToPurchases - cashToExpenses;

    setData({
      cashFromCustomers,
      pendingAR,
      cashToPurchases,
      pendingAP,
      cashToExpenses,
      expByCategory,
      netOperating,
      invoiceCount: (invoices || []).length,
      paidInvoiceCount: (invoices || []).filter((i) => i.status === "paid").length,
    });
    setLoading(false);
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportCSV = () => {
    if (!data) return;
    const rows = [
      ["Cash Flow Statement"],
      ["Operating Activities", "Amount"],
      ["Cash Received from Customers", data.cashFromCustomers.toFixed(2)],
      ["Cash Paid to Suppliers", (-data.cashToPurchases).toFixed(2)],
      ["Cash Paid for Expenses", (-data.cashToExpenses).toFixed(2)],
      ["Net Cash from Operating Activities", data.netOperating.toFixed(2)],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `cashflow-${period}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Breadcrumb items={[{ label: "Reports", href: "/reports" }, { label: "Cash Flow" }]} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cash Flow Statement</h1>
          <p className="text-sm text-muted-foreground">Cash inflows and outflows for the selected period</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-2"><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2"><Download className="h-4 w-4" /> Export</Button>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit flex-wrap">
        {periods.map((p) => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${period === p.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : data && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Cash In", value: data.cashFromCustomers, icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
              { label: "Cash Out", value: -(data.cashToPurchases + data.cashToExpenses), icon: TrendingDown, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/20" },
              { label: "Net Flow", value: data.netOperating, icon: Minus, color: data.netOperating >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400", bg: data.netOperating >= 0 ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-red-50 dark:bg-red-950/20" },
            ].map((card) => (
              <div key={card.label} className={`${card.bg} rounded-xl p-4 border border-border/30`}>
                <card.icon className={`h-4 w-4 ${card.color} mb-2`} />
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className={`text-lg font-bold ${card.color}`}>₹{Math.abs(card.value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
              </div>
            ))}
          </div>

          {/* Detailed */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-1">
            <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Operating Activities</p>

            <CashRow label="Cash Received from Customers" value={data.cashFromCustomers} />
            <CashRow label={`Pending (${data.invoiceCount - data.paidInvoiceCount} unpaid invoices)`} value={data.pendingAR} indent sub />

            <div className="border-t border-border/30 my-2" />

            <CashRow label="Cash Paid to Suppliers" value={-data.cashToPurchases} />
            {data.pendingAP > 0 && <CashRow label="Outstanding payables" value={-data.pendingAP} indent sub />}

            {Object.entries(data.expByCategory).map(([cat, amt]: any) => (
              <CashRow key={cat} label={cat} value={-amt} indent />
            ))}

            <div className="border-t border-border/30 mt-3 pt-3">
              <CashRow label="Net Cash from Operating Activities" value={data.netOperating} bold />
            </div>

            <div className="border-t border-border/30 mt-3 pt-3 space-y-1">
              <CashRow label="Investing Activities" value={0} />
              <CashRow label="Financing Activities" value={0} />
              <div className="border-t border-border/30 mt-3 pt-3">
                <CashRow label="Net Change in Cash" value={data.netOperating} bold />
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            * Shows actual cash received/paid. Connect Bank Accounts in Accounting for bank statement–level accuracy.
          </p>
        </div>
      )}
    </div>
  );
}

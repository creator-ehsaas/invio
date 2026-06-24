"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Download, RefreshCw, Scale } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";

interface BalanceSheetData {
  // Assets
  accountsReceivable: number;       // Unpaid invoices
  inventoryValue: number;           // Stock × unit price
  estimatedCash: number;            // Paid invoices − paid purchases − expenses
  totalCurrentAssets: number;

  // Liabilities
  accountsPayable: number;          // Unpaid purchase bills
  gstPayable: number;               // Output GST − ITC (if positive)
  totalCurrentLiabilities: number;

  // Equity
  retainedEarnings: number;         // Cumulative revenue − purchases − expenses
  totalEquity: number;

  totalAssets: number;
  totalLiabilities: number;
  asOf: string;
}

function fmt(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  return `${sign}₹${abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Row({ label, value, bold, indent, highlight }: {
  label: string; value: number; bold?: boolean; indent?: boolean; highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${
      highlight ? "bg-primary/5 rounded-lg px-3 -mx-3" : indent ? "pl-6" : ""
    } ${bold ? "font-semibold" : ""}`}>
      <span className={`text-sm ${bold ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-sm font-mono ${
        value < 0 ? "text-red-600 dark:text-red-400" : bold ? "text-foreground" : "text-muted-foreground"
      }`}>{fmt(value)}</span>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mt-6 mb-2 pb-1.5 border-b border-border/50">
      <span className="text-xs font-bold uppercase tracking-widest text-primary">{label}</span>
    </div>
  );
}

export default function BalanceSheetPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BalanceSheetData | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: userData } = await supabase.from("users").select("business_id").eq("id", user.id).single();
    if (!userData?.business_id) { setLoading(false); return; }
    const bid = userData.business_id;

    const [
      { data: invoices },
      { data: purchases },
      { data: expenses },
      { data: inventory },
    ] = await Promise.all([
      supabase.from("invoices").select("total, subtotal, cgst, sgst, igst, status").eq("business_id", bid),
      supabase.from("purchase_invoices").select("total, subtotal, cgst, sgst, igst, status, amount_paid").eq("business_id", bid),
      supabase.from("expenses").select("amount").eq("business_id", bid),
      supabase.from("inventory_items").select("current_stock, unit_price").eq("business_id", bid),
    ]);

    // AR = unpaid invoices
    const ar = (invoices || [])
      .filter((i) => i.status !== "paid" && i.status !== "cancelled")
      .reduce((s, i) => s + (i.total || 0), 0);

    // Inventory
    const invVal = (inventory || []).reduce((s, i) => s + (i.current_stock || 0) * (i.unit_price || 0), 0);

    // Cash estimate = paid invoices − paid purchases − all expenses
    const paidRevenue = (invoices || []).filter((i) => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
    const paidPurchases = (purchases || []).reduce((s, p) => s + (p.amount_paid || 0), 0);
    const totalExp = (expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
    const estCash = Math.max(0, paidRevenue - paidPurchases - totalExp);

    const totalCurrentAssets = ar + invVal + estCash;

    // AP = unpaid purchases (total − amount_paid)
    const ap = (purchases || [])
      .filter((p) => p.status !== "paid" && p.status !== "cancelled")
      .reduce((s, p) => s + ((p.total || 0) - (p.amount_paid || 0)), 0);

    // GST payable = output GST − ITC (capped at 0)
    const outputGst = (invoices || []).filter((i) => i.status !== "cancelled")
      .reduce((s, i) => s + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0), 0);
    const itc = (purchases || []).filter((p) => p.status !== "cancelled")
      .reduce((s, p) => s + (p.cgst || 0) + (p.sgst || 0) + (p.igst || 0), 0);
    const gstPayable = Math.max(0, outputGst - itc);

    const totalCurrentLiabilities = ap + gstPayable;

    // Retained earnings = total revenue (paid) − COGS (total purchases) − operating expenses
    const totalRevenue = (invoices || []).filter((i) => i.status !== "cancelled")
      .reduce((s, i) => s + (i.subtotal || 0), 0);
    const totalCogs = (purchases || []).filter((p) => p.status !== "cancelled")
      .reduce((s, p) => s + (p.subtotal || 0), 0);
    const retainedEarnings = totalRevenue - totalCogs - totalExp;

    const totalEquity = retainedEarnings;
    const totalAssets = totalCurrentAssets;
    const totalLiabilities = totalCurrentLiabilities;

    setData({
      accountsReceivable: ar,
      inventoryValue: invVal,
      estimatedCash: estCash,
      totalCurrentAssets,
      accountsPayable: ap,
      gstPayable,
      totalCurrentLiabilities,
      retainedEarnings,
      totalEquity,
      totalAssets,
      totalLiabilities,
      asOf: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
    });
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportCSV = () => {
    if (!data) return;
    const rows = [
      ["Balance Sheet", `As of ${data.asOf}`],
      [],
      ["ASSETS", ""],
      ["Accounts Receivable", data.accountsReceivable.toFixed(2)],
      ["Inventory", data.inventoryValue.toFixed(2)],
      ["Cash & Bank (est.)", data.estimatedCash.toFixed(2)],
      ["Total Assets", data.totalAssets.toFixed(2)],
      [],
      ["LIABILITIES", ""],
      ["Accounts Payable", data.accountsPayable.toFixed(2)],
      ["GST Payable", data.gstPayable.toFixed(2)],
      ["Total Liabilities", data.totalLiabilities.toFixed(2)],
      [],
      ["EQUITY", ""],
      ["Retained Earnings", data.retainedEarnings.toFixed(2)],
      ["Total Equity", data.totalEquity.toFixed(2)],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `balance-sheet-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return null;

  const isBalanced = Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity)) < 1;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Breadcrumb items={[{ label: "Reports", href: "/reports" }, { label: "Balance Sheet" }]} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Balance Sheet</h1>
          <p className="text-sm text-muted-foreground">As of {data.asOf}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* Balance check */}
      <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border ${
        isBalanced
          ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
          : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
      }`}>
        <Scale className="h-4 w-4 shrink-0" />
        <span>
          {isBalanced
            ? "Balance sheet is balanced — Assets = Liabilities + Equity"
            : "Note: Difference may be due to opening balances not set. Go to Accounting → Opening Balances to set them."}
        </span>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-1">

        {/* ASSETS */}
        <SectionHeader label="Assets" />
        <Row label="Accounts Receivable (Unpaid Invoices)" value={data.accountsReceivable} indent />
        <Row label="Inventory" value={data.inventoryValue} indent />
        <Row label="Cash & Bank (estimated)" value={data.estimatedCash} indent />
        <Row label="Total Current Assets" value={data.totalCurrentAssets} bold highlight />

        <Row label="Fixed Assets" value={0} indent />
        <Row label="Total Assets" value={data.totalAssets} bold highlight />

        {/* LIABILITIES */}
        <SectionHeader label="Liabilities" />
        <Row label="Accounts Payable (Unpaid Purchases)" value={data.accountsPayable} indent />
        <Row label="GST Payable (Output − ITC)" value={data.gstPayable} indent />
        <Row label="Total Current Liabilities" value={data.totalCurrentLiabilities} bold highlight />
        <Row label="Total Liabilities" value={data.totalLiabilities} bold highlight />

        {/* EQUITY */}
        <SectionHeader label="Equity" />
        <Row
          label="Retained Earnings (Revenue − COGS − Expenses)"
          value={data.retainedEarnings}
          indent
        />
        <Row label="Total Equity" value={data.totalEquity} bold highlight />

        {/* TOTAL */}
        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="font-bold text-foreground">Total Liabilities + Equity</span>
            <span className="font-bold font-mono text-foreground">{fmt(data.totalLiabilities + data.totalEquity)}</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        * Cash & Bank is estimated from cash receipts minus payments. Set up Bank Accounts in Accounting for precise figures.
      </p>
    </div>
  );
}

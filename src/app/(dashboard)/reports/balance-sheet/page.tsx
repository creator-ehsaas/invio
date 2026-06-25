"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Download, RefreshCw, Scale, Settings2 } from "lucide-react";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { toCSV } from "@/lib/csv";

interface BalanceSheetData {
  // Current assets
  cashAndBank: number;
  accountsReceivable: number;
  inventoryValue: number;
  otherCurrentAssets: number;       // manual
  totalCurrentAssets: number;
  // Non-current assets
  fixedAssets: number;              // manual
  investments: number;              // manual
  totalNonCurrentAssets: number;

  // Current liabilities
  accountsPayable: number;
  gstPayable: number;
  otherCurrentLiabilities: number;  // manual (income tax payable, short-term loans)
  totalCurrentLiabilities: number;
  // Non-current liabilities
  longTermLiabilities: number;      // manual
  totalNonCurrentLiabilities: number;

  // Equity
  ownersCapital: number;            // manual
  drawings: number;                 // manual (subtracted)
  retainedEarnings: number;
  totalEquity: number;

  totalAssets: number;
  totalLiabilities: number;
  cashIsEstimated: boolean;
  asOf: string;
}

function fmt(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  return `${sign}₹${abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Row({ label, value, bold, indent, highlight, muted }: {
  label: string; value: number; bold?: boolean; indent?: boolean; highlight?: boolean; muted?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 py-2 ${
      highlight ? "bg-primary/5 rounded-lg px-3 -mx-3" : indent ? "pl-4 sm:pl-6" : ""
    } ${bold ? "font-semibold" : ""}`}>
      <span className={`text-sm ${bold ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-sm font-mono shrink-0 ${
        value < 0 ? "text-red-600 dark:text-red-400" : bold ? "text-foreground" : muted ? "text-muted-foreground/60" : "text-muted-foreground"
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

    // Core derived data (always present)
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

    // Optional tables — degrade gracefully if not yet created
    let bankTotal = 0;
    const { data: banks, error: bankErr } = await supabase
      .from("bank_accounts").select("current_balance").eq("business_id", bid).eq("is_active", true);
    if (!bankErr && banks) bankTotal = banks.reduce((s, b) => s + (b.current_balance || 0), 0);

    const manual: Record<string, number> = {
      fixed_asset: 0, investment: 0, other_current_asset: 0,
      long_term_liability: 0, other_current_liability: 0, capital: 0, drawings: 0,
    };
    const { data: bsItems, error: bsErr } = await supabase
      .from("balance_sheet_entries").select("section, amount").eq("business_id", bid).eq("is_active", true);
    if (!bsErr && bsItems) {
      bsItems.forEach((e) => { manual[e.section] = (manual[e.section] || 0) + (e.amount || 0); });
    }

    // ── Assets ──
    const ar = (invoices || []).filter((i) => i.status !== "paid" && i.status !== "cancelled").reduce((s, i) => s + (i.total || 0), 0);
    const invVal = (inventory || []).reduce((s, i) => s + (i.current_stock || 0) * (i.unit_price || 0), 0);
    const paidRevenue = (invoices || []).filter((i) => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
    const paidPurchases = (purchases || []).reduce((s, p) => s + (p.amount_paid || 0), 0);
    const totalExp = (expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
    const estCash = Math.max(0, paidRevenue - paidPurchases - totalExp);
    // If user maintains bank balances, trust those; otherwise use the operational estimate
    const cashAndBank = bankTotal > 0 ? bankTotal : estCash;
    const cashIsEstimated = bankTotal <= 0;

    const otherCurrentAssets = manual.other_current_asset;
    const totalCurrentAssets = cashAndBank + ar + invVal + otherCurrentAssets;
    const fixedAssets = manual.fixed_asset;
    const investments = manual.investment;
    const totalNonCurrentAssets = fixedAssets + investments;

    // ── Liabilities ──
    const ap = (purchases || []).filter((p) => p.status !== "paid" && p.status !== "cancelled").reduce((s, p) => s + ((p.total || 0) - (p.amount_paid || 0)), 0);
    const outputGst = (invoices || []).filter((i) => i.status !== "cancelled").reduce((s, i) => s + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0), 0);
    const itc = (purchases || []).filter((p) => p.status !== "cancelled").reduce((s, p) => s + (p.cgst || 0) + (p.sgst || 0) + (p.igst || 0), 0);
    const gstPayable = Math.max(0, outputGst - itc);
    const otherCurrentLiabilities = manual.other_current_liability;
    const totalCurrentLiabilities = ap + gstPayable + otherCurrentLiabilities;
    const longTermLiabilities = manual.long_term_liability;
    const totalNonCurrentLiabilities = longTermLiabilities;

    // ── Equity ──
    const totalRevenue = (invoices || []).filter((i) => i.status !== "cancelled").reduce((s, i) => s + (i.subtotal || 0), 0);
    const totalCogs = (purchases || []).filter((p) => p.status !== "cancelled").reduce((s, p) => s + (p.subtotal || 0), 0);
    const retainedEarnings = totalRevenue - totalCogs - totalExp;
    const ownersCapital = manual.capital;
    const drawings = manual.drawings;
    const totalEquity = ownersCapital + retainedEarnings - drawings;

    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;
    const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;

    setData({
      cashAndBank, accountsReceivable: ar, inventoryValue: invVal, otherCurrentAssets, totalCurrentAssets,
      fixedAssets, investments, totalNonCurrentAssets,
      accountsPayable: ap, gstPayable, otherCurrentLiabilities, totalCurrentLiabilities,
      longTermLiabilities, totalNonCurrentLiabilities,
      ownersCapital, drawings, retainedEarnings, totalEquity,
      totalAssets, totalLiabilities, cashIsEstimated,
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
      ["Current Assets", ""],
      ["  Cash & Bank", data.cashAndBank.toFixed(2)],
      ["  Accounts Receivable", data.accountsReceivable.toFixed(2)],
      ["  Inventory", data.inventoryValue.toFixed(2)],
      ["  Other Current Assets", data.otherCurrentAssets.toFixed(2)],
      ["  Total Current Assets", data.totalCurrentAssets.toFixed(2)],
      ["Non-Current Assets", ""],
      ["  Fixed Assets", data.fixedAssets.toFixed(2)],
      ["  Investments", data.investments.toFixed(2)],
      ["  Total Non-Current Assets", data.totalNonCurrentAssets.toFixed(2)],
      ["Total Assets", data.totalAssets.toFixed(2)],
      [],
      ["LIABILITIES", ""],
      ["Current Liabilities", ""],
      ["  Accounts Payable", data.accountsPayable.toFixed(2)],
      ["  GST Payable", data.gstPayable.toFixed(2)],
      ["  Other Current Liabilities", data.otherCurrentLiabilities.toFixed(2)],
      ["  Total Current Liabilities", data.totalCurrentLiabilities.toFixed(2)],
      ["Non-Current Liabilities", ""],
      ["  Long-term Loans & Borrowings", data.longTermLiabilities.toFixed(2)],
      ["Total Liabilities", data.totalLiabilities.toFixed(2)],
      [],
      ["EQUITY", ""],
      ["  Owner's Capital", data.ownersCapital.toFixed(2)],
      ["  Retained Earnings", data.retainedEarnings.toFixed(2)],
      ["  Drawings", (-data.drawings).toFixed(2)],
      ["  Total Equity", data.totalEquity.toFixed(2)],
      [],
      ["Total Liabilities + Equity", (data.totalLiabilities + data.totalEquity).toFixed(2)],
    ];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCSV(rows)], { type: "text/csv" }));
    a.download = `balance-sheet-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  if (!data) return null;

  const diff = data.totalAssets - (data.totalLiabilities + data.totalEquity);
  const isBalanced = Math.abs(diff) < 1;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Breadcrumb items={[{ label: "Reports", href: "/reports" }, { label: "Balance Sheet" }]} />

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Balance Sheet</h1>
          <p className="text-sm text-muted-foreground">As of {data.asOf}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild className="gap-2">
            <Link href="/accounting/balances"><Settings2 className="h-4 w-4" /> Manage Items</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* Balance check */}
      <div className={`flex items-start gap-2 text-sm px-4 py-2.5 rounded-xl border ${
        isBalanced
          ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
          : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
      }`}>
        <Scale className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          {isBalanced
            ? "Balanced — Assets = Liabilities + Equity"
            : `Difference of ${fmt(Math.abs(diff))}. Add opening balances (capital, fixed assets, loans) via "Manage Items" so the sheet balances.`}
        </span>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-1">
        {/* ASSETS */}
        <SectionHeader label="Assets" />
        <Row label="Current Assets" value={data.totalCurrentAssets} bold />
        <Row label={`Cash & Bank${data.cashIsEstimated ? " (estimated)" : ""}`} value={data.cashAndBank} indent />
        <Row label="Accounts Receivable" value={data.accountsReceivable} indent />
        <Row label="Inventory" value={data.inventoryValue} indent />
        <Row label="Other Current Assets" value={data.otherCurrentAssets} indent muted={data.otherCurrentAssets === 0} />
        <Row label="Non-Current Assets" value={data.totalNonCurrentAssets} bold />
        <Row label="Fixed Assets (net)" value={data.fixedAssets} indent muted={data.fixedAssets === 0} />
        <Row label="Investments" value={data.investments} indent muted={data.investments === 0} />
        <Row label="Total Assets" value={data.totalAssets} bold highlight />

        {/* LIABILITIES */}
        <SectionHeader label="Liabilities" />
        <Row label="Current Liabilities" value={data.totalCurrentLiabilities} bold />
        <Row label="Accounts Payable" value={data.accountsPayable} indent />
        <Row label="GST Payable" value={data.gstPayable} indent />
        <Row label="Other Current Liabilities" value={data.otherCurrentLiabilities} indent muted={data.otherCurrentLiabilities === 0} />
        <Row label="Non-Current Liabilities" value={data.totalNonCurrentLiabilities} bold />
        <Row label="Long-term Loans & Borrowings" value={data.longTermLiabilities} indent muted={data.longTermLiabilities === 0} />
        <Row label="Total Liabilities" value={data.totalLiabilities} bold highlight />

        {/* EQUITY */}
        <SectionHeader label="Equity" />
        <Row label="Owner's Capital" value={data.ownersCapital} indent muted={data.ownersCapital === 0} />
        <Row label="Retained Earnings" value={data.retainedEarnings} indent />
        <Row label="Less: Drawings" value={-data.drawings} indent muted={data.drawings === 0} />
        <Row label="Total Equity" value={data.totalEquity} bold highlight />

        {/* TOTAL */}
        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-foreground">Total Liabilities + Equity</span>
            <span className="font-bold font-mono text-foreground shrink-0">{fmt(data.totalLiabilities + data.totalEquity)}</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center px-2">
        Receivables, payables, inventory, GST and retained earnings are computed automatically. Fixed assets, loans,
        investments, owner&apos;s capital, advance tax and income-tax payable are pulled from{" "}
        <Link href="/accounting/balances" className="text-primary underline">Balance Sheet Items</Link>.
        {data.cashIsEstimated && " Cash is estimated from receipts minus payments — add Bank Accounts for exact figures."}
      </p>
    </div>
  );
}

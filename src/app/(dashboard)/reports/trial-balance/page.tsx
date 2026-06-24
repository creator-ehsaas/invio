"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Download, RefreshCw } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { toCSV } from "@/lib/csv";

type Period = "this_month" | "last_month" | "this_quarter" | "this_year" | "all_time";

const periods: { id: Period; label: string }[] = [
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "this_quarter", label: "This Quarter" },
  { id: "this_year", label: "This Year" },
  { id: "all_time", label: "All Time" },
];

interface AccountRow {
  account: string;
  type: string;
  debit: number;
  credit: number;
}

function getDateRange(period: Period): { start: string; end: string } | null {
  if (period === "all_time") return null;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (period) {
    case "this_month": return { start: new Date(y, m, 1).toISOString().split("T")[0], end: new Date(y, m + 1, 0).toISOString().split("T")[0] };
    case "last_month": return { start: new Date(y, m - 1, 1).toISOString().split("T")[0], end: new Date(y, m, 0).toISOString().split("T")[0] };
    case "this_quarter": { const qs = Math.floor(m / 3) * 3; return { start: new Date(y, qs, 1).toISOString().split("T")[0], end: new Date(y, qs + 3, 0).toISOString().split("T")[0] }; }
    case "this_year": { const fy = m >= 3 ? y : y - 1; return { start: `${fy}-04-01`, end: `${fy + 1}-03-31` }; }
  }
}

function fmt(n: number) {
  return n === 0 ? "—" : `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TrialBalancePage() {
  const [period, setPeriod] = useState<Period>("this_year");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: ud } = await supabase.from("users").select("business_id").eq("id", user.id).single();
    if (!ud?.business_id) { setLoading(false); return; }
    const bid = ud.business_id;
    const range = getDateRange(period);

    let invQ = supabase.from("invoices").select("subtotal, cgst, sgst, igst, total, status").eq("business_id", bid).neq("status", "cancelled");
    let purQ = supabase.from("purchase_invoices").select("subtotal, cgst, sgst, igst, total, amount_paid, status").eq("business_id", bid).neq("status", "cancelled");
    let expQ = supabase.from("expenses").select("amount, category").eq("business_id", bid);
    let invItemQ = supabase.from("inventory_items").select("current_stock, unit_price").eq("business_id", bid);

    if (range) {
      invQ = invQ.gte("invoice_date", range.start).lte("invoice_date", range.end);
      purQ = purQ.gte("bill_date", range.start).lte("bill_date", range.end);
      expQ = expQ.gte("expense_date", range.start).lte("expense_date", range.end);
    }

    const [{ data: invoices }, { data: purchases }, { data: expenses }, { data: inventory }] = await Promise.all([invQ, purQ, expQ, invItemQ]);

    const totalRevenue = (invoices || []).reduce((s, i) => s + (i.subtotal || 0), 0);
    const totalCogs = (purchases || []).reduce((s, p) => s + (p.subtotal || 0), 0);
    const totalExp = (expenses || []).reduce((s, e) => s + (e.amount || 0), 0);

    const ar = (invoices || []).filter((i) => i.status !== "paid").reduce((s, i) => s + (i.total || 0), 0);
    const cashIn = (invoices || []).filter((i) => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
    const cashOut = (purchases || []).reduce((s, p) => s + (p.amount_paid || 0), 0) + totalExp;
    const cashBalance = cashIn - cashOut;

    const ap = (purchases || []).filter((p) => p.status !== "paid").reduce((s, p) => s + ((p.total || 0) - (p.amount_paid || 0)), 0);
    const invValue = (inventory || []).reduce((s, i) => s + (i.current_stock || 0) * (i.unit_price || 0), 0);

    const outputGst = (invoices || []).reduce((s, i) => s + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0), 0);
    const inputGst = (purchases || []).reduce((s, p) => s + (p.cgst || 0) + (p.sgst || 0) + (p.igst || 0), 0);

    const accountRows: AccountRow[] = [
      { account: "Cash & Bank", type: "Asset", debit: Math.max(0, cashBalance), credit: Math.max(0, -cashBalance) },
      { account: "Accounts Receivable", type: "Asset", debit: ar, credit: 0 },
      { account: "Inventory", type: "Asset", debit: invValue, credit: 0 },
      { account: "Accounts Payable", type: "Liability", debit: 0, credit: ap },
      { account: "Output GST Payable", type: "Liability", debit: inputGst, credit: outputGst },
      { account: "Sales Revenue", type: "Revenue", debit: 0, credit: totalRevenue },
      { account: "Cost of Goods Sold", type: "Expense", debit: totalCogs, credit: 0 },
      { account: "Operating Expenses", type: "Expense", debit: totalExp, credit: 0 },
    ].filter((r) => r.debit > 0 || r.credit > 0);

    const td = accountRows.reduce((s, r) => s + r.debit, 0);
    const tc = accountRows.reduce((s, r) => s + r.credit, 0);

    setRows(accountRows);
    setTotalDebit(td);
    setTotalCredit(tc);
    setLoading(false);
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportCSV = () => {
    const header = ["Account", "Type", "Debit", "Credit"];
    const dataRows = rows.map((r) => [r.account, r.type, r.debit.toFixed(2), r.credit.toFixed(2)]);
    const total = ["TOTAL", "", totalDebit.toFixed(2), totalCredit.toFixed(2)];
    const csv = toCSV([header, ...dataRows, total]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `trial-balance-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const isBalanced = Math.abs(totalDebit - totalCredit) < 1;

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Reports", href: "/reports" }, { label: "Trial Balance" }]} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Trial Balance</h1>
          <p className="text-sm text-muted-foreground">Debit and credit summary for all accounts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Period tabs */}
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
      ) : (
        <>
          <div className={`text-sm px-4 py-2.5 rounded-xl border ${
            isBalanced ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
                       : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
          }`}>
            {isBalanced ? "✓ Trial balance is balanced" : `⚠ Difference: ₹${Math.abs(totalDebit - totalCredit).toLocaleString("en-IN")} — set opening balances in Accounting to resolve`}
          </div>

          <div className="rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-3 font-semibold text-foreground">Account</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">Type</th>
                  <th className="text-right px-4 py-3 font-semibold text-foreground">Debit</th>
                  <th className="text-right px-4 py-3 font-semibold text-foreground">Credit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{r.account}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        r.type === "Asset" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                        r.type === "Liability" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                        r.type === "Revenue" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      }`}>{r.type}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">{fmt(r.debit)}</td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">{fmt(r.credit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 font-bold border-t-2 border-border">
                  <td className="px-4 py-3 text-foreground" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right font-mono text-foreground">{fmt(totalDebit)}</td>
                  <td className="px-4 py-3 text-right font-mono text-foreground">{fmt(totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

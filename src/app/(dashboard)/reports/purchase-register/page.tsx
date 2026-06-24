"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Download, Search } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { toCSV } from "@/lib/csv";
import { Input } from "@/components/ui/input";

type Period = "this_month" | "last_month" | "this_quarter" | "this_year" | "all_time";
const periods: { id: Period; label: string }[] = [
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "this_quarter", label: "This Quarter" },
  { id: "this_year", label: "FY (This Year)" },
  { id: "all_time", label: "All Time" },
];

function getDateRange(period: Period) {
  if (period === "all_time") return null;
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
  switch (period) {
    case "this_month": return { start: new Date(y, m, 1).toISOString().split("T")[0], end: new Date(y, m + 1, 0).toISOString().split("T")[0] };
    case "last_month": return { start: new Date(y, m - 1, 1).toISOString().split("T")[0], end: new Date(y, m, 0).toISOString().split("T")[0] };
    case "this_quarter": { const qs = Math.floor(m / 3) * 3; return { start: new Date(y, qs, 1).toISOString().split("T")[0], end: new Date(y, qs + 3, 0).toISOString().split("T")[0] }; }
    case "this_year": { const fy = m >= 3 ? y : y - 1; return { start: `${fy}-04-01`, end: `${fy + 1}-03-31` }; }
  }
}

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  partial: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  cancelled: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

export default function PurchaseRegisterPage() {
  const [period, setPeriod] = useState<Period>("this_month");
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: ud } = await supabase.from("users").select("business_id").eq("id", user.id).single();
    if (!ud?.business_id) { setLoading(false); return; }

    const range = getDateRange(period);
    let q = supabase.from("purchase_invoices")
      .select("id, bill_number, bill_date, supplier_name, subtotal, cgst, sgst, igst, total, amount_paid, status")
      .eq("business_id", ud.business_id)
      .neq("status", "cancelled")
      .order("bill_date", { ascending: false });
    if (range) q = q.gte("bill_date", range.start).lte("bill_date", range.end);
    const { data } = await q;
    setPurchases(data || []);
    setLoading(false);
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = purchases.filter((p) =>
    !search || p.bill_number?.toLowerCase().includes(search.toLowerCase()) ||
    p.supplier_name?.toLowerCase().includes(search.toLowerCase())
  );

  const totals = filtered.reduce((acc, p) => ({
    subtotal: acc.subtotal + (p.subtotal || 0),
    cgst: acc.cgst + (p.cgst || 0),
    sgst: acc.sgst + (p.sgst || 0),
    igst: acc.igst + (p.igst || 0),
    total: acc.total + (p.total || 0),
    paid: acc.paid + (p.amount_paid || 0),
  }), { subtotal: 0, cgst: 0, sgst: 0, igst: 0, total: 0, paid: 0 });

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  const exportCSV = () => {
    const headers = ["Bill No", "Date", "Supplier", "Taxable Value", "CGST (ITC)", "SGST (ITC)", "IGST (ITC)", "Total", "Paid", "Status"];
    const rows = filtered.map((p) => [
      p.bill_number, new Date(p.bill_date).toLocaleDateString("en-IN"),
      p.supplier_name || "Unknown",
      p.subtotal?.toFixed(2), p.cgst?.toFixed(2), p.sgst?.toFixed(2), p.igst?.toFixed(2),
      p.total?.toFixed(2), p.amount_paid?.toFixed(2), p.status,
    ]);
    const totRow = ["TOTAL", "", "", totals.subtotal.toFixed(2), totals.cgst.toFixed(2), totals.sgst.toFixed(2), totals.igst.toFixed(2), totals.total.toFixed(2), totals.paid.toFixed(2), ""];
    const csv = toCSV([headers, ...rows, totRow]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `purchase-register-${period}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <Breadcrumb items={[{ label: "Reports", href: "/reports" }, { label: "Purchase Register" }]} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Purchase Register</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} bills · ITC Available: {fmt(totals.cgst + totals.sgst + totals.igst)}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 p-1 bg-muted rounded-lg flex-wrap">
          {periods.map((p) => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${period === p.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-48 max-w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search bills..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Taxable Value", value: totals.subtotal },
          { label: "CGST (ITC)", value: totals.cgst },
          { label: "SGST (ITC)", value: totals.sgst },
          { label: "IGST (ITC)", value: totals.igst },
          { label: "Grand Total", value: totals.total },
        ].map((s) => (
          <div key={s.label} className="bg-muted/50 rounded-xl p-3 border border-border/50">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-sm font-bold text-foreground mt-0.5">{fmt(s.value)}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  {["Bill No", "Date", "Supplier", "Taxable", "CGST", "SGST", "IGST", "Total", "Paid", "Status"].map((h) => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground text-sm">No purchase bills found</td></tr>
                ) : filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">{p.bill_number}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{new Date(p.bill_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}</td>
                    <td className="px-3 py-2.5 text-foreground max-w-[130px] truncate">{p.supplier_name || "Unknown"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-foreground whitespace-nowrap">{fmt(p.subtotal || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">{fmt(p.cgst || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">{fmt(p.sgst || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">{fmt(p.igst || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground whitespace-nowrap">{fmt(p.total || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{fmt(p.amount_paid || 0)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${STATUS_COLORS[p.status] || ""}`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/50 border-t-2 border-border font-bold">
                    <td className="px-3 py-3 text-foreground" colSpan={3}>Total ({filtered.length} bills)</td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">{fmt(totals.subtotal)}</td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">{fmt(totals.cgst)}</td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">{fmt(totals.sgst)}</td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">{fmt(totals.igst)}</td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">{fmt(totals.total)}</td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400">{fmt(totals.paid)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

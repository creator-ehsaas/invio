"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Download, Search, FileText } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Period = "this_month" | "last_month" | "this_quarter" | "this_year" | "all_time";
const periods: { id: Period; label: string }[] = [
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "this_quarter", label: "This Quarter" },
  { id: "this_year", label: "FY (This Year)" },
  { id: "all_time", label: "All Time" },
];

function getDateRange(period: Period): { start: string; end: string } | null {
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
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function SalesRegisterPage() {
  const [period, setPeriod] = useState<Period>("this_month");
  const [invoices, setInvoices] = useState<any[]>([]);
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
    let q = supabase.from("invoices")
      .select("id, invoice_number, invoice_date, customer_name, subtotal, cgst, sgst, igst, total, status")
      .eq("business_id", ud.business_id)
      .neq("status", "cancelled")
      .order("invoice_date", { ascending: false });
    if (range) q = q.gte("invoice_date", range.start).lte("invoice_date", range.end);
    const { data } = await q;
    setInvoices(data || []);
    setLoading(false);
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = invoices.filter((i) =>
    !search || i.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
    i.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  const totals = filtered.reduce((acc, i) => ({
    subtotal: acc.subtotal + (i.subtotal || 0),
    cgst: acc.cgst + (i.cgst || 0),
    sgst: acc.sgst + (i.sgst || 0),
    igst: acc.igst + (i.igst || 0),
    total: acc.total + (i.total || 0),
  }), { subtotal: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  const exportCSV = () => {
    const headers = ["Invoice No", "Date", "Customer", "Taxable Value", "CGST", "SGST", "IGST", "Total", "Status"];
    const rows = filtered.map((i) => [
      i.invoice_number, new Date(i.invoice_date).toLocaleDateString("en-IN"),
      i.customer_name || "Walk-in",
      i.subtotal?.toFixed(2), i.cgst?.toFixed(2), i.sgst?.toFixed(2), i.igst?.toFixed(2),
      i.total?.toFixed(2), i.status,
    ]);
    const totRow = ["TOTAL", "", "", totals.subtotal.toFixed(2), totals.cgst.toFixed(2), totals.sgst.toFixed(2), totals.igst.toFixed(2), totals.total.toFixed(2), ""];
    const csv = [headers, ...rows, totRow].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `sales-register-${period}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <Breadcrumb items={[{ label: "Reports", href: "/reports" }, { label: "Sales Register" }]} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sales Register</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} invoices · Total: {fmt(totals.total)}</p>
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
          <Input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Taxable Value", value: totals.subtotal },
          { label: "CGST", value: totals.cgst },
          { label: "SGST", value: totals.sgst },
          { label: "IGST", value: totals.igst },
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
                  {["Invoice No", "Date", "Customer", "Taxable", "CGST", "SGST", "IGST", "Total", "Status"].map((h) => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground text-sm">No invoices found</td></tr>
                ) : filtered.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">{inv.invoice_number}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{new Date(inv.invoice_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}</td>
                    <td className="px-3 py-2.5 text-foreground max-w-[140px] truncate">{inv.customer_name || "Walk-in"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-foreground whitespace-nowrap">{fmt(inv.subtotal || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">{fmt(inv.cgst || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">{fmt(inv.sgst || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">{fmt(inv.igst || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground whitespace-nowrap">{fmt(inv.total || 0)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${STATUS_COLORS[inv.status] || ""}`}>{inv.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/50 border-t-2 border-border font-bold">
                    <td className="px-3 py-3 text-foreground" colSpan={3}>Total ({filtered.length} invoices)</td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">{fmt(totals.subtotal)}</td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">{fmt(totals.cgst)}</td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">{fmt(totals.sgst)}</td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">{fmt(totals.igst)}</td>
                    <td className="px-3 py-3 text-right font-mono text-foreground">{fmt(totals.total)}</td>
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

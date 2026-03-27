"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart3,
  Download,
  Calendar,
  IndianRupee,
  FileText,
  Users,
  Package,
  TrendingUp,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";

type Period = "this_month" | "last_month" | "this_quarter" | "this_year";

const periods: { id: Period; label: string }[] = [
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "this_quarter", label: "This Quarter" },
  { id: "this_year", label: "This Year" },
];

interface ReportStats {
  totalRevenue: number;
  gstCollected: number;
  invoiceCount: number;
  avgInvoiceValue: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  subtotalSum: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  customer_name?: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  customer_id?: string;
}

function getDateRange(period: Period): { start: Date; end: Date } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (period) {
    case "this_month":
      return {
        start: new Date(year, month, 1),
        end: new Date(year, month + 1, 0, 23, 59, 59),
      };
    case "last_month":
      return {
        start: new Date(year, month - 1, 1),
        end: new Date(year, month, 0, 23, 59, 59),
      };
    case "this_quarter":
      const quarterStart = Math.floor(month / 3) * 3;
      return {
        start: new Date(year, quarterStart, 1),
        end: new Date(year, quarterStart + 3, 0, 23, 59, 59),
      };
    case "this_year":
      // Indian financial year: April to March
      const fyStart = month >= 3 ? year : year - 1;
      return {
        start: new Date(fyStart, 3, 1), // April 1
        end: new Date(fyStart + 1, 2, 31, 23, 59, 59), // March 31
      };
  }
}

export default function ReportsPage() {
  const [activePeriod, setActivePeriod] = useState<Period>("this_month");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReportStats>({
    totalRevenue: 0,
    gstCollected: 0,
    invoiceCount: 0,
    avgInvoiceValue: 0,
    cgstTotal: 0,
    sgstTotal: 0,
    igstTotal: 0,
    subtotalSum: 0,
  });
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    fetchReportData();
  }, [activePeriod]);

  const fetchReportData = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (!userData?.business_id) {
      setLoading(false);
      return;
    }

    const { start, end } = getDateRange(activePeriod);

    const { data: invoicesData } = await supabase
      .from("invoices")
      .select("*")
      .eq("business_id", userData.business_id)
      .gte("invoice_date", start.toISOString().split("T")[0])
      .lte("invoice_date", end.toISOString().split("T")[0]);

    const allInvoices = invoicesData || [];
    setInvoices(allInvoices);

    // Calculate stats (only for non-cancelled invoices)
    const validInvoices = allInvoices.filter(inv => inv.status !== "cancelled");
    const paidInvoices = validInvoices.filter(inv => inv.status === "paid");

    const totalRevenue = paidInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const cgstTotal = validInvoices.reduce((sum, inv) => sum + (inv.cgst || 0), 0);
    const sgstTotal = validInvoices.reduce((sum, inv) => sum + (inv.sgst || 0), 0);
    const igstTotal = validInvoices.reduce((sum, inv) => sum + (inv.igst || 0), 0);
    const gstCollected = cgstTotal + sgstTotal + igstTotal;
    const subtotalSum = validInvoices.reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
    const invoiceCount = validInvoices.length;
    const avgInvoiceValue = invoiceCount > 0 ? totalRevenue / invoiceCount : 0;

    setStats({
      totalRevenue,
      gstCollected,
      invoiceCount,
      avgInvoiceValue,
      cgstTotal,
      sgstTotal,
      igstTotal,
      subtotalSum,
    });

    setLoading(false);
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const getPeriodLabel = () => {
    const p = periods.find(p => p.id === activePeriod);
    return p?.label || "This Month";
  };

  const downloadCSV = (filename: string, headers: string[], rows: string[][]) => {
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadSalesSummary = () => {
    const headers = ["Invoice No", "Date", "Customer", "Subtotal", "CGST", "SGST", "IGST", "Total", "Status"];
    const rows = invoices.map(inv => [
      inv.invoice_number || "",
      new Date(inv.invoice_date).toLocaleDateString("en-IN"),
      inv.customer_name || "Walk-in",
      inv.subtotal?.toString() || "0",
      inv.cgst?.toString() || "0",
      inv.sgst?.toString() || "0",
      inv.igst?.toString() || "0",
      inv.total?.toString() || "0",
      inv.status || ""
    ]);
    downloadCSV(`sales-summary-${getPeriodLabel().toLowerCase().replace(/\s/g, "-")}.csv`, headers, rows);
  };

  const downloadGSTReport = () => {
    const headers = ["Invoice No", "Date", "Customer", "GSTIN", "Taxable Value", "CGST Rate", "CGST Amt", "SGST Rate", "SGST Amt", "IGST Rate", "IGST Amt", "Total Tax"];
    const rows = invoices.map(inv => {
      const gstRate = inv.subtotal > 0 ? Math.round((inv.cgst + inv.sgst) / inv.subtotal * 100) : 0;
      return [
        inv.invoice_number || "",
        new Date(inv.invoice_date).toLocaleDateString("en-IN"),
        inv.customer_name || "Walk-in",
        "", // GSTIN - would need customer data
        inv.subtotal?.toString() || "0",
        (gstRate / 2).toString() + "%",
        inv.cgst?.toString() || "0",
        (gstRate / 2).toString() + "%",
        inv.sgst?.toString() || "0",
        inv.igst > 0 ? gstRate.toString() + "%" : "0%",
        inv.igst?.toString() || "0",
        ((inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0)).toString()
      ];
    });
    downloadCSV(`gst-report-${getPeriodLabel().toLowerCase().replace(/\s/g, "-")}.csv`, headers, rows);
  };

  const downloadCustomerReport = async () => {
    const supabase = createClient();
    // Group invoices by customer
    const customerMap = new Map<string, { name: string; total: number; count: number }>();

    for (const inv of invoices) {
      const key = inv.customer_id || "walk-in";
      const existing = customerMap.get(key) || { name: inv.customer_name || "Walk-in Customer", total: 0, count: 0 };
      existing.total += inv.total || 0;
      existing.count += 1;
      customerMap.set(key, existing);
    }

    const headers = ["Customer Name", "Invoice Count", "Total Revenue"];
    const rows = Array.from(customerMap.values())
      .sort((a, b) => b.total - a.total)
      .map(c => [c.name, c.count.toString(), c.total.toString()]);

    downloadCSV(`customer-report-${getPeriodLabel().toLowerCase().replace(/\s/g, "-")}.csv`, headers, rows);
  };

  const downloadItemReport = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (!userData?.business_id) return;

    const invoiceIds = invoices.map(i => i.id);
    if (invoiceIds.length === 0) {
      alert("No invoices in this period");
      return;
    }

    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .in("invoice_id", invoiceIds);

    if (!items) return;

    // Group by description
    const itemMap = new Map<string, { qty: number; revenue: number }>();
    for (const item of items) {
      const key = item.description || "Unknown";
      const existing = itemMap.get(key) || { qty: 0, revenue: 0 };
      existing.qty += item.quantity || 0;
      existing.revenue += item.amount || 0;
      itemMap.set(key, existing);
    }

    const headers = ["Item", "Total Qty", "Total Revenue"];
    const rows = Array.from(itemMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([name, data]) => [name, data.qty.toString(), data.revenue.toString()]);

    downloadCSV(`item-report-${getPeriodLabel().toLowerCase().replace(/\s/g, "-")}.csv`, headers, rows);
  };

  const statCards = [
    {
      title: "Total Revenue",
      value: formatCurrency(stats.totalRevenue),
      icon: IndianRupee,
      iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "GST Collected",
      value: formatCurrency(stats.gstCollected),
      icon: TrendingUp,
      iconBg: "bg-blue-100 dark:bg-blue-900/30",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      title: "Invoice Count",
      value: stats.invoiceCount.toString(),
      icon: FileText,
      iconBg: "bg-violet-100 dark:bg-violet-900/30",
      iconColor: "text-violet-600 dark:text-violet-400",
    },
    {
      title: "Avg Invoice Value",
      value: formatCurrency(stats.avgInvoiceValue),
      icon: BarChart3,
      iconBg: "bg-amber-100 dark:bg-amber-900/30",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
  ];

  const reportTypes = [
    {
      title: "Sales Summary",
      description: "Overview of all sales and revenue",
      icon: BarChart3,
      onClick: downloadSalesSummary,
    },
    {
      title: "GST Report (GSTR-1)",
      description: "Detailed GST breakdown for filing",
      icon: FileText,
      onClick: downloadGSTReport,
    },
    {
      title: "Customer Report",
      description: "Revenue by customer",
      icon: Users,
      onClick: downloadCustomerReport,
    },
    {
      title: "Item-wise Report",
      description: "Sales breakdown by product/service",
      icon: Package,
      onClick: downloadItemReport,
    },
  ];

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
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">Analyze your business performance</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={downloadSalesSummary}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-xl text-sm font-medium hover:bg-muted transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={downloadGSTReport}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-primary to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <Download className="w-4 h-4" />
            <span>GST Report</span>
          </button>
        </div>
      </div>

      {/* Period Filter */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>Period:</span>
          </div>
          <div className="flex gap-1 p-1 bg-muted rounded-xl">
            {periods.map((period) => (
              <button
                key={period.id}
                onClick={() => setActivePeriod(period.id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activePeriod === period.id
                    ? "bg-white dark:bg-slate-900 text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.title}
              className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${stat.iconBg}`}>
                  <Icon className={`w-5 h-5 ${stat.iconColor}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sales Summary */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Sales Summary</h2>
        </div>
        {stats.invoiceCount > 0 ? (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center p-6 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
              <p className="text-3xl font-bold text-emerald-600">{formatCurrency(stats.totalRevenue)}</p>
              <p className="text-sm text-muted-foreground mt-1">Total Revenue (Paid)</p>
            </div>
            <div className="text-center p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <p className="text-3xl font-bold text-blue-600">{formatCurrency(stats.gstCollected)}</p>
              <p className="text-sm text-muted-foreground mt-1">GST Collected</p>
            </div>
            <div className="text-center p-6 bg-violet-50 dark:bg-violet-900/20 rounded-xl">
              <p className="text-3xl font-bold text-violet-600">{stats.invoiceCount}</p>
              <p className="text-sm text-muted-foreground mt-1">Total Invoices</p>
            </div>
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <div className="text-center">
              <BarChart3 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No sales data for this period</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Create invoices to see sales data
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Report Types Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {reportTypes.map((report) => {
          const Icon = report.icon;
          return (
            <button
              key={report.title}
              onClick={report.onClick}
              className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer group text-left"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-foreground mb-1">{report.title}</h3>
                  <p className="text-sm text-muted-foreground">{report.description}</p>
                </div>
                <Download className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          );
        })}
      </div>

      {/* GST Summary Table */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground mb-4">GST Summary (GSTR-1)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Category</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                  Taxable Value
                </th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">CGST</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">SGST</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">IGST</th>
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Total Tax</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100 dark:border-slate-800/50">
                <td className="py-3 px-4 text-foreground">B2B Invoices</td>
                <td className="py-3 px-4 text-right text-muted-foreground">
                  {formatCurrency(invoices.filter(i => i.customer_id).reduce((sum, i) => sum + (i.subtotal || 0), 0))}
                </td>
                <td className="py-3 px-4 text-right text-muted-foreground">
                  {formatCurrency(invoices.filter(i => i.customer_id).reduce((sum, i) => sum + (i.cgst || 0), 0))}
                </td>
                <td className="py-3 px-4 text-right text-muted-foreground">
                  {formatCurrency(invoices.filter(i => i.customer_id).reduce((sum, i) => sum + (i.sgst || 0), 0))}
                </td>
                <td className="py-3 px-4 text-right text-muted-foreground">
                  {formatCurrency(invoices.filter(i => i.customer_id).reduce((sum, i) => sum + (i.igst || 0), 0))}
                </td>
                <td className="py-3 px-4 text-right font-medium text-foreground">
                  {formatCurrency(invoices.filter(i => i.customer_id).reduce((sum, i) => sum + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0), 0))}
                </td>
              </tr>
              <tr className="border-b border-slate-100 dark:border-slate-800/50">
                <td className="py-3 px-4 text-foreground">B2C Invoices</td>
                <td className="py-3 px-4 text-right text-muted-foreground">
                  {formatCurrency(invoices.filter(i => !i.customer_id).reduce((sum, i) => sum + (i.subtotal || 0), 0))}
                </td>
                <td className="py-3 px-4 text-right text-muted-foreground">
                  {formatCurrency(invoices.filter(i => !i.customer_id).reduce((sum, i) => sum + (i.cgst || 0), 0))}
                </td>
                <td className="py-3 px-4 text-right text-muted-foreground">
                  {formatCurrency(invoices.filter(i => !i.customer_id).reduce((sum, i) => sum + (i.sgst || 0), 0))}
                </td>
                <td className="py-3 px-4 text-right text-muted-foreground">
                  {formatCurrency(invoices.filter(i => !i.customer_id).reduce((sum, i) => sum + (i.igst || 0), 0))}
                </td>
                <td className="py-3 px-4 text-right font-medium text-foreground">
                  {formatCurrency(invoices.filter(i => !i.customer_id).reduce((sum, i) => sum + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0), 0))}
                </td>
              </tr>
              <tr className="bg-muted/30">
                <td className="py-3 px-4 font-semibold text-foreground">Total</td>
                <td className="py-3 px-4 text-right font-semibold text-foreground">{formatCurrency(stats.subtotalSum)}</td>
                <td className="py-3 px-4 text-right font-semibold text-foreground">{formatCurrency(stats.cgstTotal)}</td>
                <td className="py-3 px-4 text-right font-semibold text-foreground">{formatCurrency(stats.sgstTotal)}</td>
                <td className="py-3 px-4 text-right font-semibold text-foreground">{formatCurrency(stats.igstTotal)}</td>
                <td className="py-3 px-4 text-right font-semibold text-foreground">{formatCurrency(stats.gstCollected)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

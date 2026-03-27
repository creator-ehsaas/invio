"use client";

import { useState } from "react";
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
} from "lucide-react";

type Period = "this_month" | "last_month" | "this_quarter" | "custom";

const periods: { id: Period; label: string }[] = [
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "this_quarter", label: "This Quarter" },
  { id: "custom", label: "Custom" },
];

export default function ReportsPage() {
  const [activePeriod, setActivePeriod] = useState<Period>("this_month");

  const stats = [
    {
      title: "Total Revenue",
      value: "₹0",
      icon: IndianRupee,
      iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "GST Collected",
      value: "₹0",
      icon: TrendingUp,
      iconBg: "bg-blue-100 dark:bg-blue-900/30",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      title: "Invoice Count",
      value: "0",
      icon: FileText,
      iconBg: "bg-violet-100 dark:bg-violet-900/30",
      iconColor: "text-violet-600 dark:text-violet-400",
    },
    {
      title: "Avg Invoice Value",
      value: "₹0",
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
    },
    {
      title: "GST Report (GSTR-1)",
      description: "Detailed GST breakdown for filing",
      icon: FileText,
    },
    {
      title: "Customer Report",
      description: "Revenue by customer",
      icon: Users,
    },
    {
      title: "Item-wise Report",
      description: "Sales breakdown by product/service",
      icon: Package,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">Analyze your business performance</p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-xl text-sm font-medium hover:bg-muted transition-colors">
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Excel</span>
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-primary to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all">
            <Download className="w-4 h-4" />
            <span>Export PDF</span>
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
        {stats.map((stat) => {
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

      {/* Sales Chart */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Sales Summary</h2>
        </div>
        <div className="h-64 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          <div className="text-center">
            <BarChart3 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Sales chart will appear here</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Create invoices to see sales data
            </p>
          </div>
        </div>
      </div>

      {/* Report Types Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {reportTypes.map((report) => {
          const Icon = report.icon;
          return (
            <div
              key={report.title}
              className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
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
            </div>
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
                <th className="text-right py-3 px-4 font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100 dark:border-slate-800/50">
                <td className="py-3 px-4 text-foreground">B2B Invoices</td>
                <td className="py-3 px-4 text-right text-muted-foreground">₹0</td>
                <td className="py-3 px-4 text-right text-muted-foreground">₹0</td>
                <td className="py-3 px-4 text-right text-muted-foreground">₹0</td>
                <td className="py-3 px-4 text-right text-muted-foreground">₹0</td>
                <td className="py-3 px-4 text-right font-medium text-foreground">₹0</td>
              </tr>
              <tr className="border-b border-slate-100 dark:border-slate-800/50">
                <td className="py-3 px-4 text-foreground">B2C Invoices</td>
                <td className="py-3 px-4 text-right text-muted-foreground">₹0</td>
                <td className="py-3 px-4 text-right text-muted-foreground">₹0</td>
                <td className="py-3 px-4 text-right text-muted-foreground">₹0</td>
                <td className="py-3 px-4 text-right text-muted-foreground">₹0</td>
                <td className="py-3 px-4 text-right font-medium text-foreground">₹0</td>
              </tr>
              <tr className="bg-muted/30">
                <td className="py-3 px-4 font-semibold text-foreground">Total</td>
                <td className="py-3 px-4 text-right font-semibold text-foreground">₹0</td>
                <td className="py-3 px-4 text-right font-semibold text-foreground">₹0</td>
                <td className="py-3 px-4 text-right font-semibold text-foreground">₹0</td>
                <td className="py-3 px-4 text-right font-semibold text-foreground">₹0</td>
                <td className="py-3 px-4 text-right font-semibold text-foreground">₹0</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

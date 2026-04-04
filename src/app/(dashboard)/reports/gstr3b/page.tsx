"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Download,
  Loader2,
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Calculator,
  AlertCircle,
  CheckCircle,
  Calendar,
  RefreshCw,
} from "lucide-react";

interface GSTR3BData {
  taxPeriod: string;
  // Outward supplies
  outwardTaxable: number;
  outwardZeroRated: number;
  outwardNilRated: number;
  outwardExempt: number;
  // Output tax
  outputIgst: number;
  outputCgst: number;
  outputSgst: number;
  // Inward supplies
  inwardTaxable: number;
  inwardZeroRated: number;
  // Input tax credit
  itcIgst: number;
  itcCgst: number;
  itcSgst: number;
  // Net payable
  netIgst: number;
  netCgst: number;
  netSgst: number;
  totalPayable: number;
  // Meta
  invoiceCount: number;
  purchaseCount: number;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function GSTR3BPage() {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [data, setData] = useState<GSTR3BData | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [businessGstin, setBusinessGstin] = useState<string | null>(null);

  useEffect(() => {
    fetchGSTR3BData();
  }, [selectedMonth, selectedYear]);

  const fetchGSTR3BData = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (!userData?.business_id) return;

    // Fetch business GSTIN
    const { data: business } = await supabase
      .from("businesses")
      .select("gstin")
      .eq("id", userData.business_id)
      .single();

    setBusinessGstin(business?.gstin || null);

    // Calculate date range
    const startDate = new Date(selectedYear, selectedMonth, 1).toISOString().split("T")[0];
    const endDate = new Date(selectedYear, selectedMonth + 1, 0).toISOString().split("T")[0];

    // Fetch sales invoices for the period
    const { data: invoices } = await supabase
      .from("invoices")
      .select("subtotal, cgst, sgst, igst, total, status")
      .eq("business_id", userData.business_id)
      .gte("invoice_date", startDate)
      .lte("invoice_date", endDate)
      .neq("status", "cancelled");

    // Fetch purchase invoices for the period
    const { data: purchases } = await supabase
      .from("purchase_invoices")
      .select("subtotal, cgst, sgst, igst, total, status")
      .eq("business_id", userData.business_id)
      .gte("bill_date", startDate)
      .lte("bill_date", endDate)
      .neq("status", "cancelled");

    // Calculate totals
    const salesData = invoices || [];
    const purchaseData = purchases || [];

    const outwardTaxable = salesData.reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
    const outputCgst = salesData.reduce((sum, inv) => sum + (inv.cgst || 0), 0);
    const outputSgst = salesData.reduce((sum, inv) => sum + (inv.sgst || 0), 0);
    const outputIgst = salesData.reduce((sum, inv) => sum + (inv.igst || 0), 0);

    const inwardTaxable = purchaseData.reduce((sum, inv) => sum + (inv.subtotal || 0), 0);
    const itcCgst = purchaseData.reduce((sum, inv) => sum + (inv.cgst || 0), 0);
    const itcSgst = purchaseData.reduce((sum, inv) => sum + (inv.sgst || 0), 0);
    const itcIgst = purchaseData.reduce((sum, inv) => sum + (inv.igst || 0), 0);

    // Calculate net payable (output - input)
    const netIgst = Math.max(0, outputIgst - itcIgst);
    const netCgst = Math.max(0, outputCgst - itcCgst);
    const netSgst = Math.max(0, outputSgst - itcSgst);

    // Handle IGST credit utilization
    let remainingItcIgst = itcIgst - outputIgst;
    let adjustedNetCgst = netCgst;
    let adjustedNetSgst = netSgst;

    if (remainingItcIgst > 0) {
      // Use remaining IGST credit against CGST first
      const cgstOffset = Math.min(remainingItcIgst, outputCgst - itcCgst);
      if (cgstOffset > 0) {
        adjustedNetCgst = Math.max(0, netCgst - cgstOffset);
        remainingItcIgst -= cgstOffset;
      }
      // Then against SGST
      if (remainingItcIgst > 0) {
        const sgstOffset = Math.min(remainingItcIgst, outputSgst - itcSgst);
        if (sgstOffset > 0) {
          adjustedNetSgst = Math.max(0, netSgst - sgstOffset);
        }
      }
    }

    setData({
      taxPeriod: `${MONTHS[selectedMonth]} ${selectedYear}`,
      outwardTaxable,
      outwardZeroRated: 0,
      outwardNilRated: 0,
      outwardExempt: 0,
      outputIgst,
      outputCgst,
      outputSgst,
      inwardTaxable,
      inwardZeroRated: 0,
      itcIgst,
      itcCgst,
      itcSgst,
      netIgst,
      netCgst: adjustedNetCgst,
      netSgst: adjustedNetSgst,
      totalPayable: netIgst + adjustedNetCgst + adjustedNetSgst,
      invoiceCount: salesData.length,
      purchaseCount: purchaseData.length,
    });

    setLoading(false);
  };

  const downloadJSON = () => {
    if (!data) return;

    const gstr3bFormat = {
      gstin: businessGstin,
      ret_period: `${String(selectedMonth + 1).padStart(2, "0")}${selectedYear}`,
      sup_details: {
        osup_det: {
          txval: data.outwardTaxable,
          iamt: data.outputIgst,
          camt: data.outputCgst,
          samt: data.outputSgst,
          csamt: 0,
        },
        osup_zero: {
          txval: data.outwardZeroRated,
          iamt: 0,
          csamt: 0,
        },
        osup_nil_exmp: {
          txval: data.outwardNilRated + data.outwardExempt,
        },
      },
      itc_elg: {
        itc_avl: [
          {
            ty: "IMPG",
            iamt: 0,
            camt: 0,
            samt: 0,
            csamt: 0,
          },
          {
            ty: "ISRC",
            iamt: 0,
            camt: 0,
            samt: 0,
            csamt: 0,
          },
          {
            ty: "ISD",
            iamt: 0,
            camt: 0,
            samt: 0,
            csamt: 0,
          },
          {
            ty: "OTH",
            iamt: data.itcIgst,
            camt: data.itcCgst,
            samt: data.itcSgst,
            csamt: 0,
          },
        ],
        itc_net: {
          iamt: data.itcIgst,
          camt: data.itcCgst,
          samt: data.itcSgst,
          csamt: 0,
        },
      },
      inward_sup: {
        isup_details: [
          {
            ty: "GST",
            intra: data.inwardTaxable,
            inter: 0,
          },
        ],
      },
      intr_ltfee: {
        intr_details: {
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
        },
      },
    };

    const blob = new Blob([JSON.stringify(gstr3bFormat, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GSTR3B_${selectedYear}_${String(selectedMonth + 1).padStart(2, "0")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/reports"
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">GSTR-3B</h1>
            <p className="text-muted-foreground mt-1">Monthly GST return summary</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchGSTR3BData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-muted text-foreground font-medium rounded-xl hover:bg-muted/80 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={downloadJSON}
            disabled={!data}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Download JSON</span>
          </button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium text-foreground">Tax Period:</span>
          </div>
          <div className="flex gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-secondary border-none rounded-xl px-4 py-2 text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
            >
              {MONTHS.map((month, index) => (
                <option key={month} value={index}>{month}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-secondary border-none rounded-xl px-4 py-2 text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
            >
              {[2024, 2025, 2026, 2027].map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          {!businessGstin && (
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>Add GSTIN in Settings for accurate filing</span>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground font-medium uppercase">Sales</span>
              </div>
              <p className="text-xl font-bold text-foreground">{formatCurrency(data.outwardTaxable)}</p>
              <p className="text-xs text-muted-foreground mt-1">{data.invoiceCount} invoices</p>
            </div>
            <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-muted-foreground font-medium uppercase">Purchases</span>
              </div>
              <p className="text-xl font-bold text-foreground">{formatCurrency(data.inwardTaxable)}</p>
              <p className="text-xs text-muted-foreground mt-1">{data.purchaseCount} bills</p>
            </div>
            <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calculator className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-muted-foreground font-medium uppercase">Output Tax</span>
              </div>
              <p className="text-xl font-bold text-foreground">
                {formatCurrency(data.outputIgst + data.outputCgst + data.outputSgst)}
              </p>
            </div>
            <div className="bg-gradient-to-br from-primary/10 to-blue-500/10 border-primary/20 backdrop-blur-xl rounded-2xl border p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                <span className="text-xs text-primary font-medium uppercase">Net Payable</span>
              </div>
              <p className="text-xl font-bold text-foreground">{formatCurrency(data.totalPayable)}</p>
            </div>
          </div>

          {/* GSTR-3B Table Format */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 overflow-hidden">
            <div className="p-4 border-b border-slate-200/50 dark:border-slate-800/50">
              <h2 className="font-semibold text-foreground">3.1 Details of Outward Supplies and Inward Supplies liable to reverse charge</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nature of Supplies</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Taxable Value</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">IGST</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">CGST</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">SGST</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                  <tr>
                    <td className="px-4 py-3 font-medium text-foreground">(a) Outward taxable supplies</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.outwardTaxable)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.outputIgst)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.outputCgst)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.outputSgst)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-foreground">(b) Zero rated supplies</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.outwardZeroRated)}</td>
                    <td className="px-4 py-3 text-right">-</td>
                    <td className="px-4 py-3 text-right">-</td>
                    <td className="px-4 py-3 text-right">-</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium text-foreground">(c) Nil rated & exempt supplies</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.outwardNilRated + data.outwardExempt)}</td>
                    <td className="px-4 py-3 text-right">-</td>
                    <td className="px-4 py-3 text-right">-</td>
                    <td className="px-4 py-3 text-right">-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ITC Section */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 overflow-hidden">
            <div className="p-4 border-b border-slate-200/50 dark:border-slate-800/50">
              <h2 className="font-semibold text-foreground">4. Eligible ITC (Input Tax Credit)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Details</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">IGST</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">CGST</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">SGST</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                  <tr>
                    <td className="px-4 py-3 font-medium text-foreground">(A) ITC Available</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.itcIgst)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.itcCgst)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.itcSgst)}</td>
                  </tr>
                  <tr className="bg-emerald-50 dark:bg-emerald-950/20">
                    <td className="px-4 py-3 font-semibold text-emerald-700 dark:text-emerald-400">(D) Net ITC Available</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(data.itcIgst)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(data.itcCgst)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(data.itcSgst)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Tax Payable */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 overflow-hidden">
            <div className="p-4 border-b border-slate-200/50 dark:border-slate-800/50">
              <h2 className="font-semibold text-foreground">6. Payment of Tax</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Description</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">IGST</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">CGST</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">SGST</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                  <tr>
                    <td className="px-4 py-3 text-foreground">(i) Tax Payable</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.outputIgst)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.outputCgst)}</td>
                    <td className="px-4 py-3 text-right">{formatCurrency(data.outputSgst)}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-foreground">(ii) ITC Utilized</td>
                    <td className="px-4 py-3 text-right text-emerald-600">-{formatCurrency(Math.min(data.itcIgst, data.outputIgst))}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">-{formatCurrency(Math.min(data.itcCgst, data.outputCgst))}</td>
                    <td className="px-4 py-3 text-right text-emerald-600">-{formatCurrency(Math.min(data.itcSgst, data.outputSgst))}</td>
                  </tr>
                  <tr className="bg-amber-50 dark:bg-amber-950/20 font-semibold">
                    <td className="px-4 py-3 text-amber-700 dark:text-amber-400">(iii) Tax to be Paid in Cash</td>
                    <td className="px-4 py-3 text-right text-amber-700 dark:text-amber-400">{formatCurrency(data.netIgst)}</td>
                    <td className="px-4 py-3 text-right text-amber-700 dark:text-amber-400">{formatCurrency(data.netCgst)}</td>
                    <td className="px-4 py-3 text-right text-amber-700 dark:text-amber-400">{formatCurrency(data.netSgst)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-gradient-to-r from-primary/10 to-blue-500/10 border-t border-primary/20">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">Total Tax Payable</span>
                <span className="text-2xl font-bold text-primary">{formatCurrency(data.totalPayable)}</span>
              </div>
            </div>
          </div>

          {/* Filing Info */}
          <div className="bg-blue-50 dark:bg-blue-950/20 rounded-2xl border border-blue-200 dark:border-blue-800 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100">Filing Information</p>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  GSTR-3B must be filed by the 20th of the following month. Download the JSON file and upload it to the GST portal for filing.
                  This is a summary based on your invoices and purchases recorded in Invio.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

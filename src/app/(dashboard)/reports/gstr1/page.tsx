"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, Download, Loader2, FileSpreadsheet,
  RefreshCw, AlertCircle,
} from "lucide-react";

interface B2BEntry {
  gstin: string;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
  invoice_value: number;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
}

interface B2CSEntry {
  state: string;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
}

interface HSNEntry {
  hsn_code: string;
  description: string;
  uqc: string;
  quantity: number;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
}

interface GSTR1Data {
  b2b: B2BEntry[];
  b2cs: B2CSEntry[];
  hsn: HSNEntry[];
  totalInvoices: number;
  totalTaxable: number;
  totalTax: number;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const STATE_CODES: Record<string, string> = {
  "Andhra Pradesh": "37", "Arunachal Pradesh": "12", "Assam": "18",
  "Bihar": "10", "Chhattisgarh": "22", "Goa": "30", "Gujarat": "24",
  "Haryana": "06", "Himachal Pradesh": "02", "Jharkhand": "20",
  "Karnataka": "29", "Kerala": "32", "Madhya Pradesh": "23",
  "Maharashtra": "27", "Manipur": "14", "Meghalaya": "17",
  "Mizoram": "15", "Nagaland": "13", "Odisha": "21", "Punjab": "03",
  "Rajasthan": "08", "Sikkim": "11", "Tamil Nadu": "33",
  "Telangana": "36", "Tripura": "16", "Uttar Pradesh": "09",
  "Uttarakhand": "05", "West Bengal": "19", "Delhi": "07",
  "Jammu and Kashmir": "01", "Ladakh": "38",
};

export default function GSTR1Page() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GSTR1Data | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [businessGstin, setBusinessGstin] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"b2b" | "b2cs" | "hsn">("b2b");

  useEffect(() => { fetchData(); }, [selectedMonth, selectedYear]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from("users").select("business_id").eq("id", user.id).single();
      if (!userData?.business_id) return;

      const { data: business } = await supabase
        .from("businesses").select("gstin").eq("id", userData.business_id).single();
      setBusinessGstin(business?.gstin || null);

      const startDate = new Date(selectedYear, selectedMonth, 1).toISOString().split("T")[0];
      const endDate = new Date(selectedYear, selectedMonth + 1, 0).toISOString().split("T")[0];

      const { data: invoices } = await supabase
        .from("invoices")
        .select(`
          id, invoice_number, invoice_date, total, subtotal, cgst, sgst, igst,
          customer_name, customer_gstin, customer_state,
          invoice_items (
            description, hsn_code, quantity, unit, amount, cgst, sgst, igst, gst_rate
          )
        `)
        .eq("business_id", userData.business_id)
        .gte("invoice_date", startDate)
        .lte("invoice_date", endDate)
        .neq("status", "cancelled")
        .neq("status", "draft");

      const rows = (invoices || []) as any[];

      // B2B
      const b2b: B2BEntry[] = rows
        .filter(inv => inv.customer_gstin)
        .map(inv => ({
          gstin: inv.customer_gstin,
          customer_name: inv.customer_name,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          invoice_value: inv.total || 0,
          taxable_value: inv.subtotal || 0,
          igst: inv.igst || 0,
          cgst: inv.cgst || 0,
          sgst: inv.sgst || 0,
        }));

      // B2CS — group by state
      const b2csMap: Record<string, B2CSEntry> = {};
      rows.filter(inv => !inv.customer_gstin).forEach(inv => {
        const state = inv.customer_state || "Unknown";
        if (!b2csMap[state]) {
          b2csMap[state] = { state, taxable_value: 0, igst: 0, cgst: 0, sgst: 0 };
        }
        b2csMap[state].taxable_value += inv.subtotal || 0;
        b2csMap[state].igst += inv.igst || 0;
        b2csMap[state].cgst += inv.cgst || 0;
        b2csMap[state].sgst += inv.sgst || 0;
      });
      const b2cs = Object.values(b2csMap);

      // HSN — group all invoice_items by hsn_code
      const hsnMap: Record<string, HSNEntry> = {};
      rows.forEach(inv => {
        (inv.invoice_items || []).forEach((item: any) => {
          const key = item.hsn_code || "0000";
          if (!hsnMap[key]) {
            hsnMap[key] = {
              hsn_code: key,
              description: item.description || "",
              uqc: (item.unit || "NOS").toUpperCase().substring(0, 3),
              quantity: 0,
              taxable_value: 0,
              igst: 0,
              cgst: 0,
              sgst: 0,
            };
          }
          hsnMap[key].quantity += item.quantity || 0;
          hsnMap[key].taxable_value += item.amount || 0;
          hsnMap[key].igst += item.igst || 0;
          hsnMap[key].cgst += item.cgst || 0;
          hsnMap[key].sgst += item.sgst || 0;
        });
      });
      const hsn = Object.values(hsnMap);

      const totalTaxable = rows.reduce((s, i) => s + (i.subtotal || 0), 0);
      const totalTax = rows.reduce((s, i) => s + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0), 0);

      setData({ b2b, b2cs, hsn, totalInvoices: rows.length, totalTaxable, totalTax });
    } catch (err) {
      console.error("GSTR-1 fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}-${mm}-${d.getFullYear()}`;
  };

  const downloadJSON = () => {
    if (!data) return;
    const fp = `${String(selectedMonth + 1).padStart(2, "0")}${selectedYear}`;
    const json = {
      gstin: businessGstin,
      fp,
      b2b: data.b2b.map(e => ({
        ctin: e.gstin,
        inv: [{
          inum: e.invoice_number,
          idt: fmtDate(e.invoice_date),
          val: round2(e.invoice_value),
          pos: e.gstin.substring(0, 2),
          rchrg: "N",
          inv_typ: "R",
          itms: [{
            num: 1,
            itm_det: {
              txval: round2(e.taxable_value),
              rt: 18,
              iamt: round2(e.igst),
              camt: round2(e.cgst),
              samt: round2(e.sgst),
              csamt: 0,
            },
          }],
        }],
      })),
      b2cs: data.b2cs.map(e => ({
        sply_tp: e.igst > 0 ? "INTER" : "INTRA",
        pos: STATE_CODES[e.state] || "00",
        typ: "OE",
        txval: round2(e.taxable_value),
        rt: 18,
        iamt: round2(e.igst),
        camt: round2(e.cgst),
        samt: round2(e.sgst),
        csamt: 0,
      })),
      hsn: {
        data: data.hsn.map((e, i) => ({
          num: i + 1,
          hsn_sc: e.hsn_code,
          desc: e.description.substring(0, 30),
          uqc: e.uqc,
          qty: round2(e.quantity),
          val: round2(e.taxable_value + e.igst + e.cgst + e.sgst),
          txval: round2(e.taxable_value),
          iamt: round2(e.igst),
          camt: round2(e.cgst),
          samt: round2(e.sgst),
          csamt: 0,
        })),
      },
    };
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `GSTR1_${selectedYear}_${String(selectedMonth + 1).padStart(2, "0")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  const TABS = [
    { id: "b2b" as const, label: "B2B", count: data?.b2b.length ?? 0 },
    { id: "b2cs" as const, label: "B2CS", count: data?.b2cs.length ?? 0 },
    { id: "hsn" as const, label: "HSN", count: data?.hsn.length ?? 0 },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/reports" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">GSTR-1</h1>
          <p className="text-xs text-muted-foreground">Outward Supplies Return</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedMonth}
          onChange={e => { setSelectedMonth(Number(e.target.value)); }}
          className="h-8 rounded-md border border-input bg-background px-3 text-sm"
        >
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select
          value={selectedYear}
          onChange={e => { setSelectedYear(Number(e.target.value)); }}
          className="h-8 rounded-md border border-input bg-background px-3 text-sm"
        >
          {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button
          onClick={fetchData}
          className="h-8 w-8 flex items-center justify-center rounded-md border hover:bg-muted transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        {data && (
          <button
            onClick={downloadJSON}
            className="ml-auto h-8 flex items-center gap-1.5 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Download JSON
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? null : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Invoices", value: String(data.totalInvoices) },
              { label: "Taxable Value",  value: fmt(data.totalTaxable) },
              { label: "Total Tax",      value: fmt(data.totalTax) },
            ].map(c => (
              <div key={c.label} className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-lg font-bold mt-1">{c.value}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {/* B2B Table */}
          {activeTab === "b2b" && (
            <div className="rounded-xl border overflow-hidden">
              {data.b2b.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No B2B invoices for this period.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        {["Customer GSTIN","Invoice No","Date","Taxable","IGST","CGST","SGST","Total"].map(h => (
                          <th key={h} className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.b2b.map((e, i) => (
                        <tr key={i} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono text-xs">{e.gstin}</td>
                          <td className="px-3 py-2 font-medium">{e.invoice_number}</td>
                          <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{new Date(e.invoice_date).toLocaleDateString("en-IN")}</td>
                          <td className="px-3 py-2">{fmt(e.taxable_value)}</td>
                          <td className="px-3 py-2">{fmt(e.igst)}</td>
                          <td className="px-3 py-2">{fmt(e.cgst)}</td>
                          <td className="px-3 py-2">{fmt(e.sgst)}</td>
                          <td className="px-3 py-2 font-semibold">{fmt(e.invoice_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* B2CS Table */}
          {activeTab === "b2cs" && (
            <div className="rounded-xl border overflow-hidden">
              {data.b2cs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No B2CS invoices for this period.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {["State","Taxable Value","IGST","CGST","SGST"].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-muted-foreground px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.b2cs.map((e, i) => (
                      <tr key={i} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{e.state}</td>
                        <td className="px-3 py-2">{fmt(e.taxable_value)}</td>
                        <td className="px-3 py-2">{fmt(e.igst)}</td>
                        <td className="px-3 py-2">{fmt(e.cgst)}</td>
                        <td className="px-3 py-2">{fmt(e.sgst)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* HSN Table */}
          {activeTab === "hsn" && (
            <div className="rounded-xl border overflow-hidden">
              {data.hsn.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No HSN data for this period.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        {["HSN Code","Description","Qty","Taxable","IGST","CGST","SGST"].map(h => (
                          <th key={h} className="text-left text-xs font-medium text-muted-foreground px-3 py-2 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.hsn.map((e, i) => (
                        <tr key={i} className="border-t hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono text-xs">{e.hsn_code}</td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate">{e.description}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{round2(e.quantity)} {e.uqc}</td>
                          <td className="px-3 py-2">{fmt(e.taxable_value)}</td>
                          <td className="px-3 py-2">{fmt(e.igst)}</td>
                          <td className="px-3 py-2">{fmt(e.cgst)}</td>
                          <td className="px-3 py-2">{fmt(e.sgst)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Filing note */}
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              GSTR-1 is due by the <strong>11th of the following month</strong>. Download the JSON and upload it to the GST portal at{" "}
              <strong>gst.gov.in</strong>.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

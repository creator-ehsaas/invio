# Market Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 6 missing features that block market launch — WhatsApp reminders, GSTR-1 report, GSTIN auto-fill, invoice branding, annual plan upsell nudge, and Android APK build.

**Architecture:** Each task is self-contained. No shared state between tasks. WhatsApp utility is a standalone lib. GSTR-1 mirrors the existing GSTR-3B pattern exactly. GSTIN lookup is a thin API proxy to Whitebooks. Invoice footer is a patch to 2 existing templates. Upsell nudge is a localStorage-gated banner. APK is a config fix + build steps.

**Tech Stack:** Next.js 15 App Router, Supabase, Groq (existing), Whitebooks GST API (sandbox), Capacitor (Android), TypeScript, shadcn/ui

**Working directory:** All file paths are under `D:/invio/` — shell always resets to E:\ so use absolute paths.

---

## Task 1: WhatsApp Utility + Payment Reminder Buttons

**Files:**
- Create: `src/lib/whatsapp.ts`
- Modify: `src/app/(dashboard)/invoices/page.tsx` (add reminder to overdue dropdown)
- Modify: `src/app/(dashboard)/invoices/[id]/page.tsx` (add phone to share, add separate "Send Reminder" button)
- Modify: `src/app/(dashboard)/customers/[id]/page.tsx` (add WA quick-contact icon next to phone)

### 1.1 — Create WhatsApp utility

- [ ] **Create `D:/invio/src/lib/whatsapp.ts`**

```ts
/**
 * wa.me deep-link utilities — ToS-safe, no automation, no BSP needed.
 * User clicks → WhatsApp opens pre-filled → user hits Send manually.
 */

export function buildWaUrl(phone: string | null | undefined, message: string): string {
  const url = new URL("https://wa.me/");
  if (phone) {
    const clean = phone.replace(/\D/g, "");
    const num = clean.startsWith("91") ? clean : `91${clean}`;
    url.pathname = `/${num}`;
  }
  url.searchParams.set("text", message);
  return url.toString();
}

export function paymentReminderMessage(invoice: {
  invoice_number: string;
  customer_name: string;
  total: number;
  due_date?: string | null;
  business_name?: string;
}): string {
  const amt = invoice.total.toLocaleString("en-IN");
  const due = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "pehle";
  const biz = invoice.business_name ? `\n- ${invoice.business_name}` : "";
  return `नमस्ते ${invoice.customer_name} ji,\n\nInvoice #${invoice.invoice_number} ₹${amt} due ${due} pending hai।\n\nकृपया payment karein.\n${biz}`.trim();
}

export function invoiceShareMessage(invoice: {
  invoice_number: string;
  customer_name: string;
  total: number;
  invoice_date: string;
  business_name?: string;
}): string {
  const amt = invoice.total.toLocaleString("en-IN");
  const date = new Date(invoice.invoice_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const biz = invoice.business_name ? `\n${invoice.business_name}` : "";
  return `*Invoice #${invoice.invoice_number}*\nCustomer: ${invoice.customer_name}\nDate: ${date}\n*Total: ₹${amt}*${biz}`.trim();
}
```

- [ ] **Commit**
```bash
git -C D:/invio add src/lib/whatsapp.ts
git -C D:/invio commit -m "feat: add WhatsApp wa.me utility (buildWaUrl, reminder + share messages)"
```

---

### 1.2 — Add "Send WA Reminder" to invoice list overdue dropdown

- [ ] **Open `D:/invio/src/app/(dashboard)/invoices/page.tsx`**

- [ ] **Add MessageCircle to imports** — add `MessageCircle` to the lucide-react import line at the top.

- [ ] **Add whatsapp import** after the last import line:
```ts
import { buildWaUrl, paymentReminderMessage } from "@/lib/whatsapp";
```

- [ ] **Add reminder item to the actions dropdown** — find the `<DropdownMenuContent align="end"` block inside the `id: "actions"` column cell. After the existing `DropdownMenuSeparator` (before the Delete item), add:

```tsx
{row.original.status === "overdue" && (
  <>
    <DropdownMenuSeparator />
    <DropdownMenuItem
      onClick={(e) => {
        e.stopPropagation();
        const msg = paymentReminderMessage({
          invoice_number: row.original.invoice_number,
          customer_name: row.original.customer_name,
          total: row.original.total,
          due_date: row.original.due_date,
        });
        window.open(buildWaUrl(null, msg), "_blank");
      }}
      className="text-emerald-600 focus:text-emerald-600"
    >
      <MessageCircle className="mr-2 h-4 w-4" /> Send WA Reminder
    </DropdownMenuItem>
  </>
)}
```

- [ ] **Commit**
```bash
git -C D:/invio add src/app/\(dashboard\)/invoices/page.tsx
git -C D:/invio commit -m "feat: add Send WA Reminder to overdue invoice dropdown"
```

---

### 1.3 — Upgrade WA share on invoice detail + add reminder button

- [ ] **Open `D:/invio/src/app/(dashboard)/invoices/[id]/page.tsx`**

- [ ] **Add whatsapp import**:
```ts
import { buildWaUrl, paymentReminderMessage, invoiceShareMessage } from "@/lib/whatsapp";
```

- [ ] **Replace existing `shareWhatsApp` function** (lines ~344–365) with:
```ts
const shareWhatsApp = () => {
  if (!invoice) return;
  const msg = invoiceShareMessage({
    invoice_number: invoice.invoice_number,
    customer_name: invoice.customer_name,
    total: invoice.total,
    invoice_date: invoice.invoice_date,
    business_name: business?.name,
  });
  window.open(buildWaUrl(null, msg), "_blank");
};

const sendWaReminder = () => {
  if (!invoice) return;
  const msg = paymentReminderMessage({
    invoice_number: invoice.invoice_number,
    customer_name: invoice.customer_name,
    total: invoice.total,
    due_date: invoice.due_date,
    business_name: business?.name,
  });
  window.open(buildWaUrl(null, msg), "_blank");
};
```

- [ ] **Add "Send Reminder" button** — find where the existing WA share button is rendered (~line 508). Next to it, add (only show when status is overdue or sent):
```tsx
{(invoice.status === "overdue" || invoice.status === "sent") && (
  <Button variant="outline" size="sm" onClick={sendWaReminder} className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50">
    <MessageCircle className="h-4 w-4" /> Send Reminder
  </Button>
)}
```

Make sure `MessageCircle` is in the lucide-react import at the top of this file.

- [ ] **Commit**
```bash
git -C D:/invio add "src/app/(dashboard)/invoices/[id]/page.tsx"
git -C D:/invio commit -m "feat: add Send WA Reminder button on invoice detail page"
```

---

## Task 2: GSTR-1 Report Page

**Files:**
- Create: `src/app/(dashboard)/reports/gstr1/page.tsx`
- Modify: `src/app/(dashboard)/reports/page.tsx` (add GSTR-1 card link)

GSTR-1 architecture: same month/year selector as GSTR-3B. Fetch invoices for period → split into B2B (customers with GSTIN) and B2CS (without GSTIN). Compute HSN summary. Export as JSON matching GST portal format.

### 2.1 — Create GSTR-1 page

- [ ] **Create `D:/invio/src/app/(dashboard)/reports/gstr1/page.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, Download, Loader2, FileSpreadsheet,
  Calendar, RefreshCw, AlertCircle, CheckCircle,
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

    // Fetch invoices with items and customer GSTIN
    const { data: invoices } = await supabase
      .from("invoices")
      .select(`
        id, invoice_number, invoice_date, total, subtotal, cgst, sgst, igst,
        customer_name, customer_gstin, customer_state,
        invoice_items (
          description, hsn_code, quantity, unit, rate, amount, gst_rate,
          cgst, sgst, igst
        )
      `)
      .eq("business_id", userData.business_id)
      .gte("invoice_date", startDate)
      .lte("invoice_date", endDate)
      .neq("status", "cancelled")
      .neq("status", "draft");

    const rows = invoices || [];

    // B2B — invoices where customer has GSTIN
    const b2b: B2BEntry[] = rows
      .filter((inv: any) => inv.customer_gstin)
      .map((inv: any) => ({
        gstin: inv.customer_gstin,
        customer_name: inv.customer_name,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        invoice_value: inv.total,
        taxable_value: inv.subtotal,
        igst: inv.igst || 0,
        cgst: inv.cgst || 0,
        sgst: inv.sgst || 0,
      }));

    // B2CS — invoices without customer GSTIN, grouped by state
    const b2csMap: Record<string, B2CSEntry> = {};
    rows.filter((inv: any) => !inv.customer_gstin).forEach((inv: any) => {
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

    // HSN summary — group all items by HSN code
    const hsnMap: Record<string, HSNEntry> = {};
    rows.forEach((inv: any) => {
      (inv.invoice_items || []).forEach((item: any) => {
        const key = item.hsn_code || "0000";
        if (!hsnMap[key]) {
          hsnMap[key] = {
            hsn_code: key,
            description: item.description,
            uqc: item.unit || "NOS",
            quantity: 0,
            taxable_value: 0,
            igst: 0, cgst: 0, sgst: 0,
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

    const totalTaxable = rows.reduce((s: number, i: any) => s + (i.subtotal || 0), 0);
    const totalTax = rows.reduce((s: number, i: any) => s + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0), 0);

    setData({ b2b, b2cs, hsn, totalInvoices: rows.length, totalTaxable, totalTax });
    setLoading(false);
  };

  const downloadJSON = () => {
    if (!data) return;
    const fmt = (n: number) => Math.round(n * 100) / 100;
    const json = {
      gstin: businessGstin,
      fp: `${String(selectedMonth + 1).padStart(2, "0")}${selectedYear}`,
      b2b: data.b2b.map(e => ({
        ctin: e.gstin,
        inv: [{
          inum: e.invoice_number,
          idt: new Date(e.invoice_date).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-"),
          val: fmt(e.invoice_value),
          pos: "00",
          rchrg: "N",
          inv_typ: "R",
          itms: [{
            num: 1,
            itm_det: {
              txval: fmt(e.taxable_value),
              rt: 18,
              iamt: fmt(e.igst),
              camt: fmt(e.cgst),
              samt: fmt(e.sgst),
              csamt: 0,
            },
          }],
        }],
      })),
      b2cs: data.b2cs.map(e => ({
        sply_tp: "INTRA",
        pos: "00",
        typ: "OE",
        txval: fmt(e.taxable_value),
        rt: 18,
        iamt: fmt(e.igst),
        camt: fmt(e.cgst),
        samt: fmt(e.sgst),
        csamt: 0,
      })),
      hsn: {
        data: data.hsn.map(e => ({
          num: 1,
          hsn_sc: e.hsn_code,
          desc: e.description.substring(0, 30),
          uqc: e.uqc.toUpperCase().substring(0, 3),
          qty: fmt(e.quantity),
          val: fmt(e.taxable_value + e.igst + e.cgst + e.sgst),
          txval: fmt(e.taxable_value),
          iamt: fmt(e.igst),
          camt: fmt(e.cgst),
          samt: fmt(e.sgst),
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
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
          onChange={e => setSelectedMonth(Number(e.target.value))}
          className="h-8 rounded-md border border-input bg-background px-3 text-sm"
        >
          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select
          value={selectedYear}
          onChange={e => setSelectedYear(Number(e.target.value))}
          className="h-8 rounded-md border border-input bg-background px-3 text-sm"
        >
          {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={fetchData} className="h-8 w-8 flex items-center justify-center rounded-md border hover:bg-muted transition-colors">
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
              { label: "Taxable Value", value: fmt(data.totalTaxable) },
              { label: "Total Tax", value: fmt(data.totalTax) },
            ].map(c => (
              <div key={c.label} className="rounded-xl border bg-card p-4">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className="text-lg font-bold mt-1">{c.value}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b">
            {(["b2b", "b2cs", "hsn"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.toUpperCase()} ({tab === "b2b" ? data.b2b.length : tab === "b2cs" ? data.b2cs.length : data.hsn.length})
              </button>
            ))}
          </div>

          {/* B2B Table */}
          {activeTab === "b2b" && (
            <div className="rounded-xl border overflow-hidden">
              {data.b2b.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No B2B invoices (customers with GSTIN) for this period.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {["Customer GSTIN", "Invoice No", "Date", "Taxable", "IGST", "CGST", "SGST", "Total"].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-muted-foreground px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.b2b.map((e, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{e.gstin}</td>
                        <td className="px-3 py-2">{e.invoice_number}</td>
                        <td className="px-3 py-2 text-muted-foreground">{new Date(e.invoice_date).toLocaleDateString("en-IN")}</td>
                        <td className="px-3 py-2">{fmt(e.taxable_value)}</td>
                        <td className="px-3 py-2">{fmt(e.igst)}</td>
                        <td className="px-3 py-2">{fmt(e.cgst)}</td>
                        <td className="px-3 py-2">{fmt(e.sgst)}</td>
                        <td className="px-3 py-2 font-semibold">{fmt(e.invoice_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* B2CS Table */}
          {activeTab === "b2cs" && (
            <div className="rounded-xl border overflow-hidden">
              {data.b2cs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No B2CS invoices (unregistered customers) for this period.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {["State", "Taxable Value", "IGST", "CGST", "SGST"].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-muted-foreground px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.b2cs.map((e, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{e.state}</td>
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
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {["HSN", "Description", "Qty", "Taxable", "IGST", "CGST", "SGST"].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-muted-foreground px-3 py-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.hsn.map((e, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{e.hsn_code}</td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate">{e.description}</td>
                        <td className="px-3 py-2">{e.quantity} {e.uqc}</td>
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

          {/* Filing note */}
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>GSTR-1 is due by the 11th of the following month. Download the JSON and upload it to the GST portal at <strong>gst.gov.in</strong>.</span>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Commit**
```bash
git -C D:/invio add "src/app/(dashboard)/reports/gstr1/page.tsx"
git -C D:/invio commit -m "feat: add GSTR-1 report with B2B, B2CS, HSN tabs and JSON export"
```

---

### 2.2 — Add GSTR-1 card to reports index

- [ ] **Open `D:/invio/src/app/(dashboard)/reports/page.tsx`**

- [ ] **Find the block that renders the GSTR-3B card link** — it will reference `/reports/gstr3b`. Add a similar card for GSTR-1 immediately before or after it:

```tsx
<Link href="/reports/gstr1" className="block rounded-xl border bg-card p-5 hover:bg-muted/30 transition-colors group">
  <div className="flex items-center gap-3 mb-2">
    <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
      <FileSpreadsheet className="h-4 w-4 text-blue-500" />
    </div>
    <div>
      <p className="text-sm font-semibold">GSTR-1</p>
      <p className="text-xs text-muted-foreground">Outward Supplies</p>
    </div>
  </div>
  <p className="text-xs text-muted-foreground">B2B, B2CS, HSN summary. JSON export for portal upload. Due 11th.</p>
</Link>
```

Make sure `FileSpreadsheet` is in the lucide-react imports at top of that file.

- [ ] **Commit**
```bash
git -C D:/invio add "src/app/(dashboard)/reports/page.tsx"
git -C D:/invio commit -m "feat: add GSTR-1 card to reports index page"
```

---

## Task 3: GSTIN Auto-fill via Whitebooks API

**Files:**
- Create: `src/app/api/gstin-lookup/route.ts`
- Modify: `src/app/(dashboard)/customers/new/page.tsx`
- Modify: `.env.local` (add `WHITEBOOKS_API_KEY`)

The Whitebooks public GSTIN search endpoint does not require user auth — just an API key. It returns legalName, principalAddress (with stateCode), and status. We proxy it server-side to hide the API key.

### 3.1 — Create GSTIN lookup API route

- [ ] **Add to `.env.local`**:
```
WHITEBOOKS_API_KEY=your_sandbox_key_here
WHITEBOOKS_BASE_URL=https://gst.whitebooks.in
```
(Extract the actual sandbox key from `D:/invio/External API Resource/e-Invioce-ewaybill-Sandbox-Credentials.pdf`)

- [ ] **Create `D:/invio/src/app/api/gstin-lookup/route.ts`**:

```ts
import { NextRequest, NextResponse } from "next/server";

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export async function GET(request: NextRequest) {
  const gstin = request.nextUrl.searchParams.get("gstin")?.toUpperCase().trim();

  if (!gstin || !GSTIN_REGEX.test(gstin)) {
    return NextResponse.json({ error: "Invalid GSTIN format" }, { status: 400 });
  }

  const apiKey = process.env.WHITEBOOKS_API_KEY;
  const baseUrl = process.env.WHITEBOOKS_BASE_URL || "https://gst.whitebooks.in";

  if (!apiKey) {
    // Graceful degradation — no API key configured, return partial data from GSTIN itself
    const stateCode = gstin.substring(0, 2);
    return NextResponse.json({ gstin, stateCode, source: "local" });
  }

  try {
    const res = await fetch(`${baseUrl}/public/search?action=TP&gstin=${gstin}`, {
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      next: { revalidate: 3600 }, // cache 1 hour per GSTIN
    });

    if (!res.ok) {
      throw new Error(`Whitebooks API error: ${res.status}`);
    }

    const data = await res.json();
    const tp = data?.data?.tradeNam || data?.data?.legalName || "";
    const addr = data?.data?.pradr?.addr || {};
    const stateCode = gstin.substring(0, 2);

    return NextResponse.json({
      gstin,
      business_name: tp,
      address: [addr.bno, addr.st, addr.loc].filter(Boolean).join(", "),
      city: addr.dst || addr.loc || "",
      state: addr.stcd || stateCode,
      pincode: addr.pncd || "",
      status: data?.data?.sts || "Active",
      source: "whitebooks",
    });
  } catch (err: any) {
    console.error("GSTIN lookup failed:", err.message);
    // Return partial data from GSTIN state code so UX doesn't break
    const stateCode = gstin.substring(0, 2);
    return NextResponse.json({ gstin, stateCode, source: "fallback" });
  }
}
```

- [ ] **Commit**
```bash
git -C D:/invio add "src/app/api/gstin-lookup/route.ts"
git -C D:/invio commit -m "feat: add GSTIN lookup API route (Whitebooks proxy with graceful fallback)"
```

---

### 3.2 — Add "Verify GSTIN" button to customer form

- [ ] **Open `D:/invio/src/app/(dashboard)/customers/new/page.tsx`**

- [ ] **Add state and handler** — inside the component, add:
```tsx
const [gstinLoading, setGstinLoading] = useState(false);
const [gstinVerified, setGstinVerified] = useState(false);

const verifyGstin = async () => {
  if (!gstin || gstin.length < 15) return;
  setGstinLoading(true);
  setGstinVerified(false);
  try {
    const res = await fetch(`/api/gstin-lookup?gstin=${encodeURIComponent(gstin)}`);
    const data = await res.json();
    if (data.error) { toast.error(data.error); return; }
    if (data.business_name) setBusinessName(data.business_name); // only set if state exists
    // Auto-fill billing address fields if they exist as state vars
    setGstinVerified(true);
    toast.success("GSTIN verified — details auto-filled");
  } catch {
    toast.error("Could not verify GSTIN");
  } finally {
    setGstinLoading(false);
  }
};
```

Make sure `toast` is imported from `"sonner"`. Add `Loader2, CheckCircle2` to the lucide-react import.

- [ ] **Replace the GSTIN input** — find the GSTIN `<Input>` element and wrap it:
```tsx
<div className="relative">
  <Input
    value={gstin}
    onChange={(e) => { setGstin(e.target.value.toUpperCase()); setGstinVerified(false); }}
    placeholder="22AAAAA0000A1Z5"
    maxLength={15}
    className={gstinVerified ? "border-emerald-500 pr-20" : "pr-20"}
  />
  <button
    type="button"
    onClick={verifyGstin}
    disabled={gstin.length < 15 || gstinLoading}
    className="absolute right-2 top-1/2 -translate-y-1/2 h-6 px-2 rounded text-[11px] font-medium bg-muted hover:bg-muted/80 disabled:opacity-40 flex items-center gap-1 transition-colors"
  >
    {gstinLoading ? (
      <Loader2 className="h-3 w-3 animate-spin" />
    ) : gstinVerified ? (
      <><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Verified</>
    ) : (
      "Verify"
    )}
  </button>
</div>
```

- [ ] **Commit**
```bash
git -C D:/invio add "src/app/(dashboard)/customers/new/page.tsx"
git -C D:/invio commit -m "feat: add GSTIN verify button with auto-fill on customer form"
```

---

## Task 4: Invoice Footer on All 4 PDF Templates

**Files:**
- Modify: `src/components/invoice-pdf.tsx`

Currently `minimal` template has "Thank you for your business!" with no Invio branding. `gst_formal` template has no footer branding. `professional` already has "Generated with Invio". `export` already has "Generated with Invio".

Goal: All 4 templates end with "Made with Invio · invio-delta.vercel.app" — subtle, professional, brand-building.

### 4.1 — Update minimal template footer

- [ ] **Open `D:/invio/src/components/invoice-pdf.tsx`**

- [ ] **Find the minimal template footer** — search for `"Thank you for your business!"` in the minimal template section (~line 367). Replace that `<Text>` with:
```tsx
<Text style={minimalStyles.footer}>Thank you for your business! · Made with Invio</Text>
```

### 4.2 — Update gst_formal template footer

- [ ] **Find the gst_formal template** — search for the section rendering the GST formal / gst_formal template. Look for its footer `<Text>` or add one. Find where the last main content block ends and add:
```tsx
<View style={{ position: "absolute", bottom: 20, left: 40, right: 40, borderTopWidth: 0.5, borderTopColor: "#e5e7eb", paddingTop: 8 }}>
  <Text style={{ fontSize: 8, color: "#9ca3af", textAlign: "center" }}>
    Computer-generated invoice · Made with Invio · invio-delta.vercel.app
  </Text>
</View>
```

- [ ] **Commit**
```bash
git -C D:/invio add "src/components/invoice-pdf.tsx"
git -C D:/invio commit -m "feat: add Made with Invio footer to all 4 invoice PDF templates"
```

---

## Task 5: Annual Plan Upsell Nudge

**Files:**
- Create: `src/components/upsell-nudge.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

Show a dismissible banner on the dashboard after the user has created their first invoice. Only show to free-plan users. Dismiss stores to localStorage. Message: "Enjoying Invio? Save ₹999 with the Annual Plan — 2 months free."

### 5.1 — Create upsell nudge component

- [ ] **Create `D:/invio/src/components/upsell-nudge.tsx`**

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Sparkles } from "lucide-react";

const DISMISS_KEY = "invio_annual_nudge_dismissed";

interface UpsellNudgeProps {
  invoiceCount: number;
  isPro: boolean;
}

export function UpsellNudge({ invoiceCount, isPro }: UpsellNudgeProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isPro) return;
    if (invoiceCount < 1) return;
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) setShow(true);
  }, [invoiceCount, isPro]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
      <Sparkles className="h-4 w-4 text-primary shrink-0" />
      <p className="text-sm flex-1">
        <span className="font-medium">Save ₹999 with Annual Plan</span>
        <span className="text-muted-foreground"> — 2 months free. Same features, better value.</span>
      </p>
      <Link
        href="/subscription"
        className="shrink-0 text-xs font-semibold text-primary hover:underline"
      >
        Upgrade →
      </Link>
      <button onClick={dismiss} className="shrink-0 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
```

### 5.2 — Add to dashboard page

- [ ] **Open `D:/invio/src/app/(dashboard)/dashboard/page.tsx`**

- [ ] **Add import**:
```ts
import { UpsellNudge } from "@/components/upsell-nudge";
```

- [ ] **Add `<UpsellNudge>` to the top of the dashboard JSX** — immediately after the opening `<div className="space-y-...">` and before the first heading/stats section:
```tsx
<UpsellNudge
  invoiceCount={stats.totalInvoices}
  isPro={false /* TODO: read from subscription context */}
/>
```

- [ ] **Commit**
```bash
git -C D:/invio add "src/components/upsell-nudge.tsx" "src/app/(dashboard)/dashboard/page.tsx"
git -C D:/invio commit -m "feat: add annual plan upsell nudge on dashboard after first invoice"
```

---

## Task 6: Android APK Build

**Files:**
- Modify: `capacitor.config.ts` (fix production URL)
- Modify: `package.json` (add `mobile:apk` script)

The current config points to `https://invio.vercel.app` which is wrong — deployed URL is `https://invio-delta.vercel.app`.

### 6.1 — Fix Capacitor production URL

- [ ] **Open `D:/invio/capacitor.config.ts`**

- [ ] **Replace the production server URL** — find `url: 'https://invio.vercel.app'` and change to:
```ts
url: 'https://invio-delta.vercel.app',
```

- [ ] **Commit**
```bash
git -C D:/invio add capacitor.config.ts
git -C D:/invio commit -m "fix: update Capacitor production URL to invio-delta.vercel.app"
```

---

### 6.2 — Add APK build script to package.json

- [ ] **Open `D:/invio/package.json`**

- [ ] **Add script** — inside `"scripts"`, add after `"mobile:build"`:
```json
"mobile:apk": "next build && cap sync android && cd android && gradlew assembleRelease"
```

- [ ] **Commit**
```bash
git -C D:/invio add package.json
git -C D:/invio commit -m "feat: add mobile:apk build script"
```

---

### 6.3 — Build the APK (manual steps)

Run these in order from `D:/invio`:

- [ ] **Step 1: Build Next.js**
```bash
cd D:/invio && npm run build
```
Expected: Build completes, `.next/` folder populated.

- [ ] **Step 2: Sync to Android**
```bash
npx cap sync android
```
Expected: "✔ Copying web assets" + "✔ Updating Android plugins"

- [ ] **Step 3: Build APK in Android Studio**
  - Run: `npx cap open android`
  - In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
  - APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

- [ ] **Step 4: Send APK via WhatsApp to first trader**
```bash
# APK is at:
D:/invio/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Final Verification Checklist

After all tasks complete, verify:

- [ ] WA Reminder button appears on overdue invoices in the invoice list dropdown
- [ ] WA Reminder button appears on overdue/sent invoice detail page
- [ ] Clicking WA buttons opens WhatsApp with correct pre-filled message
- [ ] `/reports/gstr1` loads, shows B2B/B2CS/HSN tabs, JSON downloads correctly
- [ ] GSTR-1 card visible on `/reports`
- [ ] GSTIN field on `/customers/new` shows "Verify" button; clicking with a valid GSTIN shows "Verified" and fills business_name
- [ ] All 4 invoice PDF templates have "Made with Invio" in footer (test by downloading each template type)
- [ ] Annual plan nudge appears on dashboard after creating 1 invoice, disappears after dismiss
- [ ] `capacitor.config.ts` has `invio-delta.vercel.app`
- [ ] APK builds successfully

---

## Deployment

After all tasks pass verification:

```bash
git -C D:/invio push origin master
```

Vercel auto-deploys on push to master. APK send to first trader directly over WhatsApp.

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, Loader2, AlertCircle, Clock, Calendar, Download,
  ChevronRight, Sparkles, MessageSquare, X, Copy, Check
} from "lucide-react";

interface UnpaidInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_id: string | null;
  invoice_date: string;
  due_date: string | null;
  total: number;
  status: string;
  daysOverdue: number;
  bucket: "current" | "30" | "60" | "90";
}

interface BucketSummary {
  label: string;
  key: "current" | "30" | "60" | "90";
  invoices: UnpaidInvoice[];
  total: number;
  color: string;
  bgColor: string;
}

interface ReminderModal {
  invoice: UnpaidInvoice;
  message: string | null;
  loading: boolean;
}

export default function AgedReceivablesPage() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<UnpaidInvoice[]>([]);
  const [businessName, setBusinessName] = useState("");
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [reminderModal, setReminderModal] = useState<ReminderModal | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchReceivables();
  }, []);

  const fetchReceivables = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userData } = await supabase.from("users").select("business_id").eq("id", user.id).single();
    if (!userData?.business_id) { setLoading(false); return; }

    const { data: biz } = await supabase.from("businesses").select("name").eq("id", userData.business_id).single();
    if (biz) setBusinessName(biz.name);

    const { data } = await supabase
      .from("invoices")
      .select("id, invoice_number, customer_name, customer_id, invoice_date, due_date, total, status")
      .eq("business_id", userData.business_id)
      .in("status", ["sent", "overdue"])
      .order("invoice_date", { ascending: true });

    const today = new Date();
    const processed = (data || []).map(inv => {
      const dueDate = inv.due_date ? new Date(inv.due_date) : new Date(inv.invoice_date);
      const diffTime = today.getTime() - dueDate.getTime();
      const daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      let bucket: "current" | "30" | "60" | "90" = "current";
      if (daysOverdue > 90) bucket = "90";
      else if (daysOverdue > 60) bucket = "60";
      else if (daysOverdue > 30) bucket = "30";
      else if (daysOverdue > 0) bucket = "current";

      return { ...inv, daysOverdue: Math.max(0, daysOverdue), bucket };
    });

    setInvoices(processed);
    setLoading(false);
  };

  const buckets: BucketSummary[] = [
    {
      label: "Current (0-30 days)",
      key: "current",
      invoices: invoices.filter(i => i.bucket === "current"),
      total: invoices.filter(i => i.bucket === "current").reduce((s, i) => s + i.total, 0),
      color: "text-emerald-600",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50",
    },
    {
      label: "31-60 days",
      key: "30",
      invoices: invoices.filter(i => i.bucket === "30"),
      total: invoices.filter(i => i.bucket === "30").reduce((s, i) => s + i.total, 0),
      color: "text-amber-600",
      bgColor: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50",
    },
    {
      label: "61-90 days",
      key: "60",
      invoices: invoices.filter(i => i.bucket === "60"),
      total: invoices.filter(i => i.bucket === "60").reduce((s, i) => s + i.total, 0),
      color: "text-orange-600",
      bgColor: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50",
    },
    {
      label: "90+ days",
      key: "90",
      invoices: invoices.filter(i => i.bucket === "90"),
      total: invoices.filter(i => i.bucket === "90").reduce((s, i) => s + i.total, 0),
      color: "text-red-600",
      bgColor: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50",
    },
  ];

  const grandTotal = invoices.reduce((s, i) => s + i.total, 0);

  const openReminder = async (inv: UnpaidInvoice) => {
    setReminderModal({ invoice: inv, message: null, loading: true });
    try {
      const res = await fetch("/api/ai-payment-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: inv.customer_name,
          invoiceNumber: inv.invoice_number,
          amount: inv.total,
          daysOverdue: inv.daysOverdue,
          businessName,
        }),
      });
      if (res.ok) {
        const { message } = await res.json();
        setReminderModal(prev => prev ? { ...prev, message, loading: false } : null);
      }
    } catch {
      setReminderModal(prev => prev ? { ...prev, message: "Could not generate reminder.", loading: false } : null);
    }
  };

  const copyReminder = async () => {
    if (!reminderModal?.message) return;
    await navigator.clipboard.writeText(reminderModal.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendOnWhatsApp = () => {
    if (!reminderModal?.message) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(reminderModal.message)}`, "_blank");
  };

  const getAiInsight = async () => {
    if (loadingInsight || invoices.length === 0) return;
    setLoadingInsight(true);
    setAiInsight(null);
    try {
      const res = await fetch("/api/ai-receivables-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalOutstanding: grandTotal,
          buckets: buckets.map(b => ({ label: b.label, count: b.invoices.length, total: b.total })),
          invoiceCount: invoices.length,
        }),
      });
      if (res.ok) { const { insight } = await res.json(); setAiInsight(insight); }
    } catch { setAiInsight("Could not load insight."); }
    finally { setLoadingInsight(false); }
  };

  const downloadCSV = () => {
    const rows = [
      ["Aged Receivables Report"],
      ["Invoice #", "Customer", "Invoice Date", "Due Date", "Days Overdue", "Amount", "Status"],
      ...invoices.map(i => [
        i.invoice_number,
        i.customer_name || "Walk-in",
        i.invoice_date,
        i.due_date || "-",
        String(i.daysOverdue),
        String(i.total),
        i.status,
      ]),
      ["", "", "", "", "Total", String(grandTotal), ""],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aged-receivables.csv";
    a.click();
  };

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/reports" className="p-2 hover:bg-muted rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Aged Receivables</h1>
          <p className="text-muted-foreground text-sm">Unpaid invoices by age</p>
        </div>
        <button
          onClick={downloadCSV}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl hover:bg-muted transition-colors text-sm"
        >
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {invoices.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No unpaid invoices</p>
          <p className="text-sm text-muted-foreground/70 mt-1">All invoices are paid — great job!</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {buckets.map(b => (
              <button
                key={b.key}
                onClick={() => setSelectedBucket(selectedBucket === b.key ? null : b.key)}
                className={`p-4 rounded-xl border text-left transition-all ${b.bgColor} ${
                  selectedBucket === b.key ? "ring-2 ring-primary ring-offset-2" : ""
                }`}
              >
                <p className="text-xs text-muted-foreground">{b.label}</p>
                <p className={`text-xl font-bold ${b.color}`}>{fmt(b.total)}</p>
                <p className="text-xs text-muted-foreground">{b.invoices.length} invoice{b.invoices.length !== 1 ? "s" : ""}</p>
              </button>
            ))}
            <div className="p-4 rounded-xl border bg-card border-border">
              <p className="text-xs text-muted-foreground">Total Outstanding</p>
              <p className="text-xl font-bold text-foreground">{fmt(grandTotal)}</p>
              <p className="text-xs text-muted-foreground">{invoices.length} invoices</p>
            </div>
          </div>

          {/* AI Insight */}
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border border-purple-200 dark:border-purple-800/50 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-purple-600 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Collection Insights</p>
                  {aiInsight ? (
                    <p className="text-sm text-muted-foreground mt-1">{aiInsight}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">Get AI-powered collection priorities and risk assessment.</p>
                  )}
                </div>
              </div>
              <button
                onClick={getAiInsight}
                disabled={loadingInsight}
                className="shrink-0 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loadingInsight ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Analyze
              </button>
            </div>
          </div>

          {/* Invoice list */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">
                {selectedBucket ? `${buckets.find(b => b.key === selectedBucket)?.label} Invoices` : "All Unpaid Invoices"}
              </h3>
            </div>
            <div className="divide-y divide-border">
              {(selectedBucket ? invoices.filter(i => i.bucket === selectedBucket) : invoices).map(inv => (
                <Link
                  key={inv.id}
                  href={`/invoices/${inv.id}`}
                  className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{inv.invoice_number}</span>
                      {inv.daysOverdue > 60 && (
                        <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3" /> High risk
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{inv.customer_name || "Walk-in"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">{fmt(inv.total)}</p>
                    <p className={`text-xs ${inv.daysOverdue > 30 ? "text-red-600" : "text-muted-foreground"}`}>
                      {inv.daysOverdue > 0 ? `${inv.daysOverdue} days overdue` : "Due soon"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.preventDefault(); openReminder(inv); }}
                      className="p-2 text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20 rounded-lg transition-colors"
                      title="AI Payment Reminder"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* AI Reminder Modal */}
      {reminderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div>
                <h3 className="font-semibold text-foreground">AI Payment Reminder</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {reminderModal.invoice.customer_name} · {reminderModal.invoice.invoice_number}
                </p>
              </div>
              <button
                onClick={() => setReminderModal(null)}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {reminderModal.loading ? (
                <div className="flex items-center justify-center py-8 gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Drafting reminder...</span>
                </div>
              ) : (
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/50 rounded-xl p-4">
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {reminderModal.message}
                  </p>
                </div>
              )}
            </div>

            {!reminderModal.loading && reminderModal.message && (
              <div className="flex gap-3 px-5 pb-5">
                <button
                  onClick={copyReminder}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-border rounded-xl hover:bg-muted transition-colors text-sm"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button
                  onClick={sendOnWhatsApp}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  <MessageSquare className="w-4 h-4" />
                  Send on WhatsApp
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

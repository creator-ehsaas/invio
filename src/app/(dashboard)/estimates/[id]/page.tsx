"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, CheckCircle2, XCircle, ArrowRight, Loader2,
  Clock, Share2, Sparkles, Edit2, Trash2, FileText
} from "lucide-react";

interface EstimateItem {
  id: string;
  description: string;
  hsn_code: string | null;
  quantity: number;
  unit: string;
  rate: number;
  gst_rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  amount: number;
}

interface Estimate {
  id: string;
  estimate_number: string;
  customer_name: string | null;
  customer_id: string | null;
  estimate_date: string;
  valid_until: string | null;
  status: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  notes: string | null;
  terms: string | null;
  converted_invoice_id: string | null;
  converted_at: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-muted text-muted-foreground" },
  sent: { label: "Sent", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  accepted: { label: "Accepted", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  expired: { label: "Expired", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  converted: { label: "Converted", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
};

export default function EstimateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [items, setItems] = useState<EstimateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEstimate();
  }, [id]);

  const fetchEstimate = async () => {
    const supabase = createClient();
    const [{ data: est }, { data: estItems }] = await Promise.all([
      supabase.from("estimates").select("*").eq("id", id).single(),
      supabase.from("estimate_items").select("*").eq("estimate_id", id).order("created_at"),
    ]);
    if (est) setEstimate(est);
    if (estItems) setItems(estItems);
    setLoading(false);
  };

  const updateStatus = async (status: string) => {
    if (!estimate) return;
    setUpdatingStatus(true);
    const supabase = createClient();
    await supabase.from("estimates").update({ status }).eq("id", id);
    setEstimate(prev => prev ? { ...prev, status } : null);
    setUpdatingStatus(false);
  };

  const convertToInvoice = async () => {
    if (!estimate || estimate.status === "converted") return;
    setConverting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: userData } = await supabase
        .from("users").select("business_id").eq("id", user.id).single();
      if (!userData?.business_id) throw new Error("No business");

      const { data: business } = await supabase
        .from("businesses")
        .select("invoice_prefix, next_invoice_number")
        .eq("id", userData.business_id)
        .single();

      const prefix = business?.invoice_prefix || "INV-";
      const num = business?.next_invoice_number || 1;
      const invoiceNumber = `${prefix}${String(num).padStart(4, "0")}`;

      // Calc due date (15 days from today)
      const due = new Date();
      due.setDate(due.getDate() + 15);

      // Create invoice
      const { data: invoice, error: invErr } = await supabase
        .from("invoices")
        .insert({
          business_id: userData.business_id,
          customer_id: estimate.customer_id || null,
          customer_name: estimate.customer_name || null,
          invoice_number: invoiceNumber,
          invoice_date: new Date().toISOString().split("T")[0],
          due_date: due.toISOString().split("T")[0],
          status: "draft",
          subtotal: estimate.subtotal,
          cgst: estimate.cgst,
          sgst: estimate.sgst,
          igst: estimate.igst,
          total: estimate.total,
          notes: estimate.notes,
          terms: estimate.terms,
        })
        .select()
        .single();

      if (invErr) throw invErr;

      // Copy items
      const invoiceItems = items.map(item => ({
        invoice_id: invoice.id,
        description: item.description,
        hsn_code: item.hsn_code || null,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        gst_rate: item.gst_rate,
        cgst: item.cgst,
        sgst: item.sgst,
        igst: item.igst,
        amount: item.amount,
      }));

      await supabase.from("invoice_items").insert(invoiceItems);

      // Increment invoice counter
      await supabase
        .from("businesses")
        .update({ next_invoice_number: num + 1 })
        .eq("id", userData.business_id);

      // Mark estimate as converted
      await supabase
        .from("estimates")
        .update({
          status: "converted",
          converted_invoice_id: invoice.id,
          converted_at: new Date().toISOString(),
        })
        .eq("id", id);

      router.push(`/invoices/${invoice.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to convert to invoice");
    } finally {
      setConverting(false);
    }
  };

  const getAiInsight = async () => {
    if (!estimate || loadingInsight) return;
    setLoadingInsight(true);
    setAiInsight(null);

    try {
      const res = await fetch("/api/ai-estimate-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimate: {
            customer_name: estimate.customer_name,
            total: estimate.total,
            valid_until: estimate.valid_until,
            status: estimate.status,
            items: items.map(i => ({ description: i.description, quantity: i.quantity, rate: i.rate, gst_rate: i.gst_rate })),
            notes: estimate.notes,
          },
        }),
      });
      if (res.ok) {
        const { insight } = await res.json();
        setAiInsight(insight);
      }
    } catch {
      setAiInsight("Could not load AI insight right now.");
    } finally {
      setLoadingInsight(false);
    }
  };

  const deleteEstimate = async () => {
    if (!confirm("Delete this estimate permanently?")) return;
    const supabase = createClient();
    await supabase.from("estimates").delete().eq("id", id);
    router.push("/estimates");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!estimate) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Estimate not found.</p>
        <Link href="/estimates" className="text-primary hover:underline mt-2 inline-block">← Back to Estimates</Link>
      </div>
    );
  }

  const statusInfo = STATUS_LABELS[estimate.status] || STATUS_LABELS.draft;
  const isExpired = estimate.valid_until && new Date(estimate.valid_until) < new Date();
  const canConvert = estimate.status !== "converted" && estimate.status !== "rejected";

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/estimates" className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{estimate.estimate_number}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
            {isExpired && estimate.status !== "converted" && (
              <span className="text-xs text-orange-600 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Expired
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{estimate.customer_name || "No customer"}</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={deleteEstimate} className="p-2 text-muted-foreground hover:text-destructive transition-colors" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-3 text-sm">{error}</div>
      )}

      {/* AI Insight Banner */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-200 dark:border-purple-800/50 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            {aiInsight ? (
              <p className="text-sm text-foreground">{aiInsight}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Get AI-powered insights on this estimate — follow-up timing, pricing feedback, win probability.
              </p>
            )}
          </div>
          <button
            onClick={getAiInsight}
            disabled={loadingInsight}
            className="shrink-0 text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            {loadingInsight ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {loadingInsight ? "Analyzing..." : "Analyze"}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Meta */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Estimate Date</p>
                <p className="font-medium mt-0.5">{new Date(estimate.estimate_date).toLocaleDateString("en-IN")}</p>
              </div>
              {estimate.valid_until && (
                <div>
                  <p className="text-muted-foreground text-xs">Valid Until</p>
                  <p className={`font-medium mt-0.5 ${isExpired ? "text-orange-600" : ""}`}>
                    {new Date(estimate.valid_until).toLocaleDateString("en-IN")}
                  </p>
                </div>
              )}
              {estimate.converted_invoice_id && (
                <div>
                  <p className="text-muted-foreground text-xs">Converted Invoice</p>
                  <Link
                    href={`/invoices/${estimate.converted_invoice_id}`}
                    className="text-primary hover:underline font-medium mt-0.5 flex items-center gap-1 text-sm"
                  >
                    <FileText className="w-3 h-3" /> View Invoice
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Items</h2>
            </div>
            <div className="divide-y divide-border">
              {items.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{item.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.quantity} {item.unit} × ₹{item.rate.toLocaleString("en-IN")} | GST {item.gst_rate}%
                        {item.hsn_code && ` | HSN: ${item.hsn_code}`}
                      </p>
                    </div>
                    <p className="font-semibold text-foreground shrink-0">
                      ₹{item.amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes / Terms */}
          {(estimate.notes || estimate.terms) && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3 text-sm">
              {estimate.notes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-foreground">{estimate.notes}</p>
                </div>
              )}
              {estimate.terms && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Terms & Conditions</p>
                  <p className="text-foreground">{estimate.terms}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: summary + actions */}
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-2 text-sm">
            <h2 className="font-semibold text-foreground mb-3">Summary</h2>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>₹{estimate.subtotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
            </div>
            {estimate.igst > 0 ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">IGST</span>
                <span>₹{estimate.igst.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CGST</span>
                  <span>₹{estimate.cgst.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SGST</span>
                  <span>₹{estimate.sgst.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-bold text-base border-t border-border pt-2">
              <span>Total</span>
              <span>₹{estimate.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Status Actions */}
          {estimate.status !== "converted" && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <h2 className="font-semibold text-foreground text-sm mb-3">Update Status</h2>
              {estimate.status !== "sent" && (
                <button
                  onClick={() => updateStatus("sent")}
                  disabled={updatingStatus}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
                >
                  <Share2 className="w-4 h-4" /> Mark as Sent
                </button>
              )}
              {estimate.status !== "accepted" && (
                <button
                  onClick={() => updateStatus("accepted")}
                  disabled={updatingStatus}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-emerald-300 text-emerald-700 rounded-lg text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" /> Mark Accepted
                </button>
              )}
              {estimate.status !== "rejected" && (
                <button
                  onClick={() => updateStatus("rejected")}
                  disabled={updatingStatus}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-red-300 text-red-700 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                >
                  <XCircle className="w-4 h-4" /> Mark Rejected
                </button>
              )}
            </div>
          )}

          {/* Convert to Invoice */}
          {canConvert && (
            <button
              onClick={convertToInvoice}
              disabled={converting}
              className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {converting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              {converting ? "Converting..." : "Convert to Invoice"}
            </button>
          )}

          {estimate.status === "converted" && estimate.converted_invoice_id && (
            <Link
              href={`/invoices/${estimate.converted_invoice_id}`}
              className="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 transition-colors"
            >
              <FileText className="w-4 h-4" /> View Invoice
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

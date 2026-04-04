"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  Clock,
  Building2,
  Calendar,
  FileText,
  Trash2,
  CreditCard,
  X,
} from "lucide-react";
import type { PurchaseInvoice, PurchaseInvoiceItem, Supplier } from "@/types/database";

export default function PurchaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [purchase, setPurchase] = useState<PurchaseInvoice | null>(null);
  const [items, setItems] = useState<PurchaseInvoiceItem[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentRef, setPaymentRef] = useState("");

  useEffect(() => {
    fetchPurchase();
  }, [params.id]);

  const fetchPurchase = async () => {
    const supabase = createClient();

    const { data: purchaseData, error } = await supabase
      .from("purchase_invoices")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !purchaseData) {
      router.push("/purchases");
      return;
    }

    setPurchase(purchaseData);

    // Fetch items
    const { data: itemsData } = await supabase
      .from("purchase_invoice_items")
      .select("*")
      .eq("purchase_invoice_id", params.id);

    if (itemsData) setItems(itemsData);

    // Fetch supplier
    if (purchaseData.supplier_id) {
      const { data: supplierData } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", purchaseData.supplier_id)
        .single();

      if (supplierData) setSupplier(supplierData);
    }

    setLoading(false);
  };

  const recordPayment = async () => {
    if (!purchase || !paymentAmount) return;

    setUpdating(true);
    const supabase = createClient();
    const amount = parseFloat(paymentAmount);

    // Create payment record
    await supabase.from("purchase_payments").insert({
      purchase_invoice_id: purchase.id,
      amount,
      payment_method: paymentMethod,
      reference_number: paymentRef || null,
    });

    // Update purchase invoice
    const newAmountPaid = purchase.amount_paid + amount;
    const newStatus = newAmountPaid >= purchase.total ? "paid" : "partial";

    await supabase
      .from("purchase_invoices")
      .update({
        amount_paid: newAmountPaid,
        status: newStatus,
      })
      .eq("id", purchase.id);

    setShowPaymentModal(false);
    setPaymentAmount("");
    setPaymentRef("");
    fetchPurchase();
    setUpdating(false);
  };

  const deletePurchase = async () => {
    if (!confirm("Are you sure you want to delete this purchase? This action cannot be undone.")) {
      return;
    }

    const supabase = createClient();
    await supabase.from("purchase_invoices").delete().eq("id", params.id);
    router.push("/purchases");
  };

  const markAsCancelled = async () => {
    if (!confirm("Cancel this purchase?")) return;

    const supabase = createClient();
    await supabase
      .from("purchase_invoices")
      .update({ status: "cancelled" })
      .eq("id", params.id);

    fetchPurchase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!purchase) return null;

  const balance = purchase.total - purchase.amount_paid;
  const isIgst = purchase.igst > 0;

  const statusConfig = {
    pending: { label: "Pending", icon: Clock, color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30" },
    partial: { label: "Partial", icon: Clock, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30" },
    paid: { label: "Paid", icon: CheckCircle, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30" },
    cancelled: { label: "Cancelled", icon: X, color: "text-slate-500 bg-slate-100 dark:bg-slate-800" },
  };

  const status = statusConfig[purchase.status];
  const StatusIcon = status.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/purchases"
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{purchase.bill_number}</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                <StatusIcon className="w-3 h-3" />
                {status.label}
              </span>
            </div>
            <p className="text-muted-foreground mt-1">
              {purchase.supplier_name || "Unknown Supplier"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {purchase.status !== "paid" && purchase.status !== "cancelled" && (
            <button
              onClick={() => setShowPaymentModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
            >
              <CreditCard className="w-4 h-4" />
              Record Payment
            </button>
          )}
          {purchase.status !== "cancelled" && (
            <button
              onClick={markAsCancelled}
              className="p-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
              title="Cancel"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={deletePurchase}
            className="p-2.5 text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
            title="Delete"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Attached Invoice */}
          {purchase.attachment_url && (
            <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Attached Bill</h2>
                <a
                  href={purchase.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary font-medium hover:underline"
                >
                  Open full size
                </a>
              </div>
              {purchase.attachment_url.match(/\.(jpg|jpeg|png|webp|heic)$/i) ? (
                <img
                  src={purchase.attachment_url}
                  alt="Purchase bill"
                  className="w-full max-h-96 object-contain bg-muted"
                />
              ) : (
                <div className="p-6 flex items-center gap-4">
                  <div className="p-4 bg-red-100 dark:bg-red-950/30 rounded-xl">
                    <FileText className="w-8 h-8 text-red-600" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">PDF Bill Attached</p>
                    <a
                      href={purchase.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Click to view PDF
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Supplier Info */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Supplier</h2>
              {supplier && (
                <Link
                  href={`/suppliers/${supplier.id}`}
                  className="text-sm text-primary font-medium hover:underline"
                >
                  View Supplier
                </Link>
              )}
            </div>
            <div className="flex items-start gap-4">
              <div className="p-3 bg-muted rounded-xl">
                <Building2 className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">{purchase.supplier_name || "Unknown"}</p>
                {supplier?.gstin && (
                  <p className="text-sm text-muted-foreground font-mono">{supplier.gstin}</p>
                )}
                {supplier?.phone && (
                  <p className="text-sm text-muted-foreground">{supplier.phone}</p>
                )}
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-200/50 dark:border-slate-800/50">
              <h2 className="text-lg font-semibold text-foreground">Items</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-6 py-3 font-medium text-muted-foreground">Description</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qty</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Rate</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">GST</th>
                    <th className="text-right px-6 py-3 font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4">
                        <p className="font-medium text-foreground">{item.description}</p>
                        {item.hsn_code && (
                          <p className="text-xs text-muted-foreground">HSN: {item.hsn_code}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right text-muted-foreground">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="px-4 py-4 text-right text-muted-foreground">
                        ₹{item.rate.toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-4 text-right text-muted-foreground">
                        {item.gst_rate}%
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-foreground">
                        ₹{item.amount.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          {purchase.notes && (
            <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground mb-2">Notes</h2>
              <p className="text-muted-foreground">{purchase.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Dates */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">Details</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Bill Date</p>
                  <p className="font-medium">
                    {new Date(purchase.bill_date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
              {purchase.due_date && (
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <p className={`font-medium ${
                      new Date(purchase.due_date) < new Date() && balance > 0
                        ? "text-red-600"
                        : ""
                    }`}>
                      {new Date(purchase.due_date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>₹{purchase.subtotal.toLocaleString("en-IN")}</span>
              </div>
              {isIgst ? (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">IGST</span>
                  <span>₹{purchase.igst.toLocaleString("en-IN")}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">CGST</span>
                    <span>₹{purchase.cgst.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">SGST</span>
                    <span>₹{purchase.sgst.toLocaleString("en-IN")}</span>
                  </div>
                </>
              )}
              <div className="border-t pt-3 flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-lg">₹{purchase.total.toLocaleString("en-IN")}</span>
              </div>
              {purchase.amount_paid > 0 && (
                <>
                  <div className="flex justify-between text-sm text-emerald-600">
                    <span>Paid</span>
                    <span>-₹{purchase.amount_paid.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-amber-600">Balance Due</span>
                    <span className="text-amber-600">₹{balance.toLocaleString("en-IN")}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ITC Info */}
          <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-800 p-4">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Input Tax Credit</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              ₹{(purchase.cgst + purchase.sgst + purchase.igst).toLocaleString("en-IN")}
            </p>
            <p className="text-xs text-emerald-600/70 mt-1">
              Available for GSTR-3B filing
            </p>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Record Payment</h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Amount *</label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder={balance.toString()}
                  max={balance}
                  className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <p className="text-xs text-muted-foreground">Balance: ₹{balance.toLocaleString("en-IN")}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                >
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="card">Card</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Reference Number</label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="Transaction ID / Cheque No."
                  className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-2.5 text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={recordPayment}
                disabled={updating || !paymentAmount}
                className="flex-1 py-2.5 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Record Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

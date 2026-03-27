"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Download,
  Send,
  CheckCircle,
  Trash2,
  Edit,
  Loader2,
  FileText,
  MessageCircle,
} from "lucide-react";

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  status: string;
  customer_name: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  notes?: string;
}

interface InvoiceItem {
  id: string;
  description: string;
  hsn_code?: string;
  quantity: number;
  unit: string;
  rate: number;
  gst_rate: number;
  amount: number;
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchInvoice();
  }, [params.id]);

  const fetchInvoice = async () => {
    const supabase = createClient();

    const { data: inv } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", params.id)
      .single();

    if (inv) {
      setInvoice(inv);

      const { data: invItems } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", params.id);

      if (invItems) setItems(invItems);
    }

    setLoading(false);
  };

  const updateStatus = async (status: string) => {
    if (!invoice) return;
    setUpdating(true);

    const supabase = createClient();
    await supabase
      .from("invoices")
      .update({ status })
      .eq("id", invoice.id);

    setInvoice({ ...invoice, status });
    setUpdating(false);
  };

  const deleteInvoice = async () => {
    if (!invoice || !confirm("Are you sure you want to delete this invoice?")) return;

    const supabase = createClient();
    await supabase.from("invoices").delete().eq("id", invoice.id);
    router.push("/invoices");
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "sent":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "draft":
        return "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400";
      case "overdue":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-20">
        <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-lg font-semibold">Invoice not found</h2>
        <Link href="/invoices" className="text-primary hover:underline mt-2 inline-block">
          Back to invoices
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/invoices"
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                {invoice.invoice_number}
              </h1>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full uppercase ${getStatusStyle(invoice.status)}`}>
                {invoice.status}
              </span>
            </div>
            <p className="text-muted-foreground mt-1">{invoice.customer_name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-muted transition-colors">
            <Download className="w-5 h-5" />
          </button>
          <button className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-muted transition-colors">
            <Send className="w-5 h-5" />
          </button>
          <button
            onClick={deleteInvoice}
            className="p-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice Details */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              <div>
                <p className="text-xs text-muted-foreground">Invoice Date</p>
                <p className="font-medium">{new Date(invoice.invoice_date).toLocaleDateString("en-IN")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Due Date</p>
                <p className="font-medium">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("en-IN") : "-"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <p className="font-medium">{invoice.customer_name}</p>
              </div>
            </div>

            {/* Items Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left py-3 font-medium text-muted-foreground">Item</th>
                    <th className="text-center py-3 font-medium text-muted-foreground">HSN</th>
                    <th className="text-center py-3 font-medium text-muted-foreground">Qty</th>
                    <th className="text-right py-3 font-medium text-muted-foreground">Rate</th>
                    <th className="text-center py-3 font-medium text-muted-foreground">GST</th>
                    <th className="text-right py-3 font-medium text-muted-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 dark:border-slate-800/50">
                      <td className="py-3 text-foreground">{item.description}</td>
                      <td className="py-3 text-center text-muted-foreground">{item.hsn_code || "-"}</td>
                      <td className="py-3 text-center">{item.quantity} {item.unit}</td>
                      <td className="py-3 text-right">₹{item.rate.toLocaleString("en-IN")}</td>
                      <td className="py-3 text-center">{item.gst_rate}%</td>
                      <td className="py-3 text-right font-medium">₹{item.amount.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-foreground mb-2">Notes</h3>
              <p className="text-sm text-muted-foreground">{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Totals */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-foreground mb-4">Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>₹{invoice.subtotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CGST</span>
                <span>₹{invoice.cgst.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SGST</span>
                <span>₹{invoice.sgst.toLocaleString("en-IN")}</span>
              </div>
              {invoice.igst > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">IGST</span>
                  <span>₹{invoice.igst.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="border-t pt-3 flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-lg">₹{invoice.total.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-foreground mb-4">Actions</h3>
            <div className="space-y-2">
              {invoice.status !== "paid" && (
                <button
                  onClick={() => updateStatus("paid")}
                  disabled={updating}
                  className="w-full py-2.5 bg-emerald-500 text-white font-medium rounded-xl hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Mark as Paid
                </button>
              )}
              {invoice.status === "draft" && (
                <button
                  onClick={() => updateStatus("sent")}
                  disabled={updating}
                  className="w-full py-2.5 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Mark as Sent
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

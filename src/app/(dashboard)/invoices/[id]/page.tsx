"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Download,
  Send,
  CheckCircle,
  Trash2,
  Loader2,
  FileText,
  MessageCircle,
  ChevronDown,
  Package,
  User,
  X,
  AlertCircle,
} from "lucide-react";
import { downloadInvoicePDF, type InvoicePDFData } from "@/components/invoice-pdf";

interface Invoice {
  id: string;
  business_id: string;
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

interface Business {
  name: string;
  address?: string;
  gstin?: string;
  phone?: string;
  email?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  upi_id?: string;
  default_template: "minimal" | "professional" | "gst_formal" | "export";
}

type TemplateType = "minimal" | "professional" | "gst_formal" | "export";

const TEMPLATE_OPTIONS: { value: TemplateType; label: string }[] = [
  { value: "minimal", label: "Minimal" },
  { value: "professional", label: "Professional" },
  { value: "gst_formal", label: "GST Formal" },
  { value: "export", label: "Export" },
];

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>("minimal");
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [showNotification, setShowNotification] = useState(true);

  // Get auto-created items/customer from URL params
  const newItems = searchParams.get("newItems")?.split(",").filter(Boolean) || [];
  const newCustomer = searchParams.get("newCustomer");
  const hasNotifications = (newItems.length > 0 || newCustomer) && showNotification;

  useEffect(() => {
    fetchInvoice();
  }, [params.id]);

  // Close template menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowTemplateMenu(false);
    if (showTemplateMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showTemplateMenu]);

  const fetchInvoice = async () => {
    const supabase = createClient();

    const { data: inv } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", params.id)
      .single();

    if (inv) {
      setInvoice(inv);

      // Fetch items
      const { data: invItems } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", params.id);

      if (invItems) setItems(invItems);

      // Fetch business details
      const { data: businessData } = await supabase
        .from("businesses")
        .select("name, address, gstin, phone, email, bank_name, bank_account_number, bank_ifsc, upi_id, default_template")
        .eq("id", inv.business_id)
        .single();

      if (businessData) {
        setBusiness(businessData);
        setSelectedTemplate(businessData.default_template || "minimal");
      }
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

  const downloadPDF = async (template: TemplateType) => {
    if (!invoice) return;
    setDownloading(true);
    setShowTemplateMenu(false);

    try {
      const pdfData: InvoicePDFData = {
        invoice: {
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date,
          status: invoice.status,
          customer_name: invoice.customer_name,
          subtotal: invoice.subtotal,
          cgst: invoice.cgst,
          sgst: invoice.sgst,
          igst: invoice.igst,
          total: invoice.total,
          notes: invoice.notes,
        },
        items: items.map(item => ({
          description: item.description,
          hsn_code: item.hsn_code,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          gst_rate: item.gst_rate,
          amount: item.amount,
        })),
        business: business ? {
          name: business.name,
          address: business.address,
          gstin: business.gstin,
          phone: business.phone,
          email: business.email,
          bank_name: business.bank_name,
          bank_account_number: business.bank_account_number,
          bank_ifsc: business.bank_ifsc,
          upi_id: business.upi_id,
        } : undefined,
        template,
      };

      await downloadInvoicePDF(pdfData);
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const shareWhatsApp = () => {
    if (!invoice) return;

    const itemsList = items.map(item =>
      `• ${item.description}: ${item.quantity} ${item.unit} × ₹${item.rate} = ₹${item.amount}`
    ).join("\n");

    const message = `*Invoice ${invoice.invoice_number}*
Customer: ${invoice.customer_name}
Date: ${new Date(invoice.invoice_date).toLocaleDateString("en-IN")}

*Items:*
${itemsList}

Subtotal: ₹${invoice.subtotal.toLocaleString("en-IN")}
GST: ₹${(invoice.cgst + invoice.sgst + invoice.igst).toLocaleString("en-IN")}
*Total: ₹${invoice.total.toLocaleString("en-IN")}*

Status: ${invoice.status.toUpperCase()}`;

    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
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
      {/* Auto-created notification */}
      {hasNotifications && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-amber-800 dark:text-amber-200">
                New records auto-created
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                The following were automatically added. Please complete their details:
              </p>
              <div className="mt-3 space-y-2">
                {newCustomer && (
                  <Link
                    href="/customers"
                    className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200 hover:underline"
                  >
                    <User className="w-4 h-4" />
                    <span>New customer: <strong>{newCustomer}</strong></span>
                    <span className="text-xs text-amber-600">(click to edit)</span>
                  </Link>
                )}
                {newItems.length > 0 && (
                  <Link
                    href="/inventory"
                    className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200 hover:underline"
                  >
                    <Package className="w-4 h-4" />
                    <span>New inventory items: <strong>{newItems.join(", ")}</strong></span>
                    <span className="text-xs text-amber-600">(click to edit)</span>
                  </Link>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowNotification(false)}
              className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

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
          {/* Download PDF with template selector */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowTemplateMenu(!showTemplateMenu); }}
              disabled={downloading}
              title="Download PDF"
              className="flex items-center gap-1 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-muted transition-colors disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showTemplateMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg z-10 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-medium text-muted-foreground">Select Template</p>
                </div>
                {TEMPLATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={(e) => { e.stopPropagation(); downloadPDF(opt.value); }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors flex items-center justify-between"
                  >
                    {opt.label}
                    {opt.value === selectedTemplate && (
                      <span className="text-xs text-primary">Default</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={shareWhatsApp}
            title="Share on WhatsApp"
            className="p-2.5 rounded-xl border border-green-200 dark:border-green-800 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20 transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
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

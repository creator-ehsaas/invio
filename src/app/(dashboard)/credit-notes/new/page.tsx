"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Search,
  FileText,
} from "lucide-react";

interface InvoiceOption {
  id: string;
  invoice_number: string;
  customer_name: string;
  total: number;
  invoice_date: string;
}

interface CreditNoteItem {
  description: string;
  hsn_code: string;
  quantity: number;
  unit: string;
  rate: number;
  gst_rate: number;
  amount: number;
}

const REASONS = [
  { value: "return", label: "Sales Return" },
  { value: "discount", label: "Post-sale Discount" },
  { value: "price_adjustment", label: "Price Adjustment" },
  { value: "other", label: "Other" },
];

export default function NewCreditNotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invoiceIdParam = searchParams.get("invoice");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [isIntraState, setIsIntraState] = useState(true);

  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceOption | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [showInvoiceDropdown, setShowInvoiceDropdown] = useState(false);

  const [creditNoteDate, setCreditNoteDate] = useState(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("return");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<CreditNoteItem[]>([
    { description: "", hsn_code: "", quantity: 1, unit: "nos", rate: 0, gst_rate: 18, amount: 0 },
  ]);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (invoiceIdParam && invoices.length > 0) {
      const inv = invoices.find(i => i.id === invoiceIdParam);
      if (inv) {
        setSelectedInvoice(inv);
        setCustomerName(inv.customer_name);
        fetchInvoiceItems(inv.id);
      }
    }
  }, [invoiceIdParam, invoices]);

  const fetchData = async () => {
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

    setBusinessId(userData.business_id);

    // Fetch business state for GST calculation
    const { data: business } = await supabase
      .from("businesses")
      .select("state")
      .eq("id", userData.business_id)
      .single();

    // Fetch paid/sent invoices for reference
    const { data: invoiceData } = await supabase
      .from("invoices")
      .select("id, invoice_number, customer_name, total, invoice_date")
      .eq("business_id", userData.business_id)
      .in("status", ["paid", "sent"])
      .order("invoice_date", { ascending: false })
      .limit(50);

    setInvoices(invoiceData || []);
    setLoading(false);
  };

  const fetchInvoiceItems = async (invoiceId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("invoice_items")
      .select("description, hsn_code, quantity, unit, rate, gst_rate, amount")
      .eq("invoice_id", invoiceId);

    if (data && data.length > 0) {
      setItems(data.map(item => ({
        description: item.description,
        hsn_code: item.hsn_code || "",
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        gst_rate: item.gst_rate,
        amount: item.amount,
      })));
    }
  };

  const updateItem = (index: number, field: keyof CreditNoteItem, value: string | number) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };

    // Recalculate amount
    const qty = field === "quantity" ? Number(value) : item.quantity;
    const rate = field === "rate" ? Number(value) : item.rate;
    item.amount = qty * rate;

    updated[index] = item;
    setItems(updated);
  };

  const addItem = () => {
    setItems([
      ...items,
      { description: "", hsn_code: "", quantity: 1, unit: "nos", rate: 0, gst_rate: 18, amount: 0 },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    let cgst = 0, sgst = 0, igst = 0;

    items.forEach(item => {
      const gstAmount = (item.amount * item.gst_rate) / 100;
      if (isIntraState) {
        cgst += gstAmount / 2;
        sgst += gstAmount / 2;
      } else {
        igst += gstAmount;
      }
    });

    const total = subtotal + cgst + sgst + igst;
    return { subtotal, cgst, sgst, igst, total };
  };

  const handleSubmit = async () => {
    if (!businessId || !customerName.trim() || items.every(i => !i.description)) return;
    setSaving(true);

    const supabase = createClient();
    const { subtotal, cgst, sgst, igst, total } = calculateTotals();

    // Get next credit note number
    const { data: business } = await supabase
      .from("businesses")
      .select("next_credit_note_number, credit_note_prefix")
      .eq("id", businessId)
      .single();

    const prefix = business?.credit_note_prefix || "CN-";
    const nextNum = business?.next_credit_note_number || 1;
    const creditNoteNumber = `${prefix}${String(nextNum).padStart(4, "0")}`;

    // Create credit note
    const { data: creditNote, error } = await supabase
      .from("credit_notes")
      .insert({
        business_id: businessId,
        invoice_id: selectedInvoice?.id || null,
        credit_note_number: creditNoteNumber,
        credit_note_date: creditNoteDate,
        reason,
        customer_name: customerName,
        subtotal,
        cgst,
        sgst,
        igst,
        total,
        notes: notes || null,
        status: "issued",
      })
      .select()
      .single();

    if (error || !creditNote) {
      console.error("Failed to create credit note:", error);
      setSaving(false);
      return;
    }

    // Insert items
    const validItems = items.filter(i => i.description.trim());
    if (validItems.length > 0) {
      await supabase.from("credit_note_items").insert(
        validItems.map(item => ({
          credit_note_id: creditNote.id,
          description: item.description,
          hsn_code: item.hsn_code || null,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          gst_rate: item.gst_rate,
          amount: item.amount,
        }))
      );
    }

    // Update sequence
    await supabase
      .from("businesses")
      .update({ next_credit_note_number: nextNum + 1 })
      .eq("id", businessId);

    router.push("/credit-notes");
  };

  const { subtotal, cgst, sgst, igst, total } = calculateTotals();
  const filteredInvoices = invoices.filter(
    inv =>
      inv.invoice_number.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      inv.customer_name.toLowerCase().includes(invoiceSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/credit-notes" className="p-2 hover:bg-muted rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">New Credit Note</h1>
          <p className="text-muted-foreground text-sm">Issue credit for returns or adjustments</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm space-y-6">
        {/* Reference Invoice */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="relative">
            <label className="block text-sm font-medium mb-1">Reference Invoice (optional)</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={selectedInvoice ? selectedInvoice.invoice_number : invoiceSearch}
                onChange={(e) => {
                  setInvoiceSearch(e.target.value);
                  setSelectedInvoice(null);
                  setShowInvoiceDropdown(true);
                }}
                onFocus={() => setShowInvoiceDropdown(true)}
                placeholder="Search invoice..."
                className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            {showInvoiceDropdown && filteredInvoices.length > 0 && !selectedInvoice && (
              <div className="absolute z-10 mt-1 w-full bg-white dark:bg-slate-900 rounded-xl border border-border shadow-lg max-h-60 overflow-auto">
                {filteredInvoices.slice(0, 10).map(inv => (
                  <button
                    key={inv.id}
                    onClick={() => {
                      setSelectedInvoice(inv);
                      setCustomerName(inv.customer_name);
                      setShowInvoiceDropdown(false);
                      fetchInvoiceItems(inv.id);
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-muted transition-colors flex justify-between items-center"
                  >
                    <div>
                      <p className="font-medium text-sm">{inv.invoice_number}</p>
                      <p className="text-xs text-muted-foreground">{inv.customer_name}</p>
                    </div>
                    <p className="text-sm font-medium">₹{inv.total.toLocaleString("en-IN")}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Credit Note Date</label>
            <input
              type="date"
              value={creditNoteDate}
              onChange={(e) => setCreditNoteDate(e.target.value)}
              className="w-full px-4 py-2.5 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Customer Name *</label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name"
              className="w-full px-4 py-2.5 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Reason *</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-2.5 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {REASONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* GST Type Toggle */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium">GST Type:</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsIntraState(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isIntraState ? "bg-primary text-white" : "bg-muted text-muted-foreground"
              }`}
            >
              Intra-State (CGST+SGST)
            </button>
            <button
              type="button"
              onClick={() => setIsIntraState(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !isIntraState ? "bg-primary text-white" : "bg-muted text-muted-foreground"
              }`}
            >
              Inter-State (IGST)
            </button>
          </div>
        </div>

        {/* Items */}
        <div>
          <label className="block text-sm font-medium mb-2">Items</label>
          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-start">
                <div className="col-span-4">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(index, "description", e.target.value)}
                    placeholder="Description"
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  />
                </div>
                <div className="col-span-1">
                  <input
                    type="text"
                    value={item.hsn_code}
                    onChange={(e) => updateItem(index, "hsn_code", e.target.value)}
                    placeholder="HSN"
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  />
                </div>
                <div className="col-span-1">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)}
                    placeholder="Qty"
                    min="0"
                    step="0.001"
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  />
                </div>
                <div className="col-span-1">
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => updateItem(index, "unit", e.target.value)}
                    placeholder="Unit"
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    value={item.rate}
                    onChange={(e) => updateItem(index, "rate", parseFloat(e.target.value) || 0)}
                    placeholder="Rate"
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  />
                </div>
                <div className="col-span-1">
                  <select
                    value={item.gst_rate}
                    onChange={(e) => updateItem(index, "gst_rate", parseFloat(e.target.value))}
                    className="w-full px-2 py-2 border border-border rounded-lg bg-background text-sm"
                  >
                    <option value={0}>0%</option>
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
                <div className="col-span-1 text-right py-2 text-sm font-medium">
                  ₹{item.amount.toLocaleString("en-IN")}
                </div>
                <div className="col-span-1">
                  <button
                    onClick={() => removeItem(index)}
                    disabled={items.length === 1}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg disabled:opacity-30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={addItem}
            className="mt-3 flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes..."
            rows={2}
            className="w-full px-4 py-2.5 border border-border rounded-xl bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
          />
        </div>

        {/* Totals */}
        <div className="border-t pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>₹{subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
          {isIntraState ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CGST</span>
                <span>₹{cgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SGST</span>
                <span>₹{sgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">IGST</span>
              <span>₹{igst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold border-t pt-2">
            <span>Credit Total</span>
            <span className="text-red-600">-₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Link
            href="/credit-notes"
            className="flex-1 py-2.5 text-center border border-border rounded-xl hover:bg-muted transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={handleSubmit}
            disabled={saving || !customerName.trim()}
            className="flex-1 py-2.5 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Issue Credit Note
          </button>
        </div>
      </div>
    </div>
  );
}

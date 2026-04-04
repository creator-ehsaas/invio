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
  Mic,
  MicOff,
  Sparkles,
} from "lucide-react";
import { useVoiceInput } from "@/hooks/use-voice-input";

interface InvoiceOption {
  id: string;
  invoice_number: string;
  customer_name: string;
  total: number;
  invoice_date: string;
}

interface DebitNoteItem {
  description: string;
  hsn_code: string;
  quantity: number;
  unit: string;
  rate: number;
  gst_rate: number;
  amount: number;
}

const REASONS = [
  { value: "undercharge", label: "Undercharge Correction" },
  { value: "additional_service", label: "Additional Service" },
  { value: "price_increase", label: "Price Increase" },
  { value: "other", label: "Other" },
];

export default function NewDebitNotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invoiceIdParam = searchParams.get("invoice");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [isIntraState, setIsIntraState] = useState(true);
  const [isParsingVoice, setIsParsingVoice] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);

  const { isRecording, isTranscribing, toggleRecording } = useVoiceInput({
    onTranscript: async (text) => {
      if (!text.trim()) return;
      setVoiceHint(`Heard: "${text}"`);
      setIsParsingVoice(true);
      try {
        const res = await fetch("/api/parse-note-voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text, noteType: "debit" }),
        });
        if (res.ok) {
          const { data } = await res.json();
          if (data?.customer_name) setCustomerName(data.customer_name);
          if (data?.reason) setReason(data.reason);
          if (data?.notes) setNotes(data.notes);
          if (data?.items?.length) {
            setItems(data.items.map((item: { description?: string; hsn_code?: string; quantity?: number; unit?: string; rate?: number; gst_rate?: number }) => ({
              description: item.description || "",
              hsn_code: item.hsn_code || "",
              quantity: item.quantity || 1,
              unit: item.unit || "nos",
              rate: item.rate || 0,
              gst_rate: item.gst_rate ?? 18,
              amount: (item.quantity || 1) * (item.rate || 0),
            })));
          }
          setVoiceHint(null);
        }
      } catch { setVoiceHint(null); }
      finally { setIsParsingVoice(false); }
    },
  });

  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceOption | null>(null);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [showInvoiceDropdown, setShowInvoiceDropdown] = useState(false);

  const [debitNoteDate, setDebitNoteDate] = useState(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("undercharge");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DebitNoteItem[]>([
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

    // Fetch invoices for reference
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

  const updateItem = (index: number, field: keyof DebitNoteItem, value: string | number) => {
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

    // Get next debit note number
    const { data: business } = await supabase
      .from("businesses")
      .select("next_debit_note_number, debit_note_prefix")
      .eq("id", businessId)
      .single();

    const prefix = business?.debit_note_prefix || "DN-";
    const nextNum = business?.next_debit_note_number || 1;
    const debitNoteNumber = `${prefix}${String(nextNum).padStart(4, "0")}`;

    // Create debit note
    const { data: debitNote, error } = await supabase
      .from("debit_notes")
      .insert({
        business_id: businessId,
        invoice_id: selectedInvoice?.id || null,
        debit_note_number: debitNoteNumber,
        debit_note_date: debitNoteDate,
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

    if (error || !debitNote) {
      console.error("Failed to create debit note:", error);
      setSaving(false);
      return;
    }

    // Insert items
    const validItems = items.filter(i => i.description.trim());
    if (validItems.length > 0) {
      await supabase.from("debit_note_items").insert(
        validItems.map(item => ({
          debit_note_id: debitNote.id,
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
      .update({ next_debit_note_number: nextNum + 1 })
      .eq("id", businessId);

    router.push("/debit-notes");
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
        <Link href="/debit-notes" className="p-2 hover:bg-muted rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">New Debit Note</h1>
          <p className="text-muted-foreground text-sm">Charge additional amounts or corrections</p>
        </div>
        <button
          onClick={toggleRecording}
          disabled={isTranscribing || isParsingVoice}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
            isRecording ? "bg-red-500 text-white animate-pulse" : "bg-primary/10 text-primary hover:bg-primary/20"
          }`}
        >
          {isRecording ? <MicOff className="w-4 h-4" /> : isTranscribing || isParsingVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
          {isRecording ? "Stop" : isTranscribing ? "Transcribing..." : isParsingVoice ? "Parsing..." : "Voice"}
        </button>
      </div>

      {(isRecording || voiceHint) && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${isRecording ? "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 text-red-600" : "bg-primary/5 border border-primary/20 text-primary"}`}>
          {isRecording ? <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> : <Sparkles className="w-4 h-4 shrink-0" />}
          {isRecording ? "Listening... Say customer name, reason and items" : voiceHint}
        </div>
      )}

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
            <label className="block text-sm font-medium mb-1">Debit Note Date</label>
            <input
              type="date"
              value={debitNoteDate}
              onChange={(e) => setDebitNoteDate(e.target.value)}
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
            <span>Debit Total</span>
            <span className="text-emerald-600">+₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Link
            href="/debit-notes"
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
            Issue Debit Note
          </button>
        </div>
      </div>
    </div>
  );
}

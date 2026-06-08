"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Plus, Trash2, Loader2, Save, Mic, MicOff, Sparkles } from "lucide-react";
import { isIntraState } from "@/types/database";
import { useVoiceInput } from "@/hooks/use-voice-input";

interface EstimateItem {
  description: string;
  hsn_code: string;
  quantity: number;
  unit: string;
  rate: number;
  gst_rate: number;
}

interface Customer {
  id: string;
  name: string;
  gstin?: string | null;
}

interface BusinessInfo {
  gstin: string | null;
  state_code: string | null;
  estimate_prefix: string;
  next_estimate_number: number;
}

export default function NewEstimatePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isParsingVoice, setIsParsingVoice] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);

  const { isRecording, isTranscribing, toggleRecording } = useVoiceInput({
    onTranscript: async (text) => {
      if (!text.trim()) return;
      setVoiceHint(`Heard: "${text}"`);
      setIsParsingVoice(true);
      try {
        const res = await fetch("/api/parse-estimate-voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: text }),
        });
        if (res.ok) {
          const { data } = await res.json();
          if (data?.customer_name) setCustomerName(data.customer_name);
          if (data?.notes) setNotes(data.notes);
          if (data?.terms) setTerms(data.terms);
          if (data?.items?.length) {
            setItems(data.items.map((item: any) => ({
              description: item.description || "",
              hsn_code: item.hsn_code || "",
              quantity: item.quantity || 1,
              unit: item.unit || "pcs",
              rate: item.rate || 0,
              gst_rate: item.gst_rate ?? 18,
            })));
          }
          setVoiceHint(null);
        }
      } catch { setVoiceHint(null); }
      finally { setIsParsingVoice(false); }
    },
    onError: (err) => setError(err),
  });

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerGstin, setCustomerGstin] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [estimateDate, setEstimateDate] = useState(new Date().toISOString().split("T")[0]);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [items, setItems] = useState<EstimateItem[]>([
    { description: "", hsn_code: "", quantity: 1, unit: "pcs", rate: 0, gst_rate: 18 },
  ]);

  useEffect(() => {
    fetchData();
    const valid = new Date();
    valid.setDate(valid.getDate() + 30);
    setValidUntil(valid.toISOString().split("T")[0]);
  }, []);

  const fetchData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (userData?.business_id) {
      const [{ data: business }, { data: customersData }] = await Promise.all([
        supabase.from("businesses")
          .select("gstin, state_code, estimate_prefix, next_estimate_number")
          .eq("id", userData.business_id)
          .single(),
        supabase.from("customers")
          .select("id, name, gstin")
          .eq("business_id", userData.business_id),
      ]);

      if (business) setBusinessInfo(business);
      if (customersData) setCustomers(customersData);
    }
  };

  const handleCustomerChange = (name: string) => {
    setCustomerName(name);
    const matched = customers.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (matched) {
      setCustomerId(matched.id);
      setCustomerGstin(matched.gstin || null);
    } else {
      setCustomerId("");
      setCustomerGstin(null);
    }
  };

  const updateItem = (index: number, field: keyof EstimateItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const [suggestingHsn, setSuggestingHsn] = useState<Record<number, boolean>>({});

  const handleSuggestHsn = async (index: number) => {
    const item = items[index];
    if (!item.description || !item.description.trim()) return;

    setSuggestingHsn((prev) => ({ ...prev, [index]: true }));
    try {
      const res = await fetch("/api/suggest-hsn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: item.description }),
      });
      const data = await res.json();
      if (data.data) {
        const { hsn_code, gst_rate } = data.data;
        if (hsn_code) {
          updateItem(index, "hsn_code", hsn_code);
        }
        if (gst_rate !== undefined) {
          updateItem(index, "gst_rate", gst_rate);
        }
      }
    } catch (err) {
      console.error("Failed to suggest HSN:", err);
    } finally {
      setSuggestingHsn((prev) => ({ ...prev, [index]: false }));
    }
  };

  const addItem = () => {
    setItems(prev => [...prev, { description: "", hsn_code: "", quantity: 1, unit: "pcs", rate: 0, gst_rate: 18 }]);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const calcTotals = () => {
    const intra = isIntraState(businessInfo?.gstin, customerGstin);
    let subtotal = 0, cgst = 0, sgst = 0, igst = 0;
    for (const item of items) {
      const taxable = item.quantity * item.rate;
      const tax = taxable * (item.gst_rate / 100);
      subtotal += taxable;
      if (intra) { cgst += tax / 2; sgst += tax / 2; }
      else igst += tax;
    }
    return { subtotal, cgst, sgst, igst, total: subtotal + cgst + sgst + igst, intra };
  };

  const { subtotal, cgst, sgst, igst, total, intra } = calcTotals();

  const handleSave = async (status: "draft" | "sent" = "draft") => {
    if (!items.some(i => i.description.trim())) {
      setError("Add at least one item.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: userData } = await supabase
        .from("users").select("business_id").eq("id", user.id).single();
      if (!userData?.business_id) throw new Error("No business found");

      const prefix = businessInfo?.estimate_prefix || "EST-";
      const num = businessInfo?.next_estimate_number || 1;
      const estimateNumber = `${prefix}${String(num).padStart(4, "0")}`;

      const { data: estimate, error: estErr } = await supabase
        .from("estimates")
        .insert({
          business_id: userData.business_id,
          customer_id: customerId || null,
          customer_name: customerName || null,
          estimate_number: estimateNumber,
          estimate_date: estimateDate,
          valid_until: validUntil || null,
          status,
          subtotal,
          cgst,
          sgst,
          igst,
          total,
          notes: notes || null,
          terms: terms || null,
        })
        .select()
        .single();

      if (estErr) throw estErr;

      const validItems = items.filter(i => i.description.trim());
      const itemRows = validItems.map(item => {
        const taxable = item.quantity * item.rate;
        const tax = taxable * (item.gst_rate / 100);
        return {
          estimate_id: estimate.id,
          description: item.description,
          hsn_code: item.hsn_code || null,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          gst_rate: item.gst_rate,
          cgst: intra ? tax / 2 : 0,
          sgst: intra ? tax / 2 : 0,
          igst: intra ? 0 : tax,
          amount: taxable + tax,
        };
      });

      await supabase.from("estimate_items").insert(itemRows);

      // Increment estimate number
      await supabase
        .from("businesses")
        .update({ next_estimate_number: num + 1 })
        .eq("id", userData.business_id);

      router.push(`/estimates/${estimate.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to save estimate");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/estimates" className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">New Estimate</h1>
          <p className="text-sm text-muted-foreground">Create a quotation / proposal</p>
        </div>
        <button
          onClick={toggleRecording}
          disabled={isTranscribing || isParsingVoice}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
            isRecording
              ? "bg-red-500 text-white animate-pulse"
              : "bg-primary/10 text-primary hover:bg-primary/20"
          }`}
          title="Dictate estimate by voice"
        >
          {isRecording ? <MicOff className="w-4 h-4" /> : isTranscribing || isParsingVoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
          {isRecording ? "Stop" : isTranscribing ? "Transcribing..." : isParsingVoice ? "Parsing..." : "Voice"}
        </button>
      </div>

      {/* Voice hint */}
      {voiceHint && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl text-sm text-primary">
          <Sparkles className="w-4 h-4 shrink-0" />
          {voiceHint}
        </div>
      )}
      {isRecording && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 rounded-xl">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-sm text-red-600 font-medium">Listening... Say customer name and items with quantities and rates</span>
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Customer + Dates */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-4">
            <h2 className="font-semibold text-foreground">Estimate Details</h2>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Customer</label>
              <input
                type="text"
                list="customers-list"
                placeholder="Type customer name..."
                value={customerName}
                onChange={(e) => handleCustomerChange(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <datalist id="customers-list">
                {customers.map(c => <option key={c.id} value={c.name} />)}
              </datalist>
              {!intra && customerGstin && (
                <p className="text-xs text-blue-600 mt-1">Inter-state supply (IGST applies)</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estimate Date</label>
                <input
                  type="date"
                  value={estimateDate}
                  onChange={(e) => setEstimateDate(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Valid Until</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h2 className="font-semibold text-foreground">Items</h2>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Item description"
                      value={item.description}
                      onChange={(e) => updateItem(idx, "description", e.target.value)}
                      onBlur={() => {
                        if (!item.hsn_code && item.description.trim()) {
                          handleSuggestHsn(idx);
                        }
                      }}
                      className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                      className="p-2 text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="HSN"
                        value={item.hsn_code}
                        onChange={(e) => updateItem(idx, "hsn_code", e.target.value)}
                        className="w-full pl-3 pr-7 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      {item.description.trim() && (
                        <button
                          type="button"
                          onClick={() => handleSuggestHsn(idx)}
                          disabled={suggestingHsn[idx]}
                          title="Suggest HSN with AI"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-400 hover:text-primary transition-all disabled:opacity-50"
                        >
                          {suggestingHsn[idx] ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                          )}
                        </button>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        placeholder="Qty"
                        value={item.quantity}
                        min={0}
                        onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <select
                        value={item.unit}
                        onChange={(e) => updateItem(idx, "unit", e.target.value)}
                        className="px-2 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none"
                      >
                        {["pcs","kg","ton","mtr","box","ltr","bag","set","nos"].map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="number"
                      placeholder="Rate (₹)"
                      value={item.rate || ""}
                      min={0}
                      onChange={(e) => updateItem(idx, "rate", parseFloat(e.target.value) || 0)}
                      className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <select
                      value={item.gst_rate}
                      onChange={(e) => updateItem(idx, "gst_rate", parseFloat(e.target.value))}
                      className="px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none"
                    >
                      {[0, 5, 12, 18, 28].map(r => (
                        <option key={r} value={r}>GST {r}%</option>
                      ))}
                    </select>
                  </div>

                  <div className="text-right text-sm font-medium text-foreground">
                    ₹{((item.quantity * item.rate) * (1 + item.gst_rate / 100)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addItem}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Item
            </button>
          </div>

          {/* Notes / Terms */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
              <textarea
                rows={2}
                placeholder="Notes to customer..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Terms & Conditions</label>
              <textarea
                rows={2}
                placeholder="Terms, validity, payment terms..."
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Right: summary */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 space-y-3 sticky top-24">
            <h2 className="font-semibold text-foreground">Summary</h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>₹{subtotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
              </div>
              {intra ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CGST</span>
                    <span>₹{cgst.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SGST</span>
                    <span>₹{sgst.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IGST</span>
                  <span>₹{igst.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-border pt-2 mt-2">
                <span>Total</span>
                <span>₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => handleSave("draft")}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save as Draft
              </button>
              <button
                onClick={() => handleSave("sent")}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save & Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

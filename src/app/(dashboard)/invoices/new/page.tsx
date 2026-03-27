"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Mic,
  MicOff,
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  Check,
  X,
  AlertCircle,
  Package,
  User,
} from "lucide-react";

interface InvoiceItem {
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
  business_name?: string;
  gstin?: string;
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: "", hsn_code: "", quantity: 1, unit: "pcs", rate: 0, gst_rate: 18 },
  ]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [autoCreated, setAutoCreated] = useState<{
    items: string[];
    customer: string | null;
  }>({ items: [], customer: null });

  // Track AI parsing for learning
  const [lastTranscript, setLastTranscript] = useState("");
  const [aiParsedData, setAiParsedData] = useState<any>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    fetchCustomers();
    // Set default due date to 15 days from now
    const due = new Date();
    due.setDate(due.getDate() + 15);
    setDueDate(due.toISOString().split("T")[0]);
  }, []);

  const fetchCustomers = async () => {
    const supabase = createClient();
    const { data } = await supabase.from("customers").select("id, name, business_name, gstin");
    if (data) setCustomers(data);
  };

  // Execute voice commands
  const executeCommand = (command: any) => {
    switch (command.action) {
      case "set_gst":
        // Set GST for all items
        setItems(items.map(item => ({ ...item, gst_rate: command.value || 0 })));
        break;

      case "set_customer":
        setCustomerName(command.value || "");
        break;

      case "delete_item":
        if (typeof command.index === "number") {
          // Delete by index
          setItems(items.filter((_, i) => i !== command.index));
        } else if (command.match) {
          // Delete by name match
          const matchLower = command.match.toLowerCase();
          setItems(items.filter(item =>
            !item.description.toLowerCase().includes(matchLower)
          ));
        }
        break;

      case "clear_items":
        setItems([{ description: "", hsn_code: "", quantity: 1, unit: "pcs", rate: 0, gst_rate: 18 }]);
        setCustomerName("");
        break;

      case "update_item":
        if (command.match && command.field && command.value !== undefined) {
          const matchLower = command.match.toLowerCase();
          setItems(items.map(item => {
            if (item.description.toLowerCase().includes(matchLower)) {
              return { ...item, [command.field]: command.value };
            }
            return item;
          }));
        }
        break;

      case "set_notes":
        setNotes(command.value || "");
        break;

      case "set_due_date":
        if (command.value) {
          setDueDate(command.value);
        }
        break;

      default:
        setError(`Unknown command: ${command.action}`);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      setError("Could not access microphone. Please grant permission.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      // Step 1: Transcribe audio
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!transcribeRes.ok) throw new Error("Transcription failed");
      const { transcript: text } = await transcribeRes.json();
      setTranscript(text);

      if (!text) {
        setError("No speech detected. Please try again.");
        return;
      }

      // Step 2: First check if it's a command
      const cmdRes = await fetch("/api/parse-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (cmdRes.ok) {
        const { command } = await cmdRes.json();

        // Handle commands
        if (command && command.action !== "add_items") {
          executeCommand(command);
          return;
        }
      }

      // Step 3: Parse as invoice data
      const parseRes = await fetch("/api/parse-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });

      if (!parseRes.ok) {
        const errData = await parseRes.json();
        throw new Error(errData.error || "AI parsing failed");
      }
      const { invoice: parsed } = await parseRes.json();

      // Save for learning feedback
      setLastTranscript(text);
      setAiParsedData(parsed);

      // Update form with parsed data
      if (parsed.buyer_name) setCustomerName(parsed.buyer_name);
      if (parsed.items && parsed.items.length > 0) {
        setItems(
          parsed.items.map((item: any) => {
            const qty = item.quantity || 1;
            // Handle different price fields - rate, price, or amount
            let rate = item.rate || item.price || 0;
            // If we have amount but no rate, calculate rate from amount
            if (!rate && item.amount) {
              rate = item.amount / qty;
            }
            return {
              description: item.name || item.description || "",
              hsn_code: item.hsn_code || "",
              quantity: qty,
              unit: item.unit || "pcs",
              rate: rate,
              gst_rate: item.gst_percent || item.gst_rate || parsed.gst_percent || 18,
            };
          })
        );
      }
    } catch (err: any) {
      setError(err.message || "Failed to process audio");
    } finally {
      setIsProcessing(false);
    }
  };

  const addItem = () => {
    setItems([
      ...items,
      { description: "", hsn_code: "", quantity: 1, unit: "pcs", rate: 0, gst_rate: 18 },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;

    items.forEach((item) => {
      const amount = item.quantity * item.rate;
      subtotal += amount;
      const gst = (amount * item.gst_rate) / 100;
      totalCgst += gst / 2;
      totalSgst += gst / 2;
    });

    return {
      subtotal,
      cgst: totalCgst,
      sgst: totalSgst,
      total: subtotal + totalCgst + totalSgst,
    };
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    const created: { items: string[]; customer: string | null } = { items: [], customer: null };

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check subscription limits
      const { data: userSubscription } = await supabase
        .from("users")
        .select("subscription_plan, invoices_this_month, invoices_reset_date")
        .eq("id", user.id)
        .single();

      const plan = userSubscription?.subscription_plan || "free";
      const isPro = plan === "pro_monthly" || plan === "pro_yearly";
      let invoicesUsed = userSubscription?.invoices_this_month || 0;

      // Reset counter if new month
      const resetDate = userSubscription?.invoices_reset_date
        ? new Date(userSubscription.invoices_reset_date)
        : null;
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      if (!resetDate || resetDate < monthStart) {
        await supabase
          .from("users")
          .update({ invoices_this_month: 0, invoices_reset_date: new Date().toISOString() })
          .eq("id", user.id);
        invoicesUsed = 0;
      }

      // Check if user can create invoice
      if (!isPro && invoicesUsed >= 50) {
        setError("You've reached the free plan limit of 50 invoices/month. Upgrade to Pro for unlimited invoices.");
        setSaving(false);
        return;
      }

      const { data: userData } = await supabase
        .from("users")
        .select("business_id")
        .eq("id", user.id)
        .single();

      if (!userData?.business_id) throw new Error("No business found");

      const businessId = userData.business_id;
      let finalCustomerId = customerId;

      // Auto-create customer if name provided but no ID selected
      if (customerName && !customerId) {
        // Check if customer with similar name exists
        const { data: existingCustomers } = await supabase
          .from("customers")
          .select("id, name")
          .eq("business_id", businessId)
          .ilike("name", `%${customerName}%`);

        if (existingCustomers && existingCustomers.length > 0) {
          // Use existing customer
          finalCustomerId = existingCustomers[0].id;
        } else {
          // Create new customer
          const { data: newCustomer, error: customerError } = await supabase
            .from("customers")
            .insert({
              business_id: businessId,
              name: customerName,
            })
            .select()
            .single();

          if (!customerError && newCustomer) {
            finalCustomerId = newCustomer.id;
            created.customer = customerName;
          }
        }
      }

      // Auto-create inventory items that don't exist
      const { data: existingItems } = await supabase
        .from("inventory_items")
        .select("id, name")
        .eq("business_id", businessId);

      const existingNames = new Set(
        (existingItems || []).map(i => i.name.toLowerCase())
      );

      for (const item of items) {
        if (!item.description) continue;

        const itemNameLower = item.description.toLowerCase();
        if (!existingNames.has(itemNameLower)) {
          // Create new inventory item
          const { error: invItemError } = await supabase
            .from("inventory_items")
            .insert({
              business_id: businessId,
              name: item.description,
              unit: item.unit,
              unit_price: item.rate,
              current_stock: 0, // Will need manual update
              reorder_level: 10,
              gst_rate: item.gst_rate,
              hsn_code: item.hsn_code || null,
            });

          if (!invItemError) {
            created.items.push(item.description);
            existingNames.add(itemNameLower); // Prevent duplicates
          }
        }
      }

      const totals = calculateTotals();

      // Generate invoice number
      const { count } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("business_id", businessId);

      const invoiceNumber = `INV-${String((count || 0) + 1).padStart(4, "0")}`;

      // Create invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          business_id: businessId,
          customer_id: finalCustomerId || null,
          customer_name: customerName,
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          due_date: dueDate,
          subtotal: totals.subtotal,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: 0,
          total: totals.total,
          status: "draft",
          notes,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create invoice items
      const invoiceItems = items.map((item) => ({
        invoice_id: invoice.id,
        description: item.description,
        hsn_code: item.hsn_code,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        gst_rate: item.gst_rate,
        cgst: (item.quantity * item.rate * item.gst_rate) / 100 / 2,
        sgst: (item.quantity * item.rate * item.gst_rate) / 100 / 2,
        igst: 0,
        amount: item.quantity * item.rate * (1 + item.gst_rate / 100),
      }));

      const { error: itemsError } = await supabase.from("invoice_items").insert(invoiceItems);
      if (itemsError) throw itemsError;

      // Increment invoice count for free plan users
      if (!isPro) {
        await supabase
          .from("users")
          .update({ invoices_this_month: invoicesUsed + 1 })
          .eq("id", user.id);
      }

      // Send AI learning feedback if user made corrections
      if (lastTranscript && aiParsedData) {
        const userCorrected = {
          buyer_name: customerName,
          items: items.map(item => ({
            name: item.description,
            quantity: item.quantity,
            unit: item.unit,
            rate: item.rate,
            gst_percent: item.gst_rate,
            amount: item.quantity * item.rate,
          })),
        };

        // Check if there were any changes (simple comparison)
        const hasChanges =
          aiParsedData.buyer_name !== customerName ||
          JSON.stringify(aiParsedData.items) !== JSON.stringify(userCorrected.items);

        if (hasChanges) {
          // Send feedback for learning (don't await - fire and forget)
          fetch("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              originalTranscript: lastTranscript,
              aiParsed: aiParsedData,
              userCorrected,
            }),
          }).catch(() => {}); // Ignore errors
        }
      }

      // Set auto-created info for notification
      setAutoCreated(created);

      // Navigate with notification params
      const params = new URLSearchParams();
      if (created.items.length > 0) params.set("newItems", created.items.join(","));
      if (created.customer) params.set("newCustomer", created.customer);

      const queryString = params.toString();
      router.push(`/invoices/${invoice.id}${queryString ? `?${queryString}` : ""}`);
    } catch (err: any) {
      setError(err.message || "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  const totals = calculateTotals();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/invoices"
          className="p-2 rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Create Invoice</h1>
          <p className="text-muted-foreground mt-1">Speak or type your invoice details</p>
        </div>
      </div>

      {/* Voice Input Section */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-8 shadow-sm">
        <div className="text-center">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`h-24 w-24 rounded-full flex items-center justify-center mx-auto transition-all ${
              isRecording
                ? "bg-red-500 animate-pulse"
                : isProcessing
                ? "bg-muted"
                : "bg-gradient-to-br from-primary to-blue-500 hover:opacity-90"
            } text-white shadow-lg`}
          >
            {isProcessing ? (
              <Loader2 className="w-10 h-10 animate-spin" />
            ) : isRecording ? (
              <MicOff className="w-10 h-10" />
            ) : (
              <Mic className="w-10 h-10" />
            )}
          </button>
          <p className="mt-4 text-sm text-muted-foreground">
            {isRecording
              ? "Listening... Click to stop"
              : isProcessing
              ? "Processing with AI..."
              : "Click to start voice input"}
          </p>
          {transcript && (
            <div className="mt-4 p-4 bg-muted rounded-xl text-left">
              <p className="text-xs text-muted-foreground mb-1">Transcript:</p>
              <p className="text-sm text-foreground">{transcript}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                AI extracted the values below. Please verify and edit if needed.
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Invoice Form */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Customer & Dates */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">Invoice Details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-sm font-medium text-foreground">Customer</label>
                <input
                  type="text"
                  placeholder="Customer name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  list="customers-list"
                  className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <datalist id="customers-list">
                  {customers.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Invoice Date</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Items</h2>
              <button
                onClick={addItem}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            </div>
            <div className="space-y-4">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="p-4 bg-muted/50 rounded-xl space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <input
                      type="text"
                      placeholder="Item description"
                      value={item.description}
                      onChange={(e) => updateItem(index, "description", e.target.value)}
                      className="flex-1 bg-white dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <button
                      onClick={() => removeItem(index)}
                      className="p-2 text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <input
                      type="text"
                      placeholder="HSN"
                      value={item.hsn_code}
                      onChange={(e) => updateItem(index, "hsn_code", e.target.value)}
                      className="bg-white dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                      className="bg-white dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <input
                      type="number"
                      placeholder="Rate"
                      value={item.rate}
                      onChange={(e) => updateItem(index, "rate", Number(e.target.value))}
                      className="bg-white dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <select
                      value={item.gst_rate}
                      onChange={(e) => updateItem(index, "gst_rate", Number(e.target.value))}
                      className="bg-white dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      <option value={0}>0% GST</option>
                      <option value={5}>5% GST</option>
                      <option value={12}>12% GST</option>
                      <option value={18}>18% GST</option>
                      <option value={28}>28% GST</option>
                    </select>
                    <div className="text-right font-medium text-foreground py-2">
                      ₹{(item.quantity * item.rate).toLocaleString("en-IN")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">Notes</h2>
            <textarea
              placeholder="Additional notes for this invoice..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none resize-none"
            />
          </div>
        </div>

        {/* Totals Sidebar */}
        <div className="space-y-6">
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm sticky top-24">
            <h2 className="text-lg font-semibold text-foreground mb-4">Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-foreground">₹{totals.subtotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CGST</span>
                <span className="text-foreground">₹{totals.cgst.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SGST</span>
                <span className="text-foreground">₹{totals.sgst.toLocaleString("en-IN")}</span>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex justify-between">
                <span className="font-semibold text-foreground">Total</span>
                <span className="font-bold text-lg text-foreground">
                  ₹{totals.total.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={saving || !customerName || items.every((i) => !i.description)}
              className="w-full mt-6 py-3 bg-gradient-to-br from-primary to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Create Invoice
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

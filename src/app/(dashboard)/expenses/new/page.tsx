"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft, Loader2, Save, Sparkles, Upload, X, Camera, Mic, MicOff
} from "lucide-react";

interface ExpenseCategory {
  id: string;
  name: string;
}

export default function NewExpensePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [amount, setAmount] = useState("");
  const [gstAmount, setGstAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [notes, setNotes] = useState("");
  const [isItcEligible, setIsItcEligible] = useState(false);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  // AI
  const [aiCategorizing, setAiCategorizing] = useState(false);
  const [aiHighlighted, setAiHighlighted] = useState(false);

  // Upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("expense_categories")
      .select("id, name")
      .order("name");
    if (data) setCategories(data);
  };

  // Auto-categorize using AI when description changes (debounced)
  useEffect(() => {
    if (description.length < 5 || categoryId) return;
    const timer = setTimeout(() => autoCategory(description), 800);
    return () => clearTimeout(timer);
  }, [description]);

  const autoCategory = async (desc: string) => {
    if (!desc.trim() || categories.length === 0) return;
    setAiCategorizing(true);
    try {
      const res = await fetch("/api/ai-categorize-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: desc, categories: categories.map(c => c.name) }),
      });
      if (res.ok) {
        const { category, vendor, isItc } = await res.json();
        if (category) {
          const matched = categories.find(c => c.name.toLowerCase() === category.toLowerCase());
          if (matched) {
            setCategoryId(matched.id);
            setCategoryName(matched.name);
          }
        }
        if (vendor && !vendorName) setVendorName(vendor);
        if (typeof isItc === "boolean") setIsItcEligible(isItc);
        setAiHighlighted(true);
        setTimeout(() => setAiHighlighted(false), 4000);
      }
    } catch {
      // Silently fail
    } finally {
      setAiCategorizing(false);
    }
  };

  // Handle file upload + AI extraction
  const handleFileUpload = async (file: File) => {
    setUploadFile(file);
    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Upload to storage
      const ext = file.name.split(".").pop();
      const path = `expenses/${Date.now()}.${ext}`;
      const { data: uploadData, error: upErr } = await supabase.storage
        .from("purchase-attachments")
        .upload(path, file);

      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage
        .from("purchase-attachments")
        .getPublicUrl(path);

      setAttachmentUrl(publicUrl);

      // AI extract from receipt
      const formData = new FormData();
      formData.append("file", file);

      const parseRes = await fetch("/api/parse-expense-receipt", {
        method: "POST",
        body: formData,
      });

      if (parseRes.ok) {
        const { data } = await parseRes.json();
        if (data) {
          if (data.description && !description) setDescription(data.description);
          if (data.amount) setAmount(String(data.amount));
          if (data.gst_amount) setGstAmount(String(data.gst_amount));
          if (data.vendor_name && !vendorName) setVendorName(data.vendor_name);
          if (data.expense_date) setExpenseDate(data.expense_date);
          if (data.notes) setNotes(data.notes);
          if (data.category && categories.length > 0) {
            const matched = categories.find(c => c.name.toLowerCase() === data.category.toLowerCase());
            if (matched) { setCategoryId(matched.id); setCategoryName(matched.name); }
          }
          if (typeof data.is_itc_eligible === "boolean") setIsItcEligible(data.is_itc_eligible);
          setAiHighlighted(true);
          setTimeout(() => setAiHighlighted(false), 4000);
        }
      }
    } catch (err: any) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        await processVoice(blob);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      setError("Could not access microphone.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const processVoice = async (blob: Blob) => {
    setIsProcessingVoice(true);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "recording.webm");
      const tRes = await fetch("/api/transcribe", { method: "POST", body: fd });
      if (!tRes.ok) throw new Error("Transcription failed");
      const { transcript: text } = await tRes.json();
      if (!text) return;

      const pRes = await fetch("/api/parse-expense-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, categories: categories.map(c => c.name) }),
      });
      if (pRes.ok) {
        const { expense } = await pRes.json();
        if (expense) {
          if (expense.description) setDescription(expense.description);
          if (expense.amount) setAmount(String(expense.amount));
          if (expense.vendor_name) setVendorName(expense.vendor_name);
          if (expense.payment_method) setPaymentMethod(expense.payment_method);
          if (expense.notes) setNotes(expense.notes);
          if (expense.category && categories.length > 0) {
            const matched = categories.find(c => c.name.toLowerCase() === expense.category.toLowerCase());
            if (matched) { setCategoryId(matched.id); setCategoryName(matched.name); }
          }
          setAiHighlighted(true);
          setTimeout(() => setAiHighlighted(false), 4000);
        }
      }
    } catch (err: any) {
      setError(err.message || "Voice processing failed");
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const handleSave = async () => {
    if (!description.trim()) { setError("Description is required"); return; }
    if (!amount || isNaN(parseFloat(amount))) { setError("Valid amount is required"); return; }

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: insertErr } = await supabase.from("expenses").insert({
        description: description.trim(),
        category_id: categoryId || null,
        category_name: categoryName || null,
        amount: parseFloat(amount),
        gst_amount: parseFloat(gstAmount) || 0,
        expense_date: expenseDate,
        payment_method: paymentMethod,
        reference_number: referenceNumber || null,
        vendor_name: vendorName || null,
        attachment_url: attachmentUrl || null,
        notes: notes || null,
        is_itc_eligible: isItcEligible,
      });

      if (insertErr) throw insertErr;
      router.push("/expenses");
    } catch (err: any) {
      setError(err.message || "Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  const aiRingClass = aiHighlighted
    ? "ring-2 ring-amber-400 ring-offset-1"
    : "";

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/expenses" className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Record Expense</h1>
          <p className="text-sm text-muted-foreground">Upload a receipt or fill manually</p>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-3 text-sm">{error}</div>
      )}

      {/* AI Input Options */}
      <div className="grid grid-cols-2 gap-3">
        {/* Upload receipt */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
        >
          {uploading ? (
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          ) : (
            <Upload className="w-6 h-6 text-muted-foreground" />
          )}
          <p className="text-xs text-center text-muted-foreground">
            {uploading ? "Reading receipt..." : "Upload receipt\nAI auto-fills"}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }}
          />
        </div>

        {/* Voice */}
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessingVoice}
          className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-2 transition-all ${
            isRecording
              ? "border-red-400 bg-red-50 dark:bg-red-950/20"
              : "border-border hover:border-primary/50 hover:bg-primary/5"
          }`}
        >
          {isProcessingVoice ? (
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          ) : isRecording ? (
            <MicOff className="w-6 h-6 text-red-500" />
          ) : (
            <Mic className="w-6 h-6 text-muted-foreground" />
          )}
          <p className="text-xs text-center text-muted-foreground">
            {isProcessingVoice ? "Processing..." : isRecording ? "Tap to stop" : "Voice input\nSpeak expense"}
          </p>
        </button>
      </div>

      {aiHighlighted && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 py-2">
          <Sparkles className="w-4 h-4 shrink-0" />
          AI filled the details — review and adjust before saving.
        </div>
      )}

      {/* Attachment preview */}
      {uploadFile && (
        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg text-sm">
          <Camera className="w-4 h-4 text-muted-foreground" />
          <span className="flex-1 truncate">{uploadFile.name}</span>
          <button onClick={() => { setUploadFile(null); setAttachmentUrl(null); }} className="text-muted-foreground hover:text-destructive">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Form */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Description *
            {aiCategorizing && <span className="ml-2 text-purple-600"><Loader2 className="w-3 h-3 inline animate-spin" /> Auto-categorizing...</span>}
          </label>
          <input
            type="text"
            placeholder="What was this expense for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all ${aiRingClass}`}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount (₹) *</label>
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              min={0}
              onChange={(e) => setAmount(e.target.value)}
              className={`mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all ${aiRingClass}`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">GST Paid (₹)</label>
            <input
              type="number"
              placeholder="0.00"
              value={gstAmount}
              min={0}
              onChange={(e) => setGstAmount(e.target.value)}
              className={`mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all ${aiRingClass}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</label>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                const cat = categories.find(c => c.id === e.target.value);
                setCategoryName(cat?.name || "");
              }}
              className={`mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none transition-all ${aiRingClass}`}
            >
              <option value="">Select category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</label>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none"
            >
              {["cash","bank","upi","card","cheque","other"].map(m => (
                <option key={m} value={m} className="capitalize">{m.charAt(0).toUpperCase() + m.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reference #</label>
            <input
              type="text"
              placeholder="Cheque/transaction number"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vendor / Paid To</label>
          <input
            type="text"
            placeholder="Vendor or payee name"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            className={`mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all ${aiRingClass}`}
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
          <textarea
            rows={2}
            placeholder="Additional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isItcEligible}
            onChange={(e) => setIsItcEligible(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          <div>
            <p className="text-sm font-medium text-foreground">ITC Eligible</p>
            <p className="text-xs text-muted-foreground">GST on this expense can be claimed as Input Tax Credit</p>
          </div>
        </label>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Saving..." : "Save Expense"}
      </button>
    </div>
  );
}

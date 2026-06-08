"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Save,
  Upload,
  Mic,
  MicOff,
  X,
  FileText,
  Image as ImageIcon,
  Sparkles,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { isIntraState } from "@/types/database";
import type { Supplier } from "@/types/database";

interface PurchaseItem {
  description: string;
  hsn_code: string;
  quantity: number;
  unit: string;
  rate: number;
  gst_rate: number;
  aiGenerated?: boolean;
}

type ParseState = "idle" | "uploading" | "parsing" | "done" | "error";

export default function NewPurchasePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSupplierId = searchParams.get("supplier");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [businessGstin, setBusinessGstin] = useState<string | null>(null);
  const [billNumber, setBillNumber] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierGstin, setSupplierGstin] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([
    { description: "", hsn_code: "", quantity: 1, unit: "pcs", rate: 0, gst_rate: 18 },
  ]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null); // preview URL
  const [storedAttachmentUrl, setStoredAttachmentUrl] = useState<string | null>(null); // Supabase URL
  const [parseState, setParseState] = useState<ParseState>("idle");
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [aiHighlighted, setAiHighlighted] = useState(false);

  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (preselectedSupplierId && suppliers.length > 0) {
      const supplier = suppliers.find((s) => s.id === preselectedSupplierId);
      if (supplier) {
        setSelectedSupplier(supplier);
        setSupplierName(supplier.name);
        if (supplier.gstin) setSupplierGstin(supplier.gstin);
        const due = new Date();
        due.setDate(due.getDate() + (supplier.payment_terms || 30));
        setDueDate(due.toISOString().split("T")[0]);
      }
    }
  }, [preselectedSupplierId, suppliers]);

  const fetchData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (!userData?.business_id) return;

    const { data: business } = await supabase
      .from("businesses")
      .select("gstin")
      .eq("id", userData.business_id)
      .single();

    if (business) setBusinessGstin(business.gstin);

    const { data: suppliersData } = await supabase
      .from("suppliers")
      .select("*")
      .eq("business_id", userData.business_id)
      .eq("is_active", true)
      .order("name");

    if (suppliersData) setSuppliers(suppliersData);

    const due = new Date();
    due.setDate(due.getDate() + 30);
    setDueDate(due.toISOString().split("T")[0]);

    setLoading(false);
  };

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    setSelectedSupplier(supplier || null);
    if (supplier) {
      setSupplierName(supplier.name);
      if (supplier.gstin) setSupplierGstin(supplier.gstin);
      const due = new Date();
      due.setDate(due.getDate() + (supplier.payment_terms || 30));
      setDueDate(due.toISOString().split("T")[0]);
    }
  };

  // ─── File Upload & AI Parse ─────────────────────────────────────────

  const applyParsedData = (data: any) => {
    if (!data) return;

    // Try to find matching supplier from the loaded suppliers list
    let matchedSupplier: Supplier | null = null;
    if (data.supplier_gstin) {
      const gstinClean = data.supplier_gstin.trim().toUpperCase();
      matchedSupplier = suppliers.find(
        (s) => s.gstin && s.gstin.trim().toUpperCase() === gstinClean
      ) || null;
    }

    if (!matchedSupplier && data.supplier_name) {
      const nameClean = data.supplier_name.trim().toLowerCase();
      matchedSupplier = suppliers.find(
        (s) => s.name.trim().toLowerCase() === nameClean ||
               s.business_name?.trim().toLowerCase() === nameClean
      ) || null;
    }

    if (matchedSupplier) {
      setSelectedSupplier(matchedSupplier);
      setSupplierName(matchedSupplier.name);
      if (matchedSupplier.gstin) setSupplierGstin(matchedSupplier.gstin);
      const due = new Date();
      due.setDate(due.getDate() + (matchedSupplier.payment_terms || 30));
      setDueDate(due.toISOString().split("T")[0]);
    } else {
      if (data.supplier_name) setSupplierName(data.supplier_name);
      if (data.supplier_gstin) setSupplierGstin(data.supplier_gstin);
    }

    if (data.bill_number && !billNumber) setBillNumber(data.bill_number);
    if (data.bill_date) {
      const d = new Date(data.bill_date);
      if (!isNaN(d.getTime())) setBillDate(d.toISOString().split("T")[0]);
    }
    if (data.due_date) {
      const d = new Date(data.due_date);
      if (!isNaN(d.getTime())) setDueDate(d.toISOString().split("T")[0]);
    }
    if (data.notes) setNotes(data.notes);

    if (data.items && data.items.length > 0) {
      setItems(
        data.items.map((item: any) => ({
          description: item.description || "",
          hsn_code: item.hsn_code || "",
          quantity: item.quantity || 1,
          unit: item.unit || "pcs",
          rate: item.rate || 0,
          gst_rate: item.gst_rate ?? 18,
          aiGenerated: true,
        }))
      );
    }

    setAiHighlighted(true);
    // Remove highlight after 4 seconds
    setTimeout(() => setAiHighlighted(false), 4000);
  };

  const uploadAndParse = async (file: File) => {
    setUploadedFile(file);
    setParseError(null);

    // Show preview for images
    if (file.type.startsWith("image/")) {
      setUploadedFileUrl(URL.createObjectURL(file));
    } else {
      setUploadedFileUrl(null);
    }

    setParseState("uploading");

    try {
      // 1. Upload to Supabase Storage
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const ext = file.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { data: uploadData } = await supabase.storage
          .from("purchase-attachments")
          .upload(path, file, { upsert: true });

        if (uploadData) {
          const { data: { publicUrl } } = supabase.storage
            .from("purchase-attachments")
            .getPublicUrl(path);
          setStoredAttachmentUrl(publicUrl);
        }
      }

      setParseState("parsing");

      // 2. Send to AI for extraction
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse-purchase-image", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        setParseError(result.error || "Could not parse invoice. Please fill in manually.");
        setParseState("error");
        return;
      }

      applyParsedData(result.data);
      setParseState("done");
    } catch (err: any) {
      setParseError(err.message || "Upload failed");
      setParseState("error");
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAndParse(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadAndParse(file);
  }, [supplierName, supplierGstin, billNumber]);

  const removeFile = () => {
    setUploadedFile(null);
    setUploadedFileUrl(null);
    setStoredAttachmentUrl(null);
    setParseState("idle");
    setParseError(null);
  };

  // ─── Voice Input ────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        await processVoice(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch {
      setError("Could not access microphone. Please grant permission.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const processVoice = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      // Transcribe
      const fd = new FormData();
      fd.append("audio", audioBlob, "recording.webm");
      const transcribeRes = await fetch("/api/transcribe", { method: "POST", body: fd });
      if (!transcribeRes.ok) throw new Error("Transcription failed");
      const { transcript: text } = await transcribeRes.json();
      setTranscript(text);

      if (!text) {
        setError("No speech detected. Try again.");
        return;
      }

      // Parse as purchase data
      const parseRes = await fetch("/api/parse-purchase-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });

      if (!parseRes.ok) throw new Error("Voice parsing failed");
      const { data } = await parseRes.json();
      applyParsedData(data);
    } catch (err: any) {
      setError(err.message || "Voice processing failed");
    } finally {
      setIsTranscribing(false);
    }
  };

  // ─── Form Logic ─────────────────────────────────────────────────────

  const addItem = () => {
    setItems([
      ...items,
      { description: "", hsn_code: "", quantity: 1, unit: "pcs", rate: 0, gst_rate: 18 },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof PurchaseItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value, aiGenerated: false };
    setItems(updated);
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

  const calculateTotals = () => {
    let subtotal = 0;
    let totalGst = 0;

    items.forEach((item) => {
      const amount = item.quantity * item.rate;
      subtotal += amount;
      totalGst += (amount * item.gst_rate) / 100;
    });

    const effectiveSupplierGstin = supplierGstin || selectedSupplier?.gstin;
    const intraState = isIntraState(businessGstin, effectiveSupplierGstin || null);

    return intraState
      ? { subtotal, cgst: totalGst / 2, sgst: totalGst / 2, igst: 0, total: subtotal + totalGst, isIntraState: true }
      : { subtotal, cgst: 0, sgst: 0, igst: totalGst, total: subtotal + totalGst, isIntraState: false };
  };

  const handleSubmit = async () => {
    if (!billNumber) { setError("Bill number is required"); return; }

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: userData } = await supabase
        .from("users")
        .select("business_id")
        .eq("id", user.id)
        .single();

      if (!userData?.business_id) throw new Error("No business found");

      const totals = calculateTotals();

      // Auto-create supplier if name provided but not selected
      let finalSupplierId = selectedSupplier?.id || null;
      let finalSupplierName = supplierName || selectedSupplier?.name || null;

      if (supplierName && !selectedSupplier) {
        // Check if supplier exists
        const { data: existing } = await supabase
          .from("suppliers")
          .select("id, name")
          .eq("business_id", userData.business_id)
          .ilike("name", `%${supplierName}%`)
          .maybeSingle();

        if (existing) {
          finalSupplierId = existing.id;
        } else {
          // Create new supplier
          const { data: newSupplier } = await supabase
            .from("suppliers")
            .insert({
              business_id: userData.business_id,
              name: supplierName,
              gstin: supplierGstin || null,
            })
            .select()
            .single();

          if (newSupplier) finalSupplierId = newSupplier.id;
        }
      }

      const { data: purchase, error: purchaseError } = await supabase
        .from("purchase_invoices")
        .insert({
          business_id: userData.business_id,
          supplier_id: finalSupplierId,
          supplier_name: finalSupplierName,
          bill_number: billNumber,
          bill_date: billDate,
          due_date: dueDate || null,
          subtotal: totals.subtotal,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          total: totals.total,
          status: "pending",
          notes,
          attachment_url: storedAttachmentUrl,
        })
        .select()
        .single();

      if (purchaseError) throw purchaseError;

      // Create purchase items + update stock
      const purchaseItems = items
        .filter((item) => item.description)
        .map((item) => {
          const itemGst = (item.quantity * item.rate * item.gst_rate) / 100;
          return {
            purchase_invoice_id: purchase.id,
            description: item.description,
            hsn_code: item.hsn_code || null,
            quantity: item.quantity,
            unit: item.unit,
            rate: item.rate,
            gst_rate: item.gst_rate,
            cgst: totals.isIntraState ? itemGst / 2 : 0,
            sgst: totals.isIntraState ? itemGst / 2 : 0,
            igst: totals.isIntraState ? 0 : itemGst,
            amount: item.quantity * item.rate * (1 + item.gst_rate / 100),
          };
        });

      await supabase.from("purchase_invoice_items").insert(purchaseItems);

      // Update inventory stock for matching items
      for (const item of items) {
        if (!item.description) continue;
        const { data: invItem } = await supabase
          .from("inventory_items")
          .select("id, current_stock")
          .eq("business_id", userData.business_id)
          .ilike("name", item.description)
          .maybeSingle();

        if (invItem) {
          await supabase
            .from("inventory_items")
            .update({ current_stock: invItem.current_stock + item.quantity })
            .eq("id", invItem.id);
        }
      }

      router.push(`/purchases/${purchase.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create purchase");
    } finally {
      setSaving(false);
    }
  };

  const totals = calculateTotals();

  const isAiField = aiHighlighted;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/purchases" className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Record Purchase</h1>
          <p className="text-muted-foreground mt-1">Upload bill or use voice to auto-fill</p>
        </div>
      </div>

      {/* ── Upload & Voice Row ── */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Upload Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`relative rounded-2xl border-2 border-dashed p-6 transition-all ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-slate-200 dark:border-slate-700 hover:border-primary/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            onChange={handleFileInput}
            className="hidden"
          />

          {uploadedFile ? (
            <div className="space-y-3">
              {/* File preview */}
              {uploadedFileUrl ? (
                <div className="relative aspect-video rounded-xl overflow-hidden bg-muted">
                  <img
                    src={uploadedFileUrl}
                    alt="Invoice preview"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
                  <FileText className="w-8 h-8 text-red-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">{uploadedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              )}

              {/* Parse status */}
              {parseState === "uploading" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </div>
              )}
              {parseState === "parsing" && (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                  AI is reading your invoice...
                </div>
              )}
              {parseState === "done" && (
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <CheckCircle className="w-4 h-4" />
                  Invoice data extracted! Review below.
                </div>
              )}
              {parseState === "error" && (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertCircle className="w-4 h-4" />
                  {parseError || "Could not parse. Fill manually."}
                </div>
              )}

              <button
                onClick={removeFile}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Remove file
              </button>
            </div>
          ) : (
            <div
              className="text-center cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Upload className="w-6 h-6 text-primary" />
              </div>
              <p className="font-medium text-foreground">Upload Invoice</p>
              <p className="text-sm text-muted-foreground mt-1">
                Drag & drop or click — Image or PDF
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                AI will auto-fill all fields
              </p>
            </div>
          )}
        </div>

        {/* Voice Input */}
        <div className="rounded-2xl border border-slate-200/50 dark:border-slate-800/50 bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl p-6 text-center">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isTranscribing}
            className={`h-16 w-16 rounded-full flex items-center justify-center mx-auto transition-all ${
              isRecording
                ? "bg-red-500 animate-pulse shadow-lg shadow-red-500/30"
                : isTranscribing
                ? "bg-muted"
                : "bg-gradient-to-br from-primary to-blue-500 hover:opacity-90 shadow-lg shadow-primary/20"
            } text-white`}
          >
            {isTranscribing ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : isRecording ? (
              <MicOff className="w-7 h-7" />
            ) : (
              <Mic className="w-7 h-7" />
            )}
          </button>
          <p className="mt-3 font-medium text-foreground">
            {isRecording ? "Listening..." : isTranscribing ? "Processing..." : "Voice Input"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {isRecording
              ? "Tap to stop"
              : isTranscribing
              ? "AI is extracting data"
              : "Dictate supplier, items & amounts"}
          </p>
          {transcript && (
            <div className="mt-3 p-3 bg-muted rounded-xl text-left">
              <p className="text-xs text-muted-foreground mb-1">Heard:</p>
              <p className="text-xs text-foreground line-clamp-3">{transcript}</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Fill Banner */}
      {isAiField && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Fields highlighted in yellow were filled by AI. Please review and edit if needed.
          </p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Bill Details */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">Bill Details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Supplier */}
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-sm font-medium text-foreground">Supplier</label>
                <div className="flex gap-2">
                  <select
                    value={selectedSupplier?.id || ""}
                    onChange={(e) => handleSupplierChange(e.target.value)}
                    className="flex-1 bg-secondary border-none rounded-xl px-4 py-3 text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    <option value="">Select existing supplier</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.business_name ? `(${s.business_name})` : ""}
                      </option>
                    ))}
                  </select>
                  <Link
                    href="/suppliers/new"
                    className="p-3 bg-muted rounded-xl hover:bg-muted/80 transition-colors"
                    title="Add supplier"
                  >
                    <Plus className="w-5 h-5" />
                  </Link>
                </div>
              </div>

              {/* Supplier Name (free text - for new/unregistered) */}
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  Supplier Name
                  <span className="text-xs text-muted-foreground ml-2">(or enter new)</span>
                </label>
                <input
                  type="text"
                  placeholder="ABC Enterprises"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className={`w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none transition-colors ${
                    isAiField && supplierName ? "ring-2 ring-amber-400/50 bg-amber-50/50 dark:bg-amber-950/10" : ""
                  }`}
                />
              </div>

              {/* Supplier GSTIN */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Supplier GSTIN</label>
                <input
                  type="text"
                  placeholder="22AAAAA0000A1Z5"
                  value={supplierGstin}
                  onChange={(e) => setSupplierGstin(e.target.value.toUpperCase())}
                  maxLength={15}
                  className={`w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground font-mono placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none transition-colors ${
                    isAiField && supplierGstin ? "ring-2 ring-amber-400/50 bg-amber-50/50 dark:bg-amber-950/10" : ""
                  }`}
                />
              </div>

              {/* Bill Number */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Bill Number *</label>
                <input
                  type="text"
                  placeholder="INV-001"
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  className={`w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none transition-colors ${
                    isAiField && billNumber ? "ring-2 ring-amber-400/50 bg-amber-50/50 dark:bg-amber-950/10" : ""
                  }`}
                />
              </div>

              {/* Bill Date */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Bill Date</label>
                <input
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  className={`w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-colors ${
                    isAiField ? "ring-2 ring-amber-400/50 bg-amber-50/50 dark:bg-amber-950/10" : ""
                  }`}
                />
              </div>

              {/* Due Date */}
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

          {/* Items */}
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
                  className={`p-4 rounded-xl space-y-3 transition-colors ${
                    item.aiGenerated && isAiField
                      ? "bg-amber-50/60 dark:bg-amber-950/15 ring-1 ring-amber-300 dark:ring-amber-700"
                      : "bg-muted/50"
                  }`}
                >
                  {item.aiGenerated && isAiField && (
                    <div className="flex items-center gap-1 text-xs text-amber-600">
                      <Sparkles className="w-3 h-3" />
                      AI extracted — verify this item
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <input
                      type="text"
                      placeholder="Item description"
                      value={item.description}
                      onChange={(e) => updateItem(index, "description", e.target.value)}
                      onBlur={() => {
                        if (!item.hsn_code && item.description.trim()) {
                          handleSuggestHsn(index);
                        }
                      }}
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
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="HSN"
                        value={item.hsn_code}
                        onChange={(e) => updateItem(index, "hsn_code", e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border-none rounded-lg pl-3 pr-7 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                      {item.description.trim() && (
                        <button
                          type="button"
                          onClick={() => handleSuggestHsn(index)}
                          disabled={suggestingHsn[index]}
                          title="Suggest HSN with AI"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-200/50 dark:hover:bg-slate-800/50 text-slate-400 hover:text-primary transition-all disabled:opacity-50"
                        >
                          {suggestingHsn[index] ? (
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
                        onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                        className="w-full bg-white dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                    </div>
                    <div className="flex gap-1 col-span-1">
                      <input
                        type="text"
                        placeholder="Unit"
                        value={item.unit}
                        onChange={(e) => updateItem(index, "unit", e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
                      />
                    </div>
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
                  </div>
                  <div className="text-right text-sm font-medium text-foreground">
                    Subtotal: ₹{(item.quantity * item.rate).toLocaleString("en-IN")}
                    {item.gst_rate > 0 && (
                      <span className="text-muted-foreground ml-2">
                        + ₹{((item.quantity * item.rate * item.gst_rate) / 100).toLocaleString("en-IN")} GST
                        = ₹{(item.quantity * item.rate * (1 + item.gst_rate / 100)).toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">Notes</h2>
            <textarea
              placeholder="Additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none resize-none"
            />
          </div>
        </div>

        {/* Summary Sidebar */}
        <div className="space-y-6">
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm sticky top-24">
            <h2 className="text-lg font-semibold text-foreground mb-4">Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>₹{totals.subtotal.toLocaleString("en-IN")}</span>
              </div>
              {totals.isIntraState ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">CGST (ITC)</span>
                    <span className="text-emerald-600">₹{totals.cgst.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">SGST (ITC)</span>
                    <span className="text-emerald-600">₹{totals.sgst.toLocaleString("en-IN")}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">IGST (ITC)</span>
                  <span className="text-emerald-600">₹{totals.igst.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 p-2 rounded-lg">
                <span>ITC Claimable</span>
                <span className="font-medium">
                  ₹{(totals.isIntraState
                    ? totals.cgst + totals.sgst
                    : totals.igst
                  ).toLocaleString("en-IN")}
                </span>
              </div>
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-lg">₹{totals.total.toLocaleString("en-IN")}</span>
              </div>
            </div>

            {/* Attachment indicator */}
            {storedAttachmentUrl && (
              <div className="mt-4 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 p-2 rounded-lg">
                <CheckCircle className="w-3.5 h-3.5" />
                Bill image attached
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={saving || !billNumber || items.every((i) => !i.description)}
              className="w-full mt-6 py-3 bg-gradient-to-br from-primary to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Purchase
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

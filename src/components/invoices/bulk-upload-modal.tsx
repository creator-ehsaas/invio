"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  X,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Play,
  Pause,
  AlertTriangle,
  FileText,
  Trash2,
} from "lucide-react";
import { isIntraState } from "@/types/database";
import type { Customer } from "@/types/database";

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface QueueItem {
  id: string;
  file: File;
  status: "pending" | "uploading" | "parsing" | "saving" | "done" | "error";
  error?: string;
  progress: number;
  customerName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  total?: number;
}

export default function SalesBulkUploadModal({ isOpen, onClose, onSuccess }: BulkUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [businessGstin, setBusinessGstin] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [invoicePrefix, setInvoicePrefix] = useState("INV");
  const [nextInvoiceSeq, setNextInvoiceSeq] = useState(1);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const processingRef = useRef(false);
  // Track sequence counter across items within the same upload session
  const seqRef = useRef(1);

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: userData } = await supabase
          .from("users")
          .select("business_id")
          .eq("id", user.id)
          .single();

        if (!userData?.business_id) return;
        setBusinessId(userData.business_id);

        const { data: business } = await supabase
          .from("businesses")
          .select("gstin, invoice_prefix, next_invoice_number")
          .eq("id", userData.business_id)
          .single();

        if (business) {
          setBusinessGstin(business.gstin);
          setInvoicePrefix(business.invoice_prefix || "INV");
          const seq = business.next_invoice_number || 1;
          setNextInvoiceSeq(seq);
          seqRef.current = seq;
        }

        const { data: customersData } = await supabase
          .from("customers")
          .select("*")
          .eq("business_id", userData.business_id);

        if (customersData) setCustomers(customersData);
      } catch (err) {
        console.error("Error fetching data for sales bulk upload:", err);
      }
    };

    fetchData();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setQueue([]);
      setIsProcessing(false);
      processingRef.current = false;
    }
  }, [isOpen]);

  const isAllowedFile = (f: File) =>
    f.type === "application/pdf" ||
    f.type.startsWith("image/") ||
    f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    f.name.toLowerCase().endsWith(".docx");

  const addFilesToQueue = (files: File[]) => {
    const newItems: QueueItem[] = files.map((file) => ({
      id: `${Date.now()}_${Math.random().toString(36).substring(5)}`,
      file,
      status: "pending",
      progress: 0,
    }));
    setQueue((prev) => [...prev, ...newItems]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFilesToQueue(Array.from(e.target.files).filter(isAllowedFile));
      e.target.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      addFilesToQueue(Array.from(e.dataTransfer.files).filter(isAllowedFile));
    }
  };

  const removeItem = (id: string) => {
    if (isProcessing) return;
    setQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const updateItemState = (id: string, updates: Partial<Omit<QueueItem, "id" | "file">>) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  };

  const processQueue = async () => {
    if (isProcessing || queue.length === 0) return;
    setIsProcessing(true);
    processingRef.current = true;

    const itemsToProcess = [...queue];

    for (let i = 0; i < itemsToProcess.length; i++) {
      const item = itemsToProcess[i];
      if (item.status === "done" || item.status === "error" || !processingRef.current) continue;

      try {
        await processSingleItem(item);
      } catch (err: any) {
        console.error(`Error processing ${item.file.name}:`, err);
        updateItemState(item.id, {
          status: "error",
          error: err.message || "Unknown error occurred",
          progress: 100,
        });
      }
    }

    setIsProcessing(false);
    processingRef.current = false;
    onSuccess();
  };

  const stopProcessing = () => {
    processingRef.current = false;
    setIsProcessing(false);
  };

  const getFinancialYear = (dateStr: string) => {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    return month >= 4
      ? `${String(year).slice(-2)}-${String(year + 1).slice(-2)}`
      : `${String(year - 1).slice(-2)}-${String(year).slice(-2)}`;
  };

  const processSingleItem = async (item: QueueItem) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !businessId) throw new Error("User session or Business not found");

    // ── Step 1: Upload to Supabase Storage (non-fatal — invoice saved regardless) ──
    updateItemState(item.id, { status: "uploading", progress: 20 });
    const ext = item.file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

    let attachmentUrl: string | null = null;
    try {
      const { data: uploadData } = await supabase.storage
        .from("invoice-attachments")
        .upload(path, item.file, { upsert: true });
      if (uploadData) {
        const { data: { publicUrl } } = supabase.storage.from("invoice-attachments").getPublicUrl(path);
        attachmentUrl = publicUrl;
      }
    } catch {
      // Bucket may not exist yet — proceed without attachment
    }

    // ── Step 2: Parse + double-verify using AI ──
    updateItemState(item.id, { status: "parsing", progress: 50 });
    const formData = new FormData();
    formData.append("file", item.file);

    const parseRes = await fetch("/api/parse-sales-image", {
      method: "POST",
      body: formData,
    });

    if (!parseRes.ok) {
      const parseErr = await parseRes.json();
      throw new Error(parseErr.error || "AI parser extraction failed");
    }

    const { data: parsedData } = await parseRes.json();
    if (!parsedData) throw new Error("AI parser returned empty result");

    // ── Step 3: Match or create customer ──
    updateItemState(item.id, { status: "saving", progress: 70 });

    const customerName = parsedData.customer_name || "Unknown Customer";
    const customerGstin = parsedData.customer_gstin || null;

    let finalCustomerId: string | null = null;
    let finalCustomerName = customerName;

    let matched: Customer | undefined;
    if (customerGstin) {
      const gstinClean = customerGstin.trim().toUpperCase();
      matched = customers.find((c) => c.gstin && c.gstin.trim().toUpperCase() === gstinClean);
    }
    if (!matched && customerName) {
      const nameClean = customerName.trim().toLowerCase();
      matched = customers.find(
        (c) =>
          c.name.trim().toLowerCase() === nameClean ||
          c.business_name?.trim().toLowerCase() === nameClean
      );
    }

    if (matched) {
      finalCustomerId = matched.id;
      finalCustomerName = matched.name;
    } else {
      const { data: newCustomer, error: custErr } = await supabase
        .from("customers")
        .insert({ business_id: businessId, name: customerName, gstin: customerGstin })
        .select()
        .single();
      if (custErr) throw new Error(`Failed to create customer: ${custErr.message}`);
      if (newCustomer) {
        finalCustomerId = newCustomer.id;
        setCustomers((prev) => [...prev, newCustomer]);
      }
    }

    // ── Determine invoice number ──
    // Use extracted number if present; otherwise auto-generate
    let invoiceNumber = parsedData.invoice_number || null;
    const invoiceDate = parsedData.invoice_date || new Date().toISOString().split("T")[0];

    if (!invoiceNumber) {
      const fy = getFinancialYear(invoiceDate);
      const seq = seqRef.current;
      invoiceNumber = `${invoicePrefix}/${fy}/${String(seq).padStart(4, "0")}`;
      seqRef.current = seq + 1;
    }

    // Check duplicate invoice number
    const { data: dupCheck } = await supabase
      .from("invoices")
      .select("id")
      .eq("business_id", businessId)
      .eq("invoice_number", invoiceNumber)
      .maybeSingle();

    if (dupCheck) {
      // Auto-suffix to avoid collision
      invoiceNumber = `${invoiceNumber}-${Date.now().toString().slice(-4)}`;
    }

    // ── Calculate totals ──
    const parsedItems = parsedData.items || [];
    let calculatedSubtotal = 0;
    let calculatedGst = 0;

    parsedItems.forEach((it: any) => {
      const qty = Number(it.quantity) || 1;
      const rate = Number(it.rate) || 0;
      const gstPct = Number(it.gst_rate) || 0;
      const amount = qty * rate;
      calculatedSubtotal += amount;
      calculatedGst += (amount * gstPct) / 100;
    });

    const intraState = isIntraState(businessGstin, customerGstin);
    const cgst = intraState ? calculatedGst / 2 : 0;
    const sgst = intraState ? calculatedGst / 2 : 0;
    const igst = intraState ? 0 : calculatedGst;
    const total = calculatedSubtotal + calculatedGst;

    // ── Save invoice ──
    updateItemState(item.id, { progress: 85 });

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        business_id: businessId,
        customer_id: finalCustomerId,
        customer_name: finalCustomerName,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: parsedData.due_date || null,
        subtotal: calculatedSubtotal,
        cgst,
        sgst,
        igst,
        total,
        status: "draft",
        notes: parsedData.notes || "Bulk uploaded invoice",
        attachment_url: attachmentUrl,
      })
      .select()
      .single();

    if (invoiceError) throw new Error(`Failed to save invoice: ${invoiceError.message}`);

    // ── Save line items ──
    if (parsedItems.length > 0) {
      const itemsPayload = parsedItems.map((it: any) => {
        const qty = Number(it.quantity) || 1;
        const rate = Number(it.rate) || 0;
        const gstPct = Number(it.gst_rate) || 0;
        const itemGst = (qty * rate * gstPct) / 100;
        return {
          invoice_id: invoice.id,
          description: it.description || "Unknown Item",
          hsn_code: it.hsn_code || null,
          quantity: qty,
          unit: it.unit || "pcs",
          rate,
          gst_rate: gstPct,
          cgst: intraState ? itemGst / 2 : 0,
          sgst: intraState ? itemGst / 2 : 0,
          igst: intraState ? 0 : itemGst,
          amount: qty * rate * (1 + gstPct / 100),
        };
      });

      const { error: itemsError } = await supabase.from("invoice_items").insert(itemsPayload);
      if (itemsError) throw new Error(`Failed to save invoice items: ${itemsError.message}`);
    }

    // ── Bump next_invoice_number on business if this was an auto-generated number ──
    if (!parsedData.invoice_number) {
      await supabase
        .from("businesses")
        .update({ next_invoice_number: seqRef.current })
        .eq("id", businessId);
      setNextInvoiceSeq(seqRef.current);
    }

    updateItemState(item.id, {
      status: "done",
      progress: 100,
      customerName: finalCustomerName,
      invoiceNumber,
      invoiceDate,
      total,
    });
  };

  if (!isOpen) return null;

  const totalCount = queue.length;
  const doneCount = queue.filter((i) => i.status === "done").length;
  const errorCount = queue.filter((i) => i.status === "error").length;
  const pendingCount = queue.filter((i) => i.status === "pending").length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-0 duration-200">
      <div className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-white dark:bg-slate-950 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/50 dark:border-slate-800/50 p-4">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Bulk Upload Sales Invoices
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload multiple invoices — AI extracts and double-verifies customer, number, amounts, then saves as drafts
            </p>
          </div>
          <button
            onClick={isProcessing ? undefined : onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drop Zone */}
        {!isProcessing && queue.length === 0 && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex-1 m-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-slate-200 dark:border-slate-800 hover:border-primary/50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.docx"
              onChange={handleFileInput}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 text-primary">
              <Upload className="w-6 h-6" />
            </div>
            <p className="font-semibold text-foreground">Select sales invoice files</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Drag & drop PDFs, images, or DOCX files. AI extracts and double-verifies customer, invoice number, and amounts.
            </p>
          </div>
        )}

        {/* Stats */}
        {queue.length > 0 && (
          <div className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200/50 dark:border-slate-800/50 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold text-foreground">{totalCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground text-emerald-600">Saved</p>
                <p className="text-lg font-bold text-emerald-600">{doneCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground text-red-500">Failed</p>
                <p className="text-lg font-bold text-red-500">{errorCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground text-amber-500">Pending</p>
                <p className="text-lg font-bold text-amber-500">{pendingCount}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isProcessing ? (
                <button
                  onClick={stopProcessing}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/10 transition-all"
                >
                  <Pause className="w-3.5 h-3.5" /> Stop Queue
                </button>
              ) : (
                pendingCount > 0 && (
                  <button
                    onClick={processQueue}
                    className="px-4 py-2 bg-primary hover:bg-primary/95 text-white rounded-xl font-medium text-xs flex items-center gap-1.5 shadow-md shadow-primary/10 transition-all"
                  >
                    <Play className="w-3.5 h-3.5" /> Start Processing
                  </button>
                )
              )}
              {!isProcessing && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-secondary hover:bg-muted text-foreground rounded-xl font-medium text-xs transition-colors"
                >
                  Add Files
                </button>
              )}
            </div>
          </div>
        )}

        {/* Queue */}
        {queue.length > 0 && (
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {queue.map((item) => (
              <div
                key={item.id}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                  item.status === "done"
                    ? "bg-emerald-50/20 dark:bg-emerald-950/5 border-emerald-200/50 dark:border-emerald-800/30"
                    : item.status === "error"
                    ? "bg-red-50/20 dark:bg-red-950/5 border-red-200/50 dark:border-red-800/30"
                    : item.status === "parsing" || item.status === "saving" || item.status === "uploading"
                    ? "bg-primary/5 border-primary/20 animate-pulse"
                    : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="p-2 bg-slate-100 dark:bg-slate-900 rounded-lg text-slate-500 flex-shrink-0 mt-0.5">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground truncate max-w-[240px]">
                        {item.file.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        ({(item.file.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>

                    {item.status === "pending" && (
                      <p className="text-xs text-muted-foreground mt-0.5">Waiting in queue</p>
                    )}
                    {item.status === "uploading" && (
                      <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Uploading to storage...
                      </p>
                    )}
                    {item.status === "parsing" && (
                      <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 animate-pulse text-amber-500" /> AI extracting &amp; verifying details...
                      </p>
                    )}
                    {item.status === "saving" && (
                      <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Matching customer &amp; saving draft...
                      </p>
                    )}
                    {item.status === "error" && (
                      <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {item.error}
                      </p>
                    )}
                    {item.status === "done" && (
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-emerald-600 dark:text-emerald-500 mt-1">
                        <span className="font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded">Saved as Draft</span>
                        <span className="text-muted-foreground font-mono">#{item.invoiceNumber}</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="font-medium text-foreground">{item.customerName}</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="font-bold text-foreground">₹{item.total?.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 justify-end flex-shrink-0">
                  {item.status === "done" && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                  {item.status === "error" && <AlertTriangle className="w-5 h-5 text-red-500" />}
                  {(item.status === "uploading" || item.status === "parsing" || item.status === "saving") && (
                    <div className="w-16 bg-slate-100 dark:bg-slate-900 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                  {item.status === "pending" && !isProcessing && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center border-t border-slate-200/50 dark:border-slate-800/50 p-4 bg-slate-50/50 dark:bg-slate-900/10">
          <p className="text-[10px] text-muted-foreground">
            PDF, DOCX & images supported · Max 10MB · Saved as drafts for review
          </p>
          <div className="flex gap-2">
            {!isProcessing && queue.length > 0 && (
              <button
                onClick={() => setQueue([])}
                className="px-4 py-2 hover:bg-muted text-muted-foreground rounded-xl text-xs font-medium transition-colors"
              >
                Clear Queue
              </button>
            )}
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="px-5 py-2.5 bg-secondary hover:bg-muted text-foreground rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
            >
              {doneCount > 0 ? "Finish & Close" : "Cancel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

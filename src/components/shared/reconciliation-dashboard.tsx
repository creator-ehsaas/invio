"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  X,
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Plus,
  ArrowRight,
  HelpCircle,
} from "lucide-react";
import { isIntraState } from "@/types/database";

interface ReconciliationDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "customer" | "supplier";
  partyId: string;
  partyName: string;
  onReconciled: () => void;
}

interface StmtTx {
  date: string;
  reference: string;
  description: string;
  type: "invoice" | "payment";
  amount: number;
}

interface ReconcileMatch {
  id: string;
  status: "matched" | "mismatch" | "missing_us" | "missing_them";
  stmtTx?: StmtTx;
  ourTx?: {
    id: string;
    date: string;
    type: "invoice" | "payment";
    reference: string;
    amount: number;
    parentInvoiceId?: string; // for payments
  };
  error?: string;
  resolving?: boolean;
}

export default function ReconciliationDashboard({
  isOpen,
  onClose,
  mode,
  partyId,
  partyName,
  onReconciled,
}: ReconciliationDashboardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parsingState, setParsingState] = useState<"idle" | "uploading" | "parsing" | "matching" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<ReconcileMatch[]>([]);
  const [openingBalance, setOpeningBalance] = useState<number | null>(null);
  const [closingBalance, setClosingBalance] = useState<number | null>(null);
  
  // We keep all our DB transactions loaded for re-matching during quick-add resolutions
  const ourInvoicesRef = useRef<any[]>([]);
  const ourPaymentsRef = useRef<any[]>([]);
  const stmtTransactionsRef = useRef<StmtTx[]>([]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      startReconciliation(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const selectedFile = e.dataTransfer.files?.[0];
    if (selectedFile && (selectedFile.type === "application/pdf" || selectedFile.type.startsWith("image/"))) {
      setFile(selectedFile);
      startReconciliation(selectedFile);
    }
  };

  const startReconciliation = async (selectedFile: File) => {
    setError(null);
    setParsingState("uploading");

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication required");

      const { data: userData } = await supabase
        .from("users")
        .select("business_id")
        .eq("id", user.id)
        .single();

      if (!userData?.business_id) throw new Error("No active business profile");
      const businessId = userData.business_id;

      // 1. Fetch current database transactions on our side
      setParsingState("parsing");
      
      let ourInvoices: any[] = [];
      let ourPayments: any[] = [];

      if (mode === "supplier") {
        const { data: invoices } = await supabase
          .from("purchase_invoices")
          .select("id, bill_number, bill_date, total")
          .eq("supplier_id", partyId);

        ourInvoices = invoices || [];

        if (ourInvoices.length > 0) {
          const invoiceIds = ourInvoices.map((i) => i.id);
          const { data: payments } = await supabase
            .from("purchase_payments")
            .select("id, purchase_invoice_id, amount, payment_date, reference_number")
            .in("purchase_invoice_id", invoiceIds);

          ourPayments = payments || [];
        }
      } else {
        const { data: invoices } = await supabase
          .from("invoices")
          .select("id, invoice_number, invoice_date, total")
          .eq("customer_id", partyId);

        ourInvoices = invoices || [];

        if (ourInvoices.length > 0) {
          const invoiceIds = ourInvoices.map((i) => i.id);
          const { data: payments } = await supabase
            .from("payments")
            .select("id, invoice_id, amount, payment_date, reference_number")
            .in("invoice_id", invoiceIds);

          ourPayments = payments || [];
        }
      }

      ourInvoicesRef.current = ourInvoices;
      ourPaymentsRef.current = ourPayments;

      // 2. Upload and Parse Statement using AI
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch("/api/parse-supplier-ledger", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Failed to extract statement text");
      }

      const result = await res.json();
      const extracted = result.data;

      if (!extracted || !extracted.transactions) {
        throw new Error("AI parser could not extract a transaction list from this file");
      }

      setOpeningBalance(extracted.opening_balance);
      setClosingBalance(extracted.closing_balance);
      
      // Store statement transactions ref
      stmtTransactionsRef.current = extracted.transactions;

      // 3. Match transactions
      runMatchingEngine();
      setParsingState("done");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Reconciliation failed");
      setParsingState("error");
    }
  };

  // Matching Engine
  const runMatchingEngine = () => {
    setParsingState("matching");

    const ourInvoices = [...ourInvoicesRef.current];
    const ourPayments = [...ourPaymentsRef.current];
    const stmtTransactions = [...stmtTransactionsRef.current];

    const tempMatches: ReconcileMatch[] = [];
    const matchedOurInvoiceIds = new Set<string>();
    const matchedOurPaymentIds = new Set<string>();

    const normalizeRef = (ref: string) => {
      return (ref || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    };

    // Helper to calculate date difference in days
    const dateDiffDays = (date1Str: string, date2Str: string) => {
      const d1 = new Date(date1Str);
      const d2 = new Date(date2Str);
      return Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24);
    };

    // Step 1: Match Invoices by Reference (Bill number or Invoice number)
    stmtTransactions.forEach((stmt, idx) => {
      if (stmt.type !== "invoice") return;

      const normStmtRef = normalizeRef(stmt.reference);
      
      // Look for a matching invoice on our side
      const matchIndex = ourInvoices.findIndex((our) => {
        const refName = mode === "supplier" ? our.bill_number : our.invoice_number;
        return normalizeRef(refName) === normStmtRef || normStmtRef.includes(normalizeRef(refName));
      });

      if (matchIndex !== -1) {
        const our = ourInvoices[matchIndex];
        const refName = mode === "supplier" ? our.bill_number : our.invoice_number;
        const dateName = mode === "supplier" ? our.bill_date : our.invoice_date;
        
        const isAmtMatch = Math.abs(our.total - stmt.amount) < 1.0; // tolerate 1 rupee rounding
        
        tempMatches.push({
          id: `stmt_inv_${idx}`,
          status: isAmtMatch ? "matched" : "mismatch",
          stmtTx: stmt,
          ourTx: {
            id: our.id,
            date: dateName,
            type: "invoice",
            reference: refName,
            amount: our.total,
          },
        });

        matchedOurInvoiceIds.add(our.id);
      }
    });

    // Step 2: Match Payments by Reference
    stmtTransactions.forEach((stmt, idx) => {
      if (stmt.type !== "payment") return;

      const normStmtRef = normalizeRef(stmt.reference);
      if (!normStmtRef) return; // skip payments without reference numbers for ref matching

      const matchIndex = ourPayments.findIndex((our) => {
        return normalizeRef(our.reference_number) === normStmtRef && !matchedOurPaymentIds.has(our.id);
      });

      if (matchIndex !== -1) {
        const our = ourPayments[matchIndex];
        const isAmtMatch = Math.abs(our.amount - stmt.amount) < 1.0;
        
        tempMatches.push({
          id: `stmt_pay_${idx}`,
          status: isAmtMatch ? "matched" : "mismatch",
          stmtTx: stmt,
          ourTx: {
            id: our.id,
            date: our.payment_date,
            type: "payment",
            reference: our.reference_number || "Payment Record",
            amount: our.amount,
          },
        });

        matchedOurPaymentIds.add(our.id);
      }
    });

    // Step 3: Match remaining Statement transactions by Date & Amount (±7 days)
    stmtTransactions.forEach((stmt, idx) => {
      // Skip if already processed in step 1/2
      const isAlreadyMatched = tempMatches.some((m) => m.stmtTx?.reference === stmt.reference && m.stmtTx?.date === stmt.date && m.stmtTx?.amount === stmt.amount);
      if (isAlreadyMatched) return;

      if (stmt.type === "invoice") {
        const matchIndex = ourInvoices.findIndex((our) => {
          if (matchedOurInvoiceIds.has(our.id)) return false;
          const dateName = mode === "supplier" ? our.bill_date : our.invoice_date;
          const isAmtMatch = Math.abs(our.total - stmt.amount) < 1.0;
          const isDateClose = dateDiffDays(dateName, stmt.date) <= 7;
          return isAmtMatch && isDateClose;
        });

        if (matchIndex !== -1) {
          const our = ourInvoices[matchIndex];
          const refName = mode === "supplier" ? our.bill_number : our.invoice_number;
          const dateName = mode === "supplier" ? our.bill_date : our.invoice_date;

          tempMatches.push({
            id: `stmt_inv_fuzzy_${idx}`,
            status: "matched",
            stmtTx: stmt,
            ourTx: {
              id: our.id,
              date: dateName,
              type: "invoice",
              reference: refName,
              amount: our.total,
            },
          });
          matchedOurInvoiceIds.add(our.id);
        } else {
          // Unmatched invoice -> missing in our books
          tempMatches.push({
            id: `stmt_inv_missing_${idx}`,
            status: "missing_us",
            stmtTx: stmt,
          });
        }
      } else {
        // Payment
        const matchIndex = ourPayments.findIndex((our) => {
          if (matchedOurPaymentIds.has(our.id)) return false;
          const isAmtMatch = Math.abs(our.amount - stmt.amount) < 1.0;
          const isDateClose = dateDiffDays(our.payment_date, stmt.date) <= 7;
          return isAmtMatch && isDateClose;
        });

        if (matchIndex !== -1) {
          const our = ourPayments[matchIndex];
          tempMatches.push({
            id: `stmt_pay_fuzzy_${idx}`,
            status: "matched",
            stmtTx: stmt,
            ourTx: {
              id: our.id,
              date: our.payment_date,
              type: "payment",
              reference: our.reference_number || "Payment Record",
              amount: our.amount,
            },
          });
          matchedOurPaymentIds.add(our.id);
        } else {
          // Unmatched payment -> missing in our books
          tempMatches.push({
            id: `stmt_pay_missing_${idx}`,
            status: "missing_us",
            stmtTx: stmt,
          });
        }
      }
    });

    // Step 4: Add transactions recorded in our books but NOT found in statement
    ourInvoices.forEach((our) => {
      if (matchedOurInvoiceIds.has(our.id)) return;
      const refName = mode === "supplier" ? our.bill_number : our.invoice_number;
      const dateName = mode === "supplier" ? our.bill_date : our.invoice_date;

      tempMatches.push({
        id: `our_inv_missing_${our.id}`,
        status: "missing_them",
        ourTx: {
          id: our.id,
          date: dateName,
          type: "invoice",
          reference: refName,
          amount: our.total,
        },
      });
    });

    ourPayments.forEach((our) => {
      if (matchedOurPaymentIds.has(our.id)) return;
      tempMatches.push({
        id: `our_pay_missing_${our.id}`,
        status: "missing_them",
        ourTx: {
          id: our.id,
          date: our.payment_date,
          type: "payment",
          reference: our.reference_number || "Payment Record",
          amount: our.amount,
        },
      });
    });

    // Sort matching rows: show discrepancies and unmatched first, then fully matched
    const statusPriority = {
      mismatch: 0,
      missing_us: 1,
      missing_them: 2,
      matched: 3,
    };

    tempMatches.sort((a, b) => statusPriority[a.status] - statusPriority[b.status]);
    setMatches(tempMatches);
    setParsingState("done");
  };

  // One-click quick resolution handlers
  const handleQuickAddInvoice = async (matchId: string, stmt: StmtTx) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, resolving: true } : m))
    );

    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No active session");

      const { data: userData } = await supabase
        .from("users")
        .select("business_id")
        .eq("id", user.id)
        .single();

      if (!userData?.business_id) throw new Error("No business found");
      const businessId = userData.business_id;

      let newInvoiceId = "";

      if (mode === "supplier") {
        // Fetch supplier details to see if state is intra-state
        const { data: supplier } = await supabase
          .from("suppliers")
          .select("gstin")
          .eq("id", partyId)
          .single();

        const { data: business } = await supabase
          .from("businesses")
          .select("gstin")
          .eq("id", businessId)
          .single();

        const intraState = isIntraState(business?.gstin, supplier?.gstin);
        const subtotal = stmt.amount / 1.18;
        const tax = stmt.amount - subtotal;
        const cgst = intraState ? tax / 2 : 0;
        const sgst = intraState ? tax / 2 : 0;
        const igst = intraState ? 0 : tax;

        // Insert purchase invoice
        const { data: purchase, error: purchaseError } = await supabase
          .from("purchase_invoices")
          .insert({
            business_id: businessId,
            supplier_id: partyId,
            supplier_name: partyName,
            bill_number: stmt.reference || `RECON-${Date.now()}`,
            bill_date: stmt.date,
            subtotal,
            cgst,
            sgst,
            igst,
            total: stmt.amount,
            status: "pending",
            notes: stmt.description || "Auto-imported from supplier ledger statement reconciliation",
          })
          .select()
          .single();

        if (purchaseError) throw purchaseError;
        newInvoiceId = purchase.id;

        // Insert default line item to keep system valid
        await supabase.from("purchase_invoice_items").insert({
          purchase_invoice_id: purchase.id,
          description: "Unrecorded Purchase (Auto-imported via statement reconciliation)",
          quantity: 1,
          unit: "pcs",
          rate: subtotal,
          gst_rate: 18,
          cgst,
          sgst,
          igst,
          amount: stmt.amount,
        });

        // Add to our internal ref for re-matching
        ourInvoicesRef.current.push({
          id: purchase.id,
          bill_number: purchase.bill_number,
          bill_date: purchase.bill_date,
          total: purchase.total,
        });
      } else {
        // Customer mode sales invoice
        const { data: customer } = await supabase
          .from("customers")
          .select("gstin")
          .eq("id", partyId)
          .single();

        const { data: business } = await supabase
          .from("businesses")
          .select("gstin")
          .eq("id", businessId)
          .single();

        const intraState = isIntraState(business?.gstin, customer?.gstin);
        const subtotal = stmt.amount / 1.18;
        const tax = stmt.amount - subtotal;
        const cgst = intraState ? tax / 2 : 0;
        const sgst = intraState ? tax / 2 : 0;
        const igst = intraState ? 0 : tax;

        const { data: invoice, error: invoiceError } = await supabase
          .from("invoices")
          .insert({
            business_id: businessId,
            customer_id: partyId,
            customer_name: partyName,
            invoice_number: stmt.reference || `RECON-${Date.now()}`,
            invoice_date: stmt.date,
            subtotal,
            cgst,
            sgst,
            igst,
            total: stmt.amount,
            status: "sent",
            notes: stmt.description || "Auto-imported from customer statement reconciliation",
          })
          .select()
          .single();

        if (invoiceError) throw invoiceError;
        newInvoiceId = invoice.id;

        await supabase.from("invoice_items").insert({
          invoice_id: invoice.id,
          description: "Unrecorded Sale (Auto-imported via statement reconciliation)",
          quantity: 1,
          unit: "pcs",
          rate: subtotal,
          gst_rate: 18,
          cgst,
          sgst,
          igst,
          amount: stmt.amount,
        });

        ourInvoicesRef.current.push({
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          total: invoice.total,
        });
      }

      // Re-run matching to update UI
      runMatchingEngine();
      onReconciled();
    } catch (err: any) {
      console.error(err);
      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId ? { ...m, resolving: false, error: err.message || "Failed to add" } : m
        )
      );
    }
  };

  const handleQuickAddPayment = async (matchId: string, stmt: StmtTx) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, resolving: true } : m))
    );

    const supabase = createClient();
    try {
      // Find a pending invoice on our side to link this payment to
      let targetInvoiceId = "";
      let targetInvoiceRef = "";
      
      if (mode === "supplier") {
        // Query pending purchase invoices
        const { data: pendingInvoices } = await supabase
          .from("purchase_invoices")
          .select("id, bill_number, total, amount_paid")
          .eq("supplier_id", partyId)
          .or("status.eq.pending,status.eq.partial")
          .order("bill_date", { ascending: true }) // FIFO
          .limit(1);

        if (pendingInvoices && pendingInvoices.length > 0) {
          targetInvoiceId = pendingInvoices[0].id;
          targetInvoiceRef = pendingInvoices[0].bill_number;
          
          // Record purchase payment
          const { error: payError } = await supabase.from("purchase_payments").insert({
            purchase_invoice_id: targetInvoiceId,
            amount: stmt.amount,
            payment_method: "bank_transfer",
            reference_number: stmt.reference || null,
            payment_date: stmt.date,
            notes: stmt.description || "Auto-recorded payment via statement reconciliation",
          });

          if (payError) throw payError;

          // Update purchase invoice paid amount
          const newPaid = pendingInvoices[0].amount_paid + stmt.amount;
          const newStatus = newPaid >= pendingInvoices[0].total ? "paid" : "partial";
          await supabase
            .from("purchase_invoices")
            .update({ amount_paid: newPaid, status: newStatus })
            .eq("id", targetInvoiceId);
        } else {
          throw new Error("No pending purchase bills found. Please add the purchase bill first.");
        }
      } else {
        // Customer mode payments
        const { data: pendingInvoices } = await supabase
          .from("invoices")
          .select("id, invoice_number, total, status")
          .eq("customer_id", partyId)
          .not("status", "eq", "paid")
          .order("invoice_date", { ascending: true }) // FIFO
          .limit(1);

        if (pendingInvoices && pendingInvoices.length > 0) {
          targetInvoiceId = pendingInvoices[0].id;
          targetInvoiceRef = pendingInvoices[0].invoice_number;

          // Record payment
          const { error: payError } = await supabase.from("payments").insert({
            invoice_id: targetInvoiceId,
            amount: stmt.amount,
            payment_method: "bank_transfer",
            reference_number: stmt.reference || null,
            payment_date: stmt.date,
            notes: stmt.description || "Auto-recorded receipt via statement reconciliation",
          });

          if (payError) throw payError;

          // Update invoice status (sales payments are fully-applied or handled inside trigger/client)
          // Simple client fallback just in case
          await supabase
            .from("invoices")
            .update({ status: "paid" })
            .eq("id", targetInvoiceId);
        } else {
          throw new Error("No pending sales invoices found. Please add the invoice first.");
        }
      }

      // Re-fetch our payments list
      if (mode === "supplier") {
        const invoiceIds = ourInvoicesRef.current.map(i => i.id);
        const { data: payments } = await supabase
          .from("purchase_payments")
          .select("id, purchase_invoice_id, amount, payment_date, reference_number")
          .in("purchase_invoice_id", invoiceIds);
        ourPaymentsRef.current = payments || [];
      } else {
        const invoiceIds = ourInvoicesRef.current.map(i => i.id);
        const { data: payments } = await supabase
          .from("payments")
          .select("id, invoice_id, amount, payment_date, reference_number")
          .in("invoice_id", invoiceIds);
        ourPaymentsRef.current = payments || [];
      }

      // Re-run matching to update UI
      runMatchingEngine();
      onReconciled();
    } catch (err: any) {
      console.error(err);
      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId ? { ...m, resolving: false, error: err.message || "Failed to record" } : m
        )
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-0 duration-200">
      <div className="w-full max-w-5xl h-[85vh] flex flex-col bg-white dark:bg-slate-950 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/50 dark:border-slate-800/50 p-4">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI Statement Reconciliation — {partyName}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reconcile your internal records against the statement of account received from this {mode === "supplier" ? "supplier" : "customer"}.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload State */}
        {parsingState === "idle" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center m-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl hover:border-primary/50 cursor-pointer transition-all"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileInput}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 text-primary">
              <Upload className="w-6 h-6" />
            </div>
            <p className="font-semibold text-foreground">Upload statement / ledger file</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Drag and drop the PDF or Image of the statement provided by the {mode === "supplier" ? "supplier" : "customer"}. AI will extract the opening balance, transaction list, and match everything for you.
            </p>
          </div>
        )}

        {/* Loading States */}
        {(parsingState === "uploading" || parsingState === "parsing" || parsingState === "matching") && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
            <p className="font-semibold text-foreground">
              {parsingState === "uploading" && "Uploading document to secure storage..."}
              {parsingState === "parsing" && "AI is extracting opening balances and transaction table..."}
              {parsingState === "matching" && "Matching records and calculating discrepancies..."}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Please wait. This will take a few seconds as we extract the exact details using OCR and AI.
            </p>
          </div>
        )}

        {/* Error State */}
        {parsingState === "error" && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center m-6">
            <AlertCircle className="w-12 h-12 text-red-500 mb-3" />
            <p className="font-semibold text-foreground">Reconciliation Error</p>
            <p className="text-sm text-red-500/80 mt-1 max-w-md">{error}</p>
            <button
              onClick={() => {
                setFile(null);
                setParsingState("idle");
              }}
              className="mt-4 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-xl hover:opacity-90 shadow-md shadow-primary/10 transition-all"
            >
              Try Another File
            </button>
          </div>
        )}

        {/* Results / Matching view */}
        {parsingState === "done" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Balance Summary Header */}
            <div className="bg-slate-50 dark:bg-slate-900/50 px-6 py-3 border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between gap-4 text-xs font-medium">
              <div className="flex items-center gap-6">
                {openingBalance !== null && (
                  <div>
                    <span className="text-muted-foreground">Opening Balance (Statement): </span>
                    <span className="font-bold">₹{openingBalance.toLocaleString("en-IN")}</span>
                  </div>
                )}
                {closingBalance !== null && (
                  <div>
                    <span className="text-muted-foreground">Closing Balance (Statement): </span>
                    <span className="font-bold">₹{closingBalance.toLocaleString("en-IN")}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-500">
                  <CheckCircle className="w-3.5 h-3.5" />
                  {matches.filter((m) => m.status === "matched").length} Matched
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-500">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {matches.filter((m) => m.status === "missing_us" || m.status === "mismatch").length} Discrepancies
                </span>
                <button
                  onClick={() => {
                    setFile(null);
                    setParsingState("idle");
                  }}
                  className="px-3 py-1 bg-secondary hover:bg-muted text-foreground rounded-lg transition-colors flex items-center gap-1 text-[10px]"
                >
                  <RefreshCw className="w-3 h-3" /> Re-upload
                </button>
              </div>
            </div>

            {/* Split Comparison List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="grid grid-cols-12 gap-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-4 py-1">
                <div className="col-span-5">Their Statement (Uploaded)</div>
                <div className="col-span-1 text-center">Match Status</div>
                <div className="col-span-4">Our Recorded Entries</div>
                <div className="col-span-2 text-right">Action / Resolve</div>
              </div>

              {matches.map((m) => (
                <div
                  key={m.id}
                  className={`grid grid-cols-12 items-center gap-3 p-3.5 rounded-xl border transition-all ${
                    m.status === "matched"
                      ? "bg-emerald-50/20 dark:bg-emerald-950/5 border-emerald-200/50 dark:border-emerald-800/20"
                      : m.status === "mismatch"
                      ? "bg-amber-50/20 dark:bg-amber-950/5 border-amber-200/50 dark:border-amber-800/20"
                      : "bg-red-50/20 dark:bg-red-950/5 border-red-200/50 dark:border-red-800/20"
                  }`}
                >
                  {/* Left Side: Statement Transaction */}
                  <div className="col-span-5 min-w-0">
                    {m.stmtTx ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs font-mono text-foreground bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded">
                            {m.stmtTx.reference}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(m.stmtTx.date).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate" title={m.stmtTx.description}>
                          {m.stmtTx.description}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-semibold px-1 rounded uppercase ${
                              m.stmtTx.type === "invoice"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-500"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-500"
                            }`}
                          >
                            {m.stmtTx.type === "invoice" ? (mode === "supplier" ? "Bill" : "Sale") : (mode === "supplier" ? "Payment Made" : "Receipt")}
                          </span>
                          <span className="text-xs font-bold text-foreground">
                            ₹{m.stmtTx.amount.toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground italic">Missing on statement</div>
                    )}
                  </div>

                  {/* Middle Column: Match Status */}
                  <div className="col-span-1 flex flex-col items-center justify-center">
                    {m.status === "matched" && (
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                    )}
                    {m.status === "mismatch" && (
                      <div className="flex flex-col items-center">
                        <AlertCircle className="w-5 h-5 text-amber-500" />
                        <span className="text-[9px] text-amber-600 font-semibold mt-0.5">Mismatch</span>
                      </div>
                    )}
                    {m.status === "missing_us" && (
                      <div className="flex flex-col items-center">
                        <ArrowRight className="w-5 h-5 text-red-500" />
                        <span className="text-[9px] text-red-500 font-semibold mt-0.5">Missing Us</span>
                      </div>
                    )}
                    {m.status === "missing_them" && (
                      <div className="flex flex-col items-center">
                        <HelpCircle className="w-5 h-5 text-slate-400" />
                        <span className="text-[9px] text-slate-500 font-semibold mt-0.5">Missing Them</span>
                      </div>
                    )}
                  </div>

                  {/* Right Side: Our Transaction */}
                  <div className="col-span-4 min-w-0">
                    {m.ourTx ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs font-mono text-foreground bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded">
                            {m.ourTx.reference}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(m.ourTx.date).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-semibold px-1 rounded uppercase ${
                              m.ourTx.type === "invoice"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-500"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-500"
                            }`}
                          >
                            {m.ourTx.type}
                          </span>
                          <span className="text-xs font-bold text-foreground">
                            ₹{m.ourTx.amount.toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-red-500/80 italic font-medium">Unrecorded in our books</div>
                    )}
                  </div>

                  {/* Action Column */}
                  <div className="col-span-2 text-right">
                    {m.status === "missing_us" && m.stmtTx && (
                      <div className="space-y-1.5">
                        {m.stmtTx.type === "invoice" ? (
                          <button
                            onClick={() => handleQuickAddInvoice(m.id, m.stmtTx!)}
                            disabled={m.resolving}
                            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-primary text-white text-2xs font-semibold rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
                          >
                            {m.resolving ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Plus className="w-3 h-3" />
                            )}
                            Record {mode === "supplier" ? "Bill" : "Sale"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleQuickAddPayment(m.id, m.stmtTx!)}
                            disabled={m.resolving}
                            className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-2xs font-semibold rounded-lg hover:bg-emerald-700 transition-all disabled:opacity-50"
                          >
                            {m.resolving ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Plus className="w-3 h-3" />
                            )}
                            Record Pay
                          </button>
                        )}
                        {m.error && (
                          <p className="text-[9px] text-red-500 font-medium leading-tight">{m.error}</p>
                        )}
                      </div>
                    )}

                    {m.status === "matched" && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-500 font-semibold">
                        <CheckCircle className="w-3.5 h-3.5" /> Reconciled
                      </span>
                    )}

                    {m.status === "mismatch" && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-500 font-semibold">
                        Check amount diff
                      </span>
                    )}

                    {m.status === "missing_them" && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        Verify with Supplier
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center border-t border-slate-200/50 dark:border-slate-800/50 p-4 bg-slate-50/50 dark:bg-slate-900/10">
          <p className="text-[10px] text-muted-foreground">
            Ledger reconciliation updates your internal accounts with single-click resolution actions.
          </p>
          <button
            onClick={onClose}
            disabled={parsingState === "uploading" || parsingState === "parsing" || parsingState === "matching"}
            className="px-5 py-2.5 bg-secondary hover:bg-muted text-foreground rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}

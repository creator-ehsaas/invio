"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2,
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
  BookOpen,
  Sparkles,
  Download,
} from "lucide-react";
import ReconciliationDashboard from "./reconciliation-dashboard";

interface DoubleEntryLedgerProps {
  mode: "customer" | "supplier";
  partyId: string;
  partyName: string;
}

export interface LedgerTransaction {
  id: string;
  date: string;
  type: "Invoice" | "Payment";
  reference: string;
  description: string;
  debit: number; // Customer mode: Invoice (+), Supplier mode: Payment (-)
  credit: number; // Customer mode: Payment (-), Supplier mode: Invoice (+)
  runningBalance: number;
}

export default function DoubleEntryLedger({ mode, partyId, partyName }: DoubleEntryLedgerProps) {
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<"all" | "30days" | "month" | "year">("all");
  const [isReconcileOpen, setIsReconcileOpen] = useState(false);

  // Totals
  const [totalInvoiced, setTotalInvoiced] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [outstandingBalance, setOutstandingBalance] = useState(0);

  const fetchLedgerData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    try {
      let tempTransactions: Omit<LedgerTransaction, "runningBalance">[] = [];

      if (mode === "supplier") {
        // 1. Fetch Purchase Invoices
        const { data: invoices, error: invError } = await supabase
          .from("purchase_invoices")
          .select("id, bill_number, bill_date, total, status, notes")
          .eq("supplier_id", partyId);

        if (invError) throw invError;

        if (invoices && invoices.length > 0) {
          // Add invoices to transactions list
          invoices.forEach((inv) => {
            tempTransactions.push({
              id: inv.id,
              date: inv.bill_date,
              type: "Invoice",
              reference: inv.bill_number,
              description: inv.notes || "Purchase Bill recorded",
              debit: 0, // Debits decrease AP (Payment)
              credit: inv.total, // Credits increase AP (Invoice)
            });
          });

          // 2. Fetch Purchase Payments linked to these invoices
          const invoiceIds = invoices.map((i) => i.id);
          const { data: payments, error: payError } = await supabase
            .from("purchase_payments")
            .select("id, purchase_invoice_id, amount, payment_date, payment_method, reference_number, notes")
            .in("purchase_invoice_id", invoiceIds);

          if (payError) throw payError;

          if (payments) {
            payments.forEach((pay) => {
              const invRef = invoices.find((i) => i.id === pay.purchase_invoice_id)?.bill_number || "";
              tempTransactions.push({
                id: pay.id,
                date: pay.payment_date,
                type: "Payment",
                reference: pay.reference_number || `Pay-${pay.payment_method}`,
                description: pay.notes || `Payment made towards Bill #${invRef}`,
                debit: pay.amount, // Debits decrease AP (Payment)
                credit: 0,
              });
            });
          }
        }
      } else {
        // Customer Mode
        // 1. Fetch Sales Invoices
        const { data: invoices, error: invError } = await supabase
          .from("invoices")
          .select("id, invoice_number, invoice_date, total, status, notes")
          .eq("customer_id", partyId);

        if (invError) throw invError;

        if (invoices && invoices.length > 0) {
          invoices.forEach((inv) => {
            tempTransactions.push({
              id: inv.id,
              date: inv.invoice_date,
              type: "Invoice",
              reference: inv.invoice_number,
              description: inv.notes || "Sales Invoice generated",
              debit: inv.total, // Debits increase AR (Invoice)
              credit: 0,
            });
          });

          // 2. Fetch Customer Payments linked to these invoices
          const invoiceIds = invoices.map((i) => i.id);
          const { data: payments, error: payError } = await supabase
            .from("payments")
            .select("id, invoice_id, amount, payment_date, payment_method, reference_number, notes")
            .in("invoice_id", invoiceIds);

          if (payError) throw payError;

          if (payments) {
            payments.forEach((pay) => {
              const invRef = invoices.find((i) => i.id === pay.invoice_id)?.invoice_number || "";
              tempTransactions.push({
                id: pay.id,
                date: pay.payment_date,
                type: "Payment",
                reference: pay.reference_number || `Rec-${pay.payment_method}`,
                description: pay.notes || `Payment received for Invoice #${invRef}`,
                debit: 0,
                credit: pay.amount, // Credits decrease AR (Payment)
              });
            });
          }
        }
      }

      // Sort all transactions chronologically (ascending date)
      tempTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Filter by date range if required
      const now = new Date();
      if (dateRange === "30days") {
        const threshold = new Date();
        threshold.setDate(now.getDate() - 30);
        tempTransactions = tempTransactions.filter((tx) => new Date(tx.date) >= threshold);
      } else if (dateRange === "month") {
        tempTransactions = tempTransactions.filter(
          (tx) =>
            new Date(tx.date).getMonth() === now.getMonth() &&
            new Date(tx.date).getFullYear() === now.getFullYear()
        );
      } else if (dateRange === "year") {
        tempTransactions = tempTransactions.filter((tx) => new Date(tx.date).getFullYear() === now.getFullYear());
      }

      // Calculate running balance and accumulated totals
      let currentBalance = 0;
      let calculatedInvoiced = 0;
      let calculatedPaid = 0;

      const finalTransactions: LedgerTransaction[] = tempTransactions.map((tx) => {
        if (mode === "supplier") {
          currentBalance = currentBalance + tx.credit - tx.debit;
          calculatedInvoiced += tx.credit;
          calculatedPaid += tx.debit;
        } else {
          currentBalance = currentBalance + tx.debit - tx.credit;
          calculatedInvoiced += tx.debit;
          calculatedPaid += tx.credit;
        }

        return {
          ...tx,
          runningBalance: currentBalance,
        };
      });

      setTransactions(finalTransactions.reverse()); // Show newest first in table
      setTotalInvoiced(calculatedInvoiced);
      setTotalPaid(calculatedPaid);
      setOutstandingBalance(currentBalance);
    } catch (err) {
      console.error("Failed to build double-entry ledger:", err);
    } finally {
      setLoading(false);
    }
  }, [mode, partyId, dateRange]);

  useEffect(() => {
    fetchLedgerData();
  }, [fetchLedgerData]);

  const exportCSV = () => {
    const headers = ["Date", "Type", "Reference", "Description", "Debit (₹)", "Credit (₹)", "Balance (₹)"];
    const rows = transactions.map((t) => [
      t.date,
      t.type,
      t.reference,
      t.description.replace(/,/g, " "),
      t.debit,
      t.credit,
      t.runningBalance,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${partyName.replace(/\s+/g, "_")}_ledger.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4 shadow-sm">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            {mode === "supplier" ? "Total Purchased" : "Total Sales"}
          </p>
          <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">
            ₹{totalInvoiced.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4 shadow-sm">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            {mode === "supplier" ? "Total Paid" : "Total Received"}
          </p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1">
            ₹{totalPaid.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4 shadow-sm">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            {mode === "supplier" ? "Net Payable" : "Net Receivable"}
          </p>
          <p
            className={`text-xl sm:text-2xl font-bold mt-1 ${
              outstandingBalance > 0 ? "text-amber-600" : "text-emerald-600"
            }`}
          >
            ₹{outstandingBalance.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* Filter Options & Tools */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex gap-2">
          {(["all", "30days", "month", "year"] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                dateRange === range
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {range === "all"
                ? "All Time"
                : range === "30days"
                ? "Last 30 Days"
                : range === "month"
                ? "This Month"
                : "This Year"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setIsReconcileOpen(true)}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-gradient-to-br from-primary to-blue-500 text-white text-xs font-semibold rounded-xl hover:opacity-90 shadow-md shadow-primary/10 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" /> Reconcile Statement
          </button>
          <button
            onClick={exportCSV}
            disabled={transactions.length === 0}
            className="inline-flex items-center justify-center p-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-muted-foreground hover:text-foreground rounded-xl transition-colors disabled:opacity-50"
            title="Download CSV"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 overflow-hidden shadow-sm">
        {transactions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="w-8 h-8 mx-auto opacity-30 mb-2" />
            <p className="text-sm font-medium">No ledger transactions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-muted/50 border-b border-slate-200/50 dark:border-slate-800/50">
                  <th className="px-6 py-3.5 font-medium text-muted-foreground">Date</th>
                  <th className="px-6 py-3.5 font-medium text-muted-foreground">Type</th>
                  <th className="px-6 py-3.5 font-medium text-muted-foreground">Ref / Bill #</th>
                  <th className="px-6 py-3.5 font-medium text-muted-foreground">Description</th>
                  <th className="px-6 py-3.5 font-medium text-muted-foreground text-right">
                    {mode === "supplier" ? "Debit (Payment)" : "Debit (Invoice)"}
                  </th>
                  <th className="px-6 py-3.5 font-medium text-muted-foreground text-right">
                    {mode === "supplier" ? "Credit (Invoice)" : "Credit (Payment)"}
                  </th>
                  <th className="px-6 py-3.5 font-medium text-muted-foreground text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
                {transactions.map((tx) => {
                  const hasDebit = tx.debit > 0;
                  const hasCredit = tx.credit > 0;

                  return (
                    <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                        {new Date(tx.date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                            tx.type === "Invoice"
                              ? "bg-blue-500/10 text-blue-600"
                              : "bg-emerald-500/10 text-emerald-600"
                          }`}
                        >
                          {tx.type === "Invoice" ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <ArrowDownLeft className="w-3 h-3" />
                          )}
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono font-medium text-foreground">{tx.reference}</td>
                      <td className="px-6 py-4 text-muted-foreground max-w-xs truncate">{tx.description}</td>
                      <td className="px-6 py-4 text-right font-medium">
                        {hasDebit ? `₹${tx.debit.toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="px-6 py-4 text-right font-medium">
                        {hasCredit ? `₹${tx.credit.toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-foreground">
                        ₹{tx.runningBalance.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReconciliationDashboard
        isOpen={isReconcileOpen}
        onClose={() => setIsReconcileOpen(false)}
        mode={mode}
        partyId={partyId}
        partyName={partyName}
        onReconciled={fetchLedgerData}
      />
    </div>
  );
}

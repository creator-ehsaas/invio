"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Plus,
  Search,
  FileText,
  Loader2,
  ArrowUpRight,
  Calendar,
  MoreHorizontal,
  Trash2,
  Eye,
} from "lucide-react";

interface DebitNote {
  id: string;
  debit_note_number: string;
  debit_note_date: string;
  customer_name: string;
  reason: string;
  total: number;
  status: string;
  invoice_id: string | null;
}

const REASON_LABELS: Record<string, string> = {
  undercharge: "Undercharge Correction",
  additional_service: "Additional Service",
  price_increase: "Price Increase",
  other: "Other",
};

export default function DebitNotesPage() {
  const [debitNotes, setDebitNotes] = useState<DebitNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    fetchDebitNotes();
  }, []);

  const fetchDebitNotes = async () => {
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

    const { data } = await supabase
      .from("debit_notes")
      .select("id, debit_note_number, debit_note_date, customer_name, reason, total, status, invoice_id")
      .eq("business_id", userData.business_id)
      .order("debit_note_date", { ascending: false });

    setDebitNotes(data || []);
    setLoading(false);
  };

  const deleteDebitNote = async (id: string) => {
    if (!confirm("Delete this debit note?")) return;
    const supabase = createClient();
    await supabase.from("debit_notes").delete().eq("id", id);
    setDebitNotes(debitNotes.filter((dn) => dn.id !== id));
    setMenuOpen(null);
  };

  const filtered = debitNotes.filter(
    (dn) =>
      dn.debit_note_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dn.customer_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalValue = filtered.reduce((sum, dn) => sum + dn.total, 0);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "issued":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "adjusted":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      default:
        return "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Debit Notes</h1>
          <p className="text-muted-foreground mt-1">Manage additional charges and corrections</p>
        </div>
        <Link
          href="/debit-notes/new"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          New Debit Note
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
              <ArrowUpRight className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Debit Notes</p>
              <p className="text-xl font-bold text-foreground">{filtered.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
              <FileText className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Value</p>
              <p className="text-xl font-bold text-foreground">
                ₹{totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search debit notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-12 text-center shadow-sm">
          <ArrowUpRight className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground">No debit notes yet</h3>
          <p className="text-muted-foreground mt-1">Create your first debit note for additional charges</p>
          <Link
            href="/debit-notes/new"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Debit Note
          </Link>
        </div>
      ) : (
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
            {filtered.map((dn) => (
              <div
                key={dn.id}
                className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl">
                  <ArrowUpRight className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{dn.debit_note_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusStyle(dn.status)}`}>
                      {dn.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{dn.customer_name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(dn.debit_note_date).toLocaleDateString("en-IN")}
                    </span>
                    <span>{REASON_LABELS[dn.reason] || dn.reason}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-emerald-600">
                    +₹{dn.total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(menuOpen === dn.id ? null : dn.id)}
                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                  >
                    <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
                  </button>
                  {menuOpen === dn.id && (
                    <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg z-10 overflow-hidden">
                      <Link
                        href={`/debit-notes/${dn.id}`}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                      >
                        <Eye className="w-4 h-4" /> View
                      </Link>
                      <button
                        onClick={() => deleteDebitNote(dn.id)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

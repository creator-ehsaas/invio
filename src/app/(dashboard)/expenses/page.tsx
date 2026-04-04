"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Receipt, Search, Plus, Loader2, TrendingDown, Sparkles } from "lucide-react";

interface Expense {
  id: string;
  description: string;
  category_name: string | null;
  vendor_name: string | null;
  amount: number;
  gst_amount: number;
  expense_date: string;
  payment_method: string;
  is_itc_eligible: boolean;
}

const PAYMENT_ICONS: Record<string, string> = {
  cash: "💵", bank: "🏦", upi: "📱", card: "💳", cheque: "📝", other: "💰",
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("expenses")
      .select("id, description, category_name, vendor_name, amount, gst_amount, expense_date, payment_method, is_itc_eligible")
      .order("expense_date", { ascending: false });

    if (data) {
      setExpenses(data);
      const cats = [...new Set(data.map(e => e.category_name).filter(Boolean))] as string[];
      setCategories(cats);
    }
    setLoading(false);
  };

  const filtered = expenses.filter(e => {
    if (filterCategory !== "all" && e.category_name !== filterCategory) return false;
    if (search && !e.description.toLowerCase().includes(search.toLowerCase()) &&
        !e.vendor_name?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalAmount = filtered.reduce((s, e) => s + e.amount, 0);
  const totalITC = filtered.filter(e => e.is_itc_eligible).reduce((s, e) => s + e.gst_amount, 0);

  // Current month expenses
  const thisMonth = new Date().toISOString().substring(0, 7);
  const monthExpenses = expenses.filter(e => e.expense_date.startsWith(thisMonth));
  const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);

  const getAiSummary = async () => {
    setLoadingSummary(true);
    setAiSummary(null);
    try {
      const res = await fetch("/api/ai-expense-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenses: expenses.slice(0, 50) }),
      });
      if (res.ok) {
        const { summary } = await res.json();
        setAiSummary(summary);
      }
    } catch {
      setAiSummary("Could not load AI summary.");
    } finally {
      setLoadingSummary(false);
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
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Expenses</h1>
          <p className="text-muted-foreground text-sm mt-1">Track business expenses for P&L and ITC</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/expenses/categories"
            className="px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
          >
            Categories
          </Link>
          <Link
            href="/expenses/new"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Expense
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">This Month</p>
          <p className="text-2xl font-bold mt-1 text-red-600">
            ₹{monthTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">ITC Claimable</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">
            ₹{totalITC.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 col-span-2 sm:col-span-1">
          <p className="text-sm text-muted-foreground">Total (filtered)</p>
          <p className="text-2xl font-bold mt-1">
            ₹{totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* AI Summary */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            {aiSummary ? (
              <p className="text-sm text-foreground">{aiSummary}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                AI can analyze your expense patterns and suggest where to cut costs and claim ITC.
              </p>
            )}
          </div>
          <button
            onClick={getAiSummary}
            disabled={loadingSummary || expenses.length === 0}
            className="shrink-0 text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            {loadingSummary ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {loadingSummary ? "Analyzing..." : "Analyze"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search expenses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3 py-2.5 bg-card border border-border rounded-lg text-sm focus:outline-none"
        >
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Expense List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <Receipt className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No expenses recorded yet</p>
          <Link
            href="/expenses/new"
            className="mt-4 inline-flex items-center gap-2 text-primary hover:underline text-sm"
          >
            <Plus className="w-4 h-4" /> Record first expense
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((exp) => (
            <Link
              key={exp.id}
              href={`/expenses/${exp.id}`}
              className="block bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground truncate">{exp.description}</span>
                    {exp.category_name && (
                      <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded-full">
                        {exp.category_name}
                      </span>
                    )}
                    {exp.is_itc_eligible && (
                      <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full">
                        ITC eligible
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{new Date(exp.expense_date).toLocaleDateString("en-IN")}</span>
                    <span>{PAYMENT_ICONS[exp.payment_method] || "💰"} {exp.payment_method}</span>
                    {exp.vendor_name && <span className="truncate">{exp.vendor_name}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-red-600">-₹{exp.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
                  {exp.gst_amount > 0 && (
                    <p className="text-xs text-muted-foreground">GST ₹{exp.gst_amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

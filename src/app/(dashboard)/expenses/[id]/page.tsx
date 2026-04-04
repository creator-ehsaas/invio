"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Edit2, Trash2, Save, X, Loader2, Receipt, CheckCircle2 } from "lucide-react";

interface Expense {
  id: string;
  description: string;
  category_id: string | null;
  category_name: string | null;
  amount: number;
  gst_amount: number;
  expense_date: string;
  payment_method: string;
  reference_number: string | null;
  vendor_name: string | null;
  attachment_url: string | null;
  notes: string | null;
  is_itc_eligible: boolean;
}

interface Category {
  id: string;
  name: string;
}

const PAYMENT_ICONS: Record<string, string> = {
  cash: "💵", bank: "🏦", upi: "📱", card: "💳", cheque: "📝", other: "💰",
};

export default function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [expense, setExpense] = useState<Expense | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Expense>>({});

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    const supabase = createClient();
    const [{ data: exp }, { data: cats }] = await Promise.all([
      supabase.from("expenses").select("*").eq("id", id).single(),
      supabase.from("expense_categories").select("id, name").order("name"),
    ]);
    if (exp) { setExpense(exp); setForm(exp); }
    if (cats) setCategories(cats);
    setLoading(false);
  };

  const saveChanges = async () => {
    if (!expense) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("expenses").update({
      description: form.description,
      category_id: form.category_id || null,
      category_name: form.category_name || null,
      amount: form.amount,
      gst_amount: form.gst_amount || 0,
      expense_date: form.expense_date,
      payment_method: form.payment_method,
      reference_number: form.reference_number || null,
      vendor_name: form.vendor_name || null,
      notes: form.notes || null,
      is_itc_eligible: form.is_itc_eligible,
    }).eq("id", id);

    if (!error) {
      setExpense({ ...expense, ...form } as Expense);
      setEditing(false);
    }
    setSaving(false);
  };

  const deleteExpense = async () => {
    if (!confirm("Delete this expense?")) return;
    const supabase = createClient();
    await supabase.from("expenses").delete().eq("id", id);
    router.push("/expenses");
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!expense) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Expense not found.</p>
        <Link href="/expenses" className="text-primary hover:underline mt-2 inline-block">← Back</Link>
      </div>
    );
  }

  const f = editing ? form : expense;

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Link href="/expenses" className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground truncate">{expense.description}</h1>
          <p className="text-sm text-muted-foreground">{expense.category_name || "Uncategorized"}</p>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X className="w-4 h-4" /></button>
              <button onClick={saveChanges} disabled={saving} className="p-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><Edit2 className="w-4 h-4" /></button>
              <button onClick={deleteExpense} className="p-2 hover:bg-destructive/10 rounded-lg text-destructive"><Trash2 className="w-4 h-4" /></button>
            </>
          )}
        </div>
      </div>

      {/* Amount card */}
      <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded-2xl p-6 text-center">
        <p className="text-4xl font-bold text-red-600">
          -₹{expense.amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p className="text-sm text-muted-foreground mt-1">{new Date(expense.expense_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
        {expense.gst_amount > 0 && (
          <p className={`text-xs mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${expense.is_itc_eligible ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30" : "bg-muted text-muted-foreground"}`}>
            {expense.is_itc_eligible ? <CheckCircle2 className="w-3 h-3" /> : null}
            GST ₹{expense.gst_amount.toLocaleString("en-IN")} {expense.is_itc_eligible ? "— ITC eligible" : "— not ITC eligible"}
          </p>
        )}
      </div>

      {/* Detail form */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        {editing ? (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase">Description</label>
              <input type="text" value={f.description || ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Amount (₹)</label>
                <input type="number" value={f.amount || ""} onChange={e => setForm(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                  className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">GST (₹)</label>
                <input type="number" value={f.gst_amount || ""} onChange={e => setForm(p => ({ ...p, gst_amount: parseFloat(e.target.value) || 0 }))}
                  className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Category</label>
                <select value={f.category_id || ""} onChange={e => {
                  const cat = categories.find(c => c.id === e.target.value);
                  setForm(p => ({ ...p, category_id: e.target.value, category_name: cat?.name || "" }));
                }} className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none">
                  <option value="">Select</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Date</label>
                <input type="date" value={f.expense_date || ""} onChange={e => setForm(p => ({ ...p, expense_date: e.target.value }))}
                  className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase">Vendor</label>
              <input type="text" value={f.vendor_name || ""} onChange={e => setForm(p => ({ ...p, vendor_name: e.target.value }))}
                className="mt-1 w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm focus:outline-none" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!f.is_itc_eligible} onChange={e => setForm(p => ({ ...p, is_itc_eligible: e.target.checked }))} className="accent-primary" />
              <span className="text-sm">ITC Eligible</span>
            </label>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-muted-foreground">Category</p><p className="font-medium mt-0.5">{expense.category_name || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Payment</p><p className="font-medium mt-0.5">{PAYMENT_ICONS[expense.payment_method]} {expense.payment_method}</p></div>
            <div><p className="text-xs text-muted-foreground">Vendor</p><p className="font-medium mt-0.5">{expense.vendor_name || "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Reference</p><p className="font-medium mt-0.5">{expense.reference_number || "—"}</p></div>
            {expense.notes && <div className="col-span-2"><p className="text-xs text-muted-foreground">Notes</p><p className="mt-0.5">{expense.notes}</p></div>}
          </div>
        )}
      </div>

      {/* Attachment */}
      {expense.attachment_url && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Receipt / Attachment</p>
          {expense.attachment_url.match(/\.(jpg|jpeg|png|webp|heic)$/i) ? (
            <img src={expense.attachment_url} alt="Receipt" className="max-h-64 rounded-lg object-contain w-full" />
          ) : (
            <a href={expense.attachment_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-primary hover:underline text-sm">
              <Receipt className="w-4 h-4" /> View Attachment
            </a>
          )}
        </div>
      )}
    </div>
  );
}

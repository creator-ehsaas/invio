"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Edit2, CheckCircle, X, Loader2, AlertCircle, Landmark } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface BSEntry {
  id: string;
  section: string;
  name: string;
  amount: number;
  notes: string | null;
  is_active: boolean;
}

type Group = "Assets" | "Liabilities" | "Equity";

const SECTIONS: { id: string; label: string; group: Group; hint: string }[] = [
  { id: "fixed_asset", label: "Fixed Assets", group: "Assets", hint: "Property, plant, equipment, vehicles, furniture — enter net book value (after depreciation)" },
  { id: "investment", label: "Investments", group: "Assets", hint: "Long-term investments, fixed deposits, securities" },
  { id: "other_current_asset", label: "Other Current Assets", group: "Assets", hint: "Prepaid expenses, advances to suppliers, TDS receivable, advance income tax paid" },
  { id: "long_term_liability", label: "Long-term Loans & Borrowings", group: "Liabilities", hint: "Bank term loans, mortgages, vehicle loans (non-current portion)" },
  { id: "other_current_liability", label: "Other Current Liabilities", group: "Liabilities", hint: "Income tax payable, short-term loans, outstanding expenses, advances from customers" },
  { id: "capital", label: "Owner's Capital", group: "Equity", hint: "Capital introduced, share capital, partner contributions" },
  { id: "drawings", label: "Drawings", group: "Equity", hint: "Money/goods withdrawn by owner — reduces equity" },
];

const GROUP_ORDER: Group[] = ["Assets", "Liabilities", "Equity"];

const BLANK = { section: "fixed_asset", name: "", amount: 0, notes: "" };

const MIGRATION_SQL = `CREATE TABLE balance_sheet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  section text NOT NULL,
  name text NOT NULL,
  amount numeric DEFAULT 0,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE balance_sheet_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business_access" ON balance_sheet_entries
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));`;

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function BalanceSheetItemsPage() {
  const [entries, setEntries] = useState<BSEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableExists, setTableExists] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BSEntry | null>(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: ud } = await supabase.from("users").select("business_id").eq("id", user.id).single();
    if (!ud?.business_id) { setLoading(false); return; }
    setBusinessId(ud.business_id);

    const { data, error } = await supabase
      .from("balance_sheet_entries")
      .select("*")
      .eq("business_id", ud.business_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist") || error.message?.includes("schema cache")) {
        setTableExists(false);
      }
    } else {
      setEntries(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const startAdd = (section?: string) => {
    setEditing(null);
    setForm({ ...BLANK, section: section || "fixed_asset" });
    setShowForm(true);
  };

  const startEdit = (e: BSEntry) => {
    setEditing(e);
    setForm({ section: e.section, name: e.name, amount: e.amount, notes: e.notes || "" });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const supabase = createClient();
    const payload = {
      section: form.section,
      name: form.name,
      amount: Number(form.amount) || 0,
      notes: form.notes || null,
    };
    if (editing) {
      const { error } = await supabase.from("balance_sheet_entries").update(payload).eq("id", editing.id);
      if (error) { toast.error("Failed to update"); } else { toast.success("Updated"); setShowForm(false); fetchEntries(); }
    } else {
      const { error } = await supabase.from("balance_sheet_entries").insert({ ...payload, business_id: businessId });
      if (error) { toast.error("Failed to add"); } else { toast.success("Added"); setShowForm(false); fetchEntries(); }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    await supabase.from("balance_sheet_entries").update({ is_active: false }).eq("id", id);
    toast.success("Removed");
    fetchEntries();
  };

  const groupTotal = (group: Group) =>
    entries.filter((e) => SECTIONS.find((s) => s.id === e.section)?.group === group)
      .reduce((sum, e) => sum + (e.section === "drawings" ? -(e.amount || 0) : (e.amount || 0)), 0);

  return (
    <div className="space-y-6 max-w-3xl">
      <Breadcrumb items={[{ label: "Accounting", href: "/accounting" }, { label: "Balance Sheet Items" }]} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Balance Sheet Items</h1>
          <p className="text-sm text-muted-foreground">
            Assets, liabilities &amp; capital not auto-derived from invoices — fixed assets, loans, tax, owner&apos;s capital
          </p>
        </div>
        {tableExists && (
          <Button onClick={() => startAdd()} className="gap-2 rounded-full shrink-0">
            <Plus className="h-4 w-4" /> Add Item
          </Button>
        )}
      </div>

      {!tableExists && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold text-amber-800 dark:text-amber-300">Database setup required</p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                Run this SQL in your Supabase SQL Editor to enable balance sheet items:
              </p>
              <pre className="mt-3 p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-xs text-amber-900 dark:text-amber-200 overflow-x-auto whitespace-pre-wrap">{MIGRATION_SQL}</pre>
              <Button variant="outline" size="sm" className="mt-3" onClick={fetchEntries}>
                <CheckCircle className="h-4 w-4 mr-2" /> I&apos;ve run the SQL, try again
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading && tableExists && (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      )}

      {/* Add / Edit form */}
      {showForm && tableExists && (
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{editing ? "Edit Item" : "Add Balance Sheet Item"}</h3>
            <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Category *</label>
              <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {GROUP_ORDER.map((g) => (
                  <optgroup key={g} label={g}>
                    {SECTIONS.filter((s) => s.group === g).map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">{SECTIONS.find((s) => s.id === form.section)?.hint}</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Name *</label>
              <Input placeholder="e.g. Delivery Van / SBI Term Loan" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Amount (₹) *</label>
              <Input type="number" min={0} placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Notes</label>
              <Input placeholder="Optional notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Add Item"}
            </Button>
          </div>
        </div>
      )}

      {/* Grouped lists */}
      {!loading && tableExists && (
        <div className="space-y-6">
          {GROUP_ORDER.map((group) => {
            const groupSections = SECTIONS.filter((s) => s.group === group);
            const groupEntries = entries.filter((e) => groupSections.some((s) => s.id === e.section));
            return (
              <div key={group}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{group}</h2>
                  <span className="text-sm font-bold text-foreground">{fmt(groupTotal(group))}</span>
                </div>
                <div className="space-y-2">
                  {groupSections.map((section) => {
                    const items = groupEntries.filter((e) => e.section === section.id);
                    if (items.length === 0) return null;
                    return (
                      <div key={section.id}>
                        <p className="text-xs font-medium text-muted-foreground mb-1 px-1">{section.label}</p>
                        {items.map((e) => (
                          <div key={e.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3 mb-1.5">
                            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                              <Landmark className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm text-foreground truncate">{e.name}</p>
                              {e.notes && <p className="text-xs text-muted-foreground truncate">{e.notes}</p>}
                            </div>
                            <p className={`font-semibold text-sm shrink-0 ${e.section === "drawings" ? "text-red-500" : "text-foreground"}`}>
                              {e.section === "drawings" ? "−" : ""}{fmt(e.amount || 0)}
                            </p>
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => startEdit(e)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => handleDelete(e.id)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-500 transition-colors">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {groupEntries.length === 0 && (
                    <button onClick={() => startAdd(groupSections[0].id)}
                      className="w-full text-left text-sm text-muted-foreground hover:text-foreground border-2 border-dashed border-border rounded-xl p-3 transition-colors">
                      + Add {group.toLowerCase()} item
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

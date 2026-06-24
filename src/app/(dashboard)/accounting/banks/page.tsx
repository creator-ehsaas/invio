"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Building2, Trash2, Edit2, CheckCircle, X, Loader2, CreditCard, AlertCircle } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface BankAccount {
  id: string;
  name: string;
  bank_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
}

const BLANK: Omit<BankAccount, "id" | "is_active"> = {
  name: "",
  bank_name: "",
  account_number: "",
  ifsc_code: "",
  opening_balance: 0,
  current_balance: 0,
};

export default function BankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableExists, setTableExists] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: ud } = await supabase.from("users").select("business_id").eq("id", user.id).single();
    if (!ud?.business_id) { setLoading(false); return; }
    setBusinessId(ud.business_id);

    const { data, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("business_id", ud.business_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) {
      if (error.code === "42P01" || error.message?.includes("does not exist") || error.message?.includes("schema cache")) {
        setTableExists(false);
      }
    } else {
      setAccounts(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const startAdd = () => {
    setEditing(null);
    setForm(BLANK);
    setShowForm(true);
  };

  const startEdit = (acc: BankAccount) => {
    setEditing(acc);
    setForm({ name: acc.name, bank_name: acc.bank_name || "", account_number: acc.account_number || "", ifsc_code: acc.ifsc_code || "", opening_balance: acc.opening_balance, current_balance: acc.current_balance });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Account name is required"); return; }
    setSaving(true);
    const supabase = createClient();

    if (editing) {
      const { error } = await supabase.from("bank_accounts").update({
        name: form.name, bank_name: form.bank_name || null,
        account_number: form.account_number || null, ifsc_code: form.ifsc_code || null,
        opening_balance: Number(form.opening_balance) || 0,
        current_balance: Number(form.current_balance) || 0,
      }).eq("id", editing.id);
      if (error) { toast.error("Failed to update account"); } else { toast.success("Account updated"); setShowForm(false); fetchAccounts(); }
    } else {
      const { error } = await supabase.from("bank_accounts").insert({
        business_id: businessId,
        name: form.name, bank_name: form.bank_name || null,
        account_number: form.account_number || null, ifsc_code: form.ifsc_code || null,
        opening_balance: Number(form.opening_balance) || 0,
        current_balance: Number(form.opening_balance) || 0,
      });
      if (error) { toast.error("Failed to add account"); } else { toast.success("Bank account added"); setShowForm(false); fetchAccounts(); }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const supabase = createClient();
    await supabase.from("bank_accounts").update({ is_active: false }).eq("id", id);
    toast.success("Account removed");
    fetchAccounts();
  };

  const totalBalance = accounts.reduce((s, a) => s + (a.current_balance || 0), 0);

  return (
    <div className="space-y-6 max-w-3xl">
      <Breadcrumb items={[{ label: "Accounting", href: "/accounting" }, { label: "Bank Accounts" }]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bank Accounts</h1>
          <p className="text-sm text-muted-foreground">
            {accounts.length} account{accounts.length !== 1 ? "s" : ""} · Total: ₹{totalBalance.toLocaleString("en-IN")}
          </p>
        </div>
        {tableExists && (
          <Button onClick={startAdd} className="gap-2 rounded-full">
            <Plus className="h-4 w-4" /> Add Account
          </Button>
        )}
      </div>

      {!tableExists && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 dark:text-amber-300">Database setup required</p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                Run the following SQL in your Supabase project to enable bank accounts:
              </p>
              <pre className="mt-3 p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-xs text-amber-900 dark:text-amber-200 overflow-x-auto whitespace-pre-wrap">{`CREATE TABLE bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  bank_name text,
  account_number text,
  ifsc_code text,
  opening_balance numeric DEFAULT 0,
  current_balance numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business_access" ON bank_accounts
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));`}</pre>
              <Button variant="outline" size="sm" className="mt-3" onClick={fetchAccounts}>
                <CheckCircle className="h-4 w-4 mr-2" /> I've run the SQL, try again
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading && tableExists && (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      )}

      {!loading && tableExists && accounts.length === 0 && !showForm && (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
          <Building2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="font-semibold text-foreground">No bank accounts yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add your current and savings accounts to track balances</p>
          <Button onClick={startAdd} className="mt-4 gap-2 rounded-full"><Plus className="h-4 w-4" /> Add First Account</Button>
        </div>
      )}

      {/* Account cards */}
      {!loading && tableExists && accounts.length > 0 && (
        <div className="space-y-3">
          {accounts.map((acc) => (
            <div key={acc.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
                <CreditCard className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{acc.name}</p>
                <p className="text-xs text-muted-foreground">
                  {acc.bank_name && `${acc.bank_name} · `}
                  {acc.account_number ? `****${acc.account_number.slice(-4)}` : "No account number"}
                  {acc.ifsc_code && ` · ${acc.ifsc_code}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-foreground">₹{(acc.current_balance || 0).toLocaleString("en-IN")}</p>
                <p className="text-xs text-muted-foreground">Opening: ₹{(acc.opening_balance || 0).toLocaleString("en-IN")}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => startEdit(acc)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <Edit2 className="h-4 w-4" />
                </button>
                <button onClick={() => handleDelete(acc.id)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-500 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && tableExists && (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-foreground">{editing ? "Edit Account" : "Add Bank Account"}</h3>
            <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Account Name *</label>
              <Input placeholder="e.g. HDFC Current Account" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Bank Name</label>
              <Input placeholder="e.g. HDFC Bank" value={form.bank_name || ""} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Account Number</label>
              <Input placeholder="Account number" value={form.account_number || ""} onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">IFSC Code</label>
              <Input placeholder="HDFC0001234" value={form.ifsc_code || ""} onChange={(e) => setForm({ ...form, ifsc_code: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Opening Balance (₹)</label>
              <Input type="number" min={0} placeholder="0" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })} />
            </div>
            {editing && (
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Current Balance (₹)</label>
                <Input type="number" min={0} placeholder="0" value={form.current_balance} onChange={(e) => setForm({ ...form, current_balance: Number(e.target.value) })} />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save Changes" : "Add Account"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Plus, Trash2, Edit2, Check, X, Loader2, Tag, Sparkles } from "lucide-react";

interface Category {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
}

const DEFAULT_CATEGORIES = [
  { name: "Rent", description: "Office / shop rent" },
  { name: "Salaries", description: "Employee salaries and wages" },
  { name: "Utilities", description: "Electricity, water, internet" },
  { name: "Transport", description: "Freight, delivery, travel" },
  { name: "Marketing", description: "Ads, promotions, printing" },
  { name: "Repairs", description: "Equipment and premises repairs" },
  { name: "Office Supplies", description: "Stationery and consumables" },
  { name: "Petty Cash", description: "Small miscellaneous expenses" },
  { name: "Bank Charges", description: "Bank fees, interest, EMI" },
  { name: "Other", description: "Miscellaneous" },
];

export default function ExpenseCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("expense_categories")
      .select("*")
      .order("name");
    if (data) setCategories(data);
    setLoading(false);
  };

  const seedDefaults = async () => {
    setSeeding(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: userData } = await supabase.from("users").select("business_id").eq("id", user.id).single();
    if (!userData?.business_id) return;

    await Promise.all(
      DEFAULT_CATEGORIES.map(cat =>
        supabase.from("expense_categories").upsert(
          { business_id: userData.business_id, name: cat.name, description: cat.description, is_default: true },
          { onConflict: "business_id,name" }
        )
      )
    );

    await fetchCategories();
    setSeeding(false);
  };

  const addCategory = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: userData } = await supabase.from("users").select("business_id").eq("id", user.id).single();

    await supabase.from("expense_categories").insert({
      business_id: userData?.business_id,
      name: newName.trim(),
      description: newDesc.trim() || null,
    });

    setNewName("");
    setNewDesc("");
    setShowAdd(false);
    await fetchCategories();
    setAdding(false);
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return;
    const supabase = createClient();
    await supabase.from("expense_categories")
      .update({ name: editName.trim(), description: editDesc.trim() || null })
      .eq("id", id);
    setEditingId(null);
    await fetchCategories();
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Delete this category? Existing expenses using it will remain but lose the category link.")) return;
    const supabase = createClient();
    await supabase.from("expense_categories").delete().eq("id", id);
    setCategories(prev => prev.filter(c => c.id !== id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Link href="/expenses" className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Expense Categories</h1>
          <p className="text-sm text-muted-foreground">Organize your expenses for P&L reporting</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {categories.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <Tag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">No categories yet</p>
          <button
            onClick={seedDefaults}
            disabled={seeding}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {seeding ? "Setting up..." : "Add Default Categories"}
          </button>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-3">
          <h3 className="font-medium text-sm">New Category</h3>
          <input
            type="text"
            placeholder="Category name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex gap-2">
            <button
              onClick={addCategory}
              disabled={adding || !newName.trim()}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Save
            </button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Category list */}
      {categories.length > 0 && (
        <div className="space-y-2">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-card border border-border rounded-xl p-4">
              {editingId === cat.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none"
                  />
                  <input
                    type="text"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Description"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(cat.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 text-muted-foreground hover:bg-muted rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{cat.name}</p>
                      {cat.is_default && (
                        <span className="text-xs px-1.5 py-0.5 bg-muted text-muted-foreground rounded">default</span>
                      )}
                    </div>
                    {cat.description && <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingId(cat.id); setEditName(cat.name); setEditDesc(cat.description || ""); }}
                      className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteCategory(cat.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {categories.length > 0 && (
        <button
          onClick={seedDefaults}
          disabled={seeding}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
        >
          {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {seeding ? "Adding..." : "Reset to default categories"}
        </button>
      )}
    </div>
  );
}

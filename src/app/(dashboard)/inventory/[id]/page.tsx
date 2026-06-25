"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Loader2,
  Package,
  Plus,
  Minus,
  Save,
  X,
} from "lucide-react";

interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  description?: string;
  hsn_code?: string;
  unit: string;
  unit_price: number;
  current_stock: number;
  reorder_level: number;
  gst_rate: number;
}

export default function InventoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<InventoryItem>>({});

  useEffect(() => {
    fetchItem();
  }, [params.id]);

  const fetchItem = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("id", params.id)
      .single();

    if (data) {
      setItem(data);
      setEditForm(data);
    }
    setLoading(false);
  };

  const startEditing = () => {
    if (item) {
      setEditForm({ ...item });
      setEditing(true);
    }
  };

  const cancelEditing = () => {
    setEditing(false);
    if (item) setEditForm({ ...item });
  };

  const saveChanges = async () => {
    if (!item) return;
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("inventory_items")
      .update({
        name: editForm.name,
        sku: editForm.sku || null,
        description: editForm.description || null,
        hsn_code: editForm.hsn_code || null,
        unit: editForm.unit,
        unit_price: editForm.unit_price,
        current_stock: editForm.current_stock,
        reorder_level: editForm.reorder_level,
        gst_rate: editForm.gst_rate,
      })
      .eq("id", item.id);

    if (!error) {
      setItem({ ...item, ...editForm } as InventoryItem);
      setEditing(false);
    }
    setSaving(false);
  };

  const adjustStock = async (delta: number) => {
    if (!item) return;
    setAdjusting(true);

    const newStock = Math.max(0, item.current_stock + delta);
    const supabase = createClient();
    await supabase
      .from("inventory_items")
      .update({ current_stock: newStock })
      .eq("id", item.id);

    setItem({ ...item, current_stock: newStock });
    setEditForm({ ...editForm, current_stock: newStock });
    setAdjusting(false);
  };

  const deleteItem = async () => {
    if (!item || !confirm("Are you sure you want to delete this item?")) return;

    const supabase = createClient();
    await supabase.from("inventory_items").delete().eq("id", item.id);
    router.push("/inventory");
  };

  const getStockStatus = () => {
    if (!item) return "good";
    if (item.current_stock === 0) return "out";
    if (item.current_stock <= item.reorder_level) return "low";
    return "good";
  };

  const getStatusStyle = () => {
    const status = getStockStatus();
    switch (status) {
      case "good":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "low":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "out":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    }
  };

  const getStatusLabel = () => {
    const status = getStockStatus();
    switch (status) {
      case "good":
        return "In Stock";
      case "low":
        return "Low Stock";
      case "out":
        return "Out of Stock";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="text-center py-20">
        <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-lg font-semibold">Item not found</h2>
        <Link href="/inventory" className="text-primary hover:underline mt-2 inline-block">
          Back to inventory
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/inventory"
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              {editing ? (
                <input
                  type="text"
                  value={editForm.name || ""}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="text-2xl font-bold bg-transparent border-b-2 border-primary focus:outline-none"
                />
              ) : (
                <h1 className="text-2xl font-bold text-foreground">{item.name}</h1>
              )}
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${getStatusStyle()}`}>
                {getStatusLabel()}
              </span>
            </div>
            {editing ? (
              <input
                type="text"
                value={editForm.sku || ""}
                onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                placeholder="SKU (optional)"
                className="text-sm text-muted-foreground bg-transparent border-b border-muted focus:outline-none focus:border-primary mt-1"
              />
            ) : (
              item.sku && <p className="text-muted-foreground">SKU: {item.sku}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {editing ? (
            <>
              <button
                onClick={cancelEditing}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-muted transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={saveChanges}
                disabled={saving}
                className="p-2.5 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startEditing}
                className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-muted transition-colors"
              >
                <Edit className="w-5 h-5" />
              </button>
              <button
                onClick={deleteItem}
                className="p-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stock Adjustment */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground mb-4">Stock Level</h2>
        <div className="flex items-center justify-between">
          <div>
            {editing ? (
              <input
                type="number"
                value={editForm.current_stock || 0}
                onChange={(e) => setEditForm({ ...editForm, current_stock: parseInt(e.target.value) || 0 })}
                className="text-4xl font-bold bg-transparent border-b-2 border-primary focus:outline-none w-32"
              />
            ) : (
              <p className="text-4xl font-bold text-foreground">{item.current_stock}</p>
            )}
            {editing ? (
              <input
                type="text"
                value={editForm.unit || ""}
                onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                className="text-sm text-muted-foreground bg-transparent border-b border-muted focus:outline-none focus:border-primary"
                placeholder="Unit (e.g., pcs, kg)"
              />
            ) : (
              <p className="text-sm text-muted-foreground">{item.unit}</p>
            )}
          </div>
          {!editing && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => adjustStock(-1)}
                disabled={adjusting || item.current_stock === 0}
                className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
              >
                <Minus className="w-5 h-5" />
              </button>
              <button
                onClick={() => adjustStock(1)}
                disabled={adjusting}
                className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
          {editing ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Reorder level:</span>
              <input
                type="number"
                value={editForm.reorder_level || 0}
                onChange={(e) => setEditForm({ ...editForm, reorder_level: parseInt(e.target.value) || 0 })}
                className="w-20 px-2 py-1 bg-muted rounded-lg text-sm"
              />
              <span className="text-sm text-muted-foreground">{editForm.unit}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Reorder level: <span className="font-medium text-foreground">{item.reorder_level} {item.unit}</span>
            </p>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground mb-4">Item Details</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Unit Price</p>
            {editing ? (
              <div className="flex items-center gap-1">
                <span className="text-lg">₹</span>
                <input
                  type="number"
                  value={editForm.unit_price || 0}
                  onChange={(e) => setEditForm({ ...editForm, unit_price: parseFloat(e.target.value) || 0 })}
                  className="text-lg font-semibold bg-transparent border-b border-muted focus:outline-none focus:border-primary w-24"
                />
              </div>
            ) : (
              <p className="text-lg font-semibold text-foreground">₹{item.unit_price}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">GST Rate</p>
            {editing ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={editForm.gst_rate || 0}
                  onChange={(e) => setEditForm({ ...editForm, gst_rate: parseFloat(e.target.value) || 0 })}
                  className="text-lg font-semibold bg-transparent border-b border-muted focus:outline-none focus:border-primary w-16"
                />
                <span className="text-lg">%</span>
              </div>
            ) : (
              <p className="text-lg font-semibold text-foreground">{item.gst_rate}%</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">HSN Code</p>
            {editing ? (
              <input
                type="text"
                value={editForm.hsn_code || ""}
                onChange={(e) => setEditForm({ ...editForm, hsn_code: e.target.value })}
                placeholder="Enter HSN code"
                className="text-lg font-semibold font-mono bg-transparent border-b border-muted focus:outline-none focus:border-primary"
              />
            ) : (
              <p className="text-lg font-semibold text-foreground font-mono">{item.hsn_code || "-"}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Total Value</p>
            <p className="text-lg font-semibold text-foreground">
              ₹{((editing ? editForm.current_stock || 0 : item.current_stock) * (editing ? editForm.unit_price || 0 : item.unit_price)).toLocaleString("en-IN")}
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
          <p className="text-xs text-muted-foreground mb-1">Description</p>
          {editing ? (
            <textarea
              value={editForm.description || ""}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              placeholder="Add a description..."
              rows={3}
              className="w-full px-3 py-2 bg-muted rounded-lg text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
          ) : (
            <p className="text-foreground">{item.description || "No description"}</p>
          )}
        </div>
      </div>
    </div>
  );
}

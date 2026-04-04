"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Save,
  Building2,
} from "lucide-react";
import { isIntraState } from "@/types/database";
import type { Supplier } from "@/types/database";

interface PurchaseItem {
  description: string;
  hsn_code: string;
  quantity: number;
  unit: string;
  rate: number;
  gst_rate: number;
}

export default function NewPurchasePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSupplierId = searchParams.get("supplier");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [businessGstin, setBusinessGstin] = useState<string | null>(null);
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState(new Date().toISOString().split("T")[0]);
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([
    { description: "", hsn_code: "", quantity: 1, unit: "pcs", rate: 0, gst_rate: 18 },
  ]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (preselectedSupplierId && suppliers.length > 0) {
      const supplier = suppliers.find((s) => s.id === preselectedSupplierId);
      if (supplier) {
        setSelectedSupplier(supplier);
        // Set default due date based on payment terms
        const due = new Date();
        due.setDate(due.getDate() + (supplier.payment_terms || 30));
        setDueDate(due.toISOString().split("T")[0]);
      }
    }
  }, [preselectedSupplierId, suppliers]);

  const fetchData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (!userData?.business_id) return;

    // Fetch business GSTIN
    const { data: business } = await supabase
      .from("businesses")
      .select("gstin")
      .eq("id", userData.business_id)
      .single();

    if (business) setBusinessGstin(business.gstin);

    // Fetch suppliers
    const { data: suppliersData } = await supabase
      .from("suppliers")
      .select("*")
      .eq("business_id", userData.business_id)
      .eq("is_active", true)
      .order("name");

    if (suppliersData) setSuppliers(suppliersData);

    // Set default due date
    const due = new Date();
    due.setDate(due.getDate() + 30);
    setDueDate(due.toISOString().split("T")[0]);

    setLoading(false);
  };

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    setSelectedSupplier(supplier || null);
    if (supplier) {
      const due = new Date();
      due.setDate(due.getDate() + (supplier.payment_terms || 30));
      setDueDate(due.toISOString().split("T")[0]);
    }
  };

  const addItem = () => {
    setItems([
      ...items,
      { description: "", hsn_code: "", quantity: 1, unit: "pcs", rate: 0, gst_rate: 18 },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof PurchaseItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let totalGst = 0;

    items.forEach((item) => {
      const amount = item.quantity * item.rate;
      subtotal += amount;
      totalGst += (amount * item.gst_rate) / 100;
    });

    const intraState = isIntraState(businessGstin, selectedSupplier?.gstin);

    if (intraState) {
      return {
        subtotal,
        cgst: totalGst / 2,
        sgst: totalGst / 2,
        igst: 0,
        total: subtotal + totalGst,
        isIntraState: true,
      };
    } else {
      return {
        subtotal,
        cgst: 0,
        sgst: 0,
        igst: totalGst,
        total: subtotal + totalGst,
        isIntraState: false,
      };
    }
  };

  const handleSubmit = async () => {
    if (!billNumber) {
      setError("Bill number is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: userData } = await supabase
        .from("users")
        .select("business_id")
        .eq("id", user.id)
        .single();

      if (!userData?.business_id) throw new Error("No business found");

      const totals = calculateTotals();

      // Create purchase invoice
      const { data: purchase, error: purchaseError } = await supabase
        .from("purchase_invoices")
        .insert({
          business_id: userData.business_id,
          supplier_id: selectedSupplier?.id || null,
          supplier_name: selectedSupplier?.name || null,
          bill_number: billNumber,
          bill_date: billDate,
          due_date: dueDate || null,
          subtotal: totals.subtotal,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          total: totals.total,
          status: "pending",
          notes,
        })
        .select()
        .single();

      if (purchaseError) throw purchaseError;

      // Create purchase items
      const purchaseItems = items.map((item) => {
        const itemGst = (item.quantity * item.rate * item.gst_rate) / 100;
        return {
          purchase_invoice_id: purchase.id,
          description: item.description,
          hsn_code: item.hsn_code || null,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          gst_rate: item.gst_rate,
          cgst: totals.isIntraState ? itemGst / 2 : 0,
          sgst: totals.isIntraState ? itemGst / 2 : 0,
          igst: totals.isIntraState ? 0 : itemGst,
          amount: item.quantity * item.rate * (1 + item.gst_rate / 100),
        };
      });

      const { error: itemsError } = await supabase
        .from("purchase_invoice_items")
        .insert(purchaseItems);

      if (itemsError) throw itemsError;

      // Update inventory stock (add purchased items)
      for (const item of items) {
        if (!item.description) continue;

        // Find matching inventory item
        const { data: invItem } = await supabase
          .from("inventory_items")
          .select("id, current_stock")
          .eq("business_id", userData.business_id)
          .ilike("name", item.description)
          .maybeSingle();

        if (invItem) {
          // Update stock
          await supabase
            .from("inventory_items")
            .update({ current_stock: invItem.current_stock + item.quantity })
            .eq("id", invItem.id);
        }
      }

      router.push(`/purchases/${purchase.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create purchase");
    } finally {
      setSaving(false);
    }
  };

  const totals = calculateTotals();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/purchases"
          className="p-2 rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Record Purchase</h1>
          <p className="text-muted-foreground mt-1">Add a bill from a supplier</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Bill Details */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">Bill Details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-sm font-medium text-foreground">Supplier</label>
                <div className="flex gap-2">
                  <select
                    value={selectedSupplier?.id || ""}
                    onChange={(e) => handleSupplierChange(e.target.value)}
                    className="flex-1 bg-secondary border-none rounded-xl px-4 py-3 text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    <option value="">Select supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name} {supplier.business_name ? `(${supplier.business_name})` : ""}
                      </option>
                    ))}
                  </select>
                  <Link
                    href="/suppliers/new"
                    className="p-3 bg-muted rounded-xl hover:bg-muted/80 transition-colors"
                    title="Add new supplier"
                  >
                    <Plus className="w-5 h-5" />
                  </Link>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Bill Number *</label>
                <input
                  type="text"
                  placeholder="INV-001"
                  value={billNumber}
                  onChange={(e) => setBillNumber(e.target.value)}
                  className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Bill Date</label>
                <input
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                  className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Items</h2>
              <button
                onClick={addItem}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            </div>
            <div className="space-y-4">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="p-4 bg-muted/50 rounded-xl space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <input
                      type="text"
                      placeholder="Item description"
                      value={item.description}
                      onChange={(e) => updateItem(index, "description", e.target.value)}
                      className="flex-1 bg-white dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <button
                      onClick={() => removeItem(index)}
                      className="p-2 text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <input
                      type="text"
                      placeholder="HSN"
                      value={item.hsn_code}
                      onChange={(e) => updateItem(index, "hsn_code", e.target.value)}
                      className="bg-white dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", Number(e.target.value))}
                      className="bg-white dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <input
                      type="number"
                      placeholder="Rate"
                      value={item.rate}
                      onChange={(e) => updateItem(index, "rate", Number(e.target.value))}
                      className="bg-white dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                    <select
                      value={item.gst_rate}
                      onChange={(e) => updateItem(index, "gst_rate", Number(e.target.value))}
                      className="bg-white dark:bg-slate-900 border-none rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                      <option value={0}>0% GST</option>
                      <option value={5}>5% GST</option>
                      <option value={12}>12% GST</option>
                      <option value={18}>18% GST</option>
                      <option value={28}>28% GST</option>
                    </select>
                    <div className="text-right font-medium text-foreground py-2">
                      ₹{(item.quantity * item.rate).toLocaleString("en-IN")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">Notes</h2>
            <textarea
              placeholder="Additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none resize-none"
            />
          </div>
        </div>

        {/* Summary Sidebar */}
        <div className="space-y-6">
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm sticky top-24">
            <h2 className="text-lg font-semibold text-foreground mb-4">Summary</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-foreground">₹{totals.subtotal.toLocaleString("en-IN")}</span>
              </div>
              {totals.isIntraState ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">CGST</span>
                    <span className="text-foreground">₹{totals.cgst.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">SGST</span>
                    <span className="text-foreground">₹{totals.sgst.toLocaleString("en-IN")}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">IGST</span>
                  <span className="text-foreground">₹{totals.igst.toLocaleString("en-IN")}</span>
                </div>
              )}
              {!totals.isIntraState && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Inter-state purchase (IGST)
                </p>
              )}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex justify-between">
                <span className="font-semibold text-foreground">Total</span>
                <span className="font-bold text-lg text-foreground">
                  ₹{totals.total.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={saving || !billNumber || items.every((i) => !i.description)}
              className="w-full mt-6 py-3 bg-gradient-to-br from-primary to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Purchase
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

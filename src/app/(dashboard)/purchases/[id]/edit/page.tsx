"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import { isIntraState } from "@/types/database";
import type { Supplier, PurchaseInvoice, PurchaseInvoiceItem } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface EditItem {
  id?: string; // existing item id, undefined for new items
  description: string;
  hsn_code: string;
  quantity: number;
  unit: string;
  rate: number;
  gst_rate: number;
}

export default function EditPurchasePage() {
  const params = useParams();
  const router = useRouter();
  const purchaseId = params.id as string;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [businessGstin, setBusinessGstin] = useState<string | null>(null);
  const [billNumber, setBillNumber] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierGstin, setSupplierGstin] = useState("");
  const [billDate, setBillDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<EditItem[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [originalPurchase, setOriginalPurchase] = useState<PurchaseInvoice | null>(null);
  const [deletedItemIds, setDeletedItemIds] = useState<string[]>([]);
  const [suggestingHsn, setSuggestingHsn] = useState<Record<number, boolean>>({});
  const [businessId, setBusinessId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [purchaseId]);

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
    setBusinessId(userData.business_id);

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

    // Fetch the purchase invoice
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchase_invoices")
      .select("*")
      .eq("id", purchaseId)
      .single();

    if (purchaseError || !purchase) {
      router.push("/purchases");
      return;
    }

    setOriginalPurchase(purchase);
    setBillNumber(purchase.bill_number);
    setSupplierName(purchase.supplier_name || "");
    setBillDate(purchase.bill_date);
    setDueDate(purchase.due_date || "");
    setNotes(purchase.notes || "");

    // Set supplier
    if (purchase.supplier_id && suppliersData) {
      const sup = suppliersData.find((s) => s.id === purchase.supplier_id);
      if (sup) {
        setSelectedSupplier(sup);
        setSupplierGstin(sup.gstin || "");
      }
    }

    // Fetch items
    const { data: itemsData } = await supabase
      .from("purchase_invoice_items")
      .select("*")
      .eq("purchase_invoice_id", purchaseId);

    if (itemsData && itemsData.length > 0) {
      setItems(
        itemsData.map((item) => ({
          id: item.id,
          description: item.description,
          hsn_code: item.hsn_code || "",
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          gst_rate: item.gst_rate,
        }))
      );
    } else {
      setItems([{ description: "", hsn_code: "", quantity: 1, unit: "pcs", rate: 0, gst_rate: 18 }]);
    }

    setLoading(false);
  };

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    setSelectedSupplier(supplier || null);
    if (supplier) {
      setSupplierName(supplier.name);
      if (supplier.gstin) setSupplierGstin(supplier.gstin);
    }
  };

  const addItem = () => {
    setItems([...items, { description: "", hsn_code: "", quantity: 1, unit: "pcs", rate: 0, gst_rate: 18 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      const removed = items[index];
      if (removed.id) {
        setDeletedItemIds((prev) => [...prev, removed.id!]);
      }
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof EditItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSuggestHsn = async (index: number) => {
    const item = items[index];
    if (!item.description || !item.description.trim()) return;

    setSuggestingHsn((prev) => ({ ...prev, [index]: true }));
    try {
      const res = await fetch("/api/suggest-hsn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: item.description }),
      });
      const data = await res.json();
      if (data.data) {
        if (data.data.hsn_code) updateItem(index, "hsn_code", data.data.hsn_code);
        if (data.data.gst_rate !== undefined) updateItem(index, "gst_rate", data.data.gst_rate);
      }
    } catch (err) {
      console.error("Failed to suggest HSN:", err);
    } finally {
      setSuggestingHsn((prev) => ({ ...prev, [index]: false }));
    }
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let totalGst = 0;

    items.forEach((item) => {
      const amount = item.quantity * item.rate;
      subtotal += amount;
      totalGst += (amount * item.gst_rate) / 100;
    });

    const effectiveGstin = supplierGstin || selectedSupplier?.gstin;
    const intra = isIntraState(businessGstin, effectiveGstin || null);

    return intra
      ? { subtotal, cgst: totalGst / 2, sgst: totalGst / 2, igst: 0, total: subtotal + totalGst, isIntraState: true }
      : { subtotal, cgst: 0, sgst: 0, igst: totalGst, total: subtotal + totalGst, isIntraState: false };
  };

  const handleSave = async () => {
    if (!billNumber) { setError("Bill number is required"); return; }
    if (!businessId) { setError("No business found"); return; }

    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      const totals = calculateTotals();

      // Update purchase invoice
      const { error: updateError } = await supabase
        .from("purchase_invoices")
        .update({
          bill_number: billNumber,
          supplier_id: selectedSupplier?.id || originalPurchase?.supplier_id || null,
          supplier_name: supplierName || originalPurchase?.supplier_name || null,
          bill_date: billDate,
          due_date: dueDate || null,
          subtotal: totals.subtotal,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          total: totals.total,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", purchaseId);

      if (updateError) throw updateError;

      // Delete removed items
      if (deletedItemIds.length > 0) {
        await supabase
          .from("purchase_invoice_items")
          .delete()
          .in("id", deletedItemIds);
      }

      // Upsert items (update existing, insert new)
      for (const item of items) {
        if (!item.description) continue;

        const itemGst = (item.quantity * item.rate * item.gst_rate) / 100;
        const itemData = {
          purchase_invoice_id: purchaseId,
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

        if (item.id) {
          // Update existing
          await supabase
            .from("purchase_invoice_items")
            .update(itemData)
            .eq("id", item.id);
        } else {
          // Insert new
          await supabase
            .from("purchase_invoice_items")
            .insert(itemData);
        }
      }

      router.push(`/purchases/${purchaseId}`);
    } catch (err: any) {
      setError(err.message || "Failed to update purchase");
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
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/purchases/${purchaseId}`}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Edit Purchase</h1>
            <p className="text-muted-foreground mt-1">
              #{billNumber || originalPurchase?.bill_number} — {supplierName || "Unknown Supplier"}
            </p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="rounded-full px-5 shadow-lg shadow-primary/20"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Supplier & Details */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Bill Details</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Supplier</label>
            <select
              value={selectedSupplier?.id || ""}
              onChange={(e) => handleSupplierChange(e.target.value)}
              className="w-full h-8 px-2.5 rounded-xs border border-input bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select existing or type new below</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.gstin ? `(${s.gstin})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Supplier Name</label>
            <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Supplier GSTIN</label>
            <Input
              value={supplierGstin}
              onChange={(e) => setSupplierGstin(e.target.value.toUpperCase())}
              maxLength={15}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Bill Number *</label>
            <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Bill Date</label>
            <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Due Date</label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Line Items</h2>
          <Button variant="outline" size="sm" onClick={addItem} className="rounded-md">
            <Plus className="w-4 h-4 mr-1" />
            Add Item
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Description</th>
                <th className="text-left px-2 py-2.5 font-medium text-muted-foreground text-xs w-24">HSN</th>
                <th className="text-right px-2 py-2.5 font-medium text-muted-foreground text-xs w-16">Qty</th>
                <th className="text-left px-2 py-2.5 font-medium text-muted-foreground text-xs w-16">Unit</th>
                <th className="text-right px-2 py-2.5 font-medium text-muted-foreground text-xs w-20">Rate</th>
                <th className="text-right px-2 py-2.5 font-medium text-muted-foreground text-xs w-16">GST%</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs w-24">Amount</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item, index) => {
                const amount = item.quantity * item.rate * (1 + item.gst_rate / 100);
                return (
                  <tr key={index} className="group">
                    <td className="px-4 py-2">
                      <Input
                        value={item.description}
                        onChange={(e) => updateItem(index, "description", e.target.value)}
                        onBlur={() => {
                          if (item.description && !item.hsn_code) handleSuggestHsn(index);
                        }}
                        placeholder="Item description"
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <Input
                          value={item.hsn_code}
                          onChange={(e) => updateItem(index, "hsn_code", e.target.value)}
                          placeholder="HSN"
                          className="h-7 text-xs font-mono"
                        />
                        <button
                          onClick={() => handleSuggestHsn(index)}
                          disabled={suggestingHsn[index]}
                          className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors shrink-0"
                          title="AI suggest HSN"
                        >
                          {suggestingHsn[index] ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-right"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={item.unit}
                        onChange={(e) => updateItem(index, "unit", e.target.value)}
                        className="h-7 w-full rounded-xs border border-input bg-transparent px-1 text-xs"
                      >
                        <option value="pcs">pcs</option>
                        <option value="kg">kg</option>
                        <option value="g">g</option>
                        <option value="l">litre</option>
                        <option value="ml">ml</option>
                        <option value="m">metre</option>
                        <option value="cm">cm</option>
                        <option value="ft">ft</option>
                        <option value="box">box</option>
                        <option value="set">set</option>
                        <option value="nos">nos</option>
                        <option value="pair">pair</option>
                        <option value="sqft">sqft</option>
                        <option value="hour">hour</option>
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        value={item.rate}
                        onChange={(e) => updateItem(index, "rate", parseFloat(e.target.value) || 0)}
                        className="h-7 text-xs text-right"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={item.gst_rate}
                        onChange={(e) => updateItem(index, "gst_rate", parseInt(e.target.value))}
                        className="h-7 w-full rounded-xs border border-input bg-transparent px-1 text-xs"
                      >
                        <option value={0}>0%</option>
                        <option value={5}>5%</option>
                        <option value={12}>12%</option>
                        <option value={18}>18%</option>
                        <option value={28}>28%</option>
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-xs">
                      ₹{amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-2">
                      {items.length > 1 && (
                        <button
                          onClick={() => removeItem(index)}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">Notes</h2>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional notes..."
          rows={3}
        />
      </div>

      {/* Summary */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Summary</h2>
        <div className="space-y-2 max-w-xs ml-auto">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>₹{totals.subtotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
          </div>
          {totals.isIntraState ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CGST</span>
                <span>₹{totals.cgst.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SGST</span>
                <span>₹{totals.sgst.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">IGST</span>
              <span>₹{totals.igst.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="border-t border-border pt-2 flex justify-between">
            <span className="font-semibold">Total</span>
            <span className="font-bold text-lg">₹{totals.total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="flex items-center justify-end gap-3 pb-8">
        <Link href={`/purchases/${purchaseId}`}>
          <Button variant="outline" className="rounded-md">Cancel</Button>
        </Link>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="rounded-full px-6 shadow-lg shadow-primary/20"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

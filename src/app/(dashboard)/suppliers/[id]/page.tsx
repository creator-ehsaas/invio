"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Loader2,
  Save,
  Trash2,
  Phone,
  Mail,
  MapPin,
  Building2,
  FileText,
  ShoppingCart,
} from "lucide-react";
import { INDIAN_STATES } from "@/types/database";
import type { Supplier, PurchaseInvoice } from "@/types/database";

export default function SupplierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    business_name: "",
    phone: "",
    email: "",
    gstin: "",
    pan: "",
    street: "",
    city: "",
    state: "",
    pincode: "",
    payment_terms: 30,
    notes: "",
  });

  useEffect(() => {
    fetchSupplier();
  }, [params.id]);

  const fetchSupplier = async () => {
    const supabase = createClient();

    const { data: supplierData, error: supplierError } = await supabase
      .from("suppliers")
      .select("*")
      .eq("id", params.id)
      .single();

    if (supplierError || !supplierData) {
      router.push("/suppliers");
      return;
    }

    setSupplier(supplierData);
    setFormData({
      name: supplierData.name || "",
      business_name: supplierData.business_name || "",
      phone: supplierData.phone || "",
      email: supplierData.email || "",
      gstin: supplierData.gstin || "",
      pan: supplierData.pan || "",
      street: supplierData.address?.street || "",
      city: supplierData.address?.city || "",
      state: supplierData.address?.state || "",
      pincode: supplierData.address?.pincode || "",
      payment_terms: supplierData.payment_terms || 30,
      notes: supplierData.notes || "",
    });

    // Fetch purchases from this supplier
    const { data: purchasesData } = await supabase
      .from("purchase_invoices")
      .select("*")
      .eq("supplier_id", params.id)
      .order("bill_date", { ascending: false })
      .limit(10);

    if (purchasesData) setPurchases(purchasesData);

    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("suppliers")
      .update({
        name: formData.name,
        business_name: formData.business_name || null,
        phone: formData.phone || null,
        email: formData.email || null,
        gstin: formData.gstin || null,
        pan: formData.pan || null,
        address: {
          street: formData.street || null,
          city: formData.city || null,
          state: formData.state || null,
          pincode: formData.pincode || null,
        },
        payment_terms: formData.payment_terms,
        notes: formData.notes || null,
      })
      .eq("id", params.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setEditMode(false);
      fetchSupplier();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this supplier? This action cannot be undone.")) {
      return;
    }

    const supabase = createClient();
    await supabase.from("suppliers").delete().eq("id", params.id);
    router.push("/suppliers");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!supplier) return null;

  const totalPurchases = purchases.reduce((sum, p) => sum + p.total, 0);
  const pendingAmount = purchases
    .filter((p) => p.status === "pending" || p.status === "partial")
    .reduce((sum, p) => sum + (p.total - p.amount_paid), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/suppliers"
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{supplier.name}</h1>
            {supplier.business_name && (
              <p className="text-muted-foreground mt-1">{supplier.business_name}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {editMode ? (
            <>
              <button
                onClick={() => setEditMode(false)}
                className="px-4 py-2 text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditMode(true)}
                className="px-4 py-2.5 bg-muted text-foreground font-medium rounded-xl hover:bg-muted/80 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="p-2.5 text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Contact Info */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">Contact Information</h2>
            {editMode ? (
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Contact Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Business Name</label>
                  <input
                    type="text"
                    value={formData.business_name}
                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                    className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">GSTIN</label>
                  <input
                    type="text"
                    value={formData.gstin}
                    onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                    maxLength={15}
                    className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground font-mono focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">PAN</label>
                  <input
                    type="text"
                    value={formData.pan}
                    onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                    maxLength={10}
                    className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground font-mono focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {supplier.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span>{supplier.phone}</span>
                  </div>
                )}
                {supplier.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span>{supplier.email}</span>
                  </div>
                )}
                {supplier.gstin && (
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="font-mono">{supplier.gstin}</span>
                  </div>
                )}
                {supplier.address?.street && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p>{supplier.address.street}</p>
                      {supplier.address.city && (
                        <p className="text-muted-foreground">
                          {supplier.address.city}
                          {supplier.address.state && `, ${supplier.address.state}`}
                          {supplier.address.pincode && ` - ${supplier.address.pincode}`}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Address (Edit Mode) */}
          {editMode && (
            <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground mb-4">Address</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Street</label>
                  <input
                    type="text"
                    value={formData.street}
                    onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                    className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">State</label>
                  <select
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((state) => (
                      <option key={state.code} value={state.code}>
                        {state.code} - {state.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Pincode</label>
                  <input
                    type="text"
                    value={formData.pincode}
                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                    maxLength={6}
                    className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Recent Purchases */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Recent Purchases</h2>
              <Link
                href={`/purchases/new?supplier=${supplier.id}`}
                className="text-sm text-primary font-medium hover:underline"
              >
                + New Purchase
              </Link>
            </div>
            {purchases.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingCart className="w-10 h-10 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No purchases recorded</p>
              </div>
            ) : (
              <div className="space-y-2">
                {purchases.map((purchase) => (
                  <Link
                    key={purchase.id}
                    href={`/purchases/${purchase.id}`}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors"
                  >
                    <div>
                      <p className="font-medium text-foreground">{purchase.bill_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(purchase.bill_date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">₹{purchase.total.toLocaleString("en-IN")}</p>
                      <p className={`text-xs ${
                        purchase.status === "paid" ? "text-emerald-600" : "text-amber-600"
                      }`}>
                        {purchase.status === "paid" ? "Paid" : `Due: ₹${(purchase.total - purchase.amount_paid).toLocaleString("en-IN")}`}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Stats */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">Summary</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Purchases</p>
                <p className="text-2xl font-bold text-foreground">₹{totalPurchases.toLocaleString("en-IN")}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Payment</p>
                <p className={`text-xl font-bold ${pendingAmount > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  ₹{pendingAmount.toLocaleString("en-IN")}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Payment Terms</p>
                <p className="font-medium text-foreground">
                  {supplier.payment_terms === 0 ? "Due on Receipt" : `Net ${supplier.payment_terms} days`}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">Actions</h2>
            <div className="space-y-2">
              <Link
                href={`/purchases/new?supplier=${supplier.id}`}
                className="w-full py-2.5 px-4 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <ShoppingCart className="w-4 h-4" />
                Record Purchase
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

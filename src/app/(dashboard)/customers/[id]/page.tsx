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
  Users,
  Phone,
  Mail,
  MapPin,
  Building,
  FileText,
  Save,
  X,
} from "lucide-react";

interface Customer {
  id: string;
  name: string;
  business_name?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  billing_address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});

  useEffect(() => {
    fetchCustomer();
  }, [params.id]);

  const fetchCustomer = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("id", params.id)
      .single();

    if (data) {
      setCustomer(data);
      setEditForm({
        ...data,
        billing_address: data.billing_address || { street: "", city: "", state: "", pincode: "" },
      });
    }
    setLoading(false);
  };

  const startEditing = () => {
    if (customer) {
      setEditForm({
        ...customer,
        billing_address: customer.billing_address || { street: "", city: "", state: "", pincode: "" },
      });
      setEditing(true);
    }
  };

  const cancelEditing = () => {
    setEditing(false);
    if (customer) {
      setEditForm({
        ...customer,
        billing_address: customer.billing_address || { street: "", city: "", state: "", pincode: "" },
      });
    }
  };

  const saveChanges = async () => {
    if (!customer) return;
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase
      .from("customers")
      .update({
        name: editForm.name,
        business_name: editForm.business_name || null,
        email: editForm.email || null,
        phone: editForm.phone || null,
        gstin: editForm.gstin || null,
        billing_address: editForm.billing_address,
      })
      .eq("id", customer.id);

    if (!error) {
      setCustomer({ ...customer, ...editForm } as Customer);
      setEditing(false);
    }
    setSaving(false);
  };

  const updateAddress = (field: string, value: string) => {
    setEditForm({
      ...editForm,
      billing_address: {
        ...editForm.billing_address,
        [field]: value,
      },
    });
  };

  const deleteCustomer = async () => {
    if (!customer || !confirm("Are you sure you want to delete this customer?")) return;

    const supabase = createClient();
    await supabase.from("customers").delete().eq("id", customer.id);
    router.push("/customers");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-20">
        <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-lg font-semibold">Customer not found</h2>
        <Link href="/customers" className="text-primary hover:underline mt-2 inline-block">
          Back to customers
        </Link>
      </div>
    );
  }

  const address = editing ? editForm.billing_address : customer.billing_address;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/customers"
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xl">
              {(editing ? editForm.name?.[0] : customer.name[0])?.toUpperCase() || "?"}
            </div>
            <div>
              {editing ? (
                <input
                  type="text"
                  value={editForm.name || ""}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="text-2xl font-bold bg-transparent border-b-2 border-primary focus:outline-none"
                  placeholder="Customer name"
                />
              ) : (
                <h1 className="text-2xl font-bold text-foreground">{customer.name}</h1>
              )}
              {editing ? (
                <input
                  type="text"
                  value={editForm.business_name || ""}
                  onChange={(e) => setEditForm({ ...editForm, business_name: e.target.value })}
                  className="text-sm text-muted-foreground bg-transparent border-b border-muted focus:outline-none focus:border-primary mt-1"
                  placeholder="Business name (optional)"
                />
              ) : (
                customer.business_name && (
                  <p className="text-muted-foreground">{customer.business_name}</p>
                )
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
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
                onClick={deleteCustomer}
                className="p-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Contact Info */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground mb-4">Contact Information</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Phone className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Phone</p>
              {editing ? (
                <input
                  type="tel"
                  value={editForm.phone || ""}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full bg-transparent border-b border-muted focus:outline-none focus:border-primary"
                  placeholder="Enter phone number"
                />
              ) : (
                <p className="text-foreground">{customer.phone || "-"}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Mail className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Email</p>
              {editing ? (
                <input
                  type="email"
                  value={editForm.email || ""}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full bg-transparent border-b border-muted focus:outline-none focus:border-primary"
                  placeholder="Enter email address"
                />
              ) : (
                <p className="text-foreground">{customer.email || "-"}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Building className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">GSTIN</p>
              {editing ? (
                <input
                  type="text"
                  value={editForm.gstin || ""}
                  onChange={(e) => setEditForm({ ...editForm, gstin: e.target.value.toUpperCase() })}
                  className="w-full bg-transparent border-b border-muted focus:outline-none focus:border-primary font-mono"
                  placeholder="Enter GSTIN"
                  maxLength={15}
                />
              ) : (
                <p className="text-foreground font-mono">{customer.gstin || "-"}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Address */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground mb-4">Billing Address</h2>
        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Street Address</label>
              <input
                type="text"
                value={address?.street || ""}
                onChange={(e) => updateAddress("street", e.target.value)}
                className="w-full px-3 py-2 bg-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Enter street address"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">City</label>
                <input
                  type="text"
                  value={address?.city || ""}
                  onChange={(e) => updateAddress("city", e.target.value)}
                  className="w-full px-3 py-2 bg-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="City"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">State</label>
                <input
                  type="text"
                  value={address?.state || ""}
                  onChange={(e) => updateAddress("state", e.target.value)}
                  className="w-full px-3 py-2 bg-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="State"
                />
              </div>
            </div>
            <div className="w-1/2">
              <label className="text-xs text-muted-foreground">Pincode</label>
              <input
                type="text"
                value={address?.pincode || ""}
                onChange={(e) => updateAddress("pincode", e.target.value)}
                className="w-full px-3 py-2 bg-muted rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Pincode"
                maxLength={6}
              />
            </div>
          </div>
        ) : address && (address.street || address.city) ? (
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <MapPin className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-foreground">
              {address.street && <p>{address.street}</p>}
              <p>
                {[address.city, address.state, address.pincode].filter(Boolean).join(", ")}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">No address added</p>
        )}
      </div>

      {/* Quick Actions */}
      {!editing && (
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h2>
          <Link
            href={`/invoices/new?customer=${customer.id}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-br from-primary to-blue-500 text-white font-medium rounded-xl hover:opacity-90 transition-all"
          >
            <FileText className="w-4 h-4" />
            Create Invoice for {customer.name}
          </Link>
        </div>
      )}
    </div>
  );
}

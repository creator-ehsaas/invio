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

    if (data) setCustomer(data);
    setLoading(false);
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

  const address = customer.billing_address;

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
              {customer.name[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{customer.name}</h1>
              {customer.business_name && (
                <p className="text-muted-foreground">{customer.business_name}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-muted transition-colors">
            <Edit className="w-5 h-5" />
          </button>
          <button
            onClick={deleteCustomer}
            className="p-2.5 rounded-xl border border-red-200 dark:border-red-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Contact Info */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground mb-4">Contact Information</h2>
        <div className="space-y-4">
          {customer.phone && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Phone className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="text-foreground">{customer.phone}</p>
              </div>
            </div>
          )}
          {customer.email && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Mail className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-foreground">{customer.email}</p>
              </div>
            </div>
          )}
          {customer.gstin && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <Building className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">GSTIN</p>
                <p className="text-foreground font-mono">{customer.gstin}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Address */}
      {address && (address.street || address.city) && (
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Billing Address</h2>
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
        </div>
      )}

      {/* Quick Actions */}
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
    </div>
  );
}

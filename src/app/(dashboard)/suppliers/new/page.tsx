"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { INDIAN_STATES } from "@/types/database";

export default function NewSupplierPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Not authenticated");
      setSaving(false);
      return;
    }

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (!userData?.business_id) {
      setError("No business found");
      setSaving(false);
      return;
    }

    const { data, error: insertError } = await supabase
      .from("suppliers")
      .insert({
        business_id: userData.business_id,
        name: formData.get("name") as string,
        business_name: formData.get("business_name") as string || null,
        email: formData.get("email") as string || null,
        phone: formData.get("phone") as string || null,
        gstin: formData.get("gstin") as string || null,
        pan: formData.get("pan") as string || null,
        address: {
          street: formData.get("street") as string || null,
          city: formData.get("city") as string || null,
          state: formData.get("state") as string || null,
          pincode: formData.get("pincode") as string || null,
        },
        bank_details: {
          account_number: formData.get("account_number") as string || null,
          ifsc: formData.get("ifsc") as string || null,
          bank_name: formData.get("bank_name") as string || null,
          branch: formData.get("branch") as string || null,
        },
        payment_terms: parseInt(formData.get("payment_terms") as string) || 30,
        notes: formData.get("notes") as string || null,
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    router.push("/suppliers");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/suppliers"
          className="p-2 rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Add Supplier</h1>
          <p className="text-muted-foreground mt-1">Add a new vendor or supplier</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Basic Information</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="name" className="text-sm font-medium text-foreground">
                Contact Name *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="John Doe"
                className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="business_name" className="text-sm font-medium text-foreground">
                Business Name
              </label>
              <input
                id="business_name"
                name="business_name"
                type="text"
                placeholder="ABC Enterprises Pvt Ltd"
                className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="phone" className="text-sm font-medium text-foreground">
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                placeholder="+91 98765 43210"
                className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="supplier@example.com"
                className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="gstin" className="text-sm font-medium text-foreground">
                GSTIN
              </label>
              <input
                id="gstin"
                name="gstin"
                type="text"
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none font-mono uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="pan" className="text-sm font-medium text-foreground">
                PAN
              </label>
              <input
                id="pan"
                name="pan"
                type="text"
                placeholder="AAAAA0000A"
                maxLength={10}
                className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none font-mono uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="payment_terms" className="text-sm font-medium text-foreground">
                Payment Terms (days)
              </label>
              <select
                id="payment_terms"
                name="payment_terms"
                defaultValue="30"
                className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
              >
                <option value="0">Due on Receipt</option>
                <option value="7">Net 7</option>
                <option value="15">Net 15</option>
                <option value="30">Net 30</option>
                <option value="45">Net 45</option>
                <option value="60">Net 60</option>
              </select>
            </div>
          </div>
        </div>

        {/* Address */}
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Address</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <label htmlFor="street" className="text-sm font-medium text-foreground">
                Street Address
              </label>
              <input
                id="street"
                name="street"
                type="text"
                placeholder="123 Main Street"
                className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="city" className="text-sm font-medium text-foreground">
                City
              </label>
              <input
                id="city"
                name="city"
                type="text"
                placeholder="Mumbai"
                className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="state" className="text-sm font-medium text-foreground">
                State
              </label>
              <select
                id="state"
                name="state"
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
              <label htmlFor="pincode" className="text-sm font-medium text-foreground">
                Pincode
              </label>
              <input
                id="pincode"
                name="pincode"
                type="text"
                placeholder="400001"
                maxLength={6}
                className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Bank Details */}
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Bank Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="bank_name" className="text-sm font-medium text-foreground">
                Bank Name
              </label>
              <input
                id="bank_name"
                name="bank_name"
                type="text"
                placeholder="HDFC Bank"
                className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="branch" className="text-sm font-medium text-foreground">
                Branch
              </label>
              <input
                id="branch"
                name="branch"
                type="text"
                placeholder="Main Branch"
                className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="account_number" className="text-sm font-medium text-foreground">
                Account Number
              </label>
              <input
                id="account_number"
                name="account_number"
                type="text"
                placeholder="00000000000000"
                className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="ifsc" className="text-sm font-medium text-foreground">
                IFSC Code
              </label>
              <input
                id="ifsc"
                name="ifsc"
                type="text"
                placeholder="HDFC0000001"
                maxLength={11}
                className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none font-mono uppercase"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Notes</h2>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Any additional notes about this supplier..."
            className="w-full px-4 py-3 bg-secondary border-none rounded-xl text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none resize-none"
          />
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Link
            href="/suppliers"
            className="px-6 py-2.5 text-muted-foreground hover:text-foreground font-medium transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Supplier
          </button>
        </div>
      </form>
    </div>
  );
}

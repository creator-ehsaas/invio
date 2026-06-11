"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LogoUpload } from "@/components/logo-upload";
import { ImageUpload } from "@/components/image-upload";
import { updateBusiness } from "./actions";
import type { Business } from "@/types/database";
import { INDIAN_STATES } from "@/types/database";

interface BusinessProfileFormProps {
  business: Business;
}

export function BusinessProfileForm({ business }: BusinessProfileFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(business.logo_url);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(business.signature_url);
  const [stampUrl, setStampUrl] = useState<string | null>(business.stamp_url);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);

    const result = await updateBusiness(business.id, {
      name: formData.get("name") as string,
      gstin: (formData.get("gstin") as string) || null,
      pan: (formData.get("pan") as string) || null,
      state_code: (formData.get("state_code") as string) || null,
      address: (formData.get("address") as string) || null,
      phone: (formData.get("phone") as string) || null,
      email: (formData.get("email") as string) || null,
      invoice_prefix: (formData.get("invoice_prefix") as string) || "INV",
      terms_conditions: (formData.get("terms_conditions") as string) || null,
      logo_url: logoUrl,
    });

    setLoading(false);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Logo, Signature, Stamp Uploads */}
      <div className="grid gap-6 md:grid-cols-3">
        <LogoUpload
          currentLogoUrl={logoUrl}
          businessId={business.id}
          onUpload={setLogoUrl}
        />
        <ImageUpload
          type="signature"
          label="Authorized Signature"
          description="Signature image for documents. PNG with transparent background recommended."
          currentUrl={signatureUrl}
          businessId={business.id}
          onUpload={setSignatureUrl}
        />
        <ImageUpload
          type="stamp"
          label="Company Stamp"
          description="Company seal/stamp for official documents. PNG with transparent background."
          currentUrl={stampUrl}
          businessId={business.id}
          onUpload={setStampUrl}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Business Name *</Label>
          <Input
            id="name"
            name="name"
            defaultValue={business.name}
            required
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="gstin">GSTIN</Label>
          <Input
            id="gstin"
            name="gstin"
            defaultValue={business.gstin || ""}
            placeholder="22AAAAA0000A1Z5"
            maxLength={15}
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pan">PAN</Label>
          <Input
            id="pan"
            name="pan"
            defaultValue={business.pan || ""}
            placeholder="AAAAA0000A"
            maxLength={10}
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="state_code">State</Label>
          <select
            id="state_code"
            name="state_code"
            defaultValue={business.state_code || ""}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            disabled={loading}
          >
            <option value="">Select state</option>
            {INDIAN_STATES.map((state) => (
              <option key={state.code} value={state.code}>
                {state.code} - {state.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={business.phone || ""}
            placeholder="+91 98765 43210"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={business.email || ""}
            placeholder="business@example.com"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="invoice_prefix">Invoice Prefix</Label>
          <Input
            id="invoice_prefix"
            name="invoice_prefix"
            defaultValue={business.invoice_prefix}
            placeholder="INV"
            maxLength={10}
            disabled={loading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Business Address</Label>
        <Textarea
          id="address"
          name="address"
          defaultValue={business.address || ""}
          placeholder="123 Main Street, City, State - 400001"
          rows={3}
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="terms_conditions">Default Terms & Conditions</Label>
        <Textarea
          id="terms_conditions"
          name="terms_conditions"
          defaultValue={business.terms_conditions || ""}
          placeholder="Payment due within 30 days..."
          rows={4}
          disabled={loading}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">Settings saved successfully!</p>}

      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}

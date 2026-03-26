"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBusiness } from "./actions";
import type { Business } from "@/types/database";

interface BankDetailsFormProps {
  business: Business;
}

export function BankDetailsForm({ business }: BankDetailsFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);

    const result = await updateBusiness(business.id, {
      bank_name: (formData.get("bank_name") as string) || null,
      bank_branch: (formData.get("bank_branch") as string) || null,
      bank_account_number: (formData.get("bank_account_number") as string) || null,
      bank_ifsc: (formData.get("bank_ifsc") as string) || null,
      upi_id: (formData.get("upi_id") as string) || null,
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
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bank_name">Bank Name</Label>
          <Input
            id="bank_name"
            name="bank_name"
            defaultValue={business.bank_name || ""}
            placeholder="State Bank of India"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bank_branch">Branch</Label>
          <Input
            id="bank_branch"
            name="bank_branch"
            defaultValue={business.bank_branch || ""}
            placeholder="Main Branch, Mumbai"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bank_account_number">Account Number</Label>
          <Input
            id="bank_account_number"
            name="bank_account_number"
            defaultValue={business.bank_account_number || ""}
            placeholder="1234567890123"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bank_ifsc">IFSC Code</Label>
          <Input
            id="bank_ifsc"
            name="bank_ifsc"
            defaultValue={business.bank_ifsc || ""}
            placeholder="SBIN0001234"
            maxLength={11}
            disabled={loading}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="upi_id">UPI ID</Label>
          <Input
            id="upi_id"
            name="upi_id"
            defaultValue={business.upi_id || ""}
            placeholder="business@upi"
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            Customers can pay directly via UPI using this ID
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-600">Bank details saved successfully!</p>}

      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Save Bank Details"}
      </Button>
    </form>
  );
}

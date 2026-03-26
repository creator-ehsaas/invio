"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Invoice, InvoiceItem } from "@/types/invoice";

interface InvoiceFormProps {
  invoice: Invoice;
  onChange: (invoice: Invoice) => void;
  onReset: () => void;
}

export function InvoiceForm({ invoice, onChange, onReset }: InvoiceFormProps) {
  const updateField = <K extends keyof Invoice>(
    field: K,
    value: Invoice[K]
  ) => {
    onChange({ ...invoice, [field]: value });
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number | null) => {
    const newItems = [...invoice.items];
    newItems[index] = { ...newItems[index], [field]: value };
    onChange({ ...invoice, items: newItems });
  };

  const formatCurrency = (value: number | null) => {
    if (value === null) return "";
    return `₹${value.toFixed(2)}`;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Extracted Invoice</CardTitle>
        <Button variant="outline" onClick={onReset}>
          Try Again
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Buyer Name */}
        <div className="space-y-2">
          <Label htmlFor="buyer_name">Buyer Name</Label>
          <Input
            id="buyer_name"
            value={invoice.buyer_name || ""}
            onChange={(e) => updateField("buyer_name", e.target.value || null)}
            placeholder="Not detected"
          />
        </div>

        {/* Items Table */}
        <div className="space-y-2">
          <Label>Items</Label>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Name</th>
                  <th className="px-3 py-2 text-left">Qty</th>
                  <th className="px-3 py-2 text-left">Unit</th>
                  <th className="px-3 py-2 text-left">Rate</th>
                  <th className="px-3 py-2 text-left">GST%</th>
                  <th className="px-3 py-2 text-left">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                      No items detected
                    </td>
                  </tr>
                ) : (
                  invoice.items.map((item, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-1 py-1">
                        <Input
                          value={item.name || ""}
                          onChange={(e) => updateItem(index, "name", e.target.value)}
                          className="h-8"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          value={item.quantity ?? ""}
                          onChange={(e) => updateItem(index, "quantity", e.target.value ? Number(e.target.value) : null)}
                          className="h-8 w-16"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          value={item.unit || ""}
                          onChange={(e) => updateItem(index, "unit", e.target.value)}
                          className="h-8 w-16"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          value={item.rate ?? ""}
                          onChange={(e) => updateItem(index, "rate", e.target.value ? Number(e.target.value) : null)}
                          className="h-8 w-20"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          value={item.gst_percent ?? ""}
                          onChange={(e) => updateItem(index, "gst_percent", e.target.value ? Number(e.target.value) : null)}
                          className="h-8 w-16"
                        />
                      </td>
                      <td className="px-3 py-1 text-right font-medium">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="subtotal">Subtotal</Label>
            <Input
              id="subtotal"
              value={invoice.subtotal ?? ""}
              onChange={(e) => updateField("subtotal", e.target.value ? Number(e.target.value) : null)}
              placeholder="₹0.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gst_amount">GST Amount</Label>
            <Input
              id="gst_amount"
              value={invoice.gst_amount ?? ""}
              onChange={(e) => updateField("gst_amount", e.target.value ? Number(e.target.value) : null)}
              placeholder="₹0.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="total">Total</Label>
            <Input
              id="total"
              value={invoice.total ?? ""}
              onChange={(e) => updateField("total", e.target.value ? Number(e.target.value) : null)}
              placeholder="₹0.00"
              className="font-bold"
            />
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            value={invoice.notes || ""}
            onChange={(e) => updateField("notes", e.target.value || null)}
            placeholder="No notes"
          />
        </div>
      </CardContent>
    </Card>
  );
}

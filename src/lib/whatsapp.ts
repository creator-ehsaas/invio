interface InvoiceForMessage {
  invoice_number: string;
  customer_name: string;
  total: number;
  invoice_date?: string;
  due_date?: string;
  business_name?: string;
}

/**
 * Build a WhatsApp URL.
 * - If phone is provided: clean digits, prefix 91 if not already present,
 *   returns https://wa.me/91XXXXXXXXXX?text=...
 * - If phone is null/undefined: returns https://wa.me/?text=... (chat picker)
 */
export function buildWaUrl(phone: string | null | undefined, message: string): string {
  const encoded = encodeURIComponent(message);
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    const normalized =
      digits.length === 12 && digits.startsWith("91")
        ? digits
        : digits.length === 10
        ? `91${digits}`
        : digits; // unknown format — pass through unchanged
    return `https://wa.me/${normalized}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

/**
 * Hinglish payment reminder message for overdue invoices.
 */
// Note: uses invoice.total (not balanceDue after partial payments) since
// partial payment data isn't available at the call sites. Acceptable for reminders.
export function paymentReminderMessage(invoice: InvoiceForMessage): string {
  const amount = invoice.total.toLocaleString("en-IN");
  const dueDateStr = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";
  const business = invoice.business_name ?? "Invio Business";

  return `Namaskar *${invoice.customer_name}* ji 🙏

Aapka invoice *${invoice.invoice_number}* ka payment abhi pending hai.

💰 *Amount Due:* ₹${amount}
📅 *Due Date:* ${dueDateStr}

Kripya jaldi payment kar dein taaki koi inconvenience na ho.

Shukriya!
*${business}*`;
}

/**
 * Invoice summary message for sharing on WhatsApp.
 */
export function invoiceShareMessage(invoice: InvoiceForMessage): string {
  const amount = invoice.total.toLocaleString("en-IN");
  const dateStr = invoice.invoice_date
    ? new Date(invoice.invoice_date).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
  const business = invoice.business_name ?? "Invio Business";

  return `*Invoice ${invoice.invoice_number}*
Customer: ${invoice.customer_name}
Date: ${dateStr}
*Total: ₹${amount}*

— ${business}`;
}

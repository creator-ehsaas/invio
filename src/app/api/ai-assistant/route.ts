import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiChat } from "@/lib/ai-client";

const SYSTEM_PROMPT = `You are a smart business assistant for an Indian SME invoicing app called Invio.
You help users manage their business via natural language.

You can respond in three ways:
1. ACTION: Navigate or pre-fill forms
2. ANSWER: Answer questions about their business data
3. EXECUTE: Perform a database mutation (like marking records paid, cancelling, deleting, or creating profiles)

Based on the user's message, return a JSON response:

For navigation/creation actions:
{
  "type": "action",
  "action": "navigate",
  "route": "/invoices/new",
  "params": { "customer": "Ram", "items": "5 chairs at 2000 each" },
  "message": "Opening new invoice for Ram..."
}

For data questions (use provided context):
{
  "type": "answer",
  "message": "Your answer here based on data"
}

For sending reminders:
{
  "type": "action",
  "action": "reminder",
  "message": "Go to Aged Receivables to send reminders"
}

For database mutations (e.g., "mark purchase #123 paid", "cancel sales invoice INV-002", "delete customer Shyam", "create supplier Ganesha Traders"):
{
  "type": "action",
  "action": "execute",
  "mutation": "mark_purchase_paid" | "mark_invoice_paid" | "cancel_purchase" | "cancel_invoice" | "delete_purchase" | "delete_invoice" | "create_customer" | "create_supplier",
  "params": {
    "billNumber": "123" (for purchases),
    "invoiceNumber": "INV-002" (for sales invoices),
    "name": "Supplier or Customer Name" (for creating profiles),
    "gstin": "GSTIN if provided" (optional),
    "phone": "phone number if provided" (optional),
    "email": "email if provided" (optional)
  },
  "message": "I am marking purchase bill #123 as paid..."
}

Supported routes and when to navigate to them:
- /invoices/new → create invoice, bill someone, raise invoice
- /estimates/new → create estimate, quotation, quote
- /expenses/new → add expense, spent money
- /purchases/new → record purchase invoice from supplier
- /customers/new → add new customer
- /reports/receivables → who owes me, pending payments, overdue
- /reports/pnl → profit and loss, how much did I earn, P&L
- /reports/gstr3b → GST return, how much GST do I owe
- /credit-notes/new → issue credit note, sales return
- /debit-notes/new → issue debit note
- /bids → gem bids, tender finder, bid listing, find tenders
- /bids/settings → GeM settings, bid settings, scraper configuration

When creating invoices, extract:
- customer name → params.customer
- items as plain text → params.items (e.g. "5 chairs at 2000 each")
- due date if mentioned → params.dueDate

When answering questions, use CONTEXT DATA provided.
If no context is relevant, say you can show the data if they navigate to the relevant page.

IMPORTANT: Keep messages short (under 20 words). Be direct. Use rupee symbol ₹ for amounts.
Today's date: ${new Date().toLocaleDateString("en-IN")}`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    const businessId = userData?.business_id;
    if (!businessId) {
      return NextResponse.json({ error: "No business found" }, { status: 400 });
    }

    const { message, businessContext } = await request.json();

    // Build context string from any provided data
    const contextStr = businessContext ? `\n\nBusiness Context:\n${JSON.stringify(businessContext, null, 2)}` : "";

    const response = await aiChat(
      [{ role: "user", content: `${message}${contextStr}` }],
      {
        temperature: 0.2,
        maxTokens: 400,
        systemPrompt: SYSTEM_PROMPT,
      }
    );

    // Parse JSON response
    let cleaned = response.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];

    const parsed = JSON.parse(cleaned);

    // Handle mutations if the action is execute
    if (parsed.type === "action" && parsed.action === "execute" && parsed.mutation) {
      const { mutation, params = {} } = parsed;

      switch (mutation) {
        case "mark_purchase_paid": {
          const billNo = params.billNumber;
          if (!billNo) {
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: "Please specify the bill number of the purchase invoice to mark paid.",
            });
          }

          // Find purchase invoice
          const { data: purchase, error: findErr } = await supabase
            .from("purchase_invoices")
            .select("*")
            .eq("business_id", businessId)
            .ilike("bill_number", `%${billNo}%`)
            .limit(1)
            .maybeSingle();

          if (findErr || !purchase) {
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: `I couldn't find a purchase bill matching '#${billNo}'.`,
            });
          }

          // Update purchase invoice
          const { error: updateErr } = await supabase
            .from("purchase_invoices")
            .update({
              status: "paid",
              amount_paid: purchase.total,
              updated_at: new Date().toISOString(),
            })
            .eq("id", purchase.id);

          if (updateErr) throw updateErr;

          // Insert payment record
          await supabase.from("purchase_payments").insert({
            purchase_invoice_id: purchase.id,
            amount: purchase.total,
            payment_date: new Date().toISOString(),
            payment_method: "bank_transfer",
            notes: "Recorded via AI Assistant",
          });

          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: `Purchase bill #${purchase.bill_number} has been marked as paid.`,
            refresh: true,
          });
        }

        case "mark_invoice_paid": {
          const invNo = params.invoiceNumber;
          if (!invNo) {
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: "Please specify the invoice number to mark paid.",
            });
          }

          // Find invoice
          const { data: invoice, error: findErr } = await supabase
            .from("invoices")
            .select("*")
            .eq("business_id", businessId)
            .ilike("invoice_number", `%${invNo}%`)
            .limit(1)
            .maybeSingle();

          if (findErr || !invoice) {
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: `I couldn't find an invoice matching '${invNo}'.`,
            });
          }

          // Update status
          const { error: updateErr } = await supabase
            .from("invoices")
            .update({
              status: "paid",
              updated_at: new Date().toISOString(),
            })
            .eq("id", invoice.id);

          if (updateErr) throw updateErr;

          // Create payment record
          await supabase.from("payments").insert({
            invoice_id: invoice.id,
            amount: invoice.total,
            payment_date: new Date().toISOString(),
            payment_method: "bank_transfer",
            notes: "Recorded via AI Assistant",
          });

          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: `Sales invoice ${invoice.invoice_number} has been marked as paid.`,
            refresh: true,
          });
        }

        case "cancel_purchase": {
          const billNo = params.billNumber;
          if (!billNo) {
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: "Please specify the bill number of the purchase invoice to cancel.",
            });
          }

          const { data: purchase, error: findErr } = await supabase
            .from("purchase_invoices")
            .select("*")
            .eq("business_id", businessId)
            .ilike("bill_number", `%${billNo}%`)
            .limit(1)
            .maybeSingle();

          if (findErr || !purchase) {
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: `I couldn't find a purchase bill matching '#${billNo}' to cancel.`,
            });
          }

          await supabase
            .from("purchase_invoices")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", purchase.id);

          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: `Purchase bill #${purchase.bill_number} has been cancelled.`,
            refresh: true,
          });
        }

        case "cancel_invoice": {
          const invNo = params.invoiceNumber;
          if (!invNo) {
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: "Please specify the invoice number to cancel.",
            });
          }

          const { data: invoice, error: findErr } = await supabase
            .from("invoices")
            .select("*")
            .eq("business_id", businessId)
            .ilike("invoice_number", `%${invNo}%`)
            .limit(1)
            .maybeSingle();

          if (findErr || !invoice) {
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: `I couldn't find an invoice matching '${invNo}' to cancel.`,
            });
          }

          await supabase
            .from("invoices")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", invoice.id);

          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: `Sales invoice ${invoice.invoice_number} has been cancelled.`,
            refresh: true,
          });
        }

        case "delete_purchase": {
          const billNo = params.billNumber;
          if (!billNo) {
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: "Please specify the bill number of the purchase invoice to delete.",
            });
          }

          const { data: purchase, error: findErr } = await supabase
            .from("purchase_invoices")
            .select("*")
            .eq("business_id", businessId)
            .ilike("bill_number", `%${billNo}%`)
            .limit(1)
            .maybeSingle();

          if (findErr || !purchase) {
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: `I couldn't find a purchase bill matching '#${billNo}' to delete.`,
            });
          }

          await supabase.from("purchase_invoices").delete().eq("id", purchase.id);

          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: `Purchase bill #${purchase.bill_number} has been deleted.`,
            refresh: true,
          });
        }

        case "delete_invoice": {
          const invNo = params.invoiceNumber;
          if (!invNo) {
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: "Please specify the invoice number to delete.",
            });
          }

          const { data: invoice, error: findErr } = await supabase
            .from("invoices")
            .select("*")
            .eq("business_id", businessId)
            .ilike("invoice_number", `%${invNo}%`)
            .limit(1)
            .maybeSingle();

          if (findErr || !invoice) {
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: `I couldn't find an invoice matching '${invNo}' to delete.`,
            });
          }

          await supabase.from("invoices").delete().eq("id", invoice.id);

          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: `Sales invoice ${invoice.invoice_number} has been deleted.`,
            refresh: true,
          });
        }

        case "create_customer": {
          const { name, gstin, phone, email } = params;
          if (!name) {
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: "Please specify a name to create a customer.",
            });
          }

          const { data: customer, error: insertErr } = await supabase
            .from("customers")
            .insert({
              business_id: businessId,
              name,
              gstin: gstin || null,
              phone: phone || null,
              email: email || null,
            })
            .select()
            .single();

          if (insertErr) throw insertErr;

          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: `Customer '${customer.name}' has been created.`,
            refresh: true,
          });
        }

        case "create_supplier": {
          const { name, gstin, phone, email } = params;
          if (!name) {
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: "Please specify a name to create a supplier.",
            });
          }

          const { data: supplier, error: insertErr } = await supabase
            .from("suppliers")
            .insert({
              business_id: businessId,
              name,
              gstin: gstin || null,
              phone: phone || null,
              email: email || null,
              is_active: true,
            })
            .select()
            .single();

          if (insertErr) throw insertErr;

          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: `Supplier '${supplier.name}' has been created.`,
            refresh: true,
          });
        }

        default:
          return NextResponse.json({
            type: "action",
            action: "execute_failed",
            message: "Unsupported mutation action.",
          });
      }
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("AI assistant parse error:", error);
    return NextResponse.json({
      type: "answer",
      message: "I couldn't understand that. Try: 'create invoice for Ram' or 'who owes me money?'",
    });
  }
}

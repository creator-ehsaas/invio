import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiChat } from "@/lib/ai-client";

const SYSTEM_PROMPT = `You are a smart business assistant for an Indian SME invoicing app called Invio.
You help users manage their business via natural language.

You can respond in three ways:
1. ACTION: Navigate or pre-fill forms
2. ANSWER: Answer questions about their business data
3. EXECUTE: Perform a database mutation (like marking records paid, cancelling, deleting, or creating profiles)

Based on the user's message, the conversation history, and context, return a JSON response:

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

For database mutations (e.g., "mark purchase #123 paid", "mark all purchases as paid", "cancel sales invoice INV-002", "delete customer Shyam", "create supplier Ganesha Traders"):
{
  "type": "action",
  "action": "execute",
  "mutation": "mark_purchase_paid" | "mark_invoice_paid" | "cancel_purchase" | "cancel_invoice" | "delete_purchase" | "delete_invoice" | "create_customer" | "create_supplier",
  "params": {
    "billNumber": "123" or "all" (for purchases),
    "invoiceNumber": "INV-002" or "all" (for sales invoices),
    "name": "Supplier or Customer Name" (for creating profiles),
    "gstin": "GSTIN if provided" (optional),
    "phone": "phone number if provided" (optional),
    "email": "email if provided" (optional)
  },
  "message": "I am marking purchase bill #123 as paid..."
}

Conversation History Rules:
- Use the provided conversation history to understand context. E.g., if you previously asked "Please specify the bill number of the purchase invoice to mark paid" and the user replies with a number like "180" or "bill 180", parse this as a request to mark purchase paid with billNumber "180".
- If the user says "mark all paid" or "mark all purchases as paid" or "mark all status all paid", set billNumber to "all".
- If the user previously asked to mark a sales invoice as paid, and now provides the number, set invoiceNumber to that value.

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

// Helper to save conversation logs to the database so that the history remains persistent
async function saveConversation(supabase: any, userId: string, businessId: string, userMsg: string, assistantMsg: string) {
  try {
    await supabase.from("ai_conversations").insert([
      {
        user_id: userId,
        business_id: businessId,
        role: "user",
        content: userMsg,
      },
      {
        user_id: userId,
        business_id: businessId,
        role: "assistant",
        content: assistantMsg,
      }
    ]);
  } catch (err) {
    console.error("Failed to save conversation history:", err);
  }
}

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

    const { message, history = [], businessContext } = await request.json();

    // Build context string from any provided data
    const contextStr = businessContext ? `\n\nBusiness Context:\n${JSON.stringify(businessContext, null, 2)}` : "";

    // Build messages array including recent history
    const messages = [];
    if (history && Array.isArray(history)) {
      history.forEach((h: any) => {
        messages.push({
          role: h.role === "assistant" ? "assistant" as const : "user" as const,
          content: h.content,
        });
      });
    }

    messages.push({
      role: "user" as const,
      content: `${message}${contextStr}`,
    });

    const response = await aiChat(
      messages,
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
            const reply = "Please specify the bill number of the purchase invoice to mark paid.";
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: reply,
            });
          }

          if (billNo.toString().toLowerCase() === "all") {
            const { data: purchases, error: findErr } = await supabase
              .from("purchase_invoices")
              .select("*")
              .eq("business_id", businessId)
              .in("status", ["pending", "partial"]);

            if (findErr) throw findErr;
            if (!purchases || purchases.length === 0) {
              const reply = "All purchase bills are already paid.";
              await saveConversation(supabase, user.id, businessId, message, reply);
              return NextResponse.json({
                type: "action",
                action: "execute_success",
                message: reply,
                refresh: false,
              });
            }

            for (const purchase of purchases) {
              await supabase
                .from("purchase_invoices")
                .update({
                  status: "paid",
                  amount_paid: purchase.total,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", purchase.id);

              await supabase.from("purchase_payments").insert({
                purchase_invoice_id: purchase.id,
                amount: purchase.total - purchase.amount_paid,
                payment_date: new Date().toISOString(),
                payment_method: "bank_transfer",
                notes: "Recorded via AI Assistant (Bulk)",
              });
            }

            const reply = `Marked all ${purchases.length} purchase bills as paid.`;
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_success",
              message: reply,
              refresh: true,
            });
          }

          // Otherwise, find a single purchase invoice
          const { data: purchase, error: findErr } = await supabase
            .from("purchase_invoices")
            .select("*")
            .eq("business_id", businessId)
            .ilike("bill_number", `%${billNo}%`)
            .limit(1)
            .maybeSingle();

          if (findErr || !purchase) {
            const reply = `I couldn't find a purchase bill matching '#${billNo}'.`;
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: reply,
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
            amount: purchase.total - purchase.amount_paid,
            payment_date: new Date().toISOString(),
            payment_method: "bank_transfer",
            notes: "Recorded via AI Assistant",
          });

          const reply = `Purchase bill #${purchase.bill_number} has been marked as paid.`;
          await saveConversation(supabase, user.id, businessId, message, reply);
          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: reply,
            refresh: true,
          });
        }

        case "mark_invoice_paid": {
          const invNo = params.invoiceNumber;
          if (!invNo) {
            const reply = "Please specify the sales invoice number to mark paid.";
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: reply,
            });
          }

          if (invNo.toString().toLowerCase() === "all") {
            const { data: invoices, error: findErr } = await supabase
              .from("invoices")
              .select("*")
              .eq("business_id", businessId)
              .in("status", ["draft", "sent", "overdue"]);

            if (findErr) throw findErr;
            if (!invoices || invoices.length === 0) {
              const reply = "All sales invoices are already paid.";
              await saveConversation(supabase, user.id, businessId, message, reply);
              return NextResponse.json({
                type: "action",
                action: "execute_success",
                message: reply,
                refresh: false,
              });
            }

            for (const invoice of invoices) {
              await supabase
                .from("invoices")
                .update({
                  status: "paid",
                  updated_at: new Date().toISOString(),
                })
                .eq("id", invoice.id);

              await supabase.from("payments").insert({
                invoice_id: invoice.id,
                amount: invoice.total,
                payment_date: new Date().toISOString(),
                payment_method: "bank_transfer",
                notes: "Recorded via AI Assistant (Bulk)",
              });
            }

            const reply = `All ${invoices.length} sales invoices have been marked as paid.`;
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_success",
              message: reply,
              refresh: true,
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
            const reply = `I couldn't find an invoice matching '${invNo}'.`;
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: reply,
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

          const reply = `Sales invoice ${invoice.invoice_number} has been marked as paid.`;
          await saveConversation(supabase, user.id, businessId, message, reply);
          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: reply,
            refresh: true,
          });
        }

        case "cancel_purchase": {
          const billNo = params.billNumber;
          if (!billNo) {
            const reply = "Please specify the bill number of the purchase invoice to cancel.";
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: reply,
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
            const reply = `I couldn't find a purchase bill matching '#${billNo}' to cancel.`;
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: reply,
            });
          }

          await supabase
            .from("purchase_invoices")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", purchase.id);

          const reply = `Purchase bill #${purchase.bill_number} has been cancelled.`;
          await saveConversation(supabase, user.id, businessId, message, reply);
          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: reply,
            refresh: true,
          });
        }

        case "cancel_invoice": {
          const invNo = params.invoiceNumber;
          if (!invNo) {
            const reply = "Please specify the invoice number to cancel.";
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: reply,
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
            const reply = `I couldn't find an invoice matching '${invNo}' to cancel.`;
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: reply,
            });
          }

          await supabase
            .from("invoices")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", invoice.id);

          const reply = `Sales invoice ${invoice.invoice_number} has been cancelled.`;
          await saveConversation(supabase, user.id, businessId, message, reply);
          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: reply,
            refresh: true,
          });
        }

        case "delete_purchase": {
          const billNo = params.billNumber;
          if (!billNo) {
            const reply = "Please specify the bill number of the purchase invoice to delete.";
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: reply,
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
            const reply = `I couldn't find a purchase bill matching '#${billNo}' to delete.`;
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: reply,
            });
          }

          await supabase.from("purchase_invoices").delete().eq("id", purchase.id);

          const reply = `Purchase bill #${purchase.bill_number} has been deleted.`;
          await saveConversation(supabase, user.id, businessId, message, reply);
          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: reply,
            refresh: true,
          });
        }

        case "delete_invoice": {
          const invNo = params.invoiceNumber;
          if (!invNo) {
            const reply = "Please specify the invoice number to delete.";
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: reply,
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
            const reply = `I couldn't find an invoice matching '${invNo}' to delete.`;
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: reply,
            });
          }

          await supabase.from("invoices").delete().eq("id", invoice.id);

          const reply = `Sales invoice ${invoice.invoice_number} has been deleted.`;
          await saveConversation(supabase, user.id, businessId, message, reply);
          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: reply,
            refresh: true,
          });
        }

        case "create_customer": {
          const { name, gstin, phone, email } = params;
          if (!name) {
            const reply = "Please specify a name to create a customer.";
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: reply,
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

          const reply = `Customer '${customer.name}' has been created.`;
          await saveConversation(supabase, user.id, businessId, message, reply);
          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: reply,
            refresh: true,
          });
        }

        case "create_supplier": {
          const { name, gstin, phone, email } = params;
          if (!name) {
            const reply = "Please specify a name to create a supplier.";
            await saveConversation(supabase, user.id, businessId, message, reply);
            return NextResponse.json({
              type: "action",
              action: "execute_failed",
              message: reply,
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

          const reply = `Supplier '${supplier.name}' has been created.`;
          await saveConversation(supabase, user.id, businessId, message, reply);
          return NextResponse.json({
            type: "action",
            action: "execute_success",
            message: reply,
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

    // For standard navigation and reminder actions, save them to the DB as well
    if (parsed.type === "action") {
      if (parsed.action === "navigate" || parsed.action === "reminder") {
        await saveConversation(supabase, user.id, businessId, message, parsed.message || "");
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

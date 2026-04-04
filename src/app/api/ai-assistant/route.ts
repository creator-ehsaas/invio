import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";

const SYSTEM_PROMPT = `You are a smart business assistant for an Indian SME invoicing app called Invio.
You help users manage their business via natural language.

You can respond in two ways:
1. ACTION: Navigate or pre-fill forms
2. ANSWER: Answer questions about their business data

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

Supported routes and when to use them:
- /invoices/new → create invoice, bill someone, raise invoice
- /estimates/new → create estimate, quotation, quote
- /expenses/new → add expense, record purchase, spent money
- /purchases/new → record purchase invoice from supplier
- /customers/new → add new customer
- /reports/receivables → who owes me, pending payments, overdue
- /reports/pnl → profit and loss, how much did I earn, P&L
- /reports/gstr3b → GST return, how much GST do I owe
- /credit-notes/new → issue credit note, sales return
- /debit-notes/new → issue debit note

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
    const { message, context } = await request.json();

    // Build context string from any provided data
    const contextStr = context ? `\n\nBusiness Context:\n${JSON.stringify(context, null, 2)}` : "";

    const response = await aiChat(
      [{ role: "user", content: `${message}${contextStr}` }],
      {
        temperature: 0.2,
        maxTokens: 300,
        systemPrompt: SYSTEM_PROMPT,
      }
    );

    // Parse JSON response
    let cleaned = response.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleaned = jsonMatch[0];

    const parsed = JSON.parse(cleaned);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({
      type: "answer",
      message: "I couldn't understand that. Try: 'create invoice for Ram' or 'who owes me money?'",
    });
  }
}

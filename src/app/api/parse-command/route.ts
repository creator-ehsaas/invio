import { NextRequest, NextResponse } from "next/server";
import { groq } from "@/lib/groq";

const COMMAND_PROMPT = `You are a voice command parser for an invoice app.
Analyze the user's speech and determine if it's a COMMAND to edit the invoice, or NEW DATA to add items.

COMMANDS the user might give:
- Remove/delete GST, zero GST, no GST → { "action": "set_gst", "value": 0 }
- Set GST to X%, change GST to X% → { "action": "set_gst", "value": X }
- Remove/delete item X, delete first/second/last item → { "action": "delete_item", "index": N } (0-based)
- Clear all items, start over, reset → { "action": "clear_items" }
- Change customer to X, customer name is X → { "action": "set_customer", "value": "X" }
- Change quantity of X to Y → { "action": "update_item", "match": "X", "field": "quantity", "value": Y }
- Change price/rate of X to Y → { "action": "update_item", "match": "X", "field": "rate", "value": Y }
- Add X% discount → { "action": "set_discount", "value": X }
- Due date is X, payment due X → { "action": "set_due_date", "value": "YYYY-MM-DD" }
- Add note X, notes X → { "action": "set_notes", "value": "X" }

If the speech contains item names with quantities and prices, it's NEW DATA:
→ { "action": "add_items", "parse_as_invoice": true }

Return ONLY a valid JSON object with:
- action: the command type
- value/index/match/field: relevant parameters
- parse_as_invoice: true if this should be parsed as invoice data instead

Examples:
"Remove GST" → { "action": "set_gst", "value": 0 }
"5% GST" → { "action": "set_gst", "value": 5 }
"Delete flour item" → { "action": "delete_item", "match": "flour" }
"Delete second item" → { "action": "delete_item", "index": 1 }
"Customer is Rahul Sharma" → { "action": "set_customer", "value": "Rahul Sharma" }
"4 kg rice Rs 200" → { "action": "add_items", "parse_as_invoice": true }
"Change rice quantity to 5" → { "action": "update_item", "match": "rice", "field": "quantity", "value": 5 }
"Clear everything" → { "action": "clear_items" }

User speech: "{text}"

Return ONLY the JSON, no explanation.`;

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400 }
      );
    }

    const prompt = COMMAND_PROMPT.replace("{text}", text);

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 256,
    });

    let responseText = completion.choices[0]?.message?.content || "";

    // Strip markdown code blocks if present
    responseText = responseText
      .replace(/^```json?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    // Extract JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      responseText = jsonMatch[0];
    }

    const command = JSON.parse(responseText);
    return NextResponse.json({ command });
  } catch (error) {
    console.error("Parse command error:", error);
    return NextResponse.json(
      { error: "Command parsing failed" },
      { status: 500 }
    );
  }
}

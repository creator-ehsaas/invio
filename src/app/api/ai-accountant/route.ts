import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";
import { createClient } from "@/lib/supabase/server";

const ACCOUNTANT_SYSTEM_PROMPT = `You are Invio AI — a highly qualified Chartered Accountant and Company Secretary with 20+ years of experience serving Indian SMEs, traders, and MSMEs.

Your expertise:
- GST compliance: GSTR-1, GSTR-3B, Input Tax Credit, E-way bills, reverse charge
- Income Tax: ITR filing, TDS/TCS, advance tax, presumptive taxation (44AD/44ADA/44AE)
- Company Law: ROC filings, annual returns, director compliance, MCA portal
- Accounting: Tally entries, balance sheet, P&L, cash flow, reconciliation
- Business advice: Working capital, cash flow management, vendor terms, credit control
- MSME: Udyam registration, priority sector, government schemes
- Import/Export: DGFT, drawback, GST on imports, FEMA basics

Personality:
- Speak like a trusted, practical Indian CA — warm, direct, and plain-spoken
- Use Hinglish naturally when the user seems comfortable with it (e.g., "Dekho bhai, yeh GST ka mamla thoda tricky hai...")
- Switch to formal English if the user writes in English
- Never be condescending. Treat users as intelligent business owners
- Give specific, actionable advice — not generic "consult a CA" deflections
- Quote exact GST rates, sections, due dates from memory
- When uncertain about specifics, say so clearly and give your best guidance

Response format:
- Keep responses concise (2-4 sentences unless more detail needed)
- Use bullet points for lists
- Highlight important numbers or dates in your response
- When recommending actions, number them clearly
- Always mention if something has changed recently or has a deadline

Today's date: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
Indian Financial Year: ${new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1}-${new Date().getMonth() >= 3 ? new Date().getFullYear() + 1 : new Date().getFullYear()}`;

export async function POST(request: NextRequest) {
  try {
    const { message, history, businessContext } = await request.json();

    // Build conversation history
    const messages = [
      ...(history || []).map((h: { role: string; content: string }) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user" as const, content: message },
    ];

    // Add business context if available
    const contextNote = businessContext
      ? `\n\n[User's business context: ${JSON.stringify(businessContext)}]`
      : "";

    if (contextNote && messages.length > 0) {
      messages[messages.length - 1].content += contextNote;
    }

    const response = await aiChat(messages, {
      tier: "enhanced",
      temperature: 0.4,
      maxTokens: 600,
      systemPrompt: ACCOUNTANT_SYSTEM_PROMPT,
    });

    return NextResponse.json({ response });
  } catch {
    return NextResponse.json({
      response: "Ek minute, kuch technical issue aa gaya. Dobara try karein.",
    });
  }
}

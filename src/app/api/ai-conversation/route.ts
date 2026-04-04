import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiChat } from "@/lib/ai-client";

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
- Use Hinglish naturally when the user seems comfortable with it
- Switch to formal English if the user writes in English
- Give specific, actionable advice — not generic "consult a CA" deflections
- Quote exact GST rates, sections, due dates from memory
- Remember the full conversation history provided — refer back to earlier questions when relevant

Response format:
- Keep responses concise (2-4 sentences unless more detail needed)
- Use bullet points for lists
- When recommending actions, number them clearly

Today's date: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
Indian Financial Year: ${new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1}-${new Date().getMonth() >= 3 ? new Date().getFullYear() + 1 : new Date().getFullYear()}`;

// GET: Load conversation history for the current user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ messages: [] });

    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");

    const { data } = await supabase
      .from("ai_conversations")
      .select("id, role, content, created_at, metadata")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Return in chronological order
    return NextResponse.json({ messages: (data || []).reverse() });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}

// POST: Send a message, get AI response, save both to DB
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { message, businessContext } = await request.json();

    // Get user's business_id
    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    const businessId = userData?.business_id;

    // Load recent conversation history (last 20 messages for context)
    const { data: history } = await supabase
      .from("ai_conversations")
      .select("role, content")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const recentHistory = (history || []).reverse();

    // Save user message
    await supabase.from("ai_conversations").insert({
      user_id: user.id,
      business_id: businessId || null,
      role: "user",
      content: message,
    });

    // Build messages array for AI
    const messages = [
      ...recentHistory.map((h) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      {
        role: "user" as const,
        content: businessContext
          ? `${message}\n\n[Business context: ${JSON.stringify(businessContext)}]`
          : message,
      },
    ];

    // Get AI response
    const response = await aiChat(messages, {
      tier: "enhanced",
      temperature: 0.4,
      maxTokens: 600,
      systemPrompt: ACCOUNTANT_SYSTEM_PROMPT,
    });

    // Save AI response
    await supabase.from("ai_conversations").insert({
      user_id: user.id,
      business_id: businessId || null,
      role: "assistant",
      content: response,
    });

    return NextResponse.json({ response });
  } catch {
    return NextResponse.json({
      response: "Kuch technical issue aa gaya. Dobara try karein.",
    });
  }
}

// DELETE: Clear conversation history
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await supabase.from("ai_conversations").delete().eq("user_id", user.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to clear history" }, { status: 500 });
  }
}

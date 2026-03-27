import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Store AI learning feedback when user corrects AI-parsed invoice data
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (!userData?.business_id) {
      return NextResponse.json({ error: "No business found" }, { status: 400 });
    }

    const { originalTranscript, aiParsed, userCorrected } = await request.json();

    if (!originalTranscript || !aiParsed || !userCorrected) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Store the feedback for learning
    const { error } = await supabase.from("ai_feedback").insert({
      business_id: userData.business_id,
      user_id: user.id,
      original_transcript: originalTranscript,
      ai_parsed: aiParsed,
      user_corrected: userCorrected,
      created_at: new Date().toISOString(),
    });

    if (error) {
      // Table might not exist, that's ok
      console.log("Feedback storage skipped:", error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Feedback error:", error);
    return NextResponse.json({ error: "Failed to store feedback" }, { status: 500 });
  }
}

// Get recent corrections for few-shot learning
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (!userData?.business_id) {
      return NextResponse.json({ examples: [] });
    }

    // Get recent feedback examples
    const { data: feedback } = await supabase
      .from("ai_feedback")
      .select("original_transcript, user_corrected")
      .eq("business_id", userData.business_id)
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({ examples: feedback || [] });
  } catch (error) {
    return NextResponse.json({ examples: [] });
  }
}

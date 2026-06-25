import { NextRequest, NextResponse } from "next/server";
import { getDodoClient, PLANS } from "@/lib/dodo";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { planId } = await request.json();

    // Validate plan
    const plan = planId === "pro_monthly" ? PLANS.PRO_MONTHLY :
                 planId === "pro_yearly" ? PLANS.PRO_YEARLY :
                 planId === "business_monthly" ? PLANS.BUSINESS_MONTHLY :
                 planId === "business_yearly" ? PLANS.BUSINESS_YEARLY : null;

    if (!plan || !plan.productId) {
      return NextResponse.json(
        { error: "Invalid plan selected" },
        { status: 400 }
      );
    }

    // Get user details
    const { data: userData } = await supabase
      .from("users")
      .select("full_name, business_id")
      .eq("id", user.id)
      .single();

    // Create checkout session with Dodo Payments
    const dodo = getDodoClient();
    const session = await dodo.checkoutSessions.create({
      product_cart: [
        {
          product_id: plan.productId,
          quantity: 1,
        },
      ],
      billing_address: {
        country: "IN",
      },
      customer: {
        email: user.email!,
        name: userData?.full_name || user.email!,
      },
      return_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard?subscription=success`,
      metadata: {
        user_id: user.id,
        business_id: userData?.business_id || "",
        plan_id: planId,
      },
      feature_flags: {
        allow_tax_id: false, // Disable GST input field
        allow_customer_editing_tax_id: false, // Don't let customer enter tax ID
      },
      minimal_address: true, // Only require minimal address info
    });

    return NextResponse.json({
      checkoutUrl: session.checkout_url,
      sessionId: session.session_id,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

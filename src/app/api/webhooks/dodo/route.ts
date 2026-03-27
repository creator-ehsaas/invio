import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { createClient } from "@supabase/supabase-js";

// Use service role for webhook handling (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const webhookId = request.headers.get("webhook-id") || "";
    const webhookSignature = request.headers.get("webhook-signature") || "";
    const webhookTimestamp = request.headers.get("webhook-timestamp") || "";

    // Verify webhook signature if secret is configured
    if (process.env.DODO_PAYMENTS_WEBHOOK_SECRET) {
      const webhook = new Webhook(process.env.DODO_PAYMENTS_WEBHOOK_SECRET);
      try {
        await webhook.verify(rawBody, {
          "webhook-id": webhookId,
          "webhook-signature": webhookSignature,
          "webhook-timestamp": webhookTimestamp,
        });
      } catch {
        console.error("Webhook signature verification failed");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 400 }
        );
      }
    }

    const payload = JSON.parse(rawBody);
    console.log("Dodo webhook received:", payload.type);

    // Handle different webhook events
    switch (payload.type) {
      case "subscription.active":
        await handleSubscriptionActive(payload.data);
        break;

      case "subscription.renewed":
        await handleSubscriptionRenewed(payload.data);
        break;

      case "subscription.cancelled":
        await handleSubscriptionCancelled(payload.data);
        break;

      case "subscription.on_hold":
        await handleSubscriptionOnHold(payload.data);
        break;

      case "subscription.expired":
        await handleSubscriptionExpired(payload.data);
        break;

      case "payment.succeeded":
        await handlePaymentSucceeded(payload.data);
        break;

      default:
        console.log("Unhandled webhook event:", payload.type);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handleSubscriptionActive(data: any) {
  const { subscription_id, customer, metadata, next_billing_date, product_id } = data;
  const userId = metadata?.user_id;
  const businessId = metadata?.business_id;
  const planId = metadata?.plan_id;

  if (!userId) {
    console.error("No user_id in subscription metadata");
    return;
  }

  // Upsert subscription record
  await supabaseAdmin.from("subscriptions").upsert({
    id: subscription_id,
    user_id: userId,
    business_id: businessId || null,
    plan_id: planId,
    product_id: product_id,
    status: "active",
    current_period_end: next_billing_date,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: "id",
  });

  // Update user's subscription status
  await supabaseAdmin
    .from("users")
    .update({
      subscription_status: "active",
      subscription_plan: planId,
    })
    .eq("id", userId);

  console.log(`Subscription ${subscription_id} activated for user ${userId}`);
}

async function handleSubscriptionRenewed(data: any) {
  const { subscription_id, next_billing_date } = data;

  await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "active",
      current_period_end: next_billing_date,
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscription_id);

  console.log(`Subscription ${subscription_id} renewed`);
}

async function handleSubscriptionCancelled(data: any) {
  const { subscription_id } = data;

  // Get subscription to find user
  const { data: subscription } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("id", subscription_id)
    .single();

  await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscription_id);

  // Update user's subscription status
  if (subscription?.user_id) {
    await supabaseAdmin
      .from("users")
      .update({
        subscription_status: "cancelled",
        subscription_plan: "free",
      })
      .eq("id", subscription.user_id);
  }

  console.log(`Subscription ${subscription_id} cancelled`);
}

async function handleSubscriptionOnHold(data: any) {
  const { subscription_id } = data;

  await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "on_hold",
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscription_id);

  console.log(`Subscription ${subscription_id} on hold`);
}

async function handleSubscriptionExpired(data: any) {
  const { subscription_id } = data;

  // Get subscription to find user
  const { data: subscription } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("id", subscription_id)
    .single();

  await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "expired",
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscription_id);

  // Downgrade user to free plan
  if (subscription?.user_id) {
    await supabaseAdmin
      .from("users")
      .update({
        subscription_status: "expired",
        subscription_plan: "free",
      })
      .eq("id", subscription.user_id);
  }

  console.log(`Subscription ${subscription_id} expired`);
}

async function handlePaymentSucceeded(data: any) {
  const { payment_id, metadata, subscription_id } = data;

  // Record payment
  await supabaseAdmin.from("subscription_payments").insert({
    id: payment_id,
    subscription_id: subscription_id || null,
    user_id: metadata?.user_id || null,
    amount: data.amount || 0,
    currency: data.currency || "INR",
    status: "succeeded",
    created_at: new Date().toISOString(),
  });

  console.log(`Payment ${payment_id} succeeded`);
}

import { NextRequest, NextResponse } from "next/server";
import { groq } from "@/lib/groq";
import { createClient } from "@/lib/supabase/server";

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

    const businessId = userData.business_id;

    // Fetch business data for analysis
    const [invoicesRes, customersRes, inventoryRes, businessRes] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, status, customer_name, subtotal, total, cgst, sgst")
        .eq("business_id", businessId)
        .order("invoice_date", { ascending: false })
        .limit(50),
      supabase
        .from("customers")
        .select("id, name, business_name")
        .eq("business_id", businessId),
      supabase
        .from("inventory_items")
        .select("id, name, current_stock, reorder_level, unit_price")
        .eq("business_id", businessId),
      supabase
        .from("businesses")
        .select("name")
        .eq("id", businessId)
        .single(),
    ]);

    const invoices = invoicesRes.data || [];
    const customers = customersRes.data || [];
    const inventory = inventoryRes.data || [];
    const businessName = businessRes.data?.name || "Your Business";

    // Calculate key metrics
    const totalRevenue = invoices
      .filter(inv => inv.status === "paid")
      .reduce((sum, inv) => sum + (inv.total || 0), 0);

    const pendingAmount = invoices
      .filter(inv => inv.status !== "paid" && inv.status !== "cancelled")
      .reduce((sum, inv) => sum + (inv.total || 0), 0);

    const overdueInvoices = invoices.filter(inv => inv.status === "overdue").length;

    const lowStockItems = inventory.filter(
      item => item.current_stock <= item.reorder_level
    );

    // Customer revenue breakdown
    const customerRevenue: Record<string, number> = {};
    invoices.forEach(inv => {
      const name = inv.customer_name || "Walk-in";
      customerRevenue[name] = (customerRevenue[name] || 0) + (inv.total || 0);
    });

    const topCustomers = Object.entries(customerRevenue)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, revenue]) => ({ name, revenue }));

    // Build context for AI
    const context = `
Business: ${businessName}
Total Invoices: ${invoices.length}
Total Revenue (Paid): ₹${totalRevenue.toLocaleString("en-IN")}
Pending Payments: ₹${pendingAmount.toLocaleString("en-IN")}
Overdue Invoices: ${overdueInvoices}
Total Customers: ${customers.length}
Inventory Items: ${inventory.length}
Low Stock Items: ${lowStockItems.length} (${lowStockItems.map(i => i.name).join(", ") || "None"})
Top Customers: ${topCustomers.map(c => `${c.name} (₹${c.revenue.toLocaleString("en-IN")})`).join(", ") || "None yet"}

Recent Invoice Statuses: ${invoices.slice(0, 10).map(i => `${i.invoice_number}: ${i.status}`).join(", ")}
    `.trim();

    const prompt = `You are a smart business advisor for Indian small businesses. Analyze this business data and provide 3-5 actionable insights.

${context}

Rules:
- Be specific with numbers and names
- Focus on actionable advice
- Keep each insight to 1-2 sentences
- Use Indian Rupee (₹) format
- If data is limited, give general tips for growing the business
- Consider GST compliance, cash flow, inventory management

Return a JSON array of insights, each with:
- type: "success" | "warning" | "tip" | "action"
- title: short title (3-5 words)
- message: the insight (1-2 sentences)

Example format:
[
  {"type": "warning", "title": "Payment Collection", "message": "You have ₹50,000 pending. Follow up with customers."},
  {"type": "success", "title": "Top Customer", "message": "Rahul Sharma contributes 40% of revenue. Consider loyalty benefits."}
]

Return ONLY the JSON array, no explanation.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 512,
    });

    let responseText = completion.choices[0]?.message?.content || "[]";

    // Clean up response
    responseText = responseText
      .replace(/^```json?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      responseText = jsonMatch[0];
    }

    const insights = JSON.parse(responseText);

    return NextResponse.json({
      insights,
      summary: {
        totalRevenue,
        pendingAmount,
        overdueInvoices,
        lowStockCount: lowStockItems.length,
        customerCount: customers.length,
      },
    });
  } catch (error) {
    console.error("Insights error:", error);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 }
    );
  }
}

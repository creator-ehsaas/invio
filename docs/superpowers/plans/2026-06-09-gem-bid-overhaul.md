# GeM Bid Feature Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the credential-based GeM scraper with a public-page scraper, add a business capability profile onboarding wizard, and implement AI-powered bid shortlisting so users see ranked, relevant bids without manual effort.

**Architecture:** Three-phase pipeline — (1) scan public listing pages for new bids, (2) scrape each bid's detail page for full specification text, (3) rank all new bids against a stored business capability profile using a single AI call. The profile is built once during onboarding by auto-analyzing existing invoice/PO data plus MSME/certification inputs.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + Storage), Puppeteer with stealth plugin, Groq via `aiChat` in `src/lib/ai-client.ts`, React 19, Tailwind CSS v4, TypeScript.

---

## File Map

### New files
| Path | Responsibility |
|------|---------------|
| `supabase/migrations/20260609_gem_business_profile.sql` | Creates `gem_business_profile` table; adds `ai_match_score`, `ai_match_reason`, `raw_full_text` to `gem_bids`; adds `shortlisted` status |
| `src/app/(dashboard)/bids/setup/page.tsx` | 4-step onboarding wizard |
| `src/app/api/gem-business-profile/analyze/route.ts` | Auto-analyzes existing invoices/POs to suggest capability profile fields |
| `src/app/api/gem-business-profile/save/route.ts` | Upserts completed `gem_business_profile` row |
| `src/app/api/gem-scraper/fetch-detail/route.ts` | Scrapes individual bid page for full specification text |
| `src/app/api/gem-scraper/shortlist/route.ts` | Bulk AI ranking of all `new` bids against business capability profile |

### Modified files
| Path | What changes |
|------|-------------|
| `src/types/gem.ts` | Add `GemBusinessProfile` type; add `shortlisted` to `GemBidStatus`; add `ai_match_score`, `ai_match_reason`, `raw_full_text` to `GemBid`; remove credentials from `GemConfig` |
| `src/app/api/gem-scraper/scan/route.ts` | Read keywords/categories from `gem_config` in DB instead of hardcoded; remove all credential logic; trigger `fetch-detail` for each new bid after scan |
| `src/app/(dashboard)/bids/settings/page.tsx` | Remove GeM credentials section; replace with setup wizard link banner |
| `src/app/(dashboard)/bids/page.tsx` | Add "Shortlisted" tab; show `ai_match_score` and `ai_match_reason` on cards; add "Complete setup" banner when no profile exists |
| `src/app/(dashboard)/bids/[id]/page.tsx` | Show `risk_assessment`, `evaluation_method`, AI-extracted financials/dates; fix document download buttons; add "Fetch Full Details" button that calls `fetch-detail` |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260609_gem_business_profile.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260609_gem_business_profile.sql

-- 1. Business capability profile table
CREATE TABLE IF NOT EXISTS gem_business_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID UNIQUE NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- MSME
  msme_category TEXT CHECK (msme_category IN ('micro', 'small', 'medium', 'none')),
  udyam_number TEXT,

  -- Financial capacity (values in INR lakhs)
  turnover_fy1 NUMERIC,
  turnover_fy2 NUMERIC,
  turnover_fy3 NUMERIC,
  turnover_fy_labels TEXT[],   -- e.g. ARRAY['FY 2024-25', 'FY 2023-24', 'FY 2022-23']

  years_in_business INTEGER,
  gem_seller_registered BOOLEAN DEFAULT FALSE,
  gem_seller_id TEXT,

  certifications TEXT[],       -- e.g. ARRAY['ISO 9001', 'BIS', 'NABL']
  supply_states TEXT[],        -- state names, e.g. ARRAY['Maharashtra', 'Delhi']

  -- AI-generated from invoice analysis
  ai_capability_summary TEXT,
  ai_recommended_categories JSONB,  -- [{category, confidence, reasoning}]
  ai_typical_bid_min NUMERIC,
  ai_typical_bid_max NUMERIC,
  ai_eligibility_gaps TEXT[],
  ai_product_categories TEXT[],

  setup_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. New columns on gem_bids
ALTER TABLE gem_bids
  ADD COLUMN IF NOT EXISTS ai_match_score   INTEGER,
  ADD COLUMN IF NOT EXISTS ai_match_reason  TEXT,
  ADD COLUMN IF NOT EXISTS raw_full_text    TEXT;

-- 3. Extend status check to include 'shortlisted'
ALTER TABLE gem_bids
  DROP CONSTRAINT IF EXISTS gem_bids_status_check;

ALTER TABLE gem_bids
  ADD CONSTRAINT gem_bids_status_check
  CHECK (status IN (
    'new', 'shortlisted', 'analyzing', 'analyzed',
    'interested', 'applied', 'won', 'lost', 'expired'
  ));

-- 4. RLS: business owners can only access their own profile
ALTER TABLE gem_business_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gem_business_profile_owner"
  ON gem_business_profile
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply the migration**

Run this SQL in the Supabase dashboard SQL editor (or via Supabase CLI if configured).
Verify with: `SELECT column_name FROM information_schema.columns WHERE table_name = 'gem_bids';`
Expected: `ai_match_score`, `ai_match_reason`, `raw_full_text` appear in the list.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260609_gem_business_profile.sql
git commit -m "feat(gem): add gem_business_profile table and extend gem_bids schema"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/gem.ts`

- [ ] **Step 1: Update `src/types/gem.ts`**

Replace the entire file with the following (keep all existing interfaces, add/change only what's shown):

```typescript
// GeM Bid Finder — Type Definitions

// ── Status ────────────────────────────────────────────────────────────────────
export type GemBidStatus =
  | "new"
  | "shortlisted"      // ← added
  | "analyzing"
  | "analyzed"
  | "interested"
  | "applied"
  | "won"
  | "lost"
  | "expired";

// ── Bid ───────────────────────────────────────────────────────────────────────
export interface GemBid {
  id: string;
  business_id: string;
  gem_bid_id: string;
  title: string;
  category: string | null;
  quantity: string | null;
  uom: string | null;
  department: string | null;
  organization: string | null;
  start_date: string | null;
  end_date: string | null;
  estimated_value: number | null;
  bid_type: string | null;
  status: GemBidStatus;
  ai_summary: string | null;
  ai_eligibility: AIEligibility | null;
  ai_requirements: AIRequirement[] | null;
  ai_doc_checklist: AIDocChecklistItem[] | null;
  ai_match_score: number | null;     // ← added (0-100)
  ai_match_reason: string | null;    // ← added
  raw_html: string | null;
  raw_full_text: string | null;      // ← added (from detail page scrape)
  bid_url: string | null;
  scraped_at: string;
  created_at: string;
  updated_at: string;
}

// ── AI Sub-types (unchanged) ──────────────────────────────────────────────────
export interface AIEligibility {
  eligible: boolean;
  confidence: number;
  reasons: string[];
  missing_docs: string[];
  missing_criteria: string[];
}

export interface AIRequirement {
  category: string;
  title: string;
  description: string;
  mandatory: boolean;
  met: boolean | null;
}

export interface AIDocChecklistItem {
  doc_name: string;
  doc_type: "mandatory" | "optional" | "conditional";
  description: string;
  can_generate: boolean;
  generated: boolean;
  notes: string | null;
}

// ── Document ──────────────────────────────────────────────────────────────────
export interface GemBidDocument {
  id: string;
  gem_bid_id: string;
  doc_type: GemDocType;
  file_name: string;
  file_url: string;
  ai_analysis: string | null;
  is_generated: boolean;
  created_at: string;
}

export type GemDocType =
  | "tender_document"
  | "atc"
  | "bot"
  | "corrigendum"
  | "cover_letter"
  | "compliance_matrix"
  | "experience_cert"
  | "undertaking"
  | "other";

// ── Scan Log (unchanged) ──────────────────────────────────────────────────────
export interface GemScanLog {
  id: string;
  business_id: string;
  scan_type: "full" | "incremental" | "manual";
  bids_found: number;
  bids_new: number;
  status: "running" | "completed" | "failed" | "captcha_blocked";
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

// ── Config (credentials removed) ─────────────────────────────────────────────
export interface GemConfig {
  categories: string[];
  keywords: string[];
  scan_frequency: "manual" | "30min" | "1hr" | "6hr" | "daily";
  notifications_enabled: boolean;
}

// ── Business Capability Profile ───────────────────────────────────────────────
export interface GemBusinessProfile {
  id: string;
  business_id: string;
  msme_category: "micro" | "small" | "medium" | "none" | null;
  udyam_number: string | null;
  turnover_fy1: number | null;
  turnover_fy2: number | null;
  turnover_fy3: number | null;
  turnover_fy_labels: string[] | null;
  years_in_business: number | null;
  gem_seller_registered: boolean;
  gem_seller_id: string | null;
  certifications: string[] | null;
  supply_states: string[] | null;
  ai_capability_summary: string | null;
  ai_recommended_categories: AIRecommendedCategory[] | null;
  ai_typical_bid_min: number | null;
  ai_typical_bid_max: number | null;
  ai_eligibility_gaps: string[] | null;
  ai_product_categories: string[] | null;
  setup_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIRecommendedCategory {
  category: string;
  confidence: number;  // 0-100
  reasoning: string;
}

// ── API response shapes ───────────────────────────────────────────────────────
export interface ScanResult {
  scan_id: string;
  status: "completed" | "failed" | "captcha_blocked";
  bids_found: number;
  bids_new: number;
  duration_ms: number;
  error?: string;
  captcha_screenshot?: string;
}

export interface AnalyzeResult {
  bid_id: string;
  summary: string;
  eligibility: AIEligibility;
  requirements: AIRequirement[];
  doc_checklist: AIDocChecklistItem[];
}

export interface GenerateDocResult {
  doc_id: string;
  doc_type: GemDocType;
  file_name: string;
  file_url: string;
}

export interface ShortlistResult {
  shortlisted: number;
  scored: number;
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd D:\invio && npm run build 2>&1 | head -40
```

Expected: build succeeds or only pre-existing errors appear (none related to `gem.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/types/gem.ts
git commit -m "feat(gem): update types — add shortlisted status, match score fields, GemBusinessProfile"
```

---

## Task 3: Fetch-Detail API Route

Scrapes the individual bid page at `bidplus.gem.gov.in/bid/index/{encoded-bid-id}` to retrieve full specification text. Called after scan for each new bid.

**Files:**
- Create: `src/app/api/gem-scraper/fetch-detail/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/gem-scraper/fetch-detail/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomDelay = (min: number, max: number) => delay(min + Math.random() * (max - min));

/**
 * Scrapes the full specification page for a single GeM bid.
 * POST /api/gem-scraper/fetch-detail
 * Body: { bid_id: string }  — the Supabase row id (uuid)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();
    if (!userData?.business_id) return NextResponse.json({ error: "No business" }, { status: 400 });

    const body = await request.json();
    const { bid_id } = body as { bid_id: string };
    if (!bid_id) return NextResponse.json({ error: "bid_id required" }, { status: 400 });

    const { data: bid } = await supabase
      .from("gem_bids")
      .select("gem_bid_id, raw_full_text")
      .eq("id", bid_id)
      .eq("business_id", userData.business_id)
      .single();

    if (!bid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });

    // Already fetched — skip
    if (bid.raw_full_text) {
      return NextResponse.json({ status: "already_fetched", bid_id });
    }

    // Build the detail URL. GeM uses the bid number directly in the path.
    // e.g. GEM/2026/B/12345  →  https://bidplus.gem.gov.in/bid/index/GEM/2026/B/12345
    const detailUrl = `https://bidplus.gem.gov.in/bid/index/${bid.gem_bid_id}`;

    let browser: any;
    try {
      const puppeteerExtra = await import("puppeteer-extra");
      const StealthPlugin = await import("puppeteer-extra-plugin-stealth");
      const puppeteer = puppeteerExtra.default;
      puppeteer.use(StealthPlugin.default());
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      });
    } catch {
      const puppeteer = await import("puppeteer");
      browser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      });
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    let fullText = "";
    try {
      await page.goto(detailUrl, { waitUntil: "networkidle2", timeout: 45000 });
      await randomDelay(1500, 3000);

      fullText = await page.evaluate(() => {
        // Remove navigation, scripts, styles
        const remove = document.querySelectorAll("nav, script, style, footer, header, .navbar, .sidebar");
        remove.forEach((el) => el.remove());

        // Extract all visible text from the main content area
        const main = document.querySelector(
          "main, #main-content, .bid-detail, .container, body"
        );
        return (main?.innerText || document.body.innerText || "")
          .replace(/\s{3,}/g, "\n\n")
          .trim()
          .substring(0, 30000); // cap at 30k chars — enough for analysis
      });
    } catch (err: any) {
      await browser.close();
      return NextResponse.json(
        { error: `Failed to fetch bid page: ${err.message}` },
        { status: 500 }
      );
    }

    await browser.close();

    if (!fullText || fullText.length < 100) {
      return NextResponse.json({ error: "Bid page returned empty content" }, { status: 422 });
    }

    await supabase
      .from("gem_bids")
      .update({ raw_full_text: fullText, updated_at: new Date().toISOString() })
      .eq("id", bid_id);

    return NextResponse.json({ status: "fetched", bid_id, text_length: fullText.length });
  } catch (err: any) {
    console.error("fetch-detail error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd D:\invio && npm run build 2>&1 | grep -E "error|Error" | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/gem-scraper/fetch-detail/route.ts
git commit -m "feat(gem): add fetch-detail route — scrapes full bid spec from bidplus.gem.gov.in"
```

---

## Task 4: Business Profile Analyze API Route

Auto-analyzes the business's existing invoices and purchase orders to suggest capability profile fields. Called in step 1 of the onboarding wizard.

**Files:**
- Create: `src/app/api/gem-business-profile/analyze/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/gem-business-profile/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiChat } from "@/lib/ai-client";

/**
 * Analyzes existing invoice/PO data to auto-suggest capability profile.
 * POST /api/gem-business-profile/analyze
 * No body required — reads from authenticated user's business.
 */
export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();
    if (!userData?.business_id) return NextResponse.json({ error: "No business" }, { status: 400 });

    const businessId = userData.business_id;

    // Fetch business profile
    const { data: business } = await supabase
      .from("businesses")
      .select("name, gstin, address")
      .eq("id", businessId)
      .single();

    // Fetch recent invoice items with HSN codes (what they SELL)
    const { data: invoiceItems } = await supabase
      .from("invoice_items")
      .select("description, hsn_code, gst_rate, amount, quantity, unit")
      .eq("invoice_id", supabase
        .from("invoices")
        .select("id")
        .eq("business_id", businessId)
      )
      .limit(200);

    // Fetch invoice summaries for value analysis
    const { data: invoices } = await supabase
      .from("invoices")
      .select("total, invoice_date, customer_name, status")
      .eq("business_id", businessId)
      .eq("status", "paid")
      .order("invoice_date", { ascending: false })
      .limit(100);

    // Fetch purchase invoices (what they BUY — for experience proof)
    const { data: purchaseInvoices } = await supabase
      .from("purchase_invoices")
      .select("total, bill_date, supplier_name, status")
      .eq("business_id", businessId)
      .order("bill_date", { ascending: false })
      .limit(50);

    // Build analysis prompt
    const invoiceSummary = invoices && invoices.length > 0
      ? `Paid invoices (${invoices.length} records):
- Total values: ₹${invoices.map(i => i.total).join(", ₹")}
- Average invoice value: ₹${Math.round(invoices.reduce((s, i) => s + (i.total || 0), 0) / invoices.length).toLocaleString("en-IN")}
- Max invoice value: ₹${Math.max(...invoices.map(i => i.total || 0)).toLocaleString("en-IN")}
- Customers (sample): ${invoices.slice(0, 10).map(i => i.customer_name).filter(Boolean).join(", ")}`
      : "No invoice data available.";

    const itemSummary = invoiceItems && invoiceItems.length > 0
      ? `Invoice line items (${invoiceItems.length} records):
${invoiceItems.slice(0, 50).map(i =>
  `- ${i.description}${i.hsn_code ? ` (HSN: ${i.hsn_code})` : ""}${i.gst_rate ? `, GST ${i.gst_rate}%` : ""}`
).join("\n")}`
      : "No invoice line item data available.";

    const purchaseSummary = purchaseInvoices && purchaseInvoices.length > 0
      ? `Purchase invoices (${purchaseInvoices.length} records):
- Total values: ${purchaseInvoices.slice(0, 20).map(i => `₹${i.total?.toLocaleString("en-IN")}`).join(", ")}
- Suppliers: ${purchaseInvoices.slice(0, 10).map(i => i.supplier_name).filter(Boolean).join(", ")}`
      : "No purchase data available.";

    const prompt = `You are an expert at analyzing Indian SME businesses for Government e-Marketplace (GeM) bid suitability.

Analyze the following business data and return a JSON capability profile.

Company: ${business?.name || "Unknown"}
GSTIN: ${business?.gstin || "Not provided"}
State: ${business?.address || "Not provided"}

--- Sales Data ---
${invoiceSummary}

--- Products / Services Sold ---
${itemSummary}

--- Procurement Data ---
${purchaseSummary}

Return ONLY valid JSON with this exact structure:
{
  "ai_capability_summary": "2-3 sentence summary of what this business does, what they supply, at what scale, and their key strengths for GeM bidding",
  "ai_product_categories": ["category1", "category2"],
  "ai_recommended_categories": [
    {
      "category": "Exact GeM category name",
      "confidence": 85,
      "reasoning": "Why this category fits based on the data"
    }
  ],
  "ai_typical_bid_min": 50000,
  "ai_typical_bid_max": 2000000,
  "ai_eligibility_gaps": ["gap1 — e.g. No ISO 9001 certification likely needed for IT bids", "gap2"],
  "suggested_keywords": ["keyword1", "keyword2", "keyword3"]
}

Rules:
- ai_recommended_categories: list 3-5 specific GeM categories that match their products/services. Use actual GeM category names.
- ai_typical_bid_min/max: estimate the bid value range they can realistically fulfill (in INR, based on their invoice history).
- ai_eligibility_gaps: list 2-4 common eligibility gaps for their category (e.g., missing MSME cert, turnover threshold, specific licenses).
- If data is sparse, make reasonable estimates but flag them.
- Return ONLY the JSON, no markdown.`;

    const raw = await aiChat([{ role: "user", content: prompt }], {
      tier: "enhanced",
      temperature: 0.2,
      maxTokens: 2048,
    });

    // Parse JSON — strip markdown fences if present
    let result: any;
    try {
      const cleaned = raw.replace(/^```json?\s*/im, "").replace(/\n?```\s*$/im, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      result = JSON.parse(match ? match[0] : cleaned);
    } catch {
      return NextResponse.json({ error: "AI analysis failed to parse" }, { status: 422 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("gem profile analyze error:", err);
    return NextResponse.json({ error: err.message || "Analysis failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the save route**

```typescript
// src/app/api/gem-business-profile/save/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { GemBusinessProfile } from "@/types/gem";

/**
 * Upserts the gem_business_profile for the authenticated user's business.
 * POST /api/gem-business-profile/save
 * Body: Partial<GemBusinessProfile> (without id, business_id, created_at, updated_at)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();
    if (!userData?.business_id) return NextResponse.json({ error: "No business" }, { status: 400 });

    const body = await request.json();
    const { id: _id, business_id: _bid, created_at: _ca, ...fields } = body;

    const { data, error } = await supabase
      .from("gem_business_profile")
      .upsert(
        { ...fields, business_id: userData.business_id, updated_at: new Date().toISOString() },
        { onConflict: "business_id" }
      )
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("gem profile save error:", err);
    return NextResponse.json({ error: err.message || "Save failed" }, { status: 500 });
  }
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();
    if (!userData?.business_id) return NextResponse.json(null);

    const { data } = await supabase
      .from("gem_business_profile")
      .select("*")
      .eq("business_id", userData.business_id)
      .maybeSingle();

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Build check**

```bash
cd D:\invio && npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no new TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/gem-business-profile/
git commit -m "feat(gem): add business profile analyze + save API routes"
```

---

## Task 5: GeM Onboarding Wizard (`/bids/setup`)

4-step wizard that collects business capability data for intelligent bid matching.

**Files:**
- Create: `src/app/(dashboard)/bids/setup/page.tsx`

- [ ] **Step 1: Create the wizard page**

```typescript
// src/app/(dashboard)/bids/setup/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Loader2, CheckCircle2, Sparkles,
  Building2, Award, MapPin, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { AIRecommendedCategory } from "@/types/gem";
import { INDIAN_STATES } from "@/types/database";

const CERTIFICATIONS = [
  "ISO 9001", "ISO 14001", "ISO 27001", "BIS", "NABL",
  "CMMI Level 3", "CMMI Level 5", "GeM Registered Seller",
  "DPIIT Startup", "Udyam MSME",
];

const GEM_CATEGORIES = [
  "IT Services & Consulting", "Software Development & Maintenance",
  "Computer Hardware & Peripherals", "Networking & Telecom Equipment",
  "Office Stationery & Supplies", "Office Furniture & Fixtures",
  "Medical Equipment & Supplies", "Catering & Food Services",
  "Security Services", "Housekeeping & Facility Management",
  "Vehicle Renting & Leasing", "Construction & Civil Works",
  "Electrical Equipment & Supplies", "Printing & Packaging",
  "Training & Skill Development", "Manpower Supply",
  "Engineering & Manufacturing", "Textiles & Uniforms",
  "Agriculture & Allied Products", "Others",
];

type Step = 1 | 2 | 3 | 4;

interface ProfileDraft {
  // Step 2
  msme_category: "micro" | "small" | "medium" | "none";
  udyam_number: string;
  years_in_business: string;
  gem_seller_registered: boolean;
  gem_seller_id: string;
  turnover_fy1: string;
  turnover_fy2: string;
  turnover_fy3: string;
  // Step 3
  certifications: string[];
  supply_states: string[];
  // Step 4 (AI-generated + user-confirmed)
  ai_capability_summary: string;
  ai_recommended_categories: AIRecommendedCategory[];
  confirmed_categories: string[];
  ai_typical_bid_min: string;
  ai_typical_bid_max: string;
  ai_eligibility_gaps: string[];
  suggested_keywords: string[];
}

const EMPTY_DRAFT: ProfileDraft = {
  msme_category: "none",
  udyam_number: "",
  years_in_business: "",
  gem_seller_registered: false,
  gem_seller_id: "",
  turnover_fy1: "",
  turnover_fy2: "",
  turnover_fy3: "",
  certifications: [],
  supply_states: [],
  ai_capability_summary: "",
  ai_recommended_categories: [],
  confirmed_categories: [],
  ai_typical_bid_min: "",
  ai_typical_bid_max: "",
  ai_eligibility_gaps: [],
  suggested_keywords: [],
};

export default function BidSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Step 1: auto-analyze on mount
  const runAnalysis = useCallback(async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/gem-business-profile/analyze", { method: "POST" });
      if (!res.ok) throw new Error("Analysis failed");
      const data = await res.json();
      setDraft((prev) => ({
        ...prev,
        ai_capability_summary: data.ai_capability_summary || "",
        ai_recommended_categories: data.ai_recommended_categories || [],
        confirmed_categories: (data.ai_recommended_categories || []).map((c: AIRecommendedCategory) => c.category),
        ai_typical_bid_min: String(data.ai_typical_bid_min || ""),
        ai_typical_bid_max: String(data.ai_typical_bid_max || ""),
        ai_eligibility_gaps: data.ai_eligibility_gaps || [],
        suggested_keywords: data.suggested_keywords || [],
      }));
    } catch (err: any) {
      toast.error("Auto-analysis failed. You can still fill in details manually.");
    }
    setAnalyzing(false);
  }, []);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  const updateDraft = (fields: Partial<ProfileDraft>) => setDraft((prev) => ({ ...prev, ...fields }));

  const toggleItem = (field: "certifications" | "supply_states" | "confirmed_categories", value: string) => {
    setDraft((prev) => {
      const arr = prev[field] as string[];
      return { ...prev, [field]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        msme_category: draft.msme_category,
        udyam_number: draft.udyam_number || null,
        years_in_business: draft.years_in_business ? parseInt(draft.years_in_business) : null,
        gem_seller_registered: draft.gem_seller_registered,
        gem_seller_id: draft.gem_seller_id || null,
        turnover_fy1: draft.turnover_fy1 ? parseFloat(draft.turnover_fy1) : null,
        turnover_fy2: draft.turnover_fy2 ? parseFloat(draft.turnover_fy2) : null,
        turnover_fy3: draft.turnover_fy3 ? parseFloat(draft.turnover_fy3) : null,
        turnover_fy_labels: ["FY 2024-25", "FY 2023-24", "FY 2022-23"],
        certifications: draft.certifications,
        supply_states: draft.supply_states,
        ai_capability_summary: draft.ai_capability_summary,
        ai_recommended_categories: draft.ai_recommended_categories,
        ai_product_categories: draft.confirmed_categories,
        ai_typical_bid_min: draft.ai_typical_bid_min ? parseFloat(draft.ai_typical_bid_min) : null,
        ai_typical_bid_max: draft.ai_typical_bid_max ? parseFloat(draft.ai_typical_bid_max) : null,
        ai_eligibility_gaps: draft.ai_eligibility_gaps,
        setup_completed: true,
      };

      // Save profile
      const profileRes = await fetch("/api/gem-business-profile/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!profileRes.ok) throw new Error("Failed to save profile");

      // Save confirmed categories as gem_config keywords too
      if (draft.suggested_keywords.length > 0) {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: userData } = await supabase.from("users").select("business_id").eq("id", user.id).single();
          if (userData?.business_id) {
            await supabase.from("gem_config").upsert({
              business_id: userData.business_id,
              categories: draft.confirmed_categories,
              keywords: draft.suggested_keywords,
              scan_frequency: "manual",
              notifications_enabled: false,
              updated_at: new Date().toISOString(),
            }, { onConflict: "business_id" });
          }
        }
      }

      toast.success("Profile saved! Redirecting to bid finder...");
      setTimeout(() => router.push("/bids"), 1500);
    } catch (err: any) {
      toast.error(err.message || "Save failed");
    }
    setSaving(false);
  };

  const STEP_LABELS: Record<Step, string> = {
    1: "Business Intelligence",
    2: "MSME & Financials",
    3: "Certifications & Reach",
    4: "Confirm Categories",
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/bids" className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">GeM Bid Setup</h1>
          <p className="text-sm text-muted-foreground">
            One-time setup to enable AI-powered bid matching
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 transition-colors ${
              s < step ? "bg-primary border-primary text-white" :
              s === step ? "border-primary text-primary" :
              "border-muted-foreground/30 text-muted-foreground/50"
            }`}>
              {s < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : s}
            </div>
            <span className={`text-xs hidden sm:block ${s === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>
              {STEP_LABELS[s]}
            </span>
            {s < 4 && <div className={`h-px flex-1 ${s < step ? "bg-primary" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Auto-Analysis */}
      {step === 1 && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-950/30">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Analyzing Your Business</h2>
              <p className="text-xs text-muted-foreground">
                We're reading your invoices and purchase history to understand what you supply
              </p>
            </div>
          </div>

          {analyzing ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Analyzing your invoices and POs...</p>
            </div>
          ) : draft.ai_capability_summary ? (
            <div className="space-y-4">
              <div className="p-4 bg-purple-50 dark:bg-purple-950/20 rounded-xl border border-purple-200 dark:border-purple-800/50">
                <p className="text-xs font-semibold text-purple-700 dark:text-purple-400 mb-1.5">Business Summary</p>
                <p className="text-sm text-foreground leading-relaxed">{draft.ai_capability_summary}</p>
              </div>

              {draft.ai_recommended_categories.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-foreground mb-2">Suggested GeM Categories</p>
                  <div className="space-y-1.5">
                    {draft.ai_recommended_categories.map((cat) => (
                      <div key={cat.category} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/50 text-xs">
                        <div className="shrink-0 mt-0.5 font-bold text-primary">{cat.confidence}%</div>
                        <div>
                          <p className="font-medium text-foreground">{cat.category}</p>
                          <p className="text-muted-foreground">{cat.reasoning}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {draft.ai_eligibility_gaps.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-foreground mb-2">Eligibility Gaps to Watch</p>
                  <ul className="space-y-1">
                    {draft.ai_eligibility_gaps.map((gap, i) => (
                      <li key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                        <span className="mt-0.5">⚠</span>{gap}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-muted-foreground">Analysis could not complete. No invoice data found yet, or there was an error.</p>
              <Button variant="outline" size="sm" onClick={runAnalysis}>
                <Sparkles className="w-4 h-4 mr-1.5" />
                Retry Analysis
              </Button>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={() => setStep(2)} className="rounded-full px-6">
              Next <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: MSME & Financials */}
      {step === 2 && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-950/30">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">MSME & Financial Details</h2>
              <p className="text-xs text-muted-foreground">Required for many government tenders</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* MSME Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">MSME Category</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(["none", "micro", "small", "medium"] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => updateDraft({ msme_category: cat })}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium capitalize transition-colors ${
                      draft.msme_category === cat
                        ? "bg-primary text-white border-primary"
                        : "border-border hover:border-primary/50 text-foreground"
                    }`}
                  >
                    {cat === "none" ? "Not MSME" : cat}
                  </button>
                ))}
              </div>
            </div>

            {draft.msme_category !== "none" && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Udyam Registration Number</label>
                <Input
                  placeholder="UDYAM-XX-00-0000000"
                  value={draft.udyam_number}
                  onChange={(e) => updateDraft({ udyam_number: e.target.value })}
                />
              </div>
            )}

            {/* Annual Turnover */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Annual Turnover (₹ Lakhs)</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "FY 2024-25", key: "turnover_fy1" },
                  { label: "FY 2023-24", key: "turnover_fy2" },
                  { label: "FY 2022-23", key: "turnover_fy3" },
                ].map(({ label, key }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">{label}</label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={(draft as any)[key]}
                      onChange={(e) => updateDraft({ [key]: e.target.value } as any)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Years in Business</label>
                <Input
                  type="number"
                  placeholder="e.g. 5"
                  value={draft.years_in_business}
                  onChange={(e) => updateDraft({ years_in_business: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">GeM Seller Registration</label>
                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="checkbox"
                    id="gem_seller"
                    checked={draft.gem_seller_registered}
                    onChange={(e) => updateDraft({ gem_seller_registered: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="gem_seller" className="text-xs text-foreground">Registered on GeM portal</label>
                </div>
              </div>
            </div>

            {draft.gem_seller_registered && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">GeM Seller ID</label>
                <Input
                  placeholder="e.g. SEL12345678"
                  value={draft.gem_seller_id}
                  onChange={(e) => updateDraft({ gem_seller_id: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(1)} className="rounded-md">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
            <Button onClick={() => setStep(3)} className="rounded-full px-6">
              Next <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Certifications & Supply States */}
      {step === 3 && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/30">
              <Award className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Certifications & Supply Reach</h2>
              <p className="text-xs text-muted-foreground">Determines which bids you qualify for</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Certifications you hold</label>
              <div className="flex flex-wrap gap-2">
                {CERTIFICATIONS.map((cert) => (
                  <button
                    key={cert}
                    onClick={() => toggleItem("certifications", cert)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      draft.certifications.includes(cert)
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : "border-border hover:border-emerald-400 text-foreground"
                    }`}
                  >
                    {cert}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">States you can supply to</label>
              <p className="text-[11px] text-muted-foreground">Select all that apply. PAN India = select all.</p>
              <div className="max-h-48 overflow-y-auto border border-border rounded-lg p-2.5 grid grid-cols-2 sm:grid-cols-3 gap-1">
                <button
                  onClick={() => updateDraft({
                    supply_states: draft.supply_states.length === INDIAN_STATES.length
                      ? []
                      : INDIAN_STATES.map((s) => s.name),
                  })}
                  className={`col-span-full text-xs px-2 py-1.5 rounded-md border font-semibold text-left mb-1 transition-colors ${
                    draft.supply_states.length === INDIAN_STATES.length
                      ? "bg-primary text-white border-primary"
                      : "border-primary text-primary hover:bg-primary/10"
                  }`}
                >
                  PAN India (Select All)
                </button>
                {INDIAN_STATES.map((state) => (
                  <button
                    key={state.code}
                    onClick={() => toggleItem("supply_states", state.name)}
                    className={`text-xs px-2 py-1 rounded text-left transition-colors ${
                      draft.supply_states.includes(state.name)
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {state.name}
                  </button>
                ))}
              </div>
              {draft.supply_states.length > 0 && draft.supply_states.length < INDIAN_STATES.length && (
                <p className="text-[11px] text-muted-foreground">{draft.supply_states.length} states selected</p>
              )}
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(2)} className="rounded-md">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
            <Button onClick={() => setStep(4)} className="rounded-full px-6">
              Next <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm Categories */}
      {step === 4 && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-950/30">
              <Tag className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Confirm Bid Categories</h2>
              <p className="text-xs text-muted-foreground">
                These will be used to scan GeM and rank matching bids
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              AI suggested the categories below. Select all that apply to your business.
            </p>
            <div className="flex flex-wrap gap-2">
              {GEM_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => toggleItem("confirmed_categories", cat)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    draft.confirmed_categories.includes(cat)
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "border-border hover:border-indigo-400 text-foreground"
                  }`}
                >
                  {cat}
                  {draft.ai_recommended_categories.some((r) => r.category === cat) && (
                    <span className="ml-1 opacity-60">★</span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">★ = AI-recommended based on your invoices</p>
          </div>

          {draft.ai_typical_bid_min && draft.ai_typical_bid_max && (
            <div className="p-3 bg-muted/50 rounded-lg text-xs">
              <p className="font-medium text-foreground mb-1">Suggested Bid Value Range</p>
              <p className="text-muted-foreground">
                ₹{parseFloat(draft.ai_typical_bid_min).toLocaleString("en-IN")} –{" "}
                ₹{parseFloat(draft.ai_typical_bid_max).toLocaleString("en-IN")}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Based on your invoice history. You can target bids within this range to maximize win probability.
              </p>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(3)} className="rounded-md">
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || draft.confirmed_categories.length === 0}
              className="rounded-full px-6 shadow-lg shadow-primary/20"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
              )}
              {saving ? "Saving..." : "Complete Setup"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
cd D:\invio && npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no new TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/bids/setup/
git commit -m "feat(gem): add 4-step GeM onboarding wizard at /bids/setup"
```

---

## Task 6: Shortlist API Route

Bulk-ranks all `new` bids against the business capability profile using a single AI call.

**Files:**
- Create: `src/app/api/gem-scraper/shortlist/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/gem-scraper/shortlist/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiChat } from "@/lib/ai-client";
import type { GemBusinessProfile } from "@/types/gem";

/**
 * Ranks all 'new' bids for this business against the capability profile.
 * POST /api/gem-scraper/shortlist
 * No body required.
 * 
 * Updates bids:
 *  - score >= 70: status → 'shortlisted', ai_match_score, ai_match_reason set
 *  - score < 70: ai_match_score set, status stays 'new'
 */
export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();
    if (!userData?.business_id) return NextResponse.json({ error: "No business" }, { status: 400 });

    const businessId = userData.business_id;

    // Fetch the capability profile
    const { data: profile } = await supabase
      .from("gem_business_profile")
      .select("*")
      .eq("business_id", businessId)
      .maybeSingle() as { data: GemBusinessProfile | null };

    if (!profile?.setup_completed) {
      return NextResponse.json(
        { error: "Complete the GeM setup wizard first at /bids/setup" },
        { status: 400 }
      );
    }

    // Fetch all new bids (no score yet)
    const { data: bids } = await supabase
      .from("gem_bids")
      .select("id, gem_bid_id, title, department, organization, category, quantity, uom, estimated_value, end_date, bid_type, ai_summary, raw_full_text")
      .eq("business_id", businessId)
      .eq("status", "new")
      .order("scraped_at", { ascending: false })
      .limit(50); // process in batches of 50

    if (!bids || bids.length === 0) {
      return NextResponse.json({ shortlisted: 0, scored: 0, message: "No new bids to score" });
    }

    // Build profile summary for prompt
    const profileSummary = `
Business Capability Profile:
- Summary: ${profile.ai_capability_summary || "Not available"}
- Categories: ${(profile.ai_product_categories || []).join(", ") || "Not specified"}
- MSME: ${profile.msme_category || "Not registered"}
- Annual Turnover: ₹${profile.turnover_fy1 || 0}L (FY24-25), ₹${profile.turnover_fy2 || 0}L (FY23-24)
- Years in Business: ${profile.years_in_business || "Unknown"}
- Certifications: ${(profile.certifications || []).join(", ") || "None specified"}
- Supply States: ${(profile.supply_states || []).join(", ") || "Not specified"}
- Typical Bid Range: ₹${profile.ai_typical_bid_min?.toLocaleString("en-IN") || "?"} – ₹${profile.ai_typical_bid_max?.toLocaleString("en-IN") || "?"}
- Known Eligibility Gaps: ${(profile.ai_eligibility_gaps || []).join("; ") || "None identified"}
    `.trim();

    // Build bids list for prompt
    const bidsText = bids.map((bid, i) => `
[${i + 1}] ID: ${bid.id}
  Title: ${bid.title}
  Dept: ${bid.department || "N/A"} | Category: ${bid.category || "N/A"}
  Qty: ${bid.quantity || "?"} ${bid.uom || ""} | Value: ₹${bid.estimated_value?.toLocaleString("en-IN") || "N/A"}
  Closes: ${bid.end_date ? new Date(bid.end_date).toLocaleDateString("en-IN") : "N/A"}
  ${bid.ai_summary ? `Summary: ${bid.ai_summary.substring(0, 200)}` : ""}
  ${bid.raw_full_text ? `Spec excerpt: ${bid.raw_full_text.substring(0, 500)}` : ""}
`.trim()).join("\n\n");

    const prompt = `You are an expert GeM (Government e-Marketplace) bid advisor for Indian SMEs.

${profileSummary}

Rate each of the following ${bids.length} bids on how well they match this business. 
Consider: category match, bid value within their range, eligibility (MSME/certs), supply state match.

${bidsText}

Return ONLY a valid JSON array — one object per bid, in the same order:
[
  {
    "id": "exact-uuid-from-bid",
    "score": 85,
    "reason": "Strong match: IT services category aligns perfectly, value ₹5L within their range, MSME preferred"
  }
]

Scoring guide:
- 90-100: Perfect match — category, value, eligibility all align
- 70-89: Good match — 2 out of 3 criteria strongly align
- 50-69: Partial match — some overlap but concerns (e.g. value too high, missing cert)
- 0-49: Poor match — wrong category or company clearly not eligible

Return ONLY the JSON array, no markdown fences.`;

    const raw = await aiChat([{ role: "user", content: prompt }], {
      tier: "enhanced",
      temperature: 0.1,
      maxTokens: 4096,
    });

    // Parse result
    let scores: { id: string; score: number; reason: string }[];
    try {
      const cleaned = raw.replace(/^```json?\s*/im, "").replace(/\n?```\s*$/im, "").trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      scores = JSON.parse(match ? match[0] : cleaned);
    } catch {
      return NextResponse.json({ error: "AI scoring failed to parse" }, { status: 422 });
    }

    // Apply scores to bids
    let shortlistedCount = 0;
    for (const { id, score, reason } of scores) {
      const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
      const newStatus = clampedScore >= 70 ? "shortlisted" : "new";
      if (newStatus === "shortlisted") shortlistedCount++;

      await supabase
        .from("gem_bids")
        .update({
          ai_match_score: clampedScore,
          ai_match_reason: reason,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("business_id", businessId);
    }

    return NextResponse.json({
      shortlisted: shortlistedCount,
      scored: scores.length,
    });
  } catch (err: any) {
    console.error("shortlist error:", err);
    return NextResponse.json({ error: err.message || "Shortlisting failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build check**

```bash
cd D:\invio && npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: no new TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/gem-scraper/shortlist/route.ts
git commit -m "feat(gem): add shortlist route — bulk AI ranking of new bids against capability profile"
```

---

## Task 7: Update Scan Route

Remove credential logic. Read keywords/categories from `gem_config`. After each new bid is saved, enqueue `fetch-detail`.

**Files:**
- Modify: `src/app/api/gem-scraper/scan/route.ts`

- [ ] **Step 1: Replace the scan route**

Replace `src/app/api/gem-scraper/scan/route.ts` entirely with:

```typescript
// src/app/api/gem-scraper/scan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomDelay = (min: number, max: number) => delay(min + Math.random() * (max - min));

/**
 * Scans bidplus.gem.gov.in/all-bids for new bids — no credentials needed.
 * POST /api/gem-scraper/scan
 * Body: { keywords?: string[], maxPages?: number }  (overrides saved config)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let scanLogId: string | null = null;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();
    if (!userData?.business_id) return NextResponse.json({ error: "No business" }, { status: 400 });

    const businessId = userData.business_id;

    // Load saved config for keywords/categories
    const { data: savedConfig } = await supabase
      .from("gem_config")
      .select("keywords, categories")
      .eq("business_id", businessId)
      .maybeSingle();

    const body = await request.json().catch(() => ({}));
    // Body overrides saved config
    const keywords: string[] = body.keywords ?? savedConfig?.keywords ?? [];
    const categories: string[] = body.categories ?? savedConfig?.categories ?? [];
    const maxPages: number = body.maxPages ?? 3;

    // Create scan log
    const { data: scanLog } = await supabase
      .from("gem_scan_logs")
      .insert({ business_id: businessId, scan_type: "manual", status: "running" })
      .select()
      .single();
    scanLogId = scanLog?.id || null;

    // Launch Puppeteer
    let browser: any;
    try {
      const puppeteerExtra = await import("puppeteer-extra");
      const StealthPlugin = await import("puppeteer-extra-plugin-stealth");
      const puppeteer = puppeteerExtra.default;
      puppeteer.use(StealthPlugin.default());
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--window-size=1920,1080"],
      });
    } catch {
      const puppeteer = await import("puppeteer");
      browser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--window-size=1920,1080"],
      });
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    // Build search URL — use first keyword if available
    const searchParam = keywords.length > 0
      ? `?searchText=${encodeURIComponent(keywords[0])}`
      : "";
    const gemUrl = `https://bidplus.gem.gov.in/all-bids${searchParam}`;

    await page.goto(gemUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await randomDelay(2000, 4000);

    // Check for CAPTCHA
    const hasCaptcha = await page.evaluate(() => {
      const body = (document.body as HTMLElement).innerText.toLowerCase();
      return (
        body.includes("captcha") ||
        body.includes("verify you are human") ||
        !!document.querySelector("iframe[src*='recaptcha']") ||
        !!document.querySelector(".g-recaptcha")
      );
    });

    if (hasCaptcha) {
      const screenshot = await page.screenshot({ encoding: "base64" });
      await browser.close();
      if (scanLogId) await supabase.from("gem_scan_logs").update({ status: "captcha_blocked", duration_ms: Date.now() - startTime }).eq("id", scanLogId);
      return NextResponse.json({ status: "captcha_blocked", bids_found: 0, bids_new: 0, duration_ms: Date.now() - startTime, captcha_screenshot: screenshot });
    }

    // Scrape listing pages
    const allBids: any[] = [];
    for (let pageNum = 0; pageNum < maxPages; pageNum++) {
      await randomDelay(2000, 4000);

      const pageBids = await page.evaluate(() => {
        const bids: any[] = [];
        const bidCards = document.querySelectorAll(
          ".bid-listing-card, .card.bid-card, [class*=\"bid-list\"], table tbody tr, .block_m"
        );
        bidCards.forEach((card) => {
          try {
            const text = (card as HTMLElement).innerText || card.textContent || "";
            const bidMatch = text.match(/GEM\/\d{4}\/[A-Z]\/\d+/);
            if (!bidMatch) return;
            const bidId = bidMatch[0];
            const titleEl = card.querySelector("h5, h4, .bid-title, [class*=\"title\"], td:nth-child(2)");
            const title = (titleEl as HTMLElement)?.innerText?.trim() || "";
            const deptMatch = text.match(/(?:Department|Ministry|Organization|Buyer)[:\s]*([^\n,]+)/i);
            const qtyMatch = text.match(/(?:Quantity|Qty)[:\s]*(\d[\d,]*)/i);
            const dateRegex = /(\d{2}[-/]\d{2}[-/]\d{4})/g;
            const dates = text.match(dateRegex) || [];
            const valueMatch = text.match(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)/);
            const linkEl = card.querySelector("a[href*='bid']") as HTMLAnchorElement | null;
            bids.push({
              gem_bid_id: bidId,
              title: title.substring(0, 500),
              department: deptMatch ? deptMatch[1].trim() : null,
              quantity: qtyMatch ? qtyMatch[1].replace(/,/g, "") : null,
              start_date: dates[0] || null,
              end_date: dates[1] || null,
              estimated_value: valueMatch ? parseFloat(valueMatch[1].replace(/,/g, "")) : null,
              bid_url: linkEl?.href || null,
            });
          } catch { /* skip malformed */ }
        });
        return bids;
      });
      allBids.push(...pageBids);

      if (pageNum < maxPages - 1) {
        try {
          const nextBtn = await page.$("a[rel=\"next\"], .pagination .next a, button.next-page, [aria-label=\"Next\"]");
          if (nextBtn) { await nextBtn.click(); await randomDelay(3000, 5000); }
          else break;
        } catch { break; }
      }
    }

    await browser.close();

    // Deduplicate
    const uniqueBids = new Map<string, any>();
    allBids.forEach((bid) => { if (bid.gem_bid_id) uniqueBids.set(bid.gem_bid_id, bid); });

    // Check existing
    const existingIds: string[] = [];
    if (uniqueBids.size > 0) {
      const { data: existing } = await supabase
        .from("gem_bids").select("gem_bid_id")
        .eq("business_id", businessId)
        .in("gem_bid_id", Array.from(uniqueBids.keys()));
      existing?.forEach((e: any) => existingIds.push(e.gem_bid_id));
    }

    // Insert new bids
    const newBids: any[] = [];
    for (const [bidId, bid] of uniqueBids) {
      if (existingIds.includes(bidId)) continue;
      const parseDate = (d: string | null) => {
        if (!d) return null;
        const parts = d.split(/[-/]/);
        return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : null;
      };
      newBids.push({
        business_id: businessId,
        gem_bid_id: bidId,
        title: bid.title || "Untitled Bid",
        department: bid.department,
        quantity: bid.quantity,
        estimated_value: bid.estimated_value,
        start_date: parseDate(bid.start_date),
        end_date: parseDate(bid.end_date),
        bid_url: bid.bid_url,
        status: "new",
      });
    }

    let insertedBids: any[] = [];
    if (newBids.length > 0) {
      const { data } = await supabase.from("gem_bids").insert(newBids).select("id");
      insertedBids = data || [];
    }

    const durationMs = Date.now() - startTime;
    if (scanLogId) {
      await supabase.from("gem_scan_logs").update({
        status: "completed",
        bids_found: uniqueBids.size,
        bids_new: newBids.length,
        duration_ms: durationMs,
      }).eq("id", scanLogId);
    }

    // Kick off fetch-detail for new bids in the background (fire & forget)
    // We use the internal API — each request is independent so failures don't block scan result
    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    for (const inserted of insertedBids.slice(0, 10)) { // limit to 10 per scan
      fetch(`${baseUrl}/api/gem-scraper/fetch-detail`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: request.headers.get("cookie") || "" },
        body: JSON.stringify({ bid_id: inserted.id }),
      }).catch(() => { /* background — ignore failures */ });
      await delay(500); // stagger requests
    }

    return NextResponse.json({
      status: "completed",
      bids_found: uniqueBids.size,
      bids_new: newBids.length,
      duration_ms: durationMs,
      scan_id: scanLogId,
    });
  } catch (error: any) {
    console.error("GeM scan error:", error);
    if (scanLogId) {
      const supabase = await createClient();
      await supabase.from("gem_scan_logs").update({ status: "failed", error_message: error.message, duration_ms: Date.now() - startTime }).eq("id", scanLogId);
    }
    return NextResponse.json({ status: "failed", error: error.message, bids_found: 0, bids_new: 0 }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add `NEXT_PUBLIC_APP_URL` note**

Add this to your `.env.local` if not already present:
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
In production, set this to your actual domain.

- [ ] **Step 3: Build check**

```bash
cd D:\invio && npm run build 2>&1 | grep -E "error TS" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/gem-scraper/scan/route.ts
git commit -m "feat(gem): update scan route — read settings from DB, remove credentials, auto-trigger fetch-detail"
```

---

## Task 8: Update Settings Page

Remove credentials fields. Add a link to the setup wizard if profile isn't complete.

**Files:**
- Modify: `src/app/(dashboard)/bids/settings/page.tsx`

- [ ] **Step 1: Remove the credentials card**

In `src/app/(dashboard)/bids/settings/page.tsx`:

Remove the entire `useState` for `username`/`password`:
```typescript
// DELETE these two lines:
const [username, setUsername] = useState("");
const [password, setPassword] = useState("");
```

Remove from `fetchSettings`:
```typescript
// DELETE these two lines inside fetchSettings:
setUsername(config.gem_username || "");
setPassword(config.gem_password || "");
```

Remove from `handleSave` the payload fields:
```typescript
// In the upsert payload, remove:
gem_username: username || null,
gem_password: password || null,
```

Remove the entire "GeM Portal Login" card (the `<div>` starting with the `<Lock />` icon, containing the username/password inputs). It spans roughly lines 213–241 in the original.

- [ ] **Step 2: Add a setup wizard banner at the top of the settings grid**

After the error/success banners and before the `<div className="grid gap-6">`, add:

```typescript
{/* Setup Wizard Banner */}
<div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 border border-purple-200 dark:border-purple-800/50 rounded-xl p-4 flex items-center justify-between gap-4">
  <div>
    <p className="text-sm font-semibold text-foreground">Business Capability Profile</p>
    <p className="text-xs text-muted-foreground mt-0.5">
      Complete the setup wizard to enable AI-powered bid shortlisting.
    </p>
  </div>
  <Link href="/bids/setup">
    <Button size="sm" className="rounded-full shrink-0">
      <Sparkles className="w-4 h-4 mr-1.5" />
      Open Setup
    </Button>
  </Link>
</div>
```

Add the missing imports at the top of the file:
```typescript
import Link from "next/link";
import { Sparkles } from "lucide-react";
// (Sparkles and Link may already be imported — check first)
```

- [ ] **Step 3: Build check**

```bash
cd D:\invio && npm run build 2>&1 | grep -E "error TS" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/bids/settings/page.tsx
git commit -m "feat(gem): remove credentials from settings; add setup wizard link"
```

---

## Task 9: Update Bids List Page

Add "Shortlisted" tab showing AI-ranked bids with match score and reason. Add "Complete setup" banner when no profile exists. Add "Shortlist Now" button.

**Files:**
- Modify: `src/app/(dashboard)/bids/page.tsx`

- [ ] **Step 1: Add state, fetch profile, and shortlist handler**

At the top of `BidsPage` component (after existing state declarations), add:

```typescript
const [hasProfile, setHasProfile] = useState<boolean | null>(null);
const [shortlisting, setShortlisting] = useState(false);
```

Add a `useEffect` to check if profile exists:
```typescript
useEffect(() => {
  fetch("/api/gem-business-profile/save")  // GET
    .then((r) => r.json())
    .then((data) => setHasProfile(!!data?.setup_completed))
    .catch(() => setHasProfile(false));
}, []);
```

Add shortlist handler after `handleScan`:
```typescript
const handleShortlist = async () => {
  setShortlisting(true);
  setScanResult(null);
  try {
    const res = await fetch("/api/gem-scraper/shortlist", { method: "POST" });
    const result = await res.json();
    if (res.ok) {
      setScanResult(`✅ Shortlisting complete! ${result.shortlisted} of ${result.scored} bids matched your profile.`);
      fetchBids();
    } else {
      setScanResult(`❌ Shortlisting failed: ${result.error}`);
    }
  } catch (err: any) {
    setScanResult(`❌ Error: ${err.message}`);
  }
  setShortlisting(false);
};
```

- [ ] **Step 2: Add `shortlisted` to STATUS_TABS and STATUS_CONFIG**

```typescript
// In STATUS_TABS, add after "all":
const STATUS_TABS: (GemBidStatus | "all")[] = [
  "all", "shortlisted", "new", "analyzed", "interested", "applied", "won", "lost", "expired",
];

// In STATUS_CONFIG, add:
shortlisted: { label: "Shortlisted", color: "text-violet-700 dark:text-violet-400", bgColor: "bg-violet-50 dark:bg-violet-950/30", icon: Sparkles },
```

- [ ] **Step 3: Add imports for Sparkles and Link (if missing)**

```typescript
import { Sparkles } from "lucide-react";
import Link from "next/link";
```

- [ ] **Step 4: Add profile banner + shortlist button to the header section**

After the scan result banner, before the Stats Row, add:

```typescript
{/* No profile banner */}
{hasProfile === false && (
  <div className="p-4 rounded-xl border border-purple-200 dark:border-purple-800/50 bg-purple-50 dark:bg-purple-950/20 flex items-center justify-between gap-4">
    <div>
      <p className="text-sm font-semibold text-foreground">Set up your business profile to get AI shortlisting</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        Takes 3 minutes — we'll auto-analyze your invoices and suggest matching bids.
      </p>
    </div>
    <Link href="/bids/setup">
      <Button size="sm" className="rounded-full shrink-0">
        <Sparkles className="w-4 h-4 mr-1.5" /> Complete Setup
      </Button>
    </Link>
  </div>
)}
```

Add "Shortlist Now" button next to "Scan Now" in the header actions div:

```typescript
{hasProfile && (
  <Button
    onClick={handleShortlist}
    disabled={shortlisting}
    variant="outline"
    className="rounded-full px-5"
  >
    {shortlisting ? (
      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
    ) : (
      <Sparkles className="w-4 h-4 mr-1.5" />
    )}
    {shortlisting ? "Ranking..." : "Shortlist Now"}
  </Button>
)}
```

- [ ] **Step 5: Show match score on bid cards**

In the bid card (inside the map), after the `ai_summary` line, add:

```typescript
{bid.ai_match_score !== null && bid.ai_match_score !== undefined && (
  <div className="flex items-center gap-2 mt-2">
    <div className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
      bid.ai_match_score >= 70
        ? "bg-violet-100 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400"
        : "bg-muted text-muted-foreground"
    }`}>
      {bid.ai_match_score}% match
    </div>
    {bid.ai_match_reason && (
      <span className="text-[11px] text-muted-foreground line-clamp-1">
        {bid.ai_match_reason}
      </span>
    )}
  </div>
)}
```

- [ ] **Step 6: Build check**

```bash
cd D:\invio && npm run build 2>&1 | grep -E "error TS" | head -20
```

- [ ] **Step 7: Commit**

```bash
git add src/app/(dashboard)/bids/page.tsx
git commit -m "feat(gem): update bid list — shortlisted tab, match score on cards, shortlist button"
```

---

## Task 10: Fix Bid Detail Page

Show all AI-extracted fields (risk, evaluation method, full financials/dates). Fix document download. Add "Fetch Full Details" button.

**Files:**
- Modify: `src/app/(dashboard)/bids/[id]/page.tsx`

- [ ] **Step 1: Fix document download**

Find the download button in the `generatedDocs.map()` section (around line 657):
```typescript
// REPLACE:
<button className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-700">
  <Download className="w-3 h-3" />
</button>

// WITH:
<a
  href={doc.file_url.startsWith("http") ? doc.file_url : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gem-documents/${doc.file_url}`}
  download={doc.file_name}
  target="_blank"
  rel="noopener noreferrer"
  className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-700 flex items-center"
>
  <Download className="w-3 h-3" />
</a>
```

Apply the same fix to the tender docs section (the Eye and Download buttons around line 498):
```typescript
// REPLACE the Download button:
<button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
  <Download className="w-3.5 h-3.5" />
</button>

// WITH:
<a
  href={doc.file_url.startsWith("http") ? doc.file_url : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gem-documents/${doc.file_url}`}
  download={doc.file_name}
  target="_blank"
  rel="noopener noreferrer"
  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center"
>
  <Download className="w-3.5 h-3.5" />
</a>
```

- [ ] **Step 2: Add Fetch Full Details button and handler**

Add state at top of component:
```typescript
const [fetchingDetails, setFetchingDetails] = useState(false);
```

Add handler after `handleAnalyze`:
```typescript
const handleFetchDetails = async () => {
  if (!bid) return;
  setFetchingDetails(true);
  try {
    const res = await fetch("/api/gem-scraper/fetch-detail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bid_id: bid.id }),
    });
    if (res.ok) {
      await fetchBid();
      toast.success("Full bid details fetched");
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to fetch details");
    }
  } catch (err: any) {
    toast.error(err.message);
  }
  setFetchingDetails(false);
};
```

Add a `toast` import (it's `sonner`):
```typescript
import { toast } from "sonner";
```

In the header actions area (next to "AI Analyze" button), add:
```typescript
{!bid.raw_full_text && (
  <Button
    onClick={handleFetchDetails}
    disabled={fetchingDetails}
    variant="outline"
    size="sm"
    className="rounded-md"
  >
    {fetchingDetails ? (
      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
    ) : (
      <Eye className="w-4 h-4 mr-1.5" />
    )}
    {fetchingDetails ? "Fetching..." : "Fetch Full Spec"}
  </Button>
)}
{bid.raw_full_text && (
  <span className="text-[11px] text-emerald-600 flex items-center gap-1">
    <CheckCircle2 className="w-3.5 h-3.5" /> Full spec loaded
  </span>
)}
```

- [ ] **Step 3: Add Risk & Evaluation section to right panel**

The `analyze` API returns `risk_assessment` and `evaluation_method` but they're not stored on the `gem_bids` row — they're only returned in the API response. The fix is to store them.

In `src/app/api/gem-scraper/analyze/route.ts`, in the `supabase.from("gem_bids").update(...)` call, add two more fields to the update payload. First add them to the DB migration (update Task 1 migration file) — actually to avoid re-running the migration, add them as an ALTER in a second migration:

Create `supabase/migrations/20260609b_gem_bids_extra_fields.sql`:
```sql
ALTER TABLE gem_bids
  ADD COLUMN IF NOT EXISTS ai_risk_assessment TEXT,
  ADD COLUMN IF NOT EXISTS ai_evaluation_method TEXT,
  ADD COLUMN IF NOT EXISTS ai_emd_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS ai_delivery_date TEXT;
```

Run this in Supabase SQL editor.

Update `src/types/gem.ts` — add to `GemBid` interface:
```typescript
ai_risk_assessment: string | null;
ai_evaluation_method: string | null;
ai_emd_amount: number | null;
ai_delivery_date: string | null;
```

Update `src/app/api/gem-scraper/analyze/route.ts` — in the `.update({...})` call add:
```typescript
ai_risk_assessment: analysis.risk_assessment || null,
ai_evaluation_method: analysis.evaluation_method || null,
ai_emd_amount: analysis.financials?.emd_amount || null,
ai_delivery_date: analysis.key_dates?.delivery_date || null,
```

In `src/app/(dashboard)/bids/[id]/page.tsx`, add a "Risk & Evaluation" card to the right panel (after the Financial card):

```typescript
{(bid.ai_risk_assessment || bid.ai_evaluation_method) && (
  <div className="bg-card border border-border rounded-xl p-4">
    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
      <Shield className="w-4 h-4" />
      Risk & Evaluation
    </h3>
    <div className="space-y-2.5">
      {bid.ai_evaluation_method && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Evaluation</span>
          <span className="font-medium text-foreground">{bid.ai_evaluation_method}</span>
        </div>
      )}
      {bid.ai_emd_amount && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">EMD Amount</span>
          <span className="font-medium text-foreground">₹{bid.ai_emd_amount.toLocaleString("en-IN")}</span>
        </div>
      )}
      {bid.ai_delivery_date && (
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Delivery By</span>
          <span className="font-medium text-foreground">{bid.ai_delivery_date}</span>
        </div>
      )}
      {bid.ai_risk_assessment && (
        <div className="pt-1 border-t border-border">
          <p className="text-[10px] font-semibold text-muted-foreground mb-1">RISK</p>
          <p className={`text-xs font-medium ${
            bid.ai_risk_assessment.startsWith("Low") ? "text-emerald-600" :
            bid.ai_risk_assessment.startsWith("Medium") ? "text-amber-600" : "text-red-600"
          }`}>
            {bid.ai_risk_assessment}
          </p>
        </div>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: Final build check**

```bash
cd D:\invio && npm run build 2>&1 | grep -E "error TS" | head -20
```

Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/bids/ src/app/api/gem-scraper/analyze/route.ts src/types/gem.ts supabase/migrations/
git commit -m "feat(gem): fix document download, add Fetch Full Spec button, show risk/evaluation in detail panel"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|-------------|------|
| Remove credential-based login | Task 7 (scan), Task 8 (settings) |
| Business capability profile onboarding | Tasks 4, 5 |
| Auto-analyze invoices/POs for profile | Task 4 (`/api/gem-business-profile/analyze`) |
| MSME, turnover, certifications, supply states | Task 5 (wizard Steps 2 & 3) |
| AI-generates capability profile | Task 4 (AI prompt) |
| Scrape full bid spec without credentials | Task 3 (`fetch-detail`) |
| Scan reads keywords/categories from settings | Task 7 |
| Bulk AI shortlisting against profile | Task 6 |
| "Shortlisted" status + score on bid cards | Task 9 |
| Show setup banner when no profile | Task 9 |
| Fix document download | Task 10 |
| Show risk, evaluation method, EMD, delivery | Task 10 |
| DB schema for all new fields | Task 1 |

### Placeholder scan
- No TBDs, no "implement later" phrases
- All code blocks are complete
- All file paths are exact

### Type consistency check
- `GemBid.ai_match_score` defined in Task 2, used in Tasks 6, 9 ✓
- `GemBusinessProfile` defined in Task 2, used in Tasks 5, 6 ✓
- `AIRecommendedCategory` defined in Task 2, used in Task 5 ✓
- `GemBidStatus` includes `"shortlisted"` in Task 2, used in Tasks 6, 9 ✓
- `raw_full_text` in `GemBid` (Task 2), written by Task 3, read by Task 6 and Task 10 ✓

---

*Plan complete and saved to `docs/superpowers/plans/2026-06-09-gem-bid-overhaul.md`.*

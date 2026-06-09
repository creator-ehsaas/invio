"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Loader2, CheckCircle2, Sparkles,
  Building2, Award, Tag,
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
  msme_category: "micro" | "small" | "medium" | "none";
  udyam_number: string;
  years_in_business: string;
  gem_seller_registered: boolean;
  gem_seller_id: string;
  turnover_fy1: string;
  turnover_fy2: string;
  turnover_fy3: string;
  certifications: string[];
  supply_states: string[];
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
    } catch {
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

      const profileRes = await fetch("/api/gem-business-profile/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!profileRes.ok) throw new Error("Failed to save profile");

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

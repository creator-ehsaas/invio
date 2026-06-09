"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Save,
  Loader2,
  Sparkles,
  Tag,
  Info,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Broad GeM categories covering most Indian SME product/service types
const GEM_CATEGORIES = [
  // IT & Electronics
  "Computer Hardware & Peripherals",
  "IT Software & Services",
  "Networking & Communication Equipment",
  "Electronic Components",
  // Office & Stationery
  "Office Furniture & Fixtures",
  "Office Stationery & Supplies",
  "Printing & Imaging Equipment",
  // Industrial & Manufacturing
  "Steel & Metal Products",
  "Electrical Equipment & Supplies",
  "Industrial Machinery & Equipment",
  "Tools & Hardware",
  "Chemicals & Consumables",
  "Pipes, Fittings & Plumbing",
  "Construction Materials",
  // Services
  "Facility Management Services",
  "Security & Surveillance Services",
  "Housekeeping & Sanitation Services",
  "IT AMC & Support Services",
  "Printing & Packaging Services",
  "Consulting & Advisory Services",
  "Training & Skill Development",
  "Manpower & Staffing Services",
  // Healthcare & Safety
  "Medical Devices & Equipment",
  "PPE & Safety Equipment",
  "Lab Equipment & Supplies",
  // Vehicles & Logistics
  "Vehicle Hiring & Leasing",
  "Logistics & Courier Services",
  // Food & Hospitality
  "Catering & Food Services",
  "Uniforms & Textiles",
];

export default function BidSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from("users")
        .select("business_id")
        .eq("id", user.id)
        .single();

      if (!userData?.business_id) {
        setError("No business profile found.");
        setLoading(false);
        return;
      }

      setBusinessId(userData.business_id);

      const { data: config } = await supabase
        .from("gem_config")
        .select("categories, keywords")
        .eq("business_id", userData.business_id)
        .maybeSingle();

      if (config) {
        setSelectedCategories(config.categories || []);
        setKeywords(config.keywords?.join(", ") || "");
      }
    } catch (err: any) {
      setError("Failed to load settings.");
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleSave = async () => {
    if (!businessId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);

    const keywordList = keywords
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    try {
      const supabase = createClient();
      const { error: saveError } = await supabase
        .from("gem_config")
        .upsert(
          { business_id: businessId, categories: selectedCategories, keywords: keywordList, scan_frequency: "manual", updated_at: new Date().toISOString() },
          { onConflict: "business_id" }
        );
      if (saveError) throw saveError;
      setSuccess("Settings saved.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/bids"
            className="p-2 rounded-xl hover:bg-muted transition-colors border border-transparent hover:border-border"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Bid Scanner Settings</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Tell Invio what to look for when scanning GeM for new bids
            </p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="rounded-full px-5 shadow-lg shadow-primary/20"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-700 dark:text-emerald-400 text-sm flex items-start gap-2.5">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      {/* How it works */}
      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 rounded-xl p-4 flex gap-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          When you click <strong>Scan Now</strong> on the Bids page, Invio searches the GeM portal for live government tenders matching your keywords and categories. New bids are saved to your dashboard automatically. The AI shortlisting then scores them against your business profile.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Keywords */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary" />
              Search Keywords
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Enter the products or services your business supplies — comma separated. These are used as search terms on GeM.
            </p>
          </div>
          <Input
            type="text"
            placeholder="e.g. steel furniture, powder coating, office chairs, fabrication"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Tip: Use specific product names (e.g. <em>"steel almirah"</em>) rather than broad terms (e.g. <em>"steel"</em>) to get more relevant results.
          </p>
        </div>

        {/* Categories */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              Categories to Watch
              {selectedCategories.length > 0 && (
                <span className="ml-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {selectedCategories.length} selected
                </span>
              )}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              These are used for filtering and AI shortlisting. Select all that apply to your business.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {GEM_CATEGORIES.map((cat) => {
              const active = selectedCategories.includes(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className={`text-xs px-3 py-1.5 rounded-full transition-all border ${
                    active
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-muted hover:bg-muted/80 text-muted-foreground border-border"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
          {selectedCategories.length === 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              No categories selected — all GeM bids will be scanned (may include irrelevant results).
            </p>
          )}
        </div>

        {/* AI Profile banner */}
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 border border-purple-200 dark:border-purple-800/50 rounded-xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">AI Shortlisting</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Complete your business capability profile to let AI rank bids by fit score and flag the best opportunities.
            </p>
          </div>
          <Link href="/bids/setup">
            <Button size="sm" className="rounded-full shrink-0 whitespace-nowrap">
              <Sparkles className="w-4 h-4 mr-1.5" />
              Setup Profile
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Link href="/bids">
          <Button variant="outline" className="rounded-md">Cancel</Button>
        </Link>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="rounded-full px-6 shadow-lg shadow-primary/20"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
          Save Settings
        </Button>
      </div>
    </div>
  );
}

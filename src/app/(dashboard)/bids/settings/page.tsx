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
  Bell,
  Clock,
  Briefcase,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const AVAILABLE_CATEGORIES = [
  "IT Services",
  "Software Development",
  "Office Stationery & Furniture",
  "Computer Hardware",
  "Catering Services",
  "Security Services",
  "Housekeeping Services",
  "Medical Equipment",
  "Vehicle Renting / Leasing",
  "Management Consulting",
];

export default function BidSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);

  // Form states
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [scanFrequency, setScanFrequency] = useState("manual");
  const [notifications, setNotifications] = useState(false);

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

      // Fetch GeM config
      const { data: config, error: configError } = await supabase
        .from("gem_config")
        .select("*")
        .eq("business_id", userData.business_id)
        .maybeSingle();

      if (configError) {
        // Table might not exist or other error, fallback to defaults
        console.warn("Could not load GeM settings from database:", configError.message);
      }

      if (config) {
        setSelectedCategories(config.categories || []);
        setKeywords(config.keywords?.join(", ") || "");
        setScanFrequency(config.scan_frequency || "manual");
        setNotifications(config.notifications_enabled || false);
      }
    } catch (err: any) {
      console.error("Error loading settings:", err);
      setError("Failed to load settings. Please make sure the SQL migration is applied.");
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
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
      
      // Upsert gem_config
      const { error: saveError } = await supabase
        .from("gem_config")
        .upsert({
          business_id: businessId,
          categories: selectedCategories,
          keywords: keywordList,
          scan_frequency: scanFrequency,
          notifications_enabled: notifications,
          updated_at: new Date().toISOString(),
        }, { onConflict: "business_id" });

      if (saveError) throw saveError;

      setSuccess("GeM Bid Finder settings saved successfully!");
      
      // Auto dismiss success toast after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error("Error saving settings:", err);
      setError(
        err.message?.includes("relation \"gem_config\" does not exist")
          ? "Database table 'gem_config' is missing. Please run the SQL migration `20260608_create_gem_config.sql` in your Supabase SQL editor."
          : err.message || "Failed to save settings."
      );
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
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Bid Finder Settings</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Configure scraping preferences, credentials, and notification schedules
            </p>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="rounded-full px-5 shadow-lg shadow-primary/20"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-1.5" />
          )}
          {saving ? "Saving..." : "Save Settings"}
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

      <div className="grid gap-6">
        {/* Categories Monitor */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary" />
            Categories to Monitor
          </h2>
          <p className="text-xs text-muted-foreground">
            Select specific GeM categories to discover. Only tenders matching these categories will be scraped.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {AVAILABLE_CATEGORIES.map((category) => {
              const active = selectedCategories.includes(category);
              return (
                <button
                  key={category}
                  onClick={() => handleCategoryToggle(category)}
                  className={`text-xs px-3.5 py-2 rounded-full transition-all border ${
                    active
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-muted hover:bg-muted/80 text-muted-foreground border-border"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        {/* Keywords Filter */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Tag className="w-4 h-4 text-primary" />
            Search Keywords
          </h2>
          <p className="text-xs text-muted-foreground">
            Comma-separated list of keywords. The scraper will use these to search the GeM portal (e.g., "laptop, facility management, steel fabrication").
          </p>
          <div className="space-y-1.5">
            <Input
              type="text"
              placeholder="e.g. software development, IT services, workstation"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
            />
          </div>
        </div>

        {/* Scan Schedule & Alerts */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Scan Schedule & Notifications
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {/* Frequency */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Scraping Schedule</label>
              <select
                value={scanFrequency}
                onChange={(e) => setScanFrequency(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-input bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="manual">Manual Scan Only</option>
                <option value="30min">Every 30 Minutes</option>
                <option value="1hr">Every Hour</option>
                <option value="6hr">Every 6 Hours</option>
                <option value="daily">Once a Day</option>
              </select>
            </div>

            {/* Notifications Toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-muted-foreground" />
                  New Bid Alerts
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Get browser notifications when matching bids are discovered.
                </p>
              </div>
              <input
                type="checkbox"
                checked={notifications}
                onChange={(e) => setNotifications(e.target.checked)}
                className="w-4 h-4 rounded text-primary border-input focus:ring-primary"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Save bar */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-4">
        <Link href="/bids">
          <Button variant="outline" className="rounded-md">
            Cancel
          </Button>
        </Link>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="rounded-full px-6 shadow-lg shadow-primary/20"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-1.5" />
          )}
          Save Settings
        </Button>
      </div>
    </div>
  );
}

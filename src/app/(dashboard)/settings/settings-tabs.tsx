"use client";

import { useState, type ReactNode } from "react";
import {
  User,
  Building,
  Settings,
  CreditCard,
  ChevronRight,
} from "lucide-react";

type Tab = "profile" | "business" | "preferences" | "billing";

const tabs: { id: Tab; label: string; icon: typeof User }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "business", label: "Business", icon: Building },
  { id: "preferences", label: "Preferences", icon: Settings },
  { id: "billing", label: "Billing", icon: CreditCard },
];

interface SettingsTabsProps {
  profileContent: ReactNode;
  businessContent: ReactNode;
  preferencesContent?: ReactNode;
  billingContent?: ReactNode;
}

export function SettingsTabs({
  profileContent,
  businessContent,
  preferencesContent,
  billingContent,
}: SettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("business");

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Tab Navigation */}
      <div className="lg:w-64 flex-shrink-0">
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-2 shadow-sm">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {activeTab === tab.id && <ChevronRight className="w-4 h-4 ml-auto" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
        {activeTab === "profile" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-foreground">Profile Settings</h2>
            {profileContent}
          </div>
        )}

        {activeTab === "business" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-foreground">Business Settings</h2>
            {businessContent}
          </div>
        )}

        {activeTab === "preferences" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-foreground">Preferences</h2>
            {preferencesContent || <PreferencesPlaceholder />}
          </div>
        )}

        {activeTab === "billing" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-foreground">Billing & Plan</h2>
            {billingContent || <BillingPlaceholder />}
          </div>
        )}
      </div>
    </div>
  );
}

function PreferencesPlaceholder() {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Language</label>
        <select className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground focus:ring-2 focus:ring-primary/20 outline-none">
          <option value="en">English</option>
          <option value="hi">Hindi (हिंदी)</option>
          <option value="mr">Marathi (मराठी)</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Currency Display</label>
        <select className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground focus:ring-2 focus:ring-primary/20 outline-none">
          <option value="inr">₹ INR (Indian Rupee)</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Default Payment Terms</label>
        <select className="w-full bg-secondary border-none rounded-xl px-4 py-3 text-foreground focus:ring-2 focus:ring-primary/20 outline-none">
          <option value="0">Due on Receipt</option>
          <option value="7">Net 7 Days</option>
          <option value="15">Net 15 Days</option>
          <option value="30">Net 30 Days</option>
        </select>
      </div>

      <div className="flex items-center justify-between p-4 bg-secondary rounded-xl">
        <div>
          <p className="text-sm font-medium text-foreground">Email Notifications</p>
          <p className="text-xs text-muted-foreground">
            Receive email alerts for payments and invoices
          </p>
        </div>
        <button
          className="w-12 h-6 rounded-full bg-primary relative transition-colors"
          role="switch"
        >
          <span className="absolute right-1 top-1 w-4 h-4 rounded-full bg-white shadow-sm" />
        </button>
      </div>
    </div>
  );
}

function BillingPlaceholder() {
  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <div className="p-6 bg-gradient-to-br from-primary/10 to-blue-500/10 rounded-2xl border border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-primary font-semibold uppercase tracking-wider">
              Current Plan
            </p>
            <p className="text-2xl font-bold text-foreground mt-1">Free</p>
          </div>
          <span className="px-3 py-1 bg-primary/20 text-primary text-xs font-semibold rounded-full">
            Active
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          You&apos;re on the free plan with basic features.
        </p>
        <button className="w-full py-3 bg-gradient-to-br from-primary to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all">
          Upgrade to Pro
        </button>
      </div>

      {/* Usage Stats */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Usage This Month</h3>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Invoices Created</span>
              <span className="text-foreground font-medium">0 / 10</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: "0%" }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Customers</span>
              <span className="text-foreground font-medium">0 / 25</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: "0%" }} />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-muted-foreground">Voice Transcriptions</span>
              <span className="text-foreground font-medium">0 / 50</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: "0%" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

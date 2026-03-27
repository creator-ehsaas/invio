"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  FileText,
  Users,
  IndianRupee,
  Clock,
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Check,
  BarChart3,
  ChevronRight,
  Loader2,
  X,
  Lightbulb,
  CheckCircle,
  Bell,
  Zap,
} from "lucide-react";
import { UpgradeBanner } from "@/components/billing/UpgradeBanner";

interface DashboardStats {
  totalInvoices: number;
  totalCustomers: number;
  totalRevenue: number;
  pendingAmount: number;
  inventoryItems: number;
  lowStockItems: number;
  hasBusinessProfile: boolean;
}

interface Insight {
  type: "success" | "warning" | "tip" | "action";
  title: string;
  message: string;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalInvoices: 0,
    totalCustomers: 0,
    totalRevenue: 0,
    pendingAmount: 0,
    inventoryItems: 0,
    lowStockItems: 0,
    hasBusinessProfile: false,
  });
  const [showInsights, setShowInsights] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchInsights = async () => {
    setLoadingInsights(true);
    setShowInsights(true);

    try {
      const res = await fetch("/api/insights", { method: "POST" });
      const data = await res.json();

      if (data.insights) {
        setInsights(data.insights);
      }
    } catch (error) {
      console.error("Failed to fetch insights:", error);
      setInsights([{
        type: "tip",
        title: "Getting Started",
        message: "Create more invoices and add customers to get personalized AI insights about your business."
      }]);
    } finally {
      setLoadingInsights(false);
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case "success": return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case "warning": return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case "action": return <Zap className="w-5 h-5 text-blue-500" />;
      default: return <Lightbulb className="w-5 h-5 text-violet-500" />;
    }
  };

  const getInsightBg = (type: string) => {
    switch (type) {
      case "success": return "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800";
      case "warning": return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
      case "action": return "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800";
      default: return "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800";
    }
  };

  const fetchDashboardData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (!userData?.business_id) {
      setLoading(false);
      return;
    }

    const businessId = userData.business_id;

    // Fetch all stats in parallel
    const [invoicesRes, customersRes, inventoryRes, businessRes] = await Promise.all([
      supabase.from("invoices").select("id, status, total").eq("business_id", businessId),
      supabase.from("customers").select("id").eq("business_id", businessId),
      supabase.from("inventory_items").select("id, current_stock, reorder_level").eq("business_id", businessId),
      supabase.from("businesses").select("name, gstin").eq("id", businessId).single(),
    ]);

    const invoices = invoicesRes.data || [];
    const customers = customersRes.data || [];
    const inventory = inventoryRes.data || [];

    const totalRevenue = invoices
      .filter(inv => inv.status === "paid")
      .reduce((sum, inv) => sum + (inv.total || 0), 0);

    const pendingAmount = invoices
      .filter(inv => inv.status !== "paid" && inv.status !== "cancelled")
      .reduce((sum, inv) => sum + (inv.total || 0), 0);

    const lowStockItems = inventory.filter(
      item => item.current_stock <= item.reorder_level
    ).length;

    setStats({
      totalInvoices: invoices.length,
      totalCustomers: customers.length,
      totalRevenue,
      pendingAmount,
      inventoryItems: inventory.length,
      lowStockItems,
      hasBusinessProfile: !!(businessRes.data?.name && businessRes.data?.gstin),
    });

    setLoading(false);
  };

  const greeting = getGreeting();

  const quickStartSteps = [
    { id: 1, label: "Complete your business profile", completed: stats.hasBusinessProfile, href: "/settings" },
    { id: 2, label: "Add your first customer", completed: stats.totalCustomers > 0, href: "/customers" },
    { id: 3, label: "Create your first invoice", completed: stats.totalInvoices > 0, href: "/invoices" },
    { id: 4, label: "Set up inventory items", completed: stats.inventoryItems > 0, href: "/inventory" },
  ];

  const completedSteps = quickStartSteps.filter((s) => s.completed).length;

  const statCards = [
    {
      title: "Total Invoices",
      value: stats.totalInvoices.toString(),
      subtitle: "All time",
      icon: FileText,
      iconBg: "bg-blue-100 dark:bg-blue-900/30",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      title: "Customers",
      value: stats.totalCustomers.toString(),
      badge: "Active",
      subtitle: "Total active",
      icon: Users,
      iconBg: "bg-violet-100 dark:bg-violet-900/30",
      iconColor: "text-violet-600 dark:text-violet-400",
    },
    {
      title: "Revenue",
      value: `₹${stats.totalRevenue.toLocaleString("en-IN")}`,
      subtitle: "Paid invoices",
      icon: IndianRupee,
      iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Pending",
      value: `₹${stats.pendingAmount.toLocaleString("en-IN")}`,
      subtitle: "Outstanding",
      icon: Clock,
      iconBg: "bg-amber-100 dark:bg-amber-900/30",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    {
      title: "Inventory",
      value: stats.inventoryItems.toString(),
      subtitle: "Items tracked",
      icon: Package,
      iconBg: "bg-cyan-100 dark:bg-cyan-900/30",
      iconColor: "text-cyan-600 dark:text-cyan-400",
    },
    {
      title: "Low Stock",
      value: stats.lowStockItems.toString(),
      badge: stats.lowStockItems > 0 ? "Check" : undefined,
      badgeColor: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      subtitle: "Need restock",
      icon: AlertTriangle,
      iconBg: "bg-orange-100 dark:bg-orange-900/30",
      iconColor: "text-orange-600 dark:text-orange-400",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upgrade banner for free users */}
      <UpgradeBanner />

      {/* Header with AI Insights */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{greeting}</h1>
          <p className="text-muted-foreground mt-1">
            Here&apos;s what&apos;s happening with your business today.
          </p>
        </div>
        <button
          onClick={fetchInsights}
          disabled={loadingInsights}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-200/50 dark:border-violet-800/50 text-sm font-medium text-violet-700 dark:text-violet-300 hover:from-violet-500/20 hover:to-purple-500/20 transition-all disabled:opacity-50"
        >
          {loadingInsights ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          <span>{loadingInsights ? "Analyzing..." : "AI Insights"}</span>
        </button>
      </div>

      {/* AI Insights Panel */}
      {showInsights && (
        <div className="bg-gradient-to-br from-violet-500/5 to-purple-500/5 backdrop-blur-xl rounded-2xl border border-violet-200/50 dark:border-violet-800/50 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" />
              <h2 className="text-lg font-semibold text-foreground">AI Business Insights</h2>
            </div>
            <button
              onClick={() => setShowInsights(false)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {loadingInsights ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-violet-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Analyzing your business data...</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {insights.map((insight, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-xl border ${getInsightBg(insight.type)}`}
                >
                  <div className="flex gap-3">
                    {getInsightIcon(insight.type)}
                    <div>
                      <h3 className="font-medium text-foreground">{insight.title}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">{insight.message}</p>
                    </div>
                  </div>
                </div>
              ))}
              {insights.length === 0 && !loadingInsights && (
                <p className="text-center text-muted-foreground py-4">
                  No insights available yet. Create more invoices to get AI-powered suggestions!
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-4 text-center">
            Powered by AI analysis of your invoices, customers, and inventory
          </p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.title}
              className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4 shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`p-2 rounded-xl ${stat.iconBg}`}>
                  <Icon className={`w-4 h-4 ${stat.iconColor}`} />
                </div>
                {stat.badge && (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      stat.badgeColor || "bg-primary/10 text-primary"
                    }`}
                  >
                    {stat.badge}
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
            </div>
          );
        })}
      </div>

      {/* Quick Start & Chart Row */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Quick Start Card */}
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Quick Start</h2>
            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">
              {completedSteps}/{quickStartSteps.length} completed
            </span>
          </div>
          <ul className="space-y-3">
            {quickStartSteps.map((step) => (
              <li key={step.id}>
                <Link
                  href={step.href}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors group"
                >
                  <span
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium ${
                      step.completed
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.completed ? <Check className="w-4 h-4" /> : step.id}
                  </span>
                  <span
                    className={`flex-1 text-sm ${
                      step.completed ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Revenue Chart Placeholder */}
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Revenue Overview</h2>
            <select className="text-xs bg-muted border-none rounded-lg px-3 py-1.5 text-muted-foreground">
              <option>This Month</option>
              <option>Last Month</option>
              <option>This Quarter</option>
            </select>
          </div>
          {stats.totalRevenue > 0 ? (
            <div className="h-48 flex flex-col items-center justify-center">
              <p className="text-4xl font-bold text-emerald-600">
                ₹{stats.totalRevenue.toLocaleString("en-IN")}
              </p>
              <p className="text-sm text-muted-foreground mt-2">Total Revenue</p>
              <div className="flex gap-4 mt-4 text-sm">
                <div className="text-center">
                  <p className="font-semibold text-foreground">{stats.totalInvoices}</p>
                  <p className="text-xs text-muted-foreground">Invoices</p>
                </div>
                <div className="text-center">
                  <p className="font-semibold text-amber-600">₹{stats.pendingAmount.toLocaleString("en-IN")}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="text-center">
                <BarChart3 className="w-10 h-10 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Revenue chart will appear here
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Start creating invoices to see data
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

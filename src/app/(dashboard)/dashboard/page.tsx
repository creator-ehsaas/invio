"use client";

import { useState } from "react";
import Link from "next/link";
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
} from "lucide-react";

const stats = [
  {
    title: "Total Invoices",
    value: "0",
    change: "+0%",
    trend: "up",
    subtitle: "This month",
    icon: FileText,
    iconBg: "bg-blue-100 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  {
    title: "Customers",
    value: "0",
    badge: "Active",
    subtitle: "Total active",
    icon: Users,
    iconBg: "bg-violet-100 dark:bg-violet-900/30",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
  {
    title: "Revenue",
    value: "₹0",
    change: "+0%",
    trend: "up",
    subtitle: "This month",
    icon: IndianRupee,
    iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  {
    title: "Pending",
    value: "₹0",
    change: "0%",
    trend: "neutral",
    subtitle: "Outstanding",
    icon: Clock,
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  {
    title: "Inventory",
    value: "0",
    subtitle: "Items tracked",
    icon: Package,
    iconBg: "bg-cyan-100 dark:bg-cyan-900/30",
    iconColor: "text-cyan-600 dark:text-cyan-400",
  },
  {
    title: "Low Stock",
    value: "0",
    badge: "Check",
    badgeColor: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    subtitle: "Need restock",
    icon: AlertTriangle,
    iconBg: "bg-orange-100 dark:bg-orange-900/30",
    iconColor: "text-orange-600 dark:text-orange-400",
  },
];

const quickStartSteps = [
  { id: 1, label: "Complete your business profile", completed: false, href: "/settings" },
  { id: 2, label: "Add your first customer", completed: false, href: "/customers" },
  { id: 3, label: "Create your first invoice", completed: false, href: "/invoices" },
  { id: 4, label: "Set up inventory items", completed: false, href: "/inventory" },
];

export default function DashboardPage() {
  const completedSteps = quickStartSteps.filter((s) => s.completed).length;
  const greeting = getGreeting();

  return (
    <div className="space-y-6">
      {/* Header with AI Insights */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{greeting}</h1>
          <p className="text-muted-foreground mt-1">
            Here&apos;s what&apos;s happening with your business today.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-200/50 dark:border-violet-800/50 text-sm font-medium text-violet-700 dark:text-violet-300 hover:from-violet-500/20 hover:to-purple-500/20 transition-all">
          <Sparkles className="w-4 h-4" />
          <span>AI Insights Available</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((stat) => {
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
                {stat.change && (
                  <span
                    className={`text-xs font-medium flex items-center gap-0.5 ${
                      stat.trend === "up"
                        ? "text-emerald-600"
                        : stat.trend === "down"
                        ? "text-red-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {stat.trend === "up" && <TrendingUp className="w-3 h-3" />}
                    {stat.trend === "down" && <TrendingDown className="w-3 h-3" />}
                    {stat.change}
                  </span>
                )}
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

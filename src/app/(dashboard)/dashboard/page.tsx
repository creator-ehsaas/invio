"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  FileText, Users, IndianRupee, Clock, Package, AlertTriangle,
  Sparkles, Check, BarChart3, ChevronRight, Loader2, X,
  Lightbulb, CheckCircle, Zap, GripVertical, Settings2, Eye, EyeOff,
  TrendingUp, Plus, ExternalLink, Receipt, ShoppingCart, Calendar, Key,
} from "lucide-react";
import { UpgradeBanner } from "@/components/billing/UpgradeBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  totalInvoices: number;
  totalCustomers: number;
  totalRevenue: number;
  pendingAmount: number;
  inventoryItems: number;
  lowStockItems: number;
  hasBusinessProfile: boolean;
  recentInvoices: RecentInvoice[];
  lowStockList: LowStockItem[];
  totalExpenses: number;
  totalPayables: number;
}

interface RecentInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  total: number;
  status: string;
}

interface LowStockItem {
  id: string;
  name: string;
  current_stock: number;
  reorder_level: number;
  unit?: string;
}

interface Insight {
  type: "success" | "warning" | "tip" | "action";
  title: string;
  message: string;
}

type WidgetId = "stats" | "quick-start" | "revenue" | "recent-invoices" | "low-stock" | "ai-insights" | "shortcuts-by-role";

interface Widget {
  id: WidgetId;
  label: string;
  defaultVisible: boolean;
}

const ALL_WIDGETS: Widget[] = [
  { id: "stats", label: "Stats Overview", defaultVisible: true },
  { id: "revenue", label: "Revenue Overview", defaultVisible: true },
  { id: "quick-start", label: "Quick Start", defaultVisible: true },
  { id: "recent-invoices", label: "Recent Invoices", defaultVisible: true },
  { id: "low-stock", label: "Low Stock Alerts", defaultVisible: true },
  { id: "ai-insights", label: "AI Insights", defaultVisible: true },
  { id: "shortcuts-by-role", label: "Role-Based Shortcuts", defaultVisible: true },
];

const WIDGET_ORDER_KEY = "invio_dashboard_order_v2";
const WIDGET_VISIBILITY_KEY = "invio_dashboard_visibility_v2";

type PeriodFilter = "all" | "this_month" | "last_month" | "this_quarter" | "this_year";

// Helper to determine if a date falls within a selected period
function isDateInPeriod(dateStr: string | null | undefined, period: PeriodFilter): boolean {
  if (!dateStr) return false;
  if (period === "all") return true;

  const date = new Date(dateStr);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (period) {
    case "this_month":
      return date.getMonth() === month && date.getFullYear() === year;
    case "last_month": {
      const lastMonth = month === 0 ? 11 : month - 1;
      const lastMonthYear = month === 0 ? year - 1 : year;
      return date.getMonth() === lastMonth && date.getFullYear() === lastMonthYear;
    }
    case "this_quarter": {
      const quarterStart = Math.floor(month / 3) * 3;
      const quarterStartLimit = new Date(year, quarterStart, 1);
      const quarterEndLimit = new Date(year, quarterStart + 3, 0, 23, 59, 59);
      return date >= quarterStartLimit && date <= quarterEndLimit;
    }
    case "this_year": {
      // Indian financial year (April 1st to March 31st)
      const fyStartYear = month >= 3 ? year : year - 1;
      const fyStart = new Date(fyStartYear, 3, 1);
      const fyEnd = new Date(fyStartYear + 1, 2, 31, 23, 59, 59);
      return date >= fyStart && date <= fyEnd;
    }
    default:
      return true;
  }
}

// ─── Sortable Widget Wrapper ──────────────────────────────────────────────────

function SortableWidget({
  id, customizing, children,
}: {
  id: string;
  customizing: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {customizing && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-3 top-3 z-10 cursor-grab active:cursor-grabbing p-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors touch-none"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className={cn(customizing && "ring-2 ring-primary/20 ring-offset-2 ring-offset-background rounded-2xl")}>
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    draft: "bg-muted text-muted-foreground",
    overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  };
  return (
    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize", map[status] || map.draft)}>
      {status}
    </span>
  );
}

function getInsightIcon(type: string) {
  switch (type) {
    case "success": return <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />;
    case "warning": return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />;
    case "action": return <Zap className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />;
    default: return <Lightbulb className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />;
  }
}

function getInsightBg(type: string) {
  switch (type) {
    case "success": return "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800";
    case "warning": return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
    case "action": return "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800";
    default: return "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800";
  }
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [userRole, setUserRole] = useState<"owner" | "staff">("owner");

  // Raw Database states
  const [rawInvoices, setRawInvoices] = useState<any[]>([]);
  const [rawPurchases, setRawPurchases] = useState<any[]>([]);
  const [rawExpenses, setRawExpenses] = useState<any[]>([]);
  const [customersCount, setCustomersCount] = useState(0);
  const [inventoryCount, setInventoryCount] = useState(0);
  const [lowStockList, setLowStockList] = useState<LowStockItem[]>([]);
  const [hasBusinessProfile, setHasBusinessProfile] = useState(false);

  const [insights, setInsights] = useState<Insight[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [customizing, setCustomizing] = useState(false);

  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>(() => {
    if (typeof window === "undefined") return ALL_WIDGETS.map((w) => w.id);
    try {
      const saved = localStorage.getItem(WIDGET_ORDER_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return ALL_WIDGETS.map((w) => w.id);
  });

  const [visibility, setVisibility] = useState<Record<WidgetId, boolean>>(() => {
    if (typeof window === "undefined") {
      return Object.fromEntries(ALL_WIDGETS.map((w) => [w.id, w.defaultVisible])) as Record<WidgetId, boolean>;
    }
    try {
      const saved = localStorage.getItem(WIDGET_VISIBILITY_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return Object.fromEntries(ALL_WIDGETS.map((w) => [w.id, w.defaultVisible])) as Record<WidgetId, boolean>;
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const fetchDashboardData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: userData } = await supabase
      .from("users").select("business_id, role").eq("id", user.id).single();
    if (userData) {
      setUserRole(userData.role || "owner");
    }
    if (!userData?.business_id) { setLoading(false); return; }

    const bId = userData.business_id;

    const [invoicesRes, customersRes, inventoryRes, businessRes, expensesRes, purchasesRes] = await Promise.all([
      supabase.from("invoices")
        .select("id, invoice_number, status, total, created_at, customers(name)")
        .eq("business_id", bId)
        .order("created_at", { ascending: false }),
      supabase.from("customers").select("id").eq("business_id", bId),
      supabase.from("inventory_items").select("id, name, current_stock, reorder_level, unit").eq("business_id", bId),
      supabase.from("businesses").select("name, gstin").eq("id", bId).single(),
      supabase.from("expenses").select("amount, expense_date, created_at").eq("business_id", bId),
      supabase.from("purchase_invoices").select("total, amount_paid, status, bill_date, created_at").eq("business_id", bId),
    ]);

    setRawInvoices(invoicesRes.data || []);
    setRawPurchases(purchasesRes.data || []);
    setRawExpenses(expensesRes.data || []);
    setCustomersCount((customersRes.data || []).length);
    setInventoryCount((inventoryRes.data || []).length);

    const inventory = inventoryRes.data || [];
    const lowStock = inventory.filter((item) => item.current_stock <= item.reorder_level);
    setLowStockList(lowStock);

    setHasBusinessProfile(!!(businessRes.data?.name && businessRes.data?.gstin));
    setLoading(false);
  }, []);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  // Recalculated values depending on date period filter
  const stats = useMemo(() => {
    const filteredInvoices = rawInvoices.filter((i) => isDateInPeriod(i.created_at, period));
    const filteredExpenses = rawExpenses.filter((e) => isDateInPeriod(e.expense_date || e.created_at, period));
    const filteredPurchases = rawPurchases.filter((p) => isDateInPeriod(p.bill_date || p.created_at, period));

    const totalRevenue = filteredInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
    const pendingAmount = filteredInvoices.filter((i) => i.status !== "paid" && i.status !== "cancelled").reduce((s, i) => s + (i.total || 0), 0);
    const totalExpenses = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const totalPayables = filteredPurchases.filter((p) => p.status !== "paid" && p.status !== "cancelled").reduce((s, p) => s + (p.total - p.amount_paid), 0);

    return {
      totalInvoices: filteredInvoices.length,
      totalRevenue,
      pendingAmount,
      totalExpenses,
      totalPayables,
      recentInvoices: filteredInvoices.slice(0, 8).map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number || `INV-${inv.id.slice(0, 6)}`,
        customer_name: (inv.customers as any)?.name || "Unknown",
        total: inv.total || 0,
        status: inv.status || "draft",
      })),
    };
  }, [rawInvoices, rawExpenses, rawPurchases, period]);

  const fetchInsights = async () => {
    setLoadingInsights(true);
    try {
      const res = await fetch("/api/insights", { method: "POST" });
      const data = await res.json();
      if (data.insights) setInsights(data.insights);
    } catch {
      setInsights([{ type: "tip", title: "Getting Started", message: "Create more invoices to get personalized AI insights." }]);
    } finally {
      setLoadingInsights(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const next = arrayMove(widgetOrder, widgetOrder.indexOf(active.id as WidgetId), widgetOrder.indexOf(over.id as WidgetId));
      setWidgetOrder(next);
      localStorage.setItem(WIDGET_ORDER_KEY, JSON.stringify(next));
    }
  };

  const toggleVisibility = (id: WidgetId) => {
    const next = { ...visibility, [id]: !visibility[id] };
    setVisibility(next);
    localStorage.setItem(WIDGET_VISIBILITY_KEY, JSON.stringify(next));
  };

  const resetLayout = () => {
    const order = ALL_WIDGETS.map((w) => w.id);
    const vis = Object.fromEntries(ALL_WIDGETS.map((w) => [w.id, w.defaultVisible])) as Record<WidgetId, boolean>;
    setWidgetOrder(order);
    setVisibility(vis);
    localStorage.removeItem(WIDGET_ORDER_KEY);
    localStorage.removeItem(WIDGET_VISIBILITY_KEY);
  };

  const quickStartSteps = [
    { id: 1, label: "Complete business profile", completed: hasBusinessProfile, href: "/settings" },
    { id: 2, label: "Add your first customer", completed: customersCount > 0, href: "/customers/new" },
    { id: 3, label: "Create your first invoice", completed: rawInvoices.length > 0, href: "/invoices/new" },
    { id: 4, label: "Set up inventory items", completed: inventoryCount > 0, href: "/inventory/new" },
  ];
  const completedSteps = quickStartSteps.filter((s) => s.completed).length;

  const statCards = [
    { title: "Invoices", value: stats.totalInvoices, fmt: "n", icon: FileText, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30", href: "/invoices" },
    { title: "Customers", value: customersCount, fmt: "n", icon: Users, color: "text-violet-600", bg: "bg-violet-100 dark:bg-violet-900/30", href: "/customers" },
    { title: "Revenue Collected", value: stats.totalRevenue, fmt: "c", icon: IndianRupee, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30", href: "/invoices" },
    { title: "Receivables", value: stats.pendingAmount, fmt: "c", icon: Clock, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30", href: "/invoices" },
    { title: "Payables", value: stats.totalPayables, fmt: "c", icon: ShoppingCart, color: "text-indigo-600", bg: "bg-indigo-100 dark:bg-indigo-900/30", href: "/purchases" },
    { title: "Expenses", value: stats.totalExpenses, fmt: "c", icon: Receipt, color: "text-rose-600", bg: "bg-rose-100 dark:bg-rose-900/30", href: "/expenses" },
  ];

  const renderWidget = (id: WidgetId): React.ReactNode => {
    if (!visibility[id]) return null;
    const pl = customizing ? "pl-10" : "";

    switch (id) {
      case "stats":
        return (
          <SortableWidget key={id} id={id} customizing={customizing}>
            <div className={cn("grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4", pl)}>
              {statCards.map((s) => {
                const Icon = s.icon;
                const val = s.fmt === "c" ? `₹${s.value.toLocaleString("en-IN")}` : String(s.value);
                return (
                  <Link key={s.title} href={s.href}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className={cn("p-2 rounded-xl", s.bg)}>
                            <Icon className={cn("w-4 h-4", s.color)} />
                          </div>
                        </div>
                        <p className="text-xl font-bold truncate">{val}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.title}</p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </SortableWidget>
        );

      case "revenue":
        return (
          <SortableWidget key={id} id={id} customizing={customizing}>
            <Card className={cn(pl)}>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Revenue & Liability</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-end gap-8 mb-6">
                  <div>
                    <p className="text-3xl font-bold text-emerald-600">₹{stats.totalRevenue.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total revenue collected</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-amber-600">₹{stats.pendingAmount.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-muted-foreground">Outstanding Receivables</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Revenue", value: stats.totalRevenue, color: "bg-emerald-500" },
                    { label: "Receivables", value: stats.pendingAmount, color: "bg-amber-400" },
                    { label: "Payables (Outstanding purchases)", value: stats.totalPayables, color: "bg-indigo-500" },
                    { label: "Expenses", value: stats.totalExpenses, color: "bg-rose-400" },
                  ].map((bar) => {
                    const max = Math.max(stats.totalRevenue + stats.pendingAmount, stats.totalPayables, stats.totalExpenses) || 1;
                    return (
                      <div key={bar.label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{bar.label}</span>
                          <span className="font-medium">₹{bar.value.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", bar.color)} style={{ width: `${Math.min((bar.value / max) * 100, 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </SortableWidget>
        );

      case "quick-start":
        return (
          <SortableWidget key={id} id={id} customizing={customizing}>
            <Card className={cn(pl)}>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Quick Start</CardTitle>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">{completedSteps}/{quickStartSteps.length}</span>
              </CardHeader>
              <CardContent className="pt-0">
                <Progress value={(completedSteps / quickStartSteps.length) * 100} className="h-1.5 mb-4" />
                <ul className="space-y-1">
                  {quickStartSteps.map((step) => (
                    <li key={step.id}>
                      <Link href={step.href} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors group">
                        <span className={cn("h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0", step.completed ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" : "bg-muted text-muted-foreground")}>
                          {step.completed ? <Check className="w-3.5 h-3.5" /> : step.id}
                        </span>
                        <span className={cn("flex-1 text-sm", step.completed && "line-through text-muted-foreground")}>{step.label}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </SortableWidget>
        );

      case "recent-invoices":
        return (
          <SortableWidget key={id} id={id} customizing={customizing}>
            <Card className={cn(pl)}>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">Recent Invoices</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" asChild>
                  <Link href="/invoices"><ExternalLink className="h-3 w-3" /> View all</Link>
                </Button>
              </CardHeader>
              <CardContent className="pt-0">
                {stats.recentInvoices.length > 0 ? (
                  <div className="space-y-0.5">
                    {stats.recentInvoices.map((inv) => (
                      <Link key={inv.id} href={`/invoices/${inv.id}`} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50 transition-colors">
                        <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <FileText className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{inv.customer_name}</p>
                          <p className="text-xs text-muted-foreground">{inv.invoice_number}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold">₹{inv.total.toLocaleString("en-IN")}</p>
                          <StatusBadge status={inv.status} />
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No invoices in this period</p>
                    <Button size="sm" variant="outline" className="mt-3 gap-1.5" asChild>
                      <Link href="/invoices/new"><Plus className="h-3.5 w-3.5" /> Create Invoice</Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </SortableWidget>
        );

      case "low-stock":
        return (
          <SortableWidget key={id} id={id} customizing={customizing}>
            <Card className={cn(pl)}>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  Low Stock Alerts
                  {lowStockList.length > 0 && (
                    <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{lowStockList.length}</Badge>
                  )}
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" asChild>
                  <Link href="/inventory"><ExternalLink className="h-3 w-3" /> Inventory</Link>
                </Button>
              </CardHeader>
              <CardContent className="pt-0">
                {lowStockList.length > 0 ? (
                  <div className="space-y-0.5">
                    {lowStockList.slice(0, 6).map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/50">
                        <div className="h-7 w-7 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                          <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground">Reorder at {item.reorder_level} {item.unit}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-orange-600">{item.current_stock}</p>
                          <p className="text-xs text-muted-foreground">{item.unit || "units"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <Package className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">All stock levels are healthy</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </SortableWidget>
        );

      case "ai-insights":
        return (
          <SortableWidget key={id} id={id} customizing={customizing}>
            <Card className={cn("border-violet-200/50 dark:border-violet-800/50 bg-gradient-to-br from-violet-500/5 to-purple-500/5", pl)}>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  AI Insights
                </CardTitle>
                {insights.length === 0 ? (
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300" onClick={fetchInsights} disabled={loadingInsights}>
                    {loadingInsights ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {loadingInsights ? "Analyzing…" : "Analyze"}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setInsights([])}>
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                {loadingInsights && (
                  <div className="flex flex-col items-center py-8">
                    <Loader2 className="h-7 w-7 animate-spin text-violet-500 mb-2" />
                    <p className="text-sm text-muted-foreground">Analyzing your business data…</p>
                  </div>
                )}
                {!loadingInsights && insights.length > 0 && (
                  <div className="space-y-3">
                    {insights.map((ins, i) => (
                      <div key={i} className={cn("p-3.5 rounded-xl border", getInsightBg(ins.type))}>
                        <div className="flex gap-3">
                          {getInsightIcon(ins.type)}
                          <div>
                            <p className="text-sm font-medium">{ins.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{ins.message}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!loadingInsights && insights.length === 0 && (
                  <div className="flex flex-col items-center py-8 text-center">
                    <Lightbulb className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">Click Analyze to get AI-powered insights</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Powered by your invoices, customers & inventory</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </SortableWidget>
        );

      case "shortcuts-by-role":
        return (
          <SortableWidget key={id} id={id} customizing={customizing}>
            <Card className={cn(pl)}>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Key className="h-4 w-4 text-primary" />
                  Quick Actions ({userRole === "owner" ? "Owner/Admin" : "Staff"})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/invoices/new" className="flex items-center gap-2 p-2.5 rounded-xl border hover:bg-muted/50 transition-colors">
                    <Plus className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-medium">New Invoice</span>
                  </Link>
                  <Link href="/customers/new" className="flex items-center gap-2 p-2.5 rounded-xl border hover:bg-muted/50 transition-colors">
                    <Plus className="h-4 w-4 text-violet-600" />
                    <span className="text-xs font-medium">New Customer</span>
                  </Link>
                  <Link href="/inventory/new" className="flex items-center gap-2 p-2.5 rounded-xl border hover:bg-muted/50 transition-colors">
                    <Plus className="h-4 w-4 text-orange-600" />
                    <span className="text-xs font-medium">New Item</span>
                  </Link>
                  {userRole === "owner" ? (
                    <>
                      <Link href="/expenses/new" className="flex items-center gap-2 p-2.5 rounded-xl border hover:bg-muted/50 transition-colors">
                        <Plus className="h-4 w-4 text-rose-600" />
                        <span className="text-xs font-medium">Record Expense</span>
                      </Link>
                      <Link href="/purchases/new" className="flex items-center gap-2 p-2.5 rounded-xl border hover:bg-muted/50 transition-colors">
                        <Plus className="h-4 w-4 text-emerald-600" />
                        <span className="text-xs font-medium">Add Purchase</span>
                      </Link>
                      <Link href="/reports" className="flex items-center gap-2 p-2.5 rounded-xl border hover:bg-muted/50 transition-colors">
                        <BarChart3 className="h-4 w-4 text-indigo-600" />
                        <span className="text-xs font-medium">Business Reports</span>
                      </Link>
                    </>
                  ) : (
                    <Link href="/invoices" className="flex items-center gap-2 p-2.5 rounded-xl border hover:bg-muted/50 transition-colors">
                      <FileText className="h-4 w-4 text-indigo-600" />
                      <span className="text-xs font-medium">Sales Directory</span>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          </SortableWidget>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Unified Dashboard Empty State for new accounts
  if (rawInvoices.length === 0 && customersCount === 0 && inventoryCount === 0) {
    return (
      <div className="space-y-6 pb-8">
        <UpgradeBanner />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">{getGreeting()} 👋</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Welcome to your billing & accounting dashboard.</p>
          </div>
        </div>

        <div className="text-center py-20 bg-card border border-border rounded-2xl max-w-2xl mx-auto mt-8 p-8 shadow-sm">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <h2 className="text-xl font-bold mb-2">No activity yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-8">
            Get started by setting up your business profile, adding your first customer, or creating a GST-compliant sales invoice.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <Button asChild className="w-full sm:w-auto">
              <Link href="/invoices/new">
                <Plus className="w-4 h-4 mr-2" /> Create First Invoice
              </Link>
            </Button>
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <Link href="/customers/new">
                <Users className="w-4 h-4 mr-2" /> Add Customer
              </Link>
            </Button>
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <Link href="/inventory/new">
                <Package className="w-4 h-4 mr-2" /> Add Stock Item
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const visibleWidgets = widgetOrder.filter((id) => visibility[id]);
  const otherWidgets = visibleWidgets.filter((id) => id !== "stats");

  return (
    <div className="space-y-6 pb-8">
      <UpgradeBanner />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{getGreeting()} 👋</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Here&apos;s what&apos;s happening with your business.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex items-center gap-2 bg-card border rounded-lg px-2.5 py-1.5 text-xs font-medium">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
              className="bg-transparent border-none focus:outline-none cursor-pointer pr-1"
            >
              <option value="all">All Time</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_quarter">This Quarter</option>
              <option value="this_year">This Year (FY)</option>
            </select>
          </div>

          {customizing && (
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={resetLayout}>
              Reset layout
            </Button>
          )}
          <Button variant={customizing ? "default" : "outline"} size="sm" className="gap-1.5" onClick={() => setCustomizing(!customizing)}>
            <Settings2 className="h-4 w-4" />
            {customizing ? "Done" : "Customize"}
          </Button>
        </div>
      </div>

      {/* Customize panel */}
      {customizing && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-sm font-medium mb-3">Toggle widgets</p>
            <div className="flex flex-wrap gap-2">
              {ALL_WIDGETS.map((w) => (
                <button
                  key={w.id}
                  onClick={() => toggleVisibility(w.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    visibility[w.id]
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  {visibility[w.id] ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {w.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
              <GripVertical className="h-3 w-3" /> Drag the handle on each widget to reorder.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Draggable layout */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={widgetOrder} strategy={verticalListSortingStrategy}>
          <div className="space-y-6">
            {visibility["stats"] && renderWidget("stats")}
            {otherWidgets.length > 0 && (
              <div className="grid md:grid-cols-2 gap-6">
                {otherWidgets.map((id) => renderWidget(id))}
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

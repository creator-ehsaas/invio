"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  FileText, Users, Package, AlertTriangle,
  Sparkles, Check, BarChart3, ChevronRight, Loader2, X,
  Lightbulb, CheckCircle, Zap, GripVertical, Settings2, Eye, EyeOff,
  Plus, ExternalLink, Calendar, ArrowUpRight, ArrowDownRight, Scale,
} from "lucide-react";
import { UpgradeBanner } from "@/components/billing/UpgradeBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import {
  computeKpis, formatINR,
  type PeriodKey, type InvoiceRow, type PurchaseRow, type ExpenseRow,
} from "@/lib/kpi";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type WidgetId =
  | "stats" | "money-flow" | "gst-position" | "top-debtors"
  | "quick-start" | "recent-invoices" | "low-stock" | "ai-insights" | "shortcuts-by-role";

interface Widget {
  id: WidgetId;
  label: string;
  defaultVisible: boolean;
}

const ALL_WIDGETS: Widget[] = [
  { id: "stats", label: "Ledger Summary", defaultVisible: true },
  { id: "money-flow", label: "Money Flow", defaultVisible: true },
  { id: "gst-position", label: "GST Position", defaultVisible: true },
  { id: "top-debtors", label: "Who Owes You", defaultVisible: true },
  { id: "recent-invoices", label: "Recent Invoices", defaultVisible: true },
  { id: "quick-start", label: "Quick Start", defaultVisible: true },
  { id: "low-stock", label: "Low Stock Alerts", defaultVisible: true },
  { id: "ai-insights", label: "AI Insights", defaultVisible: true },
  { id: "shortcuts-by-role", label: "Quick Actions", defaultVisible: true },
];

const WIDGET_ORDER_KEY = "invio_dashboard_order_v3";
const WIDGET_VISIBILITY_KEY = "invio_dashboard_visibility_v3";

const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_quarter", label: "This Quarter (FY)" },
  { value: "this_fy", label: "This Financial Year" },
];

// ─── Small pieces ─────────────────────────────────────────────────────────────

function SortableWidget({
  id, customizing, children, className,
}: {
  id: string;
  customizing: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className={cn("relative", className)}>
      {customizing && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-3 top-3 z-10 cursor-grab active:cursor-grabbing p-1.5 rounded-md bg-muted hover:bg-muted/80 transition-colors touch-none"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className={cn("h-full", customizing && "ring-2 ring-[var(--vermillion)]/30 ring-offset-2 ring-offset-background rounded-xl")}>
        {children}
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-ledger-green-soft text-ledger-green",
  sent: "bg-peacock-soft text-peacock",
  draft: "bg-muted text-muted-foreground",
  overdue: "bg-vermillion-soft text-vermillion",
  partial: "bg-marigold-soft text-marigold",
  cancelled: "bg-muted text-muted-foreground line-through",
};

function StatusStamp({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
      STATUS_STYLES[status] || STATUS_STYLES.draft
    )}>
      {status}
    </span>
  );
}

/** ▲ / ▼ percentage vs the previous period. `goodWhenUp` flips the colors. */
function Delta({ value, goodWhenUp = true }: { value: number | null; goodWhenUp?: boolean }) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const up = value >= 0;
  const good = goodWhenUp ? up : !up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold tnum", good ? "text-ledger-green" : "text-vermillion")}>
      <Icon className="w-3 h-3" />
      {Math.abs(value).toFixed(0)}%
    </span>
  );
}

function getInsightIcon(type: string) {
  switch (type) {
    case "success": return <CheckCircle className="w-4 h-4 text-ledger-green shrink-0 mt-0.5" />;
    case "warning": return <AlertTriangle className="w-4 h-4 text-marigold shrink-0 mt-0.5" />;
    case "action": return <Zap className="w-4 h-4 text-peacock shrink-0 mt-0.5" />;
    default: return <Lightbulb className="w-4 h-4 text-vermillion shrink-0 mt-0.5" />;
  }
}

function getInsightBg(type: string) {
  switch (type) {
    case "success": return "bg-ledger-green-soft/60";
    case "warning": return "bg-marigold-soft/60";
    case "action": return "bg-peacock-soft/60";
    default: return "bg-vermillion-soft/60";
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
  const [period, setPeriod] = useState<PeriodKey>("this_month");
  const [userRole, setUserRole] = useState<"owner" | "staff">("owner");

  const [rawInvoices, setRawInvoices] = useState<(InvoiceRow & { id: string; invoice_number?: string })[]>([]);
  const [rawPurchases, setRawPurchases] = useState<PurchaseRow[]>([]);
  const [rawExpenses, setRawExpenses] = useState<ExpenseRow[]>([]);
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
      if (saved) {
        const parsed = JSON.parse(saved) as WidgetId[];
        // tolerate widget additions between releases
        const known = new Set(ALL_WIDGETS.map((w) => w.id));
        const valid = parsed.filter((id) => known.has(id));
        const missing = ALL_WIDGETS.map((w) => w.id).filter((id) => !valid.includes(id));
        return [...valid, ...missing];
      }
    } catch { /* ignore */ }
    return ALL_WIDGETS.map((w) => w.id);
  });

  const [visibility, setVisibility] = useState<Record<WidgetId, boolean>>(() => {
    const defaults = Object.fromEntries(ALL_WIDGETS.map((w) => [w.id, w.defaultVisible])) as Record<WidgetId, boolean>;
    if (typeof window === "undefined") return defaults;
    try {
      const saved = localStorage.getItem(WIDGET_VISIBILITY_KEY);
      if (saved) return { ...defaults, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return defaults;
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
    if (userData) setUserRole(userData.role || "owner");
    if (!userData?.business_id) { setLoading(false); return; }

    const bId = userData.business_id;

    const [invoicesRes, customersRes, inventoryRes, businessRes, expensesRes, purchasesRes] = await Promise.all([
      supabase.from("invoices")
        .select("id, invoice_number, status, total, cgst, sgst, igst, invoice_date, due_date, created_at, customers(name)")
        .eq("business_id", bId)
        .order("created_at", { ascending: false }),
      supabase.from("customers").select("id").eq("business_id", bId),
      supabase.from("inventory_items").select("id, name, current_stock, reorder_level, unit").eq("business_id", bId),
      supabase.from("businesses").select("name, gstin").eq("id", bId).single(),
      supabase.from("expenses").select("amount, expense_date, created_at").eq("business_id", bId),
      supabase.from("purchase_invoices").select("total, amount_paid, status, cgst, sgst, igst, bill_date, created_at").eq("business_id", bId),
    ]);

    setRawInvoices((invoicesRes.data || []).map((i: any) => ({
      ...i,
      customer_name: i.customers?.name || null,
    })));
    setRawPurchases(purchasesRes.data || []);
    setRawExpenses(expensesRes.data || []);
    setCustomersCount((customersRes.data || []).length);
    setInventoryCount((inventoryRes.data || []).length);

    const inventory = inventoryRes.data || [];
    setLowStockList(inventory.filter((item) => item.current_stock <= item.reorder_level));
    setHasBusinessProfile(!!(businessRes.data?.name && businessRes.data?.gstin));
    setLoading(false);
  }, []);

  useEffect(() => { fetchDashboardData(); }, [fetchDashboardData]);

  // ── KPI engine (pure, tested in scripts/test-kpi.js) ──
  const kpi = useMemo(
    () => computeKpis(rawInvoices, rawPurchases, rawExpenses, period),
    [rawInvoices, rawPurchases, rawExpenses, period]
  );

  const recentInvoices = useMemo(() => {
    return rawInvoices
      .filter((i) => i.status !== "cancelled")
      .slice(0, 7)
      .map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number || `INV-${inv.id.slice(0, 6)}`,
        customer_name: inv.customer_name || "Unknown",
        total: inv.total || 0,
        status: inv.status || "draft",
      }));
  }, [rawInvoices]);

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
    setWidgetOrder(ALL_WIDGETS.map((w) => w.id));
    setVisibility(Object.fromEntries(ALL_WIDGETS.map((w) => [w.id, w.defaultVisible])) as Record<WidgetId, boolean>);
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

  // ── The six ledger summary entries ──
  const ledgerEntries = [
    {
      title: "Collected",
      value: formatINR(kpi.collected, kpi.collected >= 1000000),
      sub: <Delta value={kpi.collectedDelta} />,
      href: "/invoices",
      tone: "text-ledger-green",
    },
    {
      title: "Billed",
      value: formatINR(kpi.billed, kpi.billed >= 1000000),
      sub: <span className="text-xs text-muted-foreground tnum">{kpi.billedCount} invoice{kpi.billedCount === 1 ? "" : "s"}</span>,
      href: "/invoices",
      tone: "text-foreground",
    },
    {
      title: "Receivables",
      value: formatINR(kpi.receivables, kpi.receivables >= 1000000),
      sub: kpi.overdueCount > 0
        ? <span className="text-xs font-semibold text-vermillion tnum">{kpi.overdueCount} overdue · {formatINR(kpi.overdueAmount, true)}</span>
        : <span className="text-xs text-muted-foreground tnum">{kpi.receivablesCount} open</span>,
      href: "/reports/receivables",
      tone: kpi.overdueCount > 0 ? "text-vermillion" : "text-foreground",
    },
    {
      title: "Payables",
      value: formatINR(kpi.payables, kpi.payables >= 1000000),
      sub: <span className="text-xs text-muted-foreground tnum">{kpi.payablesCount} open bill{kpi.payablesCount === 1 ? "" : "s"}</span>,
      href: "/purchases",
      tone: "text-foreground",
    },
    {
      title: "Expenses",
      value: formatINR(kpi.expenses, kpi.expenses >= 1000000),
      sub: <Delta value={kpi.expensesDelta} goodWhenUp={false} />,
      href: "/expenses",
      tone: "text-foreground",
    },
    {
      title: "GST Due",
      value: kpi.gstNet >= 0 ? formatINR(kpi.gstNet, kpi.gstNet >= 1000000) : formatINR(Math.abs(kpi.gstNet), true),
      sub: <span className={cn("text-xs font-semibold", kpi.gstNet >= 0 ? "text-marigold" : "text-ledger-green")}>
        {kpi.gstNet >= 0 ? "payable" : "ITC credit"}
      </span>,
      href: "/reports/gstr3b",
      tone: kpi.gstNet > 0 ? "text-marigold" : "text-ledger-green",
    },
  ];

  const renderWidget = (id: WidgetId, stagger: number): React.ReactNode => {
    if (!visibility[id]) return null;
    const pl = customizing ? "pl-10" : "";
    const anim = `rise-in stagger-${Math.min(stagger + 1, 8)}`;

    switch (id) {
      case "stats":
        return (
          <SortableWidget key={id} id={id} customizing={customizing} className={anim}>
            <Card className={cn("py-0 gap-0", pl)}>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 divide-x divide-y sm:divide-y xl:divide-y-0 divide-border">
                {ledgerEntries.map((e) => (
                  <Link
                    key={e.title}
                    href={e.href}
                    className="group/entry px-4 py-4 hover:bg-accent/40 transition-colors"
                  >
                    <p className="ledger-label mb-2">{e.title}</p>
                    <p className={cn("font-display text-[1.45rem] leading-none font-semibold tnum truncate", e.tone)}>
                      {e.value}
                    </p>
                    <div className="mt-1.5 h-4">{e.sub}</div>
                  </Link>
                ))}
              </div>
            </Card>
          </SortableWidget>
        );

      case "money-flow": {
        const maxBar = Math.max(...kpi.monthlyTrend.map((p) => p.collected), 1);
        return (
          <SortableWidget key={id} id={id} customizing={customizing} className={anim}>
            <Card className={cn("h-full", pl)}>
              <CardHeader className="border-b [.border-b]:pb-3">
                <CardTitle>Money Flow</CardTitle>
                <span className="ledger-label col-start-2 justify-self-end self-center">12 months</span>
              </CardHeader>
              <CardContent>
                {/* 12-month collected bars — current month inked in vermillion */}
                <div className="flex items-end gap-1.5 h-28 mb-1">
                  {kpi.monthlyTrend.map((p, i) => (
                    <div
                      key={p.fullLabel}
                      className="flex-1 flex flex-col justify-end h-full group/bar"
                      title={`${p.fullLabel}: ${formatINR(p.collected)} collected · ${formatINR(p.billed)} billed`}
                    >
                      <div
                        className={cn(
                          "w-full rounded-t-xs grow-bar transition-colors",
                          i === 11 ? "bg-[var(--vermillion)]" : "bg-[var(--chart-2)] opacity-70 group-hover/bar:opacity-100"
                        )}
                        style={{
                          height: `${Math.max((p.collected / maxBar) * 100, p.collected > 0 ? 4 : 1.5)}%`,
                          animationDelay: `${i * 0.035}s`,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 mb-5">
                  {kpi.monthlyTrend.map((p, i) => (
                    <span key={p.fullLabel} className={cn("flex-1 text-center text-[9px] uppercase tracking-wide", i === 11 ? "text-vermillion font-bold" : "text-muted-foreground")}>
                      {i % 2 === 1 ? p.label : ""}
                    </span>
                  ))}
                </div>

                {/* Cash ledger for the selected period */}
                <div className="space-y-0 text-sm">
                  <div className="flex justify-between py-2 border-t border-border">
                    <span className="text-muted-foreground">Cash in <span className="text-xs">(collected)</span></span>
                    <span className="font-semibold tnum text-ledger-green">{formatINR(kpi.cashIn)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-border">
                    <span className="text-muted-foreground">Cash out <span className="text-xs">(expenses + purchases)</span></span>
                    <span className="font-semibold tnum text-vermillion">−{formatINR(kpi.cashOut)}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t-2 border-foreground/60">
                    <span className="font-semibold">Net cash · {kpi.periodLabel}</span>
                    <span className={cn("font-display font-semibold tnum", kpi.netCash >= 0 ? "text-ledger-green" : "text-vermillion")}>
                      {formatINR(kpi.netCash)}
                    </span>
                  </div>
                  {kpi.collectionRate != null && (
                    <p className="pt-1 text-xs text-muted-foreground tnum">
                      Collection rate {kpi.collectionRate.toFixed(0)}% of billed
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </SortableWidget>
        );
      }

      case "gst-position":
        return (
          <SortableWidget key={id} id={id} customizing={customizing} className={anim}>
            <Card className={cn("h-full", pl)}>
              <CardHeader className="border-b [.border-b]:pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-muted-foreground" />
                  GST Position
                </CardTitle>
                <span className="ledger-label col-start-2 justify-self-end self-center">{kpi.periodLabel}</span>
              </CardHeader>
              <CardContent>
                <div className="text-sm">
                  <div className="flex justify-between py-2.5 border-t border-border">
                    <span className="text-muted-foreground">Output tax on sales</span>
                    <span className="font-semibold tnum">{formatINR(kpi.gstOutput)}</span>
                  </div>
                  <div className="flex justify-between py-2.5 border-t border-border">
                    <span className="text-muted-foreground">Less: input tax credit</span>
                    <span className="font-semibold tnum text-ledger-green">−{formatINR(kpi.gstItc)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-t-2 border-foreground/60">
                    <span className="font-semibold">{kpi.gstNet >= 0 ? "Net GST payable" : "ITC credit to carry"}</span>
                    <span className={cn("font-display text-xl font-semibold tnum", kpi.gstNet > 0 ? "text-marigold" : "text-ledger-green")}>
                      {formatINR(Math.abs(kpi.gstNet))}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/reports/gstr1">GSTR-1</Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/reports/gstr3b">GSTR-3B</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </SortableWidget>
        );

      case "top-debtors":
        return (
          <SortableWidget key={id} id={id} customizing={customizing} className={anim}>
            <Card className={cn("h-full", pl)}>
              <CardHeader className="border-b [.border-b]:pb-3">
                <CardTitle>Who Owes You</CardTitle>
                <Button variant="ghost" size="sm" className="col-start-2 justify-self-end h-7 text-xs gap-1" asChild>
                  <Link href="/reports/receivables"><ExternalLink className="h-3 w-3" /> Receivables</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {kpi.topDebtors.length > 0 ? (
                  <div>
                    {kpi.topDebtors.map((d, i) => (
                      <div key={d.name} className={cn("flex items-center gap-3 py-2.5", i > 0 && "border-t border-border")}>
                        <span className="font-display text-sm text-muted-foreground w-5 tnum">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{d.name}</p>
                          <p className="text-xs text-muted-foreground tnum">{d.count} invoice{d.count === 1 ? "" : "s"}</p>
                        </div>
                        {d.overdue && (
                          <span className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] bg-vermillion-soft text-vermillion">
                            overdue
                          </span>
                        )}
                        <span className="font-semibold tnum text-sm">{formatINR(d.outstanding)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <CheckCircle className="h-8 w-8 text-ledger-green/50 mb-2" />
                    <p className="text-sm text-muted-foreground">Nothing outstanding in this period</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </SortableWidget>
        );

      case "quick-start":
        return (
          <SortableWidget key={id} id={id} customizing={customizing} className={anim}>
            <Card className={cn("h-full", pl)}>
              <CardHeader className="border-b [.border-b]:pb-3">
                <CardTitle>Quick Start</CardTitle>
                <span className="ledger-label col-start-2 justify-self-end self-center tnum">{completedSteps}/{quickStartSteps.length}</span>
              </CardHeader>
              <CardContent>
                <Progress value={(completedSteps / quickStartSteps.length) * 100} className="h-1 mb-4" />
                <ul>
                  {quickStartSteps.map((step, i) => (
                    <li key={step.id} className={cn(i > 0 && "border-t border-border")}>
                      <Link href={step.href} className="flex items-center gap-3 py-2.5 hover:bg-accent/40 -mx-2 px-2 transition-colors group">
                        <span className={cn(
                          "h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 font-display",
                          step.completed ? "bg-ledger-green-soft text-ledger-green" : "bg-muted text-muted-foreground"
                        )}>
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
          <SortableWidget key={id} id={id} customizing={customizing} className={anim}>
            <Card className={cn("h-full", pl)}>
              <CardHeader className="border-b [.border-b]:pb-3">
                <CardTitle>Recent Invoices</CardTitle>
                <Button variant="ghost" size="sm" className="col-start-2 justify-self-end h-7 text-xs gap-1" asChild>
                  <Link href="/invoices"><ExternalLink className="h-3 w-3" /> View all</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {recentInvoices.length > 0 ? (
                  <div>
                    {recentInvoices.map((inv, i) => (
                      <Link
                        key={inv.id}
                        href={`/invoices/${inv.id}`}
                        className={cn(
                          "flex items-center gap-3 py-2.5 hover:bg-accent/40 -mx-2 px-2 transition-colors",
                          i > 0 && "border-t border-border"
                        )}
                      >
                        <span className="font-mono text-[11px] text-muted-foreground w-20 truncate shrink-0">{inv.invoice_number}</span>
                        <p className="flex-1 text-sm font-medium truncate min-w-0">{inv.customer_name}</p>
                        <StatusStamp status={inv.status} />
                        <span className="font-semibold tnum text-sm w-20 text-right shrink-0">{formatINR(inv.total)}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-8 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No invoices yet</p>
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
          <SortableWidget key={id} id={id} customizing={customizing} className={anim}>
            <Card className={cn("h-full", pl)}>
              <CardHeader className="border-b [.border-b]:pb-3">
                <CardTitle className="flex items-center gap-2">
                  Low Stock
                  {lowStockList.length > 0 && (
                    <span className="inline-flex items-center rounded-sm px-1.5 text-[10px] font-bold bg-vermillion-soft text-vermillion tnum">
                      {lowStockList.length}
                    </span>
                  )}
                </CardTitle>
                <Button variant="ghost" size="sm" className="col-start-2 justify-self-end h-7 text-xs gap-1" asChild>
                  <Link href="/inventory"><ExternalLink className="h-3 w-3" /> Inventory</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {lowStockList.length > 0 ? (
                  <div>
                    {lowStockList.slice(0, 6).map((item, i) => (
                      <div key={item.id} className={cn("flex items-center gap-3 py-2.5", i > 0 && "border-t border-border")}>
                        <AlertTriangle className="h-4 w-4 text-marigold shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground tnum">reorder at {item.reorder_level} {item.unit || ""}</p>
                        </div>
                        <span className="font-display font-semibold text-marigold tnum">{item.current_stock}</span>
                        <span className="text-xs text-muted-foreground">{item.unit || "units"}</span>
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
          <SortableWidget key={id} id={id} customizing={customizing} className={anim}>
            <Card className={cn("h-full ledger-margin", pl)}>
              <CardHeader className="border-b [.border-b]:pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-vermillion" />
                  AI Insights
                </CardTitle>
                <div className="col-start-2 justify-self-end">
                  {insights.length === 0 ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={fetchInsights} disabled={loadingInsights}>
                      {loadingInsights ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {loadingInsights ? "Analyzing…" : "Analyze"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setInsights([])}>
                      <X className="h-3 w-3 mr-1" /> Clear
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loadingInsights && (
                  <div className="flex flex-col items-center py-8">
                    <Loader2 className="h-7 w-7 animate-spin text-vermillion mb-2" />
                    <p className="text-sm text-muted-foreground">Reading your books…</p>
                  </div>
                )}
                {!loadingInsights && insights.length > 0 && (
                  <div className="space-y-2.5">
                    {insights.map((ins, i) => (
                      <div key={i} className={cn("p-3 rounded-md", getInsightBg(ins.type))}>
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
                    <p className="text-sm text-muted-foreground">Click Analyze for AI-powered insights</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Drawn from your invoices, customers & inventory</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </SortableWidget>
        );

      case "shortcuts-by-role": {
        const tiles = [
          { href: "/invoices/new", label: "New Invoice", icon: Plus },
          { href: "/customers/new", label: "New Customer", icon: Users },
          { href: "/inventory/new", label: "New Item", icon: Package },
          ...(userRole === "owner"
            ? [
                { href: "/expenses/new", label: "Record Expense", icon: Plus },
                { href: "/purchases/new", label: "Add Purchase", icon: Plus },
                { href: "/reports", label: "Reports", icon: BarChart3 },
              ]
            : [{ href: "/invoices", label: "Sales Directory", icon: FileText }]),
        ];
        return (
          <SortableWidget key={id} id={id} customizing={customizing} className={anim}>
            <Card className={cn("h-full", pl)}>
              <CardHeader className="border-b [.border-b]:pb-3">
                <CardTitle>Quick Actions</CardTitle>
                <span className="ledger-label col-start-2 justify-self-end self-center">{userRole === "owner" ? "Owner" : "Staff"}</span>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {tiles.map((t) => {
                    const Icon = t.icon;
                    return (
                      <Link
                        key={t.label}
                        href={t.href}
                        className="flex items-center gap-2 p-2.5 rounded-md border border-border hover:bg-accent/50 hover:border-[var(--vermillion)]/40 transition-colors"
                      >
                        <Icon className="h-4 w-4 text-vermillion" />
                        <span className="text-xs font-medium">{t.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </SortableWidget>
        );
      }

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-vermillion" />
      </div>
    );
  }

  // Fresh-account empty state
  if (rawInvoices.length === 0 && customersCount === 0 && inventoryCount === 0) {
    return (
      <div className="space-y-6 pb-8">
        <UpgradeBanner />
        <div className="rise-in">
          <h1 className="text-2xl sm:text-3xl">{getGreeting()}</h1>
          <p className="ledger-label mt-1.5">Your books, ready to open</p>
        </div>

        <div className="rise-in stagger-2 text-center py-16 bg-card border border-border rounded-xl max-w-2xl mx-auto mt-8 p-8 shadow-sm relative overflow-hidden">
          <div aria-hidden className="absolute left-8 top-0 bottom-0 w-[2px] bg-[var(--vermillion)]/60 hidden sm:block" />
          <h2 className="font-display text-3xl mb-3">A fresh page.</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-8">
            Set up your business profile, add a customer, and write your first GST-compliant
            invoice — your ledger starts here.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
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
  const fullWidth = new Set<WidgetId>(["stats"]);
  const gridWidgets = visibleWidgets.filter((id) => !fullWidth.has(id));

  return (
    <div className="space-y-5 pb-8">
      <UpgradeBanner />

      {/* Header */}
      <div className="rise-in flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-[2rem] leading-tight">{getGreeting()}</h1>
          <p className="ledger-label mt-1.5 tnum">
            {kpi.periodLabel} · {kpi.billedCount} invoice{kpi.billedCount === 1 ? "" : "s"} entered
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-card border border-border rounded-md px-2.5 py-1.5 text-xs font-medium">
            <Calendar className="h-3.5 w-3.5 text-vermillion" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodKey)}
              className="bg-transparent border-none focus:outline-none cursor-pointer pr-1"
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
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
        <Card className="border-[var(--vermillion)]/30 bg-vermillion-soft/30">
          <CardContent>
            <p className="text-sm font-medium mb-3">Toggle widgets</p>
            <div className="flex flex-wrap gap-2">
              {ALL_WIDGETS.map((w) => (
                <button
                  key={w.id}
                  onClick={() => toggleVisibility(w.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
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
          <div className="space-y-5">
            {visibility["stats"] && renderWidget("stats", 0)}
            {gridWidgets.length > 0 && (
              <div className="grid md:grid-cols-2 gap-5 items-stretch">
                {gridWidgets.map((id, i) => renderWidget(id, i + 1))}
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

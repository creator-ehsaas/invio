"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Receipt, Plus, Trash2, ExternalLink, MoreHorizontal, Tag, TrendingDown, Sparkles, Download } from "lucide-react";
import { toast } from "sonner";
import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { SidePanel } from "@/components/ui/side-panel";
import { AdvancedFilter, type FilterGroup, type FilterField } from "@/components/ui/advanced-filter";
import { DataView, ViewSwitcher, BulkActionsBar, type ViewType, type KanbanColumn } from "@/components/ui/data-view";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Expense {
  id: string;
  description: string;
  category_name?: string;
  vendor_name?: string;
  amount: number;
  gst_amount?: number;
  expense_date: string;
  payment_method?: string;
  is_itc_eligible?: boolean;
  notes?: string;
}

const PAYMENT_ICONS: Record<string, string> = { cash: "💵", bank_transfer: "🏦", upi: "📱", card: "💳", cheque: "📝", other: "💰" };

const KANBAN_COLUMNS: KanbanColumn<Expense>[] = [
  { id: "cash", label: "Cash", color: "#10b981", filter: (e) => e.payment_method === "cash" },
  { id: "upi", label: "UPI", color: "#3b82f6", filter: (e) => e.payment_method === "upi" },
  { id: "bank_transfer", label: "Bank", color: "#6366f1", filter: (e) => e.payment_method === "bank_transfer" },
  { id: "card", label: "Card", color: "#f59e0b", filter: (e) => e.payment_method === "card" },
  { id: "other", label: "Other", color: "#6b7280", filter: (e) => !["cash","upi","bank_transfer","card"].includes(e.payment_method ?? "") },
];

const FILTER_FIELDS: FilterField[] = [
  { key: "description", label: "Description", type: "text" },
  { key: "category_name", label: "Category", type: "text" },
  { key: "vendor_name", label: "Vendor", type: "text" },
  { key: "amount", label: "Amount", type: "number" },
  { key: "expense_date", label: "Date", type: "date" },
];

export default function ExpensesPage() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewType>("table");
  const [search, setSearch] = useState("");
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selected, setSelected] = useState<Expense | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const fetchExpenses = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("expenses")
      .select("id, description, category_name, vendor_name, amount, gst_amount, expense_date, payment_method, is_itc_eligible, notes")
      .order("expense_date", { ascending: false });
    if (data) setExpenses(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchExpenses();
    const supabase = createClient();
    const channel = supabase
      .channel("expenses-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => fetchExpenses())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchExpenses]);

  const filtered = expenses.filter((e) => {
    if (search) {
      const q = search.toLowerCase();
      if (!e.description?.toLowerCase().includes(q) && !e.vendor_name?.toLowerCase().includes(q)) return false;
    }
    for (const group of filterGroups) {
      const results = group.rules.filter((r) => r.field && r.value).map((rule) => {
        const val = String((e as any)[rule.field] ?? "").toLowerCase();
        const rval = rule.value.toLowerCase();
        if (rule.operator === "contains") return val.includes(rval);
        if (rule.operator === "equals") return val === rval;
        if (rule.operator === "greater_than") return parseFloat(val) > parseFloat(rval);
        if (rule.operator === "less_than") return parseFloat(val) < parseFloat(rval);
        return true;
      });
      if (!results.length) continue;
      if (!(group.logic === "AND" ? results.every(Boolean) : results.some(Boolean))) return false;
    }
    return true;
  });

  const selectedIds = Object.keys(rowSelection);
  const selectedCount = selectedIds.length;
  const now = new Date();
  const monthTotal = expenses
    .filter((e) => { const d = new Date(e.expense_date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
    .reduce((s, e) => s + e.amount, 0);
  const itcTotal = filtered.filter((e) => e.is_itc_eligible).reduce((s, e) => s + (e.gst_amount ?? 0), 0);

  const openPanel = (expense: Expense) => { setSelected(expense); setPanelOpen(true); };
  const selectedIndex = selected ? filtered.findIndex((e) => e.id === selected.id) : -1;

  const handleBulkDelete = async () => {
    const supabase = createClient();
    await supabase.from("expenses").delete().in("id", selectedIds);
    toast.success(`Deleted ${selectedIds.length} expense${selectedIds.length > 1 ? "s" : ""}`);
    setRowSelection({});
    fetchExpenses();
  };

  const fetchAiSummary = async () => {
    setAiLoading(true);
    try {
      const res = await window.fetch("/api/ai-expense-summary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenses: filtered.slice(0, 50) }),
      });
      const data = await res.json();
      setAiSummary(data.summary ?? "");
    } catch { toast.error("AI summary failed"); }
    setAiLoading(false);
  };

  const columns: ColumnDef<Expense>[] = [
    {
      accessorKey: "description", header: "Description",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="text-base shrink-0">{PAYMENT_ICONS[row.original.payment_method ?? "other"] ?? "💰"}</span>
          <div>
            <p className="text-sm font-medium">{row.original.description}</p>
            {row.original.vendor_name && <p className="text-xs text-muted-foreground">{row.original.vendor_name}</p>}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "category_name", header: "Category",
      cell: ({ row }) => row.original.category_name
        ? <Badge variant="secondary" className="text-xs gap-1"><Tag className="h-2.5 w-2.5" />{row.original.category_name}</Badge>
        : <span className="text-muted-foreground text-xs">—</span>,
    },
    {
      accessorKey: "expense_date", header: "Date",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.expense_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
        </span>
      ),
    },
    {
      accessorKey: "amount", header: "Amount",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">₹{row.original.amount?.toLocaleString("en-IN")}</p>
          {(row.original.gst_amount ?? 0) > 0 && <p className="text-[10px] text-muted-foreground">GST ₹{row.original.gst_amount}</p>}
        </div>
      ),
    },
    {
      accessorKey: "is_itc_eligible", header: "ITC",
      cell: ({ row }) => row.original.is_itc_eligible
        ? <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">ITC</Badge>
        : null,
    },
    {
      id: "actions", header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openPanel(row.original); }}><ExternalLink className="mr-2 h-4 w-4" /> Quick view</DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/expenses/${row.original.id}`); }}><Receipt className="mr-2 h-4 w-4" /> Open</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={async (e) => { e.stopPropagation(); const s = createClient(); await s.from("expenses").delete().eq("id", row.original.id); toast.success("Deleted"); fetchExpenses(); }}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const cardRender = (e: Expense) => (
    <div>
      <div className="flex items-start justify-between mb-2">
        <span className="text-xl">{PAYMENT_ICONS[e.payment_method ?? "other"] ?? "💰"}</span>
        {e.is_itc_eligible && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-0">ITC</Badge>}
      </div>
      <p className="text-sm font-medium mb-1 line-clamp-2">{e.description}</p>
      {e.category_name && <Badge variant="secondary" className="text-[10px] mb-2">{e.category_name}</Badge>}
      <div className="flex items-center justify-between mt-2">
        <span className="text-base font-bold text-red-600 dark:text-red-400">₹{e.amount?.toLocaleString("en-IN")}</span>
        <span className="text-xs text-muted-foreground">{new Date(e.expense_date).toLocaleDateString("en-IN")}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Expenses" }]} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-sm text-muted-foreground">{expenses.length} total · {filtered.length} showing</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link href="/expenses/categories"><Tag className="h-4 w-4" /> Categories</Link>
          </Button>
          <Button asChild className="gap-2">
            <Link href="/expenses/new"><Plus className="h-4 w-4" /> Add Expense</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground font-medium">This Month</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3"><p className="text-xl font-bold text-red-600 dark:text-red-400">₹{monthTotal.toLocaleString("en-IN")}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground font-medium">ITC Claimable</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3"><p className="text-xl font-bold text-emerald-600">₹{itcTotal.toLocaleString("en-IN")}</p></CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="px-4 py-3 flex items-center justify-between">
            <div><p className="text-xs text-muted-foreground">AI Analysis</p><p className="text-xs mt-0.5 text-muted-foreground">Get spending insights</p></div>
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={fetchAiSummary} disabled={aiLoading}>
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />{aiLoading ? "Analyzing..." : "Analyze"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {aiSummary && (
        <Card className="border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="px-4 py-3 flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" /><p className="text-sm">{aiSummary}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-80">
          <Receipt className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search expenses..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>
        <AdvancedFilter fields={FILTER_FIELDS} groups={filterGroups} onChange={setFilterGroups} />
        <Button variant="outline" size="sm" className="gap-1.5 h-8 hidden sm:flex"><Download className="h-3.5 w-3.5" /> Export</Button>
        <div className="ml-auto"><ViewSwitcher current={view} onChange={setView} available={["table", "kanban", "card"]} /></div>
      </div>

      <BulkActionsBar selectedCount={selectedCount} onClear={() => setRowSelection({})}
        actions={[{ label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => setDeleteConfirm(true), variant: "destructive" }]}
      />

      <DataView
        data={filtered} columns={columns} view={view}
        rowSelection={rowSelection} onRowSelectionChange={setRowSelection}
        onRowClick={openPanel} kanbanColumns={KANBAN_COLUMNS} cardRender={(e) => cardRender(e)}
        isLoading={loading} enableSelection
        emptyState={
          <EmptyState
            icon={<TrendingDown className="h-8 w-8" />}
            title={search ? "No expenses match your search" : "No expenses recorded"}
            description={search ? "Try adjusting your filters." : "Track your business expenses to claim GST Input Tax Credit."}
            action={{ label: "Add Expense", href: "/expenses/new" }}
            secondaryAction={search ? { label: "Clear search", onClick: () => setSearch("") } : undefined}
          />
        }
      />

      <SidePanel open={panelOpen} onClose={() => setPanelOpen(false)}
        title={selected?.description} subtitle={selected?.vendor_name}
        hasPrev={selectedIndex > 0} hasNext={selectedIndex < filtered.length - 1}
        onPrev={() => selectedIndex > 0 && openPanel(filtered[selectedIndex - 1])}
        onNext={() => selectedIndex < filtered.length - 1 && openPanel(filtered[selectedIndex + 1])}
        actions={<Button variant="outline" size="sm" asChild><Link href={`/expenses/${selected?.id}`}><ExternalLink className="h-3.5 w-3.5 mr-1" /> Open</Link></Button>}
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Amount</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">₹{selected.amount?.toLocaleString("en-IN")}</p>
                {(selected.gst_amount ?? 0) > 0 && <p className="text-xs text-muted-foreground">+ GST ₹{selected.gst_amount}</p>}
              </div>
              <span className="text-3xl">{PAYMENT_ICONS[selected.payment_method ?? "other"]}</span>
            </div>
            <div className="space-y-2">
              {[
                { label: "Category", value: selected.category_name || "—" },
                { label: "Vendor", value: selected.vendor_name || "—" },
                { label: "Date", value: new Date(selected.expense_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) },
                { label: "Payment", value: selected.payment_method?.replace("_", " ") || "—" },
                { label: "ITC", value: selected.is_itc_eligible ? "✓ Eligible" : "Not eligible" },
                { label: "Notes", value: selected.notes || "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-4 py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground shrink-0 w-20">{label}</span>
                  <span className="text-sm text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </SidePanel>

      <ConfirmDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}
        title={`Delete ${selectedCount} expense${selectedCount > 1 ? "s" : ""}?`}
        description="This action cannot be undone." confirmLabel="Delete" variant="destructive" onConfirm={handleBulkDelete}
      />
    </div>
  );
}

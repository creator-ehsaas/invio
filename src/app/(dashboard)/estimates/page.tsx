"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  FileText, Search, Plus, Loader2, CheckCircle2, Clock, XCircle, ArrowRight,
  ClipboardList, Tag, ExternalLink, MoreHorizontal, Calendar, ArrowUpRight,
  Trash2, HelpCircle
} from "lucide-react";
import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { SidePanel } from "@/components/ui/side-panel";
import { AdvancedFilter, type FilterGroup, type FilterField } from "@/components/ui/advanced-filter";
import { DataView, ViewSwitcher, BulkActionsBar, type ViewType } from "@/components/ui/data-view";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Estimate {
  id: string;
  estimate_number: string;
  customer_name: string;
  total: number;
  estimate_date: string;
  valid_until: string | null;
  status: string;
  converted_invoice_id: string | null;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  notes?: string | null;
  terms?: string | null;
  customers?: {
    gstin?: string | null;
    billing_address?: any | null;
  } | null;
}

const FILTER_FIELDS: FilterField[] = [
  { key: "estimate_number", label: "Estimate Number", type: "text" },
  { key: "customer_name", label: "Customer Name", type: "text" },
  { key: "total", label: "Total Amount", type: "number" },
  { key: "estimate_date", label: "Estimate Date", type: "date" },
  { key: "valid_until", label: "Expiry Date", type: "date" },
];

function getStatusStyle(status: string) {
  switch (status) {
    case "accepted": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0";
    case "sent": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0";
    case "draft": return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-0";
    case "converted": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-0";
    case "rejected": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0";
    case "expired": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-0";
    default: return "bg-muted text-muted-foreground border-0";
  }
}

export default function EstimatesPage() {
  const router = useRouter();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewType>("table");
  const [search, setSearch] = useState("");
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selected, setSelected] = useState<Estimate | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const fetchEstimates = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: userData } = await supabase
      .from("users").select("business_id").eq("id", user.id).single();
    if (!userData?.business_id) { setLoading(false); return; }

    const { data } = await supabase
      .from("estimates")
      .select(`
        id, estimate_number, customer_name, total, estimate_date, valid_until, status, converted_invoice_id, subtotal, cgst, sgst, igst, notes, terms,
        customers(gstin, billing_address)
      `)
      .eq("business_id", userData.business_id)
      .order("created_at", { ascending: false });

    if (data) setEstimates(data as any[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEstimates();
  }, [fetchEstimates]);

  const filtered = estimates.filter((e) => {
    if (search) {
      const q = search.toLowerCase();
      if (!e.customer_name?.toLowerCase().includes(q) && !e.estimate_number?.toLowerCase().includes(q)) return false;
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

  const totalValue = estimates.reduce((s, e) => s + (e.total || 0), 0);
  const acceptedValue = estimates.filter(e => e.status === "accepted" || e.status === "converted").reduce((s, e) => s + (e.total || 0), 0);
  const conversionRate = estimates.length > 0 
    ? Math.round((estimates.filter(e => e.status === "converted").length / estimates.length) * 100)
    : 0;

  const openPanel = (estimate: Estimate) => {
    setSelected(estimate);
    setPanelOpen(true);
  };

  const selectedIndex = selected ? filtered.findIndex((e) => e.id === selected.id) : -1;

  const handleBulkDelete = async () => {
    const supabase = createClient();
    await supabase.from("estimates").delete().in("id", selectedIds);
    toast.success(`Deleted ${selectedIds.length} estimate${selectedIds.length > 1 ? "s" : ""}`);
    setRowSelection({});
    fetchEstimates();
  };

  const columns: ColumnDef<Estimate>[] = [
    {
      accessorKey: "estimate_number",
      header: "Estimate #",
      cell: ({ row }) => (
        <div className="font-semibold text-foreground flex items-center gap-1.5">
          <span>{row.original.estimate_number}</span>
          {row.original.converted_invoice_id && (
            <Badge variant="outline" className="text-[9px] h-4 px-1 bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400 border-purple-200">
              Converted
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "customer_name",
      header: "Customer",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.customer_name || "—"}</p>
          {row.original.customers?.gstin && (
            <p className="text-[10px] font-mono text-muted-foreground">GST: {row.original.customers.gstin}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "estimate_date",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.estimate_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      ),
    },
    {
      accessorKey: "valid_until",
      header: "Valid Until",
      cell: ({ row }) => row.original.valid_until ? (
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-orange-500" />
          {new Date(row.original.valid_until).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
        </span>
      ) : <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "total",
      header: "Total",
      cell: ({ row }) => (
        <div className="text-right">
          <p className="font-semibold text-foreground">₹{row.original.total.toLocaleString("en-IN")}</p>
          <p className="text-[10px] text-muted-foreground">Tax: ₹{((row.original.cgst || 0) + (row.original.sgst || 0) + (row.original.igst || 0)).toLocaleString("en-IN")}</p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge className={getStatusStyle(row.original.status)}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openPanel(row.original); }}><ExternalLink className="mr-2 h-4 w-4" /> Quick view</DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/estimates/${row.original.id}`); }}><FileText className="mr-2 h-4 w-4" /> Open details</DropdownMenuItem>
            {row.original.converted_invoice_id && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/invoices/${row.original.converted_invoice_id}`); }}><ArrowRight className="mr-2 h-4 w-4 text-purple-600" /> View Invoice</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={async (e) => { e.stopPropagation(); const s = createClient(); await s.from("estimates").delete().eq("id", row.original.id); toast.success("Estimate deleted"); fetchEstimates(); }}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const cardRender = (e: Estimate) => (
    <div>
      <div className="flex items-start justify-between mb-2">
        <span className="font-semibold text-foreground">{e.estimate_number}</span>
        <Badge className={getStatusStyle(e.status)}>{e.status}</Badge>
      </div>
      <p className="text-sm font-medium mb-1 truncate">{e.customer_name || "—"}</p>
      {e.customers?.gstin && <p className="text-[10px] text-muted-foreground font-mono mb-2">GSTIN: {e.customers.gstin}</p>}
      <div className="flex items-center justify-between border-t pt-2 mt-2">
        <span className="text-sm font-bold text-foreground">₹{e.total.toLocaleString("en-IN")}</span>
        <span className="text-xs text-muted-foreground">{new Date(e.estimate_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Estimates" }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Estimates</h1>
          <p className="text-sm text-muted-foreground">Quotations and proposals for customers</p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/estimates/new"><Plus className="h-4 w-4" /> New Estimate</Link>
        </Button>
      </div>

      {/* Stats Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground font-medium">Total Quotes</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3"><p className="text-xl font-bold">{estimates.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground font-medium">Total Value</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3"><p className="text-xl font-bold">₹{totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4"><CardTitle className="text-xs text-muted-foreground font-medium">Accepted Value</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-xl font-bold text-emerald-600">₹{acceptedValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
            <span className="text-[10px] text-purple-600 block mt-0.5">{conversionRate}% conversion rate</span>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-80">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search estimates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>
        <AdvancedFilter fields={FILTER_FIELDS} groups={filterGroups} onChange={setFilterGroups} />
        <div className="ml-auto"><ViewSwitcher current={view} onChange={setView} available={["table", "card"]} /></div>
      </div>

      <BulkActionsBar selectedCount={selectedCount} onClear={() => setRowSelection({})}
        actions={[{ label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => setDeleteConfirm(true), variant: "destructive" }]}
      />

      <DataView
        data={filtered} columns={columns} view={view}
        rowSelection={rowSelection} onRowSelectionChange={setRowSelection}
        onRowClick={openPanel} cardRender={(e) => cardRender(e)}
        isLoading={loading} enableSelection
        emptyState={
          <EmptyState
            icon={<ClipboardList className="h-8 w-8" />}
            title={search ? "No estimates match your search" : "No estimates found"}
            description={search ? "Try adjusting your filters." : "Create quotations and proposals for your customers."}
            action={{ label: "New Estimate", href: "/estimates/new" }}
            secondaryAction={search ? { label: "Clear search", onClick: () => setSearch("") } : undefined}
          />
        }
      />

      {/* Side Detail Panel */}
      <SidePanel open={panelOpen} onClose={() => setPanelOpen(false)}
        title={selected?.estimate_number} subtitle={selected?.customer_name}
        hasPrev={selectedIndex > 0} hasNext={selectedIndex < filtered.length - 1}
        onPrev={() => selectedIndex > 0 && openPanel(filtered[selectedIndex - 1])}
        onNext={() => selectedIndex < filtered.length - 1 && openPanel(filtered[selectedIndex + 1])}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/estimates/${selected?.id}`}><ExternalLink className="h-3.5 w-3.5 mr-1" /> Open Details</Link>
            </Button>
            {selected?.converted_invoice_id && (
              <Button size="sm" variant="secondary" asChild>
                <Link href={`/invoices/${selected.converted_invoice_id}`}><ArrowRight className="h-3.5 w-3.5 mr-1 text-purple-600" /> Go to Invoice</Link>
              </Button>
            )}
          </div>
        }
      >
        {selected && (
          <div className="space-y-5">
            {/* Status & Total Banner */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total Quote Amount</p>
                <p className="text-2xl font-bold text-foreground">₹{selected.total.toLocaleString("en-IN")}</p>
                <p className="text-xs text-muted-foreground">Taxable Value: ₹{selected.subtotal.toLocaleString("en-IN")}</p>
              </div>
              <Badge className={getStatusStyle(selected.status)}>{selected.status}</Badge>
            </div>

            {/* Details Section */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Estimate Metadata</h3>
              {[
                { label: "Estimate Date", value: new Date(selected.estimate_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) },
                { label: "Valid Until", value: selected.valid_until ? new Date(selected.valid_until).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—" },
                { label: "Customer GSTIN", value: selected.customers?.gstin || "N/A" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-4 py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground shrink-0 w-28">{label}</span>
                  <span className="text-sm text-right font-medium">{value}</span>
                </div>
              ))}
            </div>

            {/* Indian GST Tax Structure */}
            <div className="space-y-2 pt-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">GST Tax breakup</h3>
              {[
                { label: "CGST (Central Tax)", value: selected.cgst },
                { label: "SGST (State Tax)", value: selected.sgst },
                { label: "IGST (Integrated Tax)", value: selected.igst },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-4 py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground shrink-0 w-28">{label}</span>
                  <span className={cn("text-sm text-right font-mono", value > 0 ? "text-foreground font-semibold" : "text-muted-foreground")}>
                    ₹{value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>

            {/* Notes / Terms */}
            {(selected.notes || selected.terms) && (
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Compliance & Terms</h3>
                {selected.notes && (
                  <div className="p-3 bg-muted/40 rounded-lg text-xs">
                    <p className="font-semibold text-muted-foreground mb-1">Notes</p>
                    <p className="text-foreground leading-relaxed">{selected.notes}</p>
                  </div>
                )}
                {selected.terms && (
                  <div className="p-3 bg-muted/40 rounded-lg text-xs">
                    <p className="font-semibold text-muted-foreground mb-1">Terms & Conditions</p>
                    <p className="text-foreground leading-relaxed">{selected.terms}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </SidePanel>

      <ConfirmDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}
        title={`Delete ${selectedCount} estimate${selectedCount > 1 ? "s" : ""}?`}
        description="This action cannot be undone and will permanently delete the selected estimates."
        confirmLabel="Delete" variant="destructive" onConfirm={handleBulkDelete}
      />
    </div>
  );
}

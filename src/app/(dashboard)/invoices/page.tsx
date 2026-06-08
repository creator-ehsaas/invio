"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { buildWaUrl, paymentReminderMessage } from "@/lib/whatsapp";
import {
  FileText, Plus, Download, Trash2, Send, CheckCircle,
  MoreHorizontal, ExternalLink, IndianRupee, MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { SidePanel } from "@/components/ui/side-panel";
import { AdvancedFilter, type FilterGroup, type FilterField } from "@/components/ui/advanced-filter";
import { DataView, ViewSwitcher, BulkActionsBar, type ViewType, type KanbanColumn } from "@/components/ui/data-view";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ActivityTimeline, type ActivityEvent } from "@/components/ui/activity-timeline";

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  total: number;
  invoice_date: string;
  due_date?: string;
  status: string;
  notes?: string;
  business_id?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; badgeVariant: "default" | "secondary" | "destructive" | "outline" }> = {
  paid:    { label: "Paid",    color: "#10b981", badgeVariant: "default" },
  sent:    { label: "Sent",    color: "#3b82f6", badgeVariant: "secondary" },
  draft:   { label: "Draft",   color: "#6b7280", badgeVariant: "outline" },
  overdue: { label: "Overdue", color: "#ef4444", badgeVariant: "destructive" },
};

const FILTER_FIELDS: FilterField[] = [
  { key: "customer_name", label: "Customer", type: "text" },
  { key: "status", label: "Status", type: "select", options: [
    { label: "Paid", value: "paid" },
    { label: "Sent", value: "sent" },
    { label: "Draft", value: "draft" },
    { label: "Overdue", value: "overdue" },
  ]},
  { key: "total", label: "Amount", type: "number" },
  { key: "invoice_date", label: "Date", type: "date" },
];

const KANBAN_COLUMNS: KanbanColumn<Invoice>[] = [
  { id: "draft",   label: "Draft",   color: "#6b7280", filter: (i) => i.status === "draft" },
  { id: "sent",    label: "Sent",    color: "#3b82f6", filter: (i) => i.status === "sent" },
  { id: "overdue", label: "Overdue", color: "#ef4444", filter: (i) => i.status === "overdue" },
  { id: "paid",    label: "Paid",    color: "#10b981", filter: (i) => i.status === "paid" },
];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, badgeVariant: "outline" as const };
  return <Badge variant={cfg.badgeVariant} className="text-[10px] font-semibold uppercase">{cfg.label}</Badge>;
}

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewType>("table");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  const fetch = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("invoices")
      .select("id, invoice_number, customer_name, total, invoice_date, due_date, status, notes")
      .order("created_at", { ascending: false });
    if (data) setInvoices(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
    // Real-time subscription
    const supabase = createClient();
    const channel = supabase
      .channel("invoices-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetch]);

  // Keyboard nav in list
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        router.push("/invoices/new");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [router]);

  const applyFilters = (data: Invoice[]) => {
    return data.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (search && !inv.customer_name?.toLowerCase().includes(search.toLowerCase()) &&
          !inv.invoice_number?.toLowerCase().includes(search.toLowerCase())) return false;

      for (const group of filterGroups) {
        const results = group.rules
          .filter((r) => r.field && r.value)
          .map((rule) => {
            const val = String((inv as any)[rule.field] ?? "").toLowerCase();
            const rval = rule.value.toLowerCase();
            switch (rule.operator) {
              case "contains": return val.includes(rval);
              case "not_contains": return !val.includes(rval);
              case "equals": return val === rval;
              case "not_equals": return val !== rval;
              case "greater_than": return parseFloat(val) > parseFloat(rval);
              case "less_than": return parseFloat(val) < parseFloat(rval);
              case "is_empty": return !val;
              case "is_not_empty": return !!val;
              default: return true;
            }
          });
        if (results.length === 0) continue;
        const passes = group.logic === "AND" ? results.every(Boolean) : results.some(Boolean);
        if (!passes) return false;
      }
      return true;
    });
  };

  const filtered = applyFilters(invoices);
  const selectedIds = Object.keys(rowSelection);
  const selectedCount = selectedIds.length;

  const openPanel = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setPanelOpen(true);
    setActivity([
      { id: "1", type: "created", title: "Invoice created", timestamp: invoice.invoice_date, actor: "You" },
      ...(invoice.status === "sent" ? [{ id: "2", type: "status_changed" as const, title: "Marked as sent", timestamp: invoice.invoice_date, actor: "You" }] : []),
      ...(invoice.status === "paid" ? [{ id: "3", type: "payment" as const, title: "Payment recorded", description: `₹${invoice.total?.toLocaleString("en-IN")} received`, timestamp: invoice.invoice_date, actor: "You" }] : []),
    ]);
  };

  const selectedIndex = selectedInvoice ? filtered.findIndex((i) => i.id === selectedInvoice.id) : -1;

  const handleBulkDelete = async () => {
    const supabase = createClient();
    await supabase.from("invoices").delete().in("id", selectedIds);
    toast.success(`Deleted ${selectedIds.length} invoice${selectedIds.length > 1 ? "s" : ""}`);
    setRowSelection({});
    fetch();
  };

  const handleBulkMarkPaid = async () => {
    const supabase = createClient();
    await supabase.from("invoices").update({ status: "paid" }).in("id", selectedIds);
    toast.success(`Marked ${selectedIds.length} invoice${selectedIds.length > 1 ? "s" : ""} as paid`);
    setRowSelection({});
    fetch();
  };

  const handleKanbanMove = async (invoice: Invoice, toColumnId: string) => {
    const supabase = createClient();
    await supabase.from("invoices").update({ status: toColumnId }).eq("id", invoice.id);
    toast.success(`Moved to ${STATUS_CONFIG[toColumnId]?.label ?? toColumnId}`);
    fetch();
  };

  // Table columns using shadcn table conventions
  const columns: ColumnDef<Invoice>[] = [
    {
      accessorKey: "invoice_number",
      header: "Invoice",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <FileText className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-medium text-sm">{row.original.invoice_number}</span>
        </div>
      ),
    },
    {
      accessorKey: "customer_name",
      header: "Customer",
      cell: ({ row }) => <span className="text-sm">{row.original.customer_name}</span>,
    },
    {
      accessorKey: "invoice_date",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.invoice_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
        </span>
      ),
    },
    {
      accessorKey: "total",
      header: "Amount",
      cell: ({ row }) => (
        <span className="text-sm font-semibold">₹{row.original.total?.toLocaleString("en-IN") ?? "0"}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openPanel(row.original); }}>
              <ExternalLink className="mr-2 h-4 w-4" /> Quick view
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/invoices/${row.original.id}`); }}>
              <FileText className="mr-2 h-4 w-4" /> Open
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async (e) => {
                e.stopPropagation();
                const supabase = createClient();
                await supabase.from("invoices").update({ status: "paid" }).eq("id", row.original.id);
                toast.success("Marked as paid");
                fetch();
              }}
            >
              <CheckCircle className="mr-2 h-4 w-4 text-emerald-500" /> Mark as paid
            </DropdownMenuItem>
            {(row.original.status === "overdue" || row.original.status === "sent") && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    const msg = paymentReminderMessage({
                      invoice_number: row.original.invoice_number,
                      customer_name: row.original.customer_name,
                      total: row.original.total,
                      due_date: row.original.due_date,
                    });
                    window.open(buildWaUrl(null, msg), "_blank");
                  }}
                >
                  <MessageCircle className="mr-2 h-4 w-4 text-emerald-500" /> Send WA Reminder
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={async (e) => {
                e.stopPropagation();
                const supabase = createClient();
                await supabase.from("invoices").delete().eq("id", row.original.id);
                toast.success("Invoice deleted");
                fetch();
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const cardRender = (invoice: Invoice) => (
    <div>
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm font-semibold">{invoice.invoice_number}</span>
        <StatusBadge status={invoice.status} />
      </div>
      <p className="text-sm text-muted-foreground mb-3">{invoice.customer_name}</p>
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold">₹{invoice.total?.toLocaleString("en-IN")}</span>
        <span className="text-xs text-muted-foreground">
          {new Date(invoice.invoice_date).toLocaleDateString("en-IN")}
        </span>
      </div>
    </div>
  );

  const STATUS_TABS = ["all", "draft", "sent", "overdue", "paid"];

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <Breadcrumb items={[{ label: "Invoices" }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-sm text-muted-foreground">{invoices.length} total · {filtered.length} showing</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 hidden sm:flex">
            <Download className="h-4 w-4" /> Export
          </Button>
          <Button asChild className="gap-2 rounded-full px-5">
            <Link href="/invoices/new">
              <Plus className="h-4 w-4" /> New Invoice
            </Link>
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        {/* Status tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                statusFilter === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "All" : STATUS_CONFIG[s]?.label ?? s}
              {s !== "all" && (
                <span className="ml-1.5 text-[10px] opacity-60">
                  {invoices.filter((i) => i.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-48 max-w-80">
            <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>

          {/* Advanced filter */}
          <AdvancedFilter
            fields={FILTER_FIELDS}
            groups={filterGroups}
            onChange={setFilterGroups}
          />

          <Separator orientation="vertical" className="h-6" />

          {/* View switcher */}
          <ViewSwitcher current={view} onChange={setView} available={["table", "kanban", "card"]} />
        </div>

        {/* Bulk actions bar */}
        <BulkActionsBar
          selectedCount={selectedCount}
          onClear={() => setRowSelection({})}
          actions={[
            { label: "Mark paid", icon: <CheckCircle className="h-3.5 w-3.5" />, onClick: handleBulkMarkPaid },
            { label: "Send", icon: <Send className="h-3.5 w-3.5" />, onClick: () => toast.info("Bulk send coming soon") },
            { label: "Export", icon: <Download className="h-3.5 w-3.5" />, onClick: () => toast.info("Exporting...") },
            { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => setDeleteConfirm(true), variant: "destructive" },
          ]}
        />
      </div>

      {/* Data view */}
      <DataView
        data={filtered}
        columns={columns}
        view={view}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        onRowClick={openPanel}
        kanbanColumns={KANBAN_COLUMNS}
        onKanbanMove={handleKanbanMove}
        cardRender={(inv) => cardRender(inv)}
        isLoading={loading}
        enableSelection
        stickyHeader
        emptyState={
          <EmptyState
            icon={<FileText className="h-8 w-8" />}
            title={search || statusFilter !== "all" ? "No invoices match your filters" : "No invoices yet"}
            description={
              search || statusFilter !== "all"
                ? "Try adjusting your search or filters."
                : "Create your first GST-compliant invoice in seconds. Try voice input or AI fill."
            }
            action={{ label: "Create Invoice", href: "/invoices/new" }}
            secondaryAction={search ? { label: "Clear search", onClick: () => setSearch("") } : undefined}
          />
        }
      />

      {/* Side Panel */}
      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={selectedInvoice?.invoice_number}
        subtitle={selectedInvoice?.customer_name}
        hasPrev={selectedIndex > 0}
        hasNext={selectedIndex < filtered.length - 1}
        onPrev={() => selectedIndex > 0 && openPanel(filtered[selectedIndex - 1])}
        onNext={() => selectedIndex < filtered.length - 1 && openPanel(filtered[selectedIndex + 1])}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/invoices/${selectedInvoice?.id}`}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
            </Link>
          </Button>
        }
      >
        {selectedInvoice && (
          <div className="space-y-5">
            {/* Status + Amount */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
                <p className="text-2xl font-bold flex items-center gap-1">
                  <IndianRupee className="h-5 w-5" />
                  {selectedInvoice.total?.toLocaleString("en-IN")}
                </p>
              </div>
              <StatusBadge status={selectedInvoice.status} />
            </div>

            {/* Details */}
            <div className="space-y-2">
              {[
                { label: "Invoice #", value: selectedInvoice.invoice_number },
                { label: "Customer", value: selectedInvoice.customer_name },
                { label: "Date", value: new Date(selectedInvoice.invoice_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) },
                { label: "Due Date", value: selectedInvoice.due_date ? new Date(selectedInvoice.due_date).toLocaleDateString("en-IN") : "—" },
                { label: "Notes", value: selectedInvoice.notes || "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between gap-4 py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground shrink-0 w-24">{label}</span>
                  <span className="text-sm text-right">{value}</span>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 gap-2" onClick={async () => {
                const supabase = createClient();
                await supabase.from("invoices").update({ status: "paid" }).eq("id", selectedInvoice.id);
                toast.success("Marked as paid");
                setSelectedInvoice({ ...selectedInvoice, status: "paid" });
                fetch();
              }}>
                <CheckCircle className="h-4 w-4 text-emerald-500" /> Mark paid
              </Button>
              <Button size="sm" variant="outline" className="flex-1 gap-2">
                <Send className="h-4 w-4" /> Send
              </Button>
            </div>

            {/* Activity */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Activity</p>
              <ActivityTimeline events={activity} />
            </div>
          </div>
        )}
      </SidePanel>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title={`Delete ${selectedCount} invoice${selectedCount > 1 ? "s" : ""}?`}
        description="This action cannot be undone. All invoice data will be permanently deleted."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}

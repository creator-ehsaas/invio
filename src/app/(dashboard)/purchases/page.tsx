"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Plus,
  ShoppingCart,
  Calendar,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  Building2,
  Upload,
  Trash2,
  ExternalLink,
  MoreHorizontal,
} from "lucide-react";
import type { PurchaseInvoice } from "@/types/database";
import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataView, ViewSwitcher, BulkActionsBar, type ViewType } from "@/components/ui/data-view";
import BulkUploadModal from "@/components/purchases/bulk-upload-modal";
import { toast } from "sonner";

const statusConfig = {
  pending: { label: "Pending", icon: Clock, color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30 border-amber-200/50" },
  partial: { label: "Partial", icon: AlertCircle, color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 border-blue-200/50" },
  paid: { label: "Paid", icon: CheckCircle, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200/50" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "text-slate-500 bg-slate-100 dark:bg-slate-800 border-slate-200/50" },
};

type StatusFilter = "all" | "pending" | "partial" | "paid" | "cancelled";

export default function PurchasesPage() {
  const router = useRouter();
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [view, setView] = useState<ViewType>("table");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [fyFilter, setFyFilter] = useState<string>("all");
  const [qtrFilter, setQtrFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");

  const fetchPurchases = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from("users")
        .select("business_id")
        .eq("id", user.id)
        .single();

      if (!userData?.business_id) return;

      const { data } = await supabase
        .from("purchase_invoices")
        .select("*")
        .eq("business_id", userData.business_id)
        .order("bill_date", { ascending: false });

      if (data) setPurchases(data);
    } catch (err) {
      console.error("Error fetching purchases:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  // Compute financial years dynamically from purchase bill dates
  const financialYears = Array.from(
    new Set(
      purchases.map((p) => {
        const date = new Date(p.bill_date);
        const month = date.getMonth(); // 0-11
        const year = date.getFullYear();
        // Indian FY: April to March
        return month >= 3 ? `${year}-${(year + 1).toString().slice(-2)}` : `${year - 1}-${year.toString().slice(-2)}`;
      })
    )
  ).sort((a, b) => b.localeCompare(a));

  const QUARTERS = [
    { label: "Q1 (Apr - Jun)", value: "Q1" },
    { label: "Q2 (Jul - Sep)", value: "Q2" },
    { label: "Q3 (Oct - Dec)", value: "Q3" },
    { label: "Q4 (Jan - Mar)", value: "Q4" },
  ];

  const MONTHS = [
    { label: "April", value: "3" },
    { label: "May", value: "4" },
    { label: "June", value: "5" },
    { label: "July", value: "6" },
    { label: "August", value: "7" },
    { label: "September", value: "8" },
    { label: "October", value: "9" },
    { label: "November", value: "10" },
    { label: "December", value: "11" },
    { label: "January", value: "0" },
    { label: "February", value: "1" },
    { label: "March", value: "2" },
  ];

  const filteredPurchases = purchases.filter((purchase) => {
    const matchesSearch =
      purchase.bill_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (purchase.supplier_name || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || purchase.status === statusFilter;

    // Date period filtering
    const billDate = new Date(purchase.bill_date);
    const m = billDate.getMonth();
    const y = billDate.getFullYear();
    const billFY = m >= 3 ? `${y}-${(y + 1).toString().slice(-2)}` : `${y - 1}-${y.toString().slice(-2)}`;
    const matchesFY = fyFilter === "all" || billFY === fyFilter;

    // Quarter calculation (Indian FY quarters)
    let billQtr = "Q4";
    if (m >= 3 && m <= 5) billQtr = "Q1";
    else if (m >= 6 && m <= 8) billQtr = "Q2";
    else if (m >= 9 && m <= 11) billQtr = "Q3";
    const matchesQtr = qtrFilter === "all" || billQtr === qtrFilter;

    // Month filter
    const matchesMonth = monthFilter === "all" || m.toString() === monthFilter;

    return matchesSearch && matchesStatus && matchesFY && matchesQtr && matchesMonth;
  });

  const selectedIds = Object.keys(rowSelection);
  const selectedCount = selectedIds.length;

  const handleBulkDelete = async () => {
    try {
      const supabase = createClient();
      await supabase.from("purchase_invoices").delete().in("id", selectedIds);
      toast.success(`Deleted ${selectedIds.length} purchase bill${selectedIds.length > 1 ? "s" : ""}`);
      setRowSelection({});
      fetchPurchases();
    } catch (err) {
      toast.error("Failed to delete purchase bills");
    }
  };

  // Calculate totals from filtered purchases
  const totalPending = filteredPurchases
    .filter((p) => p.status === "pending" || p.status === "partial")
    .reduce((sum, p) => sum + (p.total - p.amount_paid), 0);

  const totalThisMonth = purchases
    .filter((p) => {
      const billDate = new Date(p.bill_date);
      const now = new Date();
      return billDate.getMonth() === now.getMonth() && billDate.getFullYear() === now.getFullYear();
    })
    .reduce((sum, p) => sum + p.total, 0);

  const isPeriodFiltered = fyFilter !== "all" || qtrFilter !== "all" || monthFilter !== "all";
  const totalPeriod = filteredPurchases.reduce((sum, p) => sum + p.total, 0);

  const columns: ColumnDef<PurchaseInvoice>[] = [
    {
      accessorKey: "bill_number",
      header: "Bill #",
      cell: ({ row }) => (
        <span className="font-semibold text-foreground">{row.original.bill_number}</span>
      ),
    },
    {
      accessorKey: "supplier_name",
      header: "Supplier",
      cell: ({ row }) => row.original.supplier_name || "—",
    },
    {
      accessorKey: "bill_date",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-xs">
          {new Date(row.original.bill_date).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      ),
    },
    {
      accessorKey: "total",
      header: "Amount",
      cell: ({ row }) => (
        <span className="font-medium">₹{row.original.total.toLocaleString("en-IN")}</span>
      ),
    },
    {
      id: "balance",
      header: "Balance",
      cell: ({ row }) => {
        const balance = row.original.total - row.original.amount_paid;
        return (
          <span className={balance > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}>
            ₹{balance.toLocaleString("en-IN")}
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status;
        const cfg = statusConfig[status as keyof typeof statusConfig] || { label: status, color: "text-muted-foreground bg-muted" };
        const Icon = cfg.icon || Clock;
        return (
          <Badge variant="outline" className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase ${cfg.color}`}>
            <Icon className="w-3 h-3" />
            {cfg.label}
          </Badge>
        );
      },
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
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/purchases/${row.original.id}`); }}>
              <ExternalLink className="mr-2 h-4 w-4" /> Open Details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={async (e) => {
                e.stopPropagation();
                const supabase = createClient();
                await supabase.from("purchase_invoices").delete().eq("id", row.original.id);
                toast.success("Purchase bill deleted");
                fetchPurchases();
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const cardRender = (purchase: PurchaseInvoice) => {
    const status = statusConfig[purchase.status as keyof typeof statusConfig] || { label: purchase.status, color: "text-muted-foreground bg-muted" };
    const StatusIcon = status.icon || Clock;
    const balance = purchase.total - purchase.amount_paid;

    return (
      <div>
        <div className="flex items-start justify-between mb-2">
          <span className="text-sm font-semibold">{purchase.bill_number}</span>
          <Badge variant="outline" className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase ${status.color}`}>
            <StatusIcon className="w-3 h-3" />
            {status.label}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-3">{purchase.supplier_name || "—"}</p>
        <div className="flex items-center justify-between">
          <div className="text-left">
            <p className="text-lg font-bold text-foreground">₹{purchase.total.toLocaleString("en-IN")}</p>
            {balance > 0 && (
              <p className="text-[10px] text-amber-600 font-semibold">Due: ₹{balance.toLocaleString("en-IN")}</p>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(purchase.bill_date).toLocaleDateString("en-IN")}
          </span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Purchases" }]} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Purchases</h1>
          <p className="text-sm text-muted-foreground">Track bills and payments to suppliers</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="hidden sm:flex">
            <Link href="/suppliers">
              <Building2 className="w-4 h-4 mr-1.5" /> Suppliers
            </Link>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setIsBulkUploadOpen(true)} className="gap-1.5">
            <Upload className="w-4 h-4 text-primary" /> Bulk Upload
          </Button>
          <Button asChild className="gap-2 rounded-full px-5">
            <Link href="/purchases/new">
              <Plus className="h-4 w-4" /> Add Purchase
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Pending Payments</p>
          <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">
            ₹{totalPending.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-card border rounded-lg p-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            {isPeriodFiltered ? "Period Total" : "This Month"}
          </p>
          <p className="text-xl sm:text-2xl font-bold text-foreground mt-1">
            ₹{(isPeriodFiltered ? totalPeriod : totalThisMonth).toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-3">
        {/* Status tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          {(["all", "pending", "partial", "paid"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                statusFilter === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "All" : statusConfig[s]?.label ?? s}
              {s !== "all" && (
                <span className="ml-1.5 text-[10px] opacity-60">
                  {purchases.filter((p) => p.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-48 max-w-80">
            <ShoppingCart className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by bill # or supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>

          {/* Financial Year Filter */}
          <select
            value={fyFilter}
            onChange={(e) => setFyFilter(e.target.value)}
            className="h-8 px-2 bg-muted border border-border rounded-lg text-xs font-medium text-foreground outline-none cursor-pointer focus:ring-1 focus:ring-primary"
          >
            <option value="all">All FYs</option>
            {financialYears.map((fy) => (
              <option key={fy} value={fy}>
                FY {fy}
              </option>
            ))}
          </select>

          {/* Quarter Filter */}
          <select
            value={qtrFilter}
            onChange={(e) => setQtrFilter(e.target.value)}
            className="h-8 px-2 bg-muted border border-border rounded-lg text-xs font-medium text-foreground outline-none cursor-pointer focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Quarters</option>
            {QUARTERS.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>

          {/* Month Filter */}
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="h-8 px-2 bg-muted border border-border rounded-lg text-xs font-medium text-foreground outline-none cursor-pointer focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Months</option>
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          {/* Reset button */}
          {(searchQuery || fyFilter !== "all" || qtrFilter !== "all" || monthFilter !== "all" || statusFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setFyFilter("all");
                setQtrFilter("all");
                setMonthFilter("all");
                setStatusFilter("all");
              }}
              className="h-8 text-xs text-muted-foreground hover:text-foreground px-2"
            >
              Reset Filters
            </Button>
          )}

          <div className="ml-auto">
            <ViewSwitcher current={view} onChange={setView} available={["table", "card"]} />
          </div>
        </div>

        {/* Bulk actions bar */}
        <BulkActionsBar
          selectedCount={selectedCount}
          onClear={() => setRowSelection({})}
          actions={[
            { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => setDeleteConfirm(true), variant: "destructive" },
          ]}
        />
      </div>

      {/* Data view */}
      <DataView
        data={filteredPurchases}
        columns={columns}
        view={view}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        onRowClick={(purchase) => router.push(`/purchases/${purchase.id}`)}
        cardRender={(purchase) => cardRender(purchase)}
        isLoading={loading}
        enableSelection
        emptyState={
          <EmptyState
            icon={<ShoppingCart className="h-8 w-8" />}
            title={searchQuery || statusFilter !== "all" ? "No purchases match your filters" : "No purchase bills yet"}
            description={
              searchQuery || statusFilter !== "all"
                ? "Try adjusting your search query or status filter."
                : "Record your purchase bills from suppliers to track liabilities and claim input tax credit."
            }
            action={(!searchQuery && statusFilter === "all") ? { label: "Add Purchase", href: "/purchases/new" } : undefined}
            secondaryAction={searchQuery ? { label: "Clear search", onClick: () => setSearchQuery("") } : undefined}
          />
        }
      />

      <BulkUploadModal
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        onSuccess={fetchPurchases}
      />

      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title={`Delete ${selectedCount} purchase bill${selectedCount > 1 ? "s" : ""}?`}
        description="This action cannot be undone. All selected purchase data will be permanently deleted."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}

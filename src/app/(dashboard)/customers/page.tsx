"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Users, Plus, Phone, Mail, FileText, Trash2,
  ExternalLink, MoreHorizontal, Building2,
} from "lucide-react";
import { toast } from "sonner";
import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { SidePanel } from "@/components/ui/side-panel";
import { AdvancedFilter, type FilterGroup, type FilterField } from "@/components/ui/advanced-filter";
import { DataView, ViewSwitcher, BulkActionsBar, type ViewType } from "@/components/ui/data-view";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface Customer {
  id: string;
  name: string;
  business_name?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  billing_address?: {
    state?: string;
    city?: string;
    address?: string;
    pincode?: string;
  };
}

const FILTER_FIELDS: FilterField[] = [
  { key: "name", label: "Name", type: "text" },
  { key: "business_name", label: "Business", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "gstin", label: "GSTIN", type: "text" },
];

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewType>("card");
  const [search, setSearch] = useState("");
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selected, setSelected] = useState<Customer | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const fetch = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("customers")
      .select("id, name, business_name, phone, email, gstin, billing_address")
      .order("created_at", { ascending: false });
    if (data) setCustomers(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
    const supabase = createClient();
    const channel = supabase
      .channel("customers-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => fetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetch]);

  const applyFilters = (data: Customer[]) => {
    return data.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        if (!c.name.toLowerCase().includes(q) &&
            !c.business_name?.toLowerCase().includes(q) &&
            !c.email?.toLowerCase().includes(q) &&
            !c.phone?.includes(q)) return false;
      }
      for (const group of filterGroups) {
        const results = group.rules.filter((r) => r.field && r.value).map((rule) => {
          const val = String((c as any)[rule.field] ?? "").toLowerCase();
          const rval = rule.value.toLowerCase();
          switch (rule.operator) {
            case "contains": return val.includes(rval);
            case "not_contains": return !val.includes(rval);
            case "equals": return val === rval;
            case "not_equals": return val !== rval;
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

  const filtered = applyFilters(customers);
  const selectedIds = Object.keys(rowSelection);
  const selectedCount = selectedIds.length;

  const openPanel = (customer: Customer) => {
    setSelected(customer);
    setPanelOpen(true);
  };

  const selectedIndex = selected ? filtered.findIndex((c) => c.id === selected.id) : -1;

  const handleBulkDelete = async () => {
    const supabase = createClient();
    await supabase.from("customers").delete().in("id", selectedIds);
    toast.success(`Deleted ${selectedIds.length} customer${selectedIds.length > 1 ? "s" : ""}`);
    setRowSelection({});
    fetch();
  };

  const columns: ColumnDef<Customer>[] = [
    {
      accessorKey: "name",
      header: "Customer",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold shrink-0">
            {row.original.name[0].toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium">{row.original.name}</p>
            {row.original.business_name && (
              <p className="text-xs text-muted-foreground">{row.original.business_name}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.phone || "—"}</span>,
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => <span className="text-sm text-muted-foreground truncate max-w-44 block">{row.original.email || "—"}</span>,
    },
    {
      accessorKey: "gstin",
      header: "GSTIN",
      cell: ({ row }) => row.original.gstin ? (
        <Badge variant="outline" className="text-[10px] font-mono">{row.original.gstin}</Badge>
      ) : <span className="text-muted-foreground text-xs">—</span>,
    },
    {
      id: "state",
      header: "State",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.billing_address?.state || "—"}</span>,
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
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/customers/${row.original.id}`); }}>
              <Users className="mr-2 h-4 w-4" /> Open profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/invoices/new?customer=${row.original.id}`); }}>
              <FileText className="mr-2 h-4 w-4" /> New invoice
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={async (e) => {
                e.stopPropagation();
                const supabase = createClient();
                await supabase.from("customers").delete().eq("id", row.original.id);
                toast.success("Customer deleted");
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

  const cardRender = (customer: Customer) => (
    <div>
      <div className="flex items-start gap-3 mb-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-base shrink-0">
          {customer.name[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{customer.name}</p>
          {customer.business_name && (
            <p className="text-xs text-muted-foreground truncate">{customer.business_name}</p>
          )}
        </div>
      </div>
      <div className="space-y-1.5 text-xs text-muted-foreground">
        {customer.phone && (
          <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{customer.phone}</div>
        )}
        {customer.email && (
          <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" /><span className="truncate">{customer.email}</span></div>
        )}
        {customer.gstin && (
          <div className="flex items-center gap-1.5"><Building2 className="h-3 w-3" /><span className="font-mono">{customer.gstin}</span></div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Customers" }]} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground">{customers.length} total · {filtered.length} showing</p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/customers/new"><Plus className="h-4 w-4" /> Add Customer</Link>
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-80">
          <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <AdvancedFilter fields={FILTER_FIELDS} groups={filterGroups} onChange={setFilterGroups} />
        <div className="ml-auto">
          <ViewSwitcher current={view} onChange={setView} available={["card", "table"]} />
        </div>
      </div>

      <BulkActionsBar
        selectedCount={selectedCount}
        onClear={() => setRowSelection({})}
        actions={[
          { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, onClick: () => setDeleteConfirm(true), variant: "destructive" },
        ]}
      />

      <DataView
        data={filtered}
        columns={columns}
        view={view}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        onRowClick={openPanel}
        cardRender={(c) => cardRender(c)}
        isLoading={loading}
        enableSelection
        emptyState={
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title={search ? "No customers match your search" : "No customers yet"}
            description={search ? "Try a different search term." : "Add your first customer to start creating invoices and tracking relationships."}
            action={{ label: "Add Customer", href: "/customers/new" }}
            secondaryAction={search ? { label: "Clear search", onClick: () => setSearch("") } : undefined}
          />
        }
      />

      {/* Side Panel */}
      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={selected?.name}
        subtitle={selected?.business_name}
        hasPrev={selectedIndex > 0}
        hasNext={selectedIndex < filtered.length - 1}
        onPrev={() => selectedIndex > 0 && openPanel(filtered[selectedIndex - 1])}
        onNext={() => selectedIndex < filtered.length - 1 && openPanel(filtered[selectedIndex + 1])}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/customers/${selected?.id}`}><ExternalLink className="h-3.5 w-3.5 mr-1" /> Open</Link>
          </Button>
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50">
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
                {selected.name[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-lg">{selected.name}</p>
                {selected.business_name && <p className="text-sm text-muted-foreground">{selected.business_name}</p>}
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: "Phone", value: selected.phone || "—", icon: <Phone className="h-3.5 w-3.5" /> },
                { label: "Email", value: selected.email || "—", icon: <Mail className="h-3.5 w-3.5" /> },
                { label: "GSTIN", value: selected.gstin || "—", icon: <Building2 className="h-3.5 w-3.5" /> },
                { label: "State", value: selected.billing_address?.state || "—" },
                { label: "City", value: selected.billing_address?.city || "—" },
                { label: "Address", value: selected.billing_address?.address || "—" },
              ].map(({ label, value, icon }) => (
                <div key={label} className="flex items-start justify-between gap-4 py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5 shrink-0 w-20">{icon}{label}</span>
                  <span className="text-sm text-right font-mono text-[13px]">{value}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 gap-2" asChild>
                <Link href={`/invoices/new?customer=${selected.id}`}><FileText className="h-4 w-4" /> New Invoice</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/customers/${selected.id}`}><ExternalLink className="h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
        )}
      </SidePanel>

      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title={`Delete ${selectedCount} customer${selectedCount > 1 ? "s" : ""}?`}
        description="This will permanently delete the selected customers and cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Package, Search, Plus, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

type StockFilter = "all" | "low" | "out";

const tabs: { id: StockFilter; label: string }[] = [
  { id: "all", label: "All Items" },
  { id: "low", label: "Low Stock" },
  { id: "out", label: "Out of Stock" },
];

interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  current_stock: number;
  reorder_level: number;
  unit_price: number;
}

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<StockFilter>("all");
  const [search, setSearch] = useState("");
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("inventory_items")
      .select("id, name, sku, current_stock, reorder_level, unit_price")
      .order("created_at", { ascending: false });

    if (data) setInventoryItems(data);
    setLoading(false);
  };

  const getStockStatus = (stock: number, reorderLevel: number) => {
    if (stock === 0) return "out";
    if (stock <= reorderLevel) return "low";
    return "good";
  };

  const filteredItems = inventoryItems.filter((item) => {
    const status = getStockStatus(item.current_stock, item.reorder_level);
    if (activeTab === "low" && status !== "low") return false;
    if (activeTab === "out" && status !== "out") return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const lowStockCount = inventoryItems.filter(
    (i) => getStockStatus(i.current_stock, i.reorder_level) === "low"
  ).length;
  const outOfStockCount = inventoryItems.filter(
    (i) => getStockStatus(i.current_stock, i.reorder_level) === "out"
  ).length;

  const getStatusBadge = (stock: number, reorderLevel: number) => {
    const status = getStockStatus(stock, reorderLevel);
    switch (status) {
      case "good":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "low":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "out":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    }
  };

  const getStatusLabel = (stock: number, reorderLevel: number) => {
    const status = getStockStatus(stock, reorderLevel);
    switch (status) {
      case "good":
        return "In Stock";
      case "low":
        return "Low Stock";
      case "out":
        return "Out of Stock";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Inventory</h1>
          <p className="text-muted-foreground mt-1">Track and manage your stock levels</p>
        </div>
        <Link
          href="/inventory/new"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-br from-primary to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add Item</span>
        </Link>
      </div>

      {/* Low Stock Alert */}
      {lowStockCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200/50 dark:border-amber-800/30 p-4 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {lowStockCount} item{lowStockCount !== 1 ? "s" : ""} running low on stock
            </p>
            <p className="text-xs text-amber-700/70 dark:text-amber-300/70">
              Consider reordering soon to avoid stockouts
            </p>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-100 dark:bg-cyan-900/30">
              <Package className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{inventoryItems.length}</p>
              <p className="text-xs text-muted-foreground">Total Items</p>
            </div>
          </div>
        </div>
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{lowStockCount}</p>
              <p className="text-xs text-muted-foreground">Low Stock</p>
            </div>
          </div>
        </div>
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-100 dark:bg-red-900/30">
              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{outOfStockCount}</p>
              <p className="text-xs text-muted-foreground">Out of Stock</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-muted rounded-xl">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === tab.id
                    ? "bg-white dark:bg-slate-900 text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-secondary border-none rounded-xl text-sm text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Inventory List */}
      {filteredItems.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item) => (
            <Link
              key={item.id}
              href={`/inventory/${item.id}`}
              className="block bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">SKU: {item.sku || "N/A"}</p>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getStatusBadge(
                    item.current_stock,
                    item.reorder_level
                  )}`}
                >
                  {getStatusLabel(item.current_stock, item.reorder_level)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 pt-3 border-t border-slate-200/50 dark:border-slate-800/50">
                <div>
                  <p className="text-xs text-muted-foreground">Stock</p>
                  <p className="font-semibold text-foreground">{item.current_stock}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reorder At</p>
                  <p className="font-semibold text-foreground">{item.reorder_level}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Price</p>
                  <p className="font-semibold text-foreground">₹{item.unit_price}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* Empty State */
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title={search ? "No items match your search" : "No stock items yet"}
          description={search ? "Try adjusting your search query." : "Manage your product catalog with HSN codes, GST rates, and stock levels."}
          action={{ label: "Add Item", href: "/inventory/new" }}
          secondaryAction={search ? { label: "Clear search", onClick: () => setSearch("") } : { label: "Import CSV", onClick: () => alert("CSV import feature coming soon!") }}
          className="bg-white/70 dark:bg-slate-950/70 border border-slate-200/50 dark:border-slate-800/50 rounded-2xl"
        />
      )}
    </div>
  );
}

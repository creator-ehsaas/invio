"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Plus,
  Search,
  Building2,
  Phone,
  Mail,
  FileText,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import type { Supplier } from "@/types/database";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
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
      .from("suppliers")
      .select("*")
      .eq("business_id", userData.business_id)
      .order("name");

    if (data) setSuppliers(data);
    setLoading(false);
  };

  const deleteSupplier = async (id: string) => {
    if (!confirm("Are you sure you want to delete this supplier?")) return;

    const supabase = createClient();
    await supabase.from("suppliers").delete().eq("id", id);
    setSuppliers(suppliers.filter((s) => s.id !== id));
    setActiveMenu(null);
  };

  const filteredSuppliers = suppliers.filter((supplier) =>
    supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.gstin?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Suppliers</h1>
          <p className="text-muted-foreground mt-1">Manage your vendors and suppliers</p>
        </div>
        <Link
          href="/suppliers/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
        >
          <Plus className="w-4 h-4" />
          <span>Add Supplier</span>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search suppliers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-xl border border-slate-200/50 dark:border-slate-800/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Suppliers List */}
      {filteredSuppliers.length === 0 ? (
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-12 text-center">
          <Building2 className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {searchQuery ? "No suppliers found" : "No suppliers yet"}
          </h3>
          <p className="text-muted-foreground mb-6">
            {searchQuery
              ? "Try a different search term"
              : "Add your first supplier to start recording purchases"}
          </p>
          {!searchQuery && (
            <Link
              href="/suppliers/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white font-medium rounded-xl hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Supplier
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSuppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground truncate">{supplier.name}</h3>
                  {supplier.business_name && (
                    <p className="text-sm text-muted-foreground truncate">{supplier.business_name}</p>
                  )}
                </div>
                <div className="relative">
                  <button
                    onClick={() => setActiveMenu(activeMenu === supplier.id ? null : supplier.id)}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                  </button>
                  {activeMenu === supplier.id && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setActiveMenu(null)}
                      />
                      <div className="absolute right-0 mt-1 w-36 bg-card border rounded-xl shadow-lg z-20 overflow-hidden">
                        <Link
                          href={`/suppliers/${supplier.id}`}
                          className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
                          onClick={() => setActiveMenu(null)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </Link>
                        <button
                          onClick={() => deleteSupplier(supplier.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {supplier.gstin && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate font-mono text-xs">{supplier.gstin}</span>
                  </div>
                )}
                {supplier.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{supplier.phone}</span>
                  </div>
                )}
                {supplier.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{supplier.email}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/50 dark:border-slate-800/50">
                <Link
                  href={`/purchases/new?supplier=${supplier.id}`}
                  className="text-xs text-primary font-medium hover:underline"
                >
                  + Record Purchase
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

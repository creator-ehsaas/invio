"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Bell, FileText, AlertTriangle, Package, Clock, CheckCircle2,
  X, ChevronRight, Loader2,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  type: "overdue" | "low_stock" | "payment" | "due_soon";
  title: string;
  body: string;
  href: string;
  timestamp: Date;
  read: boolean;
}

const STORAGE_KEY = "invio_read_notifications";

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

export function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  // Load read IDs from localStorage once on mount
  useEffect(() => {
    setReadIds(getReadIds());
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: userData } = await supabase
      .from("users").select("business_id").eq("id", user.id).single();
    if (!userData?.business_id) { setLoading(false); return; }

    const bId = userData.business_id;
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

    const [invoicesRes, inventoryRes] = await Promise.all([
      supabase.from("invoices")
        .select("id, invoice_number, status, due_date, total, customers(name)")
        .eq("business_id", bId)
        .in("status", ["sent", "overdue"]),
      supabase.from("inventory_items")
        .select("id, name, current_stock, reorder_level, unit")
        .eq("business_id", bId),
    ]);

    const items: Notification[] = [];
    const stored = getReadIds();

    // Overdue invoices
    for (const inv of invoicesRes.data || []) {
      const due = inv.due_date ? new Date(inv.due_date) : null;
      const isOverdue = due && due < now;
      const isDueSoon = due && due >= now && due <= soon;

      if (isOverdue) {
        const id = `overdue-${inv.id}`;
        items.push({
          id,
          type: "overdue",
          title: "Overdue invoice",
          body: `${(inv.customers as any)?.name || "Customer"} · ₹${(inv.total || 0).toLocaleString("en-IN")} · ${inv.invoice_number}`,
          href: `/invoices/${inv.id}`,
          timestamp: due!,
          read: stored.has(id),
        });
      } else if (isDueSoon) {
        const id = `due-${inv.id}`;
        items.push({
          id,
          type: "due_soon",
          title: "Payment due soon",
          body: `${(inv.customers as any)?.name || "Customer"} · ₹${(inv.total || 0).toLocaleString("en-IN")} · due ${formatDistanceToNow(due!, { addSuffix: true })}`,
          href: `/invoices/${inv.id}`,
          timestamp: due!,
          read: stored.has(id),
        });
      }
    }

    // Low stock
    for (const item of inventoryRes.data || []) {
      if (item.current_stock <= item.reorder_level) {
        const id = `stock-${item.id}`;
        items.push({
          id,
          type: "low_stock",
          title: "Low stock alert",
          body: `${item.name} · ${item.current_stock} ${item.unit || "units"} remaining (reorder at ${item.reorder_level})`,
          href: `/inventory`,
          timestamp: now,
          read: stored.has(id),
        });
      }
    }

    // Sort: unread first, then by timestamp desc
    items.sort((a, b) => {
      if (a.read !== b.read) return a.read ? 1 : -1;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    setNotifications(items);
    setLoading(false);
  }, []);

  const handleOpen = () => {
    setOpen((o) => {
      if (!o) fetchNotifications();
      return !o;
    });
  };

  const markRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setReadIds((prev) => {
      const next = new Set(prev).add(id);
      saveReadIds(next);
      return next;
    });
  };

  const markAllRead = () => {
    const ids = new Set(notifications.map((n) => n.id));
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setReadIds((prev) => {
      const next = new Set([...prev, ...ids]);
      saveReadIds(next);
      return next;
    });
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-full hover:bg-muted transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border bg-card shadow-xl z-50 overflow-hidden animate-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-foreground" />
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <span className="h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-sm font-medium">All caught up!</p>
                <p className="text-xs text-muted-foreground mt-1">No overdue invoices or low stock alerts.</p>
              </div>
            ) : (
              <div>
                {notifications.map((n) => (
                  <Link
                    key={n.id}
                    href={n.href}
                    onClick={() => { markRead(n.id); setOpen(false); }}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0 group",
                      !n.read && "bg-primary/5"
                    )}
                  >
                    <div className={cn("mt-0.5 p-1.5 rounded-lg shrink-0", iconBg(n.type))}>
                      <NotifIcon type={n.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-xs font-semibold", !n.read ? "text-foreground" : "text-muted-foreground")}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        {formatDistanceToNow(n.timestamp, { addSuffix: true })}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
                    )}
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t px-4 py-2.5 bg-muted/30">
              <Link
                href="/invoices?status=overdue"
                onClick={() => setOpen(false)}
                className="text-xs text-primary hover:underline"
              >
                View all overdue invoices →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotifIcon({ type }: { type: Notification["type"] }) {
  switch (type) {
    case "overdue": return <Clock className="h-3.5 w-3.5 text-red-600" />;
    case "due_soon": return <FileText className="h-3.5 w-3.5 text-amber-600" />;
    case "low_stock": return <Package className="h-3.5 w-3.5 text-orange-600" />;
    case "payment": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
    default: return <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function iconBg(type: Notification["type"]) {
  switch (type) {
    case "overdue": return "bg-red-100 dark:bg-red-900/30";
    case "due_soon": return "bg-amber-100 dark:bg-amber-900/30";
    case "low_stock": return "bg-orange-100 dark:bg-orange-900/30";
    case "payment": return "bg-emerald-100 dark:bg-emerald-900/30";
    default: return "bg-muted";
  }
}

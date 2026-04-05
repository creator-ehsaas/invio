"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  FileText, Users, ShoppingCart, Package, BarChart2,
  Plus, Settings, Home, Receipt, CreditCard, ArrowUpRight,
  ArrowDownLeft, Moon, Sun, Keyboard, Zap, Search,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  group: string;
  shortcut?: string;
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  // Open on Cmd+K / Ctrl+K
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const navigate = (path: string) => {
    router.push(path);
    setOpen(false);
  };

  const commands: CommandItem[] = [
    // Navigation
    { id: "home", label: "Dashboard", icon: <Home className="h-4 w-4" />, action: () => navigate("/dashboard"), group: "Navigate", shortcut: "G D" },
    { id: "invoices", label: "Invoices", icon: <FileText className="h-4 w-4" />, action: () => navigate("/invoices"), group: "Navigate", shortcut: "G I" },
    { id: "customers", label: "Customers", icon: <Users className="h-4 w-4" />, action: () => navigate("/customers"), group: "Navigate", shortcut: "G C" },
    { id: "expenses", label: "Expenses", icon: <Receipt className="h-4 w-4" />, action: () => navigate("/expenses"), group: "Navigate", shortcut: "G E" },
    { id: "estimates", label: "Estimates", icon: <FileText className="h-4 w-4" />, action: () => navigate("/estimates"), group: "Navigate" },
    { id: "purchases", label: "Purchases", icon: <ShoppingCart className="h-4 w-4" />, action: () => navigate("/purchases"), group: "Navigate" },
    { id: "inventory", label: "Inventory", icon: <Package className="h-4 w-4" />, action: () => navigate("/inventory"), group: "Navigate", shortcut: "G S" },
    { id: "reports", label: "Reports", icon: <BarChart2 className="h-4 w-4" />, action: () => navigate("/reports"), group: "Navigate", shortcut: "G R" },
    { id: "settings", label: "Settings", icon: <Settings className="h-4 w-4" />, action: () => navigate("/settings"), group: "Navigate" },
    // Create
    { id: "new-invoice", label: "New Invoice", description: "Create a new sales invoice", icon: <Plus className="h-4 w-4" />, action: () => navigate("/invoices/new"), group: "Create", shortcut: "C I" },
    { id: "new-estimate", label: "New Estimate", description: "Create a new estimate/quote", icon: <Plus className="h-4 w-4" />, action: () => navigate("/estimates/new"), group: "Create", shortcut: "C E" },
    { id: "new-expense", label: "New Expense", description: "Record a new expense", icon: <Plus className="h-4 w-4" />, action: () => navigate("/expenses/new"), group: "Create" },
    { id: "new-customer", label: "New Customer", description: "Add a new customer", icon: <Plus className="h-4 w-4" />, action: () => navigate("/customers/new"), group: "Create" },
    { id: "new-purchase", label: "New Purchase", description: "Record a purchase", icon: <Plus className="h-4 w-4" />, action: () => navigate("/purchases/new"), group: "Create" },
    { id: "new-item", label: "New Inventory Item", description: "Add an item to inventory", icon: <Plus className="h-4 w-4" />, action: () => navigate("/inventory/new"), group: "Create" },
    { id: "new-credit-note", label: "New Credit Note", icon: <ArrowDownLeft className="h-4 w-4" />, action: () => navigate("/credit-notes/new"), group: "Create" },
    { id: "new-debit-note", label: "New Debit Note", icon: <ArrowUpRight className="h-4 w-4" />, action: () => navigate("/debit-notes/new"), group: "Create" },
    // Reports
    { id: "report-gstr3b", label: "GSTR-3B Report", icon: <BarChart2 className="h-4 w-4" />, action: () => navigate("/reports/gstr3b"), group: "Reports" },
    { id: "report-pnl", label: "P&L Report", icon: <BarChart2 className="h-4 w-4" />, action: () => navigate("/reports/pnl"), group: "Reports" },
    { id: "report-receivables", label: "Aged Receivables", icon: <CreditCard className="h-4 w-4" />, action: () => navigate("/reports/receivables"), group: "Reports" },
    // Actions
    {
      id: "toggle-theme",
      label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
      icon: theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
      action: () => { setTheme(theme === "dark" ? "light" : "dark"); setOpen(false); toast.success(`Switched to ${theme === "dark" ? "light" : "dark"} mode`); },
      group: "Actions",
    },
    {
      id: "shortcuts",
      label: "Keyboard Shortcuts",
      icon: <Keyboard className="h-4 w-4" />,
      action: () => { setOpen(false); document.dispatchEvent(new CustomEvent("show-shortcuts")); },
      group: "Actions",
      shortcut: "?",
    },
  ];

  const groups = Array.from(new Set(commands.map((c) => c.group)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-2xl max-w-2xl" showCloseButton={false}>
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <DialogDescription className="sr-only">Search pages, create records, and run actions</DialogDescription>
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search pages, create records, actions..."
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
            <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 sm:flex">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-[400px] overflow-y-auto overflow-x-hidden">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>
            {groups.map((group) => (
              <Command.Group key={group} heading={group} className="py-1">
                {commands
                  .filter((c) => c.group === group)
                  .map((cmd) => (
                    <Command.Item
                      key={cmd.id}
                      value={`${cmd.label} ${cmd.description ?? ""}`}
                      onSelect={cmd.action}
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground"
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-md border bg-background text-muted-foreground">
                        {cmd.icon}
                      </span>
                      <div className="flex flex-col">
                        <span>{cmd.label}</span>
                        {cmd.description && (
                          <span className="text-xs text-muted-foreground">{cmd.description}</span>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <span className="ml-auto text-xs text-muted-foreground tracking-widest">
                          {cmd.shortcut}
                        </span>
                      )}
                    </Command.Item>
                  ))}
              </Command.Group>
            ))}
          </Command.List>
          <div className="border-t px-3 py-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Zap className="h-3 w-3" /> Invio Command</span>
            <span className="flex items-center gap-1"><kbd className="rounded border px-1 font-mono">↑↓</kbd> Navigate</span>
            <span className="flex items-center gap-1"><kbd className="rounded border px-1 font-mono">↵</kbd> Select</span>
            <span className="flex items-center gap-1"><kbd className="rounded border px-1 font-mono">Esc</kbd> Close</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

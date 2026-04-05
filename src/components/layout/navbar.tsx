"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Settings,
  LogOut,
  Menu,
  Home,
  FileText,
  Users,
  Package,
  BarChart3,
  CreditCard,
  ShoppingCart,
  Receipt,
  Truck,
  ClipboardList,
  Search,
  Keyboard,
} from "lucide-react";
import type { User as UserType, Business } from "@/types/database";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationPanel } from "@/components/notification-panel";

interface NavbarProps {
  user: UserType;
  business: Business | null;
}

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/invoices", label: "Sales", icon: FileText },
  { href: "/estimates", label: "Estimates", icon: ClipboardList },
  { href: "/purchases", label: "Purchases", icon: ShoppingCart },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

// Mobile bottom nav - show most used items
const mobileNavLinks = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/invoices", label: "Sales", icon: FileText },
  { href: "/purchases", label: "Buy", icon: ShoppingCart },
  { href: "/expenses", label: "Expenses", icon: Receipt },
];

export function Navbar({ user, business }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Desktop Header */}
      <header className="fixed top-0 w-full z-50 bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm">
        <div className="hidden md:flex items-center justify-between px-6 h-16 w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="text-xl font-bold tracking-tight text-foreground">
              Invio
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`transition-colors ${
                    isActive(link.href)
                      ? "text-primary font-semibold border-b-2 border-primary pb-1"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {/* Command palette trigger */}
            <button
              onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }))}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-muted/50 hover:bg-muted text-muted-foreground text-xs transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden lg:block">Search</span>
              <kbd className="hidden lg:inline-flex h-4 items-center gap-0.5 rounded border bg-background px-1 font-mono text-[10px] font-medium">
                ⌘K
              </kbd>
            </button>

            <ThemeToggle />

            <button
              onClick={() => document.dispatchEvent(new CustomEvent("show-shortcuts"))}
              className="p-2 rounded-full hover:bg-muted transition-colors hidden md:flex"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="w-4 h-4 text-muted-foreground" />
            </button>

            <NotificationPanel />

            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="h-8 w-8 rounded-full overflow-hidden border border-border/30 bg-muted flex items-center justify-center text-sm font-medium"
              >
                {user.name ? user.name[0].toUpperCase() : "U"}
              </button>

              {dropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-card shadow-lg z-50">
                    <div className="px-4 py-3 border-b">
                      <p className="text-sm font-semibold">{user.name || "User"}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                      {business && (
                        <p className="text-xs text-primary mt-1">{business.name}</p>
                      )}
                    </div>
                    <div className="py-1">
                      <Link
                        href="/subscription"
                        className="flex items-center px-4 py-2 text-sm hover:bg-muted transition-colors"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <CreditCard className="mr-3 h-4 w-4 text-muted-foreground" />
                        Subscription
                      </Link>
                      <Link
                        href="/settings"
                        className="flex items-center px-4 py-2 text-sm hover:bg-muted transition-colors"
                        onClick={() => setDropdownOpen(false)}
                      >
                        <Settings className="mr-3 h-4 w-4 text-muted-foreground" />
                        Settings
                      </Link>
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          handleSignOut();
                        }}
                        className="flex w-full items-center px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                      >
                        <LogOut className="mr-3 h-4 w-4" />
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between px-4 h-14">
          <Link href="/dashboard" className="text-lg font-bold tracking-tight text-foreground">
            Invio
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="h-8 w-8 rounded-full overflow-hidden bg-muted flex items-center justify-center text-sm font-medium"
            >
              {user.name ? user.name[0].toUpperCase() : "U"}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="flex justify-around items-center px-2 pb-safe pt-1.5 h-16">
          {mobileNavLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center justify-center min-w-[56px] py-1 transition-all active:scale-95 ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-colors ${active ? "bg-primary/10" : ""}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-medium mt-0.5">
                  {link.label}
                </span>
              </Link>
            );
          })}

          {/* More Menu Button */}
          <button
            onClick={() => setMoreMenuOpen(!moreMenuOpen)}
            className={`flex flex-col items-center justify-center min-w-[56px] py-1 transition-all active:scale-95 ${
              moreMenuOpen ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${moreMenuOpen ? "bg-primary/10" : ""}`}>
              <Menu className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium mt-0.5">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile More Menu Overlay */}
      {moreMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMoreMenuOpen(false)}
        >
          <div
            className="absolute bottom-20 left-4 right-4 bg-card rounded-2xl shadow-xl border overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-2 grid grid-cols-3 gap-1">
              {[
                { href: "/estimates", label: "Estimates", icon: ClipboardList },
                { href: "/customers", label: "Customers", icon: Users },
                { href: "/suppliers", label: "Suppliers", icon: Truck },
                { href: "/inventory", label: "Stock", icon: Package },
                { href: "/reports", label: "Reports", icon: BarChart3 },
                { href: "/subscription", label: "Plans", icon: CreditCard },
                { href: "/settings", label: "Settings", icon: Settings },
              ].map(link => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMoreMenuOpen(false)}
                    className={`flex flex-col items-center p-4 rounded-xl transition-colors ${
                      isActive(link.href) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                    }`}
                  >
                    <Icon className="w-6 h-6 mb-1.5" />
                    <span className="text-xs font-medium">{link.label}</span>
                  </Link>
                );
              })}
              <button
                onClick={() => {
                  setMoreMenuOpen(false);
                  handleSignOut();
                }}
                className="flex flex-col items-center p-4 rounded-xl hover:bg-muted text-destructive"
              >
                <LogOut className="w-6 h-6 mb-1.5" />
                <span className="text-xs font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile dropdown menu */}
      {dropdownOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setDropdownOpen(false)}>
          <div
            className="absolute top-14 right-4 w-64 rounded-xl border bg-card shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b">
              <p className="text-sm font-semibold">{user.name || "User"}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
              {business && (
                <p className="text-xs text-primary mt-1">{business.name}</p>
              )}
            </div>
            <div className="py-1">
              <Link
                href="/subscription"
                className="flex items-center px-4 py-3 text-sm hover:bg-muted"
                onClick={() => setDropdownOpen(false)}
              >
                <CreditCard className="mr-3 h-4 w-4 text-muted-foreground" />
                Subscription
              </Link>
              <Link
                href="/settings"
                className="flex items-center px-4 py-3 text-sm hover:bg-muted"
                onClick={() => setDropdownOpen(false)}
              >
                <Settings className="mr-3 h-4 w-4 text-muted-foreground" />
                Settings
              </Link>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  handleSignOut();
                }}
                className="flex w-full items-center px-4 py-3 text-sm text-destructive hover:bg-muted"
              >
                <LogOut className="mr-3 h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

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
  Gavel,
  ChevronDown,
  BookOpen,
} from "lucide-react";
import type { User as UserType, Business } from "@/types/database";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationPanel } from "@/components/notification-panel";

interface NavbarProps {
  user: UserType;
  business: Business | null;
}

// Primary nav — always visible on desktop
const primaryLinks = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/invoices", label: "Sales", icon: FileText },
  { href: "/purchases", label: "Purchases", icon: ShoppingCart },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/customers", label: "Customers", icon: Users },
];

// Secondary nav — in "More" dropdown on desktop
const secondaryLinks = [
  { href: "/estimates", label: "Estimates", icon: ClipboardList },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/accounting", label: "Accounting", icon: BookOpen },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/bids", label: "Bids", icon: Gavel },
];

const allNavLinks = [...primaryLinks, ...secondaryLinks];

// Mobile bottom nav
const mobileNavLinks = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/invoices", label: "Sales", icon: FileText },
  { href: "/purchases", label: "Buy", icon: ShoppingCart },
  { href: "/expenses", label: "Expenses", icon: Receipt },
];

export function Navbar({ user, business }: NavbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const isSecondaryActive = secondaryLinks.some((l) => isActive(l.href));

  return (
    <>
      {/* Desktop Header */}
      <header className="fixed top-0 w-full z-50 bg-card/85 backdrop-blur-xl border-b border-border">
        <div className="hidden md:flex items-center justify-between px-4 lg:px-6 h-16 w-full max-w-7xl mx-auto min-w-0">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-4 lg:gap-6 min-w-0">
            <Link href="/dashboard" className="font-display text-[1.4rem] font-semibold tracking-tight text-foreground shrink-0">
              Invio<span className="text-vermillion">.</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm font-medium min-w-0">
              {primaryLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-2.5 lg:px-3 py-1.5 rounded-md text-xs lg:text-sm whitespace-nowrap transition-colors ${
                    isActive(link.href)
                      ? "text-foreground font-semibold after:absolute after:left-2.5 after:right-2.5 after:-bottom-[15px] after:h-[2px] after:bg-[var(--vermillion)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {link.label}
                </Link>
              ))}

              {/* More dropdown */}
              <div className="relative">
                <button
                  onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                  className={`relative flex items-center gap-1 px-2.5 lg:px-3 py-1.5 rounded-md text-xs lg:text-sm whitespace-nowrap transition-colors ${
                    isSecondaryActive
                      ? "text-foreground font-semibold after:absolute after:left-2.5 after:right-2.5 after:-bottom-[15px] after:h-[2px] after:bg-[var(--vermillion)]"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  More
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moreMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {moreMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 w-44 rounded-xl border bg-card shadow-lg z-50 py-1">
                      {secondaryLinks.map((link) => {
                        const Icon = link.icon;
                        return (
                          <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setMoreMenuOpen(false)}
                            className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                              isActive(link.href)
                                ? "text-primary font-medium bg-primary/5"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            }`}
                          >
                            <Icon className="w-4 h-4 shrink-0" />
                            {link.label}
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </nav>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
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
              className="p-2 rounded-full hover:bg-muted transition-colors hidden lg:flex"
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
                  <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-card shadow-lg z-50">
                    <div className="px-4 py-3 border-b">
                      <p className="text-sm font-semibold">{user.name || "User"}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      {business && <p className="text-xs text-primary mt-1 truncate">{business.name}</p>}
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
                        onClick={() => { setDropdownOpen(false); handleSignOut(); }}
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
          <Link href="/dashboard" className="font-display text-xl font-semibold tracking-tight text-foreground">
            Invio<span className="text-vermillion">.</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
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
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 bg-card/95 backdrop-blur-xl border-t border-border shadow-[0_-4px_20px_rgba(31,36,51,0.08)]">
        <div className="flex justify-around items-center px-2 pb-safe pt-1.5 h-16">
          {mobileNavLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center justify-center min-w-[56px] py-1 transition-all active:scale-95 ${
                  active ? "text-vermillion" : "text-muted-foreground"
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-colors ${active ? "bg-vermillion-soft" : ""}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-medium mt-0.5">{link.label}</span>
              </Link>
            );
          })}

          <button
            onClick={() => setMobileMoreOpen(!mobileMoreOpen)}
            className={`flex flex-col items-center justify-center min-w-[56px] py-1 transition-all active:scale-95 ${
              mobileMoreOpen ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${mobileMoreOpen ? "bg-primary/10" : ""}`}>
              <Menu className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium mt-0.5">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile More Menu Overlay */}
      {mobileMoreOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileMoreOpen(false)}
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
                { href: "/bids", label: "Bids", icon: Gavel },
                { href: "/subscription", label: "Plans", icon: CreditCard },
                { href: "/settings", label: "Settings", icon: Settings },
              ].map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMoreOpen(false)}
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
                onClick={() => { setMobileMoreOpen(false); handleSignOut(); }}
                className="flex flex-col items-center p-4 rounded-xl hover:bg-muted text-destructive"
              >
                <LogOut className="w-6 h-6 mb-1.5" />
                <span className="text-xs font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile user dropdown */}
      {dropdownOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setDropdownOpen(false)}>
          <div
            className="absolute top-14 right-4 w-64 rounded-xl border bg-card shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b">
              <p className="text-sm font-semibold">{user.name || "User"}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              {business && <p className="text-xs text-primary mt-1 truncate">{business.name}</p>}
            </div>
            <div className="py-1">
              <Link href="/subscription" className="flex items-center px-4 py-3 text-sm hover:bg-muted" onClick={() => setDropdownOpen(false)}>
                <CreditCard className="mr-3 h-4 w-4 text-muted-foreground" />
                Subscription
              </Link>
              <Link href="/settings" className="flex items-center px-4 py-3 text-sm hover:bg-muted" onClick={() => setDropdownOpen(false)}>
                <Settings className="mr-3 h-4 w-4 text-muted-foreground" />
                Settings
              </Link>
              <button
                onClick={() => { setDropdownOpen(false); handleSignOut(); }}
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

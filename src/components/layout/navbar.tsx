"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Bell, Settings, LogOut, Menu, X, Home, FileText, Users, Package, BarChart3, CreditCard } from "lucide-react";
import type { User as UserType, Business } from "@/types/database";

interface NavbarProps {
  user: UserType;
  business: Business | null;
}

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export function Navbar({ user, business }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
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

          <div className="flex items-center gap-4">
            <button className="p-2 rounded-full hover:bg-muted transition-colors">
              <Bell className="w-5 h-5 text-muted-foreground" />
            </button>

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
      <nav className="md:hidden fixed bottom-0 left-0 w-full z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] rounded-t-2xl flex justify-around items-center px-4 pb-safe pt-2 h-20">
        {navLinks.slice(0, 5).map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center transition-transform active:scale-90 ${
                active
                  ? "text-primary bg-primary/10 rounded-xl px-3 py-1"
                  : "text-muted-foreground"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium tracking-wide uppercase mt-1">
                {link.label}
              </span>
            </Link>
          );
        })}
      </nav>

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

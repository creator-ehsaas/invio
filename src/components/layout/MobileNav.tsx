"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, FileText, Package, Settings, Plus, Mic } from "lucide-react";
import { useCapacitor } from "@/components/providers/CapacitorProvider";
import { haptics } from "@/lib/capacitor";

const navItems = [
  { href: "/dashboard", icon: Home, label: "Home" },
  { href: "/invoices", icon: FileText, label: "Invoices" },
  { href: "/inventory", icon: Package, label: "Inventory" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function MobileNav() {
  const pathname = usePathname();
  const { isNative } = useCapacitor();

  // Only show on native or mobile web
  if (typeof window !== "undefined" && window.innerWidth > 768 && !isNative) {
    return null;
  }

  const handleNavClick = async () => {
    await haptics.selection();
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-slate-200/50 dark:border-slate-800/50 md:hidden mobile-bottom-nav">
      <div className="flex items-center justify-around px-2">
        {navItems.slice(0, 2).map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleNavClick}
              className={`flex flex-col items-center gap-1 py-2 px-4 min-w-[64px] transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}

        {/* Center FAB for creating invoice */}
        <Link
          href="/invoices/new"
          onClick={async () => {
            await haptics.medium();
          }}
          className="relative -top-4 flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-primary to-blue-600 text-white shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all active:scale-95"
        >
          <div className="absolute inset-0 rounded-full bg-white/20 animate-pulse" />
          <Mic className="w-6 h-6 relative z-10" />
        </Link>

        {navItems.slice(2).map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleNavClick}
              className={`flex flex-col items-center gap-1 py-2 px-4 min-w-[64px] transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center space-x-1 text-sm text-muted-foreground", className)}>
      <Link href="/dashboard" className="flex items-center hover:text-foreground transition-colors">
        <Home className="h-3.5 w-3.5" />
        <span className="sr-only">Home</span>
      </Link>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          {item.href && index < items.length - 1 ? (
            <Link href={item.href} className="hover:text-foreground transition-colors truncate max-w-[160px]">
              {item.label}
            </Link>
          ) : (
            <span className={cn("truncate max-w-[200px]", index === items.length - 1 && "text-foreground font-medium")}>
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

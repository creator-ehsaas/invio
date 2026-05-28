import * as React from "react";
import { cn } from "@/lib/utils";

interface SkeletonLoaderProps {
  layout?: "dashboard" | "table" | "card" | "reports" | "default";
  className?: string;
}

export function SkeletonLoader({ layout = "default", className }: SkeletonLoaderProps) {
  const pulse = "animate-pulse bg-muted rounded-xl";

  if (layout === "dashboard") {
    return (
      <div className={cn("space-y-6", className)}>
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-2">
            <div className={cn("h-8 w-48", pulse)} />
            <div className={cn("h-4 w-72", pulse)} />
          </div>
          <div className={cn("h-9 w-28", pulse)} />
        </div>

        {/* Stats Grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border rounded-xl p-4 space-y-3 bg-card">
              <div className={cn("h-8 w-8 rounded-lg", pulse)} />
              <div className="space-y-1">
                <div className={cn("h-6 w-16", pulse)} />
                <div className={cn("h-3 w-12", pulse)} />
              </div>
            </div>
          ))}
        </div>

        {/* Main section skeleton */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="border rounded-xl p-6 space-y-4 bg-card">
            <div className={cn("h-5 w-32", pulse)} />
            <div className="space-y-2 pt-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center py-2">
                  <div className={cn("h-4 w-24", pulse)} />
                  <div className={cn("h-4 w-12", pulse)} />
                </div>
              ))}
            </div>
          </div>
          <div className="border rounded-xl p-6 space-y-4 bg-card">
            <div className={cn("h-5 w-32", pulse)} />
            <div className="space-y-3 pt-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={cn("h-8 w-8 rounded-full", pulse)} />
                  <div className="flex-1 space-y-1">
                    <div className={cn("h-4 w-32", pulse)} />
                    <div className={cn("h-3 w-16", pulse)} />
                  </div>
                  <div className={cn("h-4 w-10", pulse)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (layout === "table") {
    return (
      <div className={cn("space-y-6", className)}>
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className={cn("h-7 w-32", pulse)} />
            <div className={cn("h-4 w-48", pulse)} />
          </div>
          <div className={cn("h-9 w-28", pulse)} />
        </div>

        {/* Filters skeleton */}
        <div className="flex items-center gap-2">
          <div className={cn("h-9 flex-1 max-w-sm", pulse)} />
          <div className={cn("h-9 w-20", pulse)} />
          <div className={cn("h-9 w-24 ml-auto", pulse)} />
        </div>

        {/* Table skeleton */}
        <div className="border rounded-xl bg-card overflow-hidden">
          <div className="border-b p-3 bg-muted/20">
            <div className="flex gap-4">
              <div className={cn("h-4 w-6", pulse)} />
              <div className={cn("h-4 w-32", pulse)} />
              <div className={cn("h-4 w-24", pulse)} />
              <div className={cn("h-4 w-20", pulse)} />
              <div className={cn("h-4 w-16 ml-auto", pulse)} />
            </div>
          </div>
          <div className="divide-y p-3 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4 items-center py-2">
                <div className={cn("h-4 w-6", pulse)} />
                <div className="flex-1 space-y-1">
                  <div className={cn("h-4 w-48", pulse)} />
                  <div className={cn("h-3 w-20", pulse)} />
                </div>
                <div className={cn("h-4 w-24", pulse)} />
                <div className={cn("h-4 w-16", pulse)} />
                <div className={cn("h-4 w-16 ml-auto", pulse)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (layout === "card") {
    return (
      <div className={cn("space-y-6", className)}>
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className={cn("h-7 w-32", pulse)} />
            <div className={cn("h-4 w-48", pulse)} />
          </div>
          <div className={cn("h-9 w-28", pulse)} />
        </div>

        {/* Toolbar skeleton */}
        <div className="flex items-center gap-2">
          <div className={cn("h-9 flex-1 max-w-xs", pulse)} />
          <div className={cn("h-9 w-20", pulse)} />
          <div className={cn("h-9 w-20 ml-auto", pulse)} />
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border rounded-xl p-4 bg-card space-y-4">
              <div className="flex items-center gap-3">
                <div className={cn("h-10 w-10 rounded-full", pulse)} />
                <div className="flex-1 space-y-1.5">
                  <div className={cn("h-4 w-24", pulse)} />
                  <div className={cn("h-3 w-16", pulse)} />
                </div>
              </div>
              <div className="space-y-2 pt-2 border-t">
                <div className={cn("h-3 w-full", pulse)} />
                <div className={cn("h-3 w-2/3", pulse)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (layout === "reports") {
    return (
      <div className={cn("space-y-6", className)}>
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className={cn("h-7 w-32", pulse)} />
            <div className={cn("h-4 w-48", pulse)} />
          </div>
          <div className="flex gap-2">
            <div className={cn("h-9 w-24", pulse)} />
            <div className={cn("h-9 w-28", pulse)} />
          </div>
        </div>

        {/* Period bar skeleton */}
        <div className={cn("h-16 w-full", pulse)} />

        {/* Stats Row skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border rounded-xl p-4 space-y-2 bg-card">
              <div className={cn("h-8 w-8 rounded-lg", pulse)} />
              <div className={cn("h-5 w-24", pulse)} />
              <div className={cn("h-3 w-16", pulse)} />
            </div>
          ))}
        </div>

        {/* Grid sections skeleton */}
        <div className="grid sm:grid-cols-2 gap-6">
          <div className={cn("h-48 w-full", pulse)} />
          <div className={cn("h-48 w-full", pulse)} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className={cn("h-6 w-32", pulse)} />
      <div className={cn("h-4 w-48", pulse)} />
      <div className="space-y-2 pt-4">
        <div className={cn("h-10 w-full", pulse)} />
        <div className={cn("h-10 w-full", pulse)} />
        <div className={cn("h-10 w-full", pulse)} />
      </div>
    </div>
  );
}

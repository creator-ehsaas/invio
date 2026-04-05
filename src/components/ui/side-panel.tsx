"use client";

import * as React from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SidePanelProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  actions?: React.ReactNode;
}

const widthMap = {
  sm: "w-full sm:w-96",
  md: "w-full sm:w-[480px]",
  lg: "w-full sm:w-[600px]",
  xl: "w-full sm:w-[720px]",
};

export function SidePanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = "md",
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  actions,
}: SidePanelProps) {
  // Close on Escape
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
      if (e.key === "ArrowLeft" && open && onPrev && hasPrev) onPrev();
      if (e.key === "ArrowRight" && open && onNext && hasNext) onNext();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, onPrev, onNext, hasPrev, hasNext]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-none"
          onClick={onClose}
        />
      )}
      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex flex-col bg-background border-l shadow-xl transition-transform duration-300 ease-in-out",
          widthMap[width],
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            {(onPrev || onNext) && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onPrev}
                  disabled={!hasPrev}
                  title="Previous record (←)"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onNext}
                  disabled={!hasNext}
                  title="Next record (→)"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="min-w-0">
              {title && <p className="text-sm font-semibold truncate">{title}</p>}
              {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {actions}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* Content */}
        <ScrollArea className="flex-1 overflow-hidden">
          <div className="p-4">{children}</div>
        </ScrollArea>
      </div>
    </>
  );
}

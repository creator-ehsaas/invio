"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const SHORTCUTS = [
  {
    group: "Global",
    items: [
      { keys: ["Ctrl", "K"], description: "Open command palette" },
      { keys: ["?"], description: "Show keyboard shortcuts" },
      { keys: ["Esc"], description: "Close dialog / Cancel" },
    ],
  },
  {
    group: "Navigate",
    items: [
      { keys: ["G", "D"], description: "Go to Dashboard" },
      { keys: ["G", "I"], description: "Go to Invoices" },
      { keys: ["G", "C"], description: "Go to Customers" },
      { keys: ["G", "E"], description: "Go to Expenses" },
      { keys: ["G", "S"], description: "Go to Inventory (Stock)" },
      { keys: ["G", "R"], description: "Go to Reports" },
    ],
  },
  {
    group: "Create",
    items: [
      { keys: ["C", "I"], description: "New Invoice" },
      { keys: ["C", "E"], description: "New Estimate" },
      { keys: ["N"], description: "New record (context-aware)" },
    ],
  },
  {
    group: "List Pages",
    items: [
      { keys: ["↑", "↓"], description: "Navigate rows" },
      { keys: ["Space"], description: "Select / deselect row" },
      { keys: ["Ctrl", "A"], description: "Select all" },
      { keys: ["Delete"], description: "Delete selected" },
      { keys: ["Enter"], description: "Open record" },
      { keys: ["1"], description: "Switch to Table view" },
      { keys: ["2"], description: "Switch to Kanban view" },
      { keys: ["3"], description: "Switch to Card view" },
    ],
  },
];

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 items-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsModal() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = () => setOpen(true);
    document.addEventListener("show-shortcuts", handler);

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setOpen(true);
      }
    };
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("show-shortcuts", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Keyboard Shortcuts
            <Badge variant="secondary" className="font-mono text-xs">Press ? anytime</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-2">
          {SHORTCUTS.map((section, i) => (
            <div key={section.group}>
              {i > 0 && <Separator className="mb-4" />}
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {section.group}
              </h3>
              <div className="space-y-2">
                {section.items.map((item) => (
                  <div key={item.description} className="flex items-center justify-between py-1">
                    <span className="text-sm text-foreground">{item.description}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k, j) => (
                        <React.Fragment key={k}>
                          <Kbd>{k}</Kbd>
                          {j < item.keys.length - 1 && (
                            <span className="text-xs text-muted-foreground">then</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

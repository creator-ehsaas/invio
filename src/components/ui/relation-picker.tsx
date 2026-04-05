"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface RelationOption {
  id: string;
  label: string;
  sublabel?: string;
  avatar?: string;
}

interface RelationPickerProps {
  value?: string;
  onChange: (id: string, option: RelationOption) => void;
  options: RelationOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  isLoading?: boolean;
  onSearch?: (query: string) => void;
  onCreateNew?: (query: string) => void;
  createNewLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function RelationPicker({
  value,
  onChange,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  isLoading,
  onSearch,
  onCreateNew,
  createNewLabel = "Create new",
  disabled,
  className,
}: RelationPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selected = options.find((o) => o.id === value);

  const filtered = query
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.sublabel?.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  React.useEffect(() => {
    onSearch?.(query);
  }, [query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
          disabled={disabled}
        >
          {selected ? (
            <span className="flex items-center gap-2 min-w-0">
              {selected.avatar && (
                <span className="h-5 w-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center shrink-0 font-semibold">
                  {selected.avatar}
                </span>
              )}
              <span className="truncate">{selected.label}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground mr-2" />
          <Input
            className="border-0 shadow-none focus-visible:ring-0 h-9 px-0 text-sm"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          {isLoading ? (
            <div className="py-4 text-center text-sm text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">No results found.</div>
          ) : (
            filtered.map((option) => (
              <button
                key={option.id}
                onClick={() => { onChange(option.id, option); setOpen(false); setQuery(""); }}
                className="flex items-center gap-3 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
              >
                <Check className={cn("h-4 w-4 shrink-0 text-primary", value === option.id ? "opacity-100" : "opacity-0")} />
                {option.avatar && (
                  <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center shrink-0 font-semibold">
                    {option.avatar}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="font-medium truncate">{option.label}</p>
                  {option.sublabel && <p className="text-xs text-muted-foreground truncate">{option.sublabel}</p>}
                </div>
              </button>
            ))
          )}
          {onCreateNew && query && (
            <>
              <div className="border-t my-1" />
              <button
                onClick={() => { onCreateNew(query); setOpen(false); setQuery(""); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-primary"
              >
                <Plus className="h-4 w-4" />
                {createNewLabel}: &ldquo;{query}&rdquo;
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

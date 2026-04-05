"use client";

import * as React from "react";
import { Filter, Plus, X, Save, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export type FilterOperator = "equals" | "not_equals" | "contains" | "not_contains" | "greater_than" | "less_than" | "is_empty" | "is_not_empty" | "in";

export interface FilterField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "boolean";
  options?: { label: string; value: string }[];
}

export interface FilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

export interface FilterGroup {
  id: string;
  logic: "AND" | "OR";
  rules: FilterRule[];
}

export interface SavedFilter {
  id: string;
  name: string;
  groups: FilterGroup[];
}

interface AdvancedFilterProps {
  fields: FilterField[];
  groups: FilterGroup[];
  onChange: (groups: FilterGroup[]) => void;
  savedFilters?: SavedFilter[];
  onSaveFilter?: (name: string) => void;
  onLoadFilter?: (filter: SavedFilter) => void;
  onDeleteSavedFilter?: (id: string) => void;
}

const OPERATORS: Record<string, { label: string; hasValue: boolean }> = {
  equals: { label: "is", hasValue: true },
  not_equals: { label: "is not", hasValue: true },
  contains: { label: "contains", hasValue: true },
  not_contains: { label: "does not contain", hasValue: true },
  greater_than: { label: "greater than", hasValue: true },
  less_than: { label: "less than", hasValue: true },
  is_empty: { label: "is empty", hasValue: false },
  is_not_empty: { label: "is not empty", hasValue: false },
};

function newRule(): FilterRule {
  return { id: crypto.randomUUID(), field: "", operator: "contains", value: "" };
}

function newGroup(): FilterGroup {
  return { id: crypto.randomUUID(), logic: "AND", rules: [newRule()] };
}

export function AdvancedFilter({
  fields,
  groups,
  onChange,
  savedFilters = [],
  onSaveFilter,
  onLoadFilter,
  onDeleteSavedFilter,
}: AdvancedFilterProps) {
  const [open, setOpen] = React.useState(false);
  const [saveName, setSaveName] = React.useState("");
  const [showSave, setShowSave] = React.useState(false);

  const activeCount = groups.reduce((sum, g) => sum + g.rules.filter((r) => r.field && r.value).length, 0);

  const updateRule = (groupId: string, ruleId: string, patch: Partial<FilterRule>) => {
    onChange(groups.map((g) =>
      g.id === groupId
        ? { ...g, rules: g.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)) }
        : g
    ));
  };

  const removeRule = (groupId: string, ruleId: string) => {
    const newGroups = groups.map((g) =>
      g.id === groupId ? { ...g, rules: g.rules.filter((r) => r.id !== ruleId) } : g
    ).filter((g) => g.rules.length > 0);
    onChange(newGroups);
  };

  const addRule = (groupId: string) => {
    onChange(groups.map((g) =>
      g.id === groupId ? { ...g, rules: [...g.rules, newRule()] } : g
    ));
  };

  const addGroup = () => onChange([...groups, newGroup()]);

  const removeGroup = (groupId: string) => onChange(groups.filter((g) => g.id !== groupId));

  const toggleGroupLogic = (groupId: string) => {
    onChange(groups.map((g) =>
      g.id === groupId ? { ...g, logic: g.logic === "AND" ? "OR" : "AND" } : g
    ));
  };

  const clearAll = () => onChange([]);

  const getFieldType = (key: string) => fields.find((f) => f.key === key)?.type ?? "text";
  const getFieldOptions = (key: string) => fields.find((f) => f.key === key)?.options ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-8">
          <Filter className="h-3.5 w-3.5" />
          Filter
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px]">{activeCount}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[560px] p-0" align="start">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-medium">Filters</span>
          <div className="flex items-center gap-2">
            {savedFilters.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    Saved <ChevronDown className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-1" align="end">
                  {savedFilters.map((sf) => (
                    <div key={sf.id} className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-accent cursor-pointer group">
                      <span className="text-sm truncate flex-1" onClick={() => { onLoadFilter?.(sf); setOpen(false); }}>
                        {sf.name}
                      </span>
                      {onDeleteSavedFilter && (
                        <X className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" onClick={() => onDeleteSavedFilter(sf.id)} />
                      )}
                    </div>
                  ))}
                </PopoverContent>
              </Popover>
            )}
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearAll}>
                Clear all
              </Button>
            )}
          </div>
        </div>

        <div className="p-3 space-y-3 max-h-80 overflow-y-auto">
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No filters applied. Add a filter to narrow results.</p>
          )}
          {groups.map((group, gi) => (
            <div key={group.id} className="rounded-lg border bg-muted/40 p-2 space-y-2">
              <div className="flex items-center gap-2">
                {gi > 0 && <span className="text-xs text-muted-foreground">AND group</span>}
                <button
                  onClick={() => toggleGroupLogic(group.id)}
                  className="text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20"
                >
                  {group.logic}
                </button>
                <span className="text-xs text-muted-foreground">rules</span>
                <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={() => removeGroup(group.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {group.rules.map((rule) => {
                const fieldType = getFieldType(rule.field);
                const fieldOptions = getFieldOptions(rule.field);
                const opInfo = OPERATORS[rule.operator];
                return (
                  <div key={rule.id} className="flex items-center gap-1.5">
                    <Select value={rule.field} onValueChange={(v) => updateRule(group.id, rule.id, { field: v, operator: "contains", value: "" })}>
                      <SelectTrigger className="h-7 w-32 text-xs">
                        <SelectValue placeholder="Field" />
                      </SelectTrigger>
                      <SelectContent>
                        {fields.map((f) => <SelectItem key={f.key} value={f.key} className="text-xs">{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={rule.operator} onValueChange={(v) => updateRule(group.id, rule.id, { operator: v as FilterOperator })}>
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(OPERATORS).map(([k, v]) => (
                          <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {opInfo?.hasValue && (
                      fieldType === "select" ? (
                        <Select value={rule.value} onValueChange={(v) => updateRule(group.id, rule.id, { value: v })}>
                          <SelectTrigger className="h-7 flex-1 text-xs">
                            <SelectValue placeholder="Value" />
                          </SelectTrigger>
                          <SelectContent>
                            {fieldOptions.map((o) => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          type={fieldType === "number" ? "number" : fieldType === "date" ? "date" : "text"}
                          value={rule.value}
                          onChange={(e) => updateRule(group.id, rule.id, { value: e.target.value })}
                          className="h-7 flex-1 text-xs"
                          placeholder="Value"
                        />
                      )
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeRule(group.id, rule.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
              <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 w-full justify-start" onClick={() => addRule(group.id)}>
                <Plus className="h-3 w-3" /> Add rule
              </Button>
            </div>
          ))}
        </div>

        <Separator />
        <div className="flex items-center gap-2 px-3 py-2">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addGroup}>
            <Plus className="h-3 w-3" /> Add filter group
          </Button>
          {onSaveFilter && activeCount > 0 && (
            showSave ? (
              <div className="flex items-center gap-1 ml-auto">
                <Input
                  className="h-7 w-32 text-xs"
                  placeholder="Filter name"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && saveName) { onSaveFilter(saveName); setSaveName(""); setShowSave(false); } }}
                />
                <Button size="sm" className="h-7 text-xs" onClick={() => { if (saveName) { onSaveFilter(saveName); setSaveName(""); setShowSave(false); } }}>
                  Save
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 ml-auto" onClick={() => setShowSave(true)}>
                <Save className="h-3 w-3" /> Save filter
              </Button>
            )
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

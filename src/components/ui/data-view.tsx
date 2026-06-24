"use client";

import * as React from "react";
import {
  LayoutList, KanbanSquare, LayoutGrid, Calendar,
  ChevronUp, ChevronDown, ChevronsUpDown, GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from "@tanstack/react-table";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export type ViewType = "table" | "kanban" | "card" | "calendar";

export interface KanbanColumn<T> {
  id: string;
  label: string;
  color?: string;
  filter: (item: T) => boolean;
}

interface DataViewProps<T extends { id: string }> {
  data: T[];
  columns: ColumnDef<T>[];
  view: ViewType;
  onViewChange?: (view: ViewType) => void;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
  onRowClick?: (row: T) => void;
  kanbanColumns?: KanbanColumn<T>[];
  onKanbanMove?: (item: T, toColumnId: string) => void;
  cardRender?: (item: T, selected: boolean, onSelect: () => void) => React.ReactNode;
  calendarDateField?: keyof T;
  getRowId?: (row: T) => string;
  enableSorting?: boolean;
  enableSelection?: boolean;
  isLoading?: boolean;
  emptyState?: React.ReactNode;
  globalFilter?: string;
  toolbar?: React.ReactNode;
  stickyHeader?: boolean;
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ChevronUp className="h-3 w-3" />;
  if (sorted === "desc") return <ChevronDown className="h-3 w-3" />;
  return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
}

// ── Table View ──────────────────────────────────────────────
function TableView<T extends { id: string }>({
  table,
  onRowClick,
  stickyHeader,
  enableSelection,
}: {
  table: ReturnType<typeof useReactTable<T>>;
  onRowClick?: (row: T) => void;
  stickyHeader?: boolean;
  enableSelection?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className={cn("bg-muted/50 border-b", stickyHeader && "sticky top-0 z-10")}>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {enableSelection && (
                <th className="w-10 px-3 py-2.5">
                  <Checkbox
                    checked={table.getIsAllPageRowsSelected()}
                    onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
                    aria-label="Select all"
                  />
                </th>
              )}
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap"
                >
                  {header.column.getCanSort() ? (
                    <button
                      onClick={header.column.getToggleSortingHandler()}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <SortIcon sorted={header.column.getIsSorted()} />
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-border">
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row.original)}
              className={cn(
                "transition-colors hover:bg-muted/50 group",
                row.getIsSelected() && "bg-primary/5",
                onRowClick && "cursor-pointer"
              )}
            >
              {enableSelection && (
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(v) => row.toggleSelected(!!v)}
                    aria-label="Select row"
                  />
                </td>
              )}
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2.5 text-sm">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Kanban View ──────────────────────────────────────────────
function KanbanCard<T extends { id: string }>({
  item,
  render,
  onClick,
}: { item: T; render?: (item: T) => React.ReactNode; onClick?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow",
        isDragging && "opacity-50 shadow-xl"
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="mt-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          {render ? render(item) : <pre className="text-xs">{JSON.stringify(item, null, 2)}</pre>}
        </div>
      </div>
    </div>
  );
}

function KanbanView<T extends { id: string }>({
  data,
  kanbanColumns,
  onKanbanMove,
  onRowClick,
  cardRender,
}: {
  data: T[];
  kanbanColumns: KanbanColumn<T>[];
  onKanbanMove?: (item: T, toColumnId: string) => void;
  onRowClick?: (row: T) => void;
  cardRender?: (item: T, selected: boolean, onSelect: () => void) => React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const movedItem = data.find((d) => d.id === active.id);
    if (!movedItem) return;
    // over.id could be a column id or another card's id
    const targetColumn = kanbanColumns.find((c) => c.id === over.id)
      ?? kanbanColumns.find((c) => c.filter(data.find((d) => d.id === over.id) as T));
    if (targetColumn) onKanbanMove?.(movedItem, targetColumn.id);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
        {kanbanColumns.map((col) => {
          const items = data.filter(col.filter);
          return (
            <div key={col.id} className="flex-shrink-0 w-72">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  {col.color && <div className="h-2 w-2 rounded-full" style={{ background: col.color }} />}
                  <span className="text-sm font-medium">{col.label}</span>
                </div>
                <Badge variant="secondary" className="text-xs">{items.length}</Badge>
              </div>
              <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <div
                  id={col.id}
                  className="space-y-2 rounded-lg bg-muted/40 p-2 min-h-[200px]"
                >
                  {items.map((item) => (
                    <KanbanCard
                      key={item.id}
                      item={item}
                      render={cardRender ? (i) => cardRender(i, false, () => {}) : undefined}
                      onClick={() => onRowClick?.(item)}
                    />
                  ))}
                  {items.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-8">No items</div>
                  )}
                </div>
              </SortableContext>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}

// ── Card View ──────────────────────────────────────────────
function CardView<T extends { id: string }>({
  data,
  cardRender,
  onRowClick,
  rowSelection,
  onRowSelectionChange,
  enableSelection,
}: {
  data: T[];
  cardRender?: (item: T, selected: boolean, onSelect: () => void) => React.ReactNode;
  onRowClick?: (row: T) => void;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (sel: RowSelectionState) => void;
  enableSelection?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {data.map((item) => {
        const isSelected = !!rowSelection?.[item.id];
        const toggle = () => {
          if (!onRowSelectionChange || !enableSelection) return;
          const next = { ...rowSelection };
          if (isSelected) delete next[item.id]; else next[item.id] = true;
          onRowSelectionChange(next);
        };
        return (
          <div
            key={item.id}
            onClick={() => onRowClick?.(item)}
            className={cn(
              "rounded-xl border bg-card p-4 cursor-pointer hover:shadow-md transition-all hover:border-primary/40",
              isSelected && "border-primary ring-1 ring-primary"
            )}
          >
            {cardRender ? cardRender(item, isSelected, toggle) : (
              <pre className="text-xs overflow-hidden">{JSON.stringify(item, null, 2)}</pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── View Switcher ──────────────────────────────────────────
const VIEW_ICONS: Record<ViewType, React.ReactNode> = {
  table: <LayoutList className="h-3.5 w-3.5" />,
  kanban: <KanbanSquare className="h-3.5 w-3.5" />,
  card: <LayoutGrid className="h-3.5 w-3.5" />,
  calendar: <Calendar className="h-3.5 w-3.5" />,
};

export function ViewSwitcher({
  current,
  onChange,
  available = ["table", "kanban", "card"],
}: {
  current: ViewType;
  onChange: (v: ViewType) => void;
  available?: ViewType[];
}) {
  return (
    <div className="flex items-center rounded-md border bg-muted/50 p-0.5 gap-0.5">
      {available.map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          title={v.charAt(0).toUpperCase() + v.slice(1) + " view"}
          className={cn(
            "flex items-center justify-center h-6 w-6 rounded transition-colors",
            current === v ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {VIEW_ICONS[v]}
        </button>
      ))}
    </div>
  );
}

// ── Bulk Actions Bar ──────────────────────────────────────
interface BulkAction {
  label: string;
  icon?: React.ReactNode;
  onClick: (selectedIds: string[]) => void;
  variant?: "default" | "destructive";
}

export function BulkActionsBar({
  selectedCount,
  onClear,
  actions,
}: {
  selectedCount: number;
  onClear: () => void;
  actions: BulkAction[];
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-primary/5 border-primary/20 px-3 py-2 text-sm animate-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onClear} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
        <span className="font-medium text-primary whitespace-nowrap">{selectedCount} selected</span>
        <div className="h-4 w-px bg-border hidden sm:block" />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant={action.variant === "destructive" ? "destructive" : "outline"}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => action.onClick([])}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ── Main DataView Component ──────────────────────────────
export function DataView<T extends { id: string }>({
  data,
  columns,
  view,
  onViewChange,
  rowSelection = {},
  onRowSelectionChange,
  onRowClick,
  kanbanColumns,
  onKanbanMove,
  cardRender,
  getRowId,
  enableSorting = true,
  enableSelection = true,
  isLoading,
  emptyState,
  globalFilter,
  toolbar,
  stickyHeader,
}: DataViewProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection, globalFilter },
    onSortingChange: setSorting,
    onRowSelectionChange: onRowSelectionChange as any,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableSorting,
    enableRowSelection: enableSelection,
    getRowId: getRowId ? (row) => getRowId(row) : (row) => row.id,
  });

  const selectedCount = Object.keys(rowSelection).length;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (data.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div className="space-y-3">
      {toolbar}
      {view === "table" && (
        <TableView
          table={table}
          onRowClick={onRowClick}
          stickyHeader={stickyHeader}
          enableSelection={enableSelection}
        />
      )}
      {view === "kanban" && kanbanColumns && (
        <KanbanView
          data={table.getFilteredRowModel().rows.map((r) => r.original)}
          kanbanColumns={kanbanColumns}
          onKanbanMove={onKanbanMove}
          onRowClick={onRowClick}
          cardRender={cardRender}
        />
      )}
      {view === "card" && (
        <CardView
          data={table.getFilteredRowModel().rows.map((r) => r.original)}
          cardRender={cardRender}
          onRowClick={onRowClick}
          rowSelection={rowSelection}
          onRowSelectionChange={onRowSelectionChange}
          enableSelection={enableSelection}
        />
      )}
    </div>
  );
}

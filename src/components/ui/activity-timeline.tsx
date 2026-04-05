"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export interface ActivityEvent {
  id: string;
  type: "created" | "updated" | "status_changed" | "payment" | "note" | "email" | "custom";
  title: string;
  description?: string;
  actor?: string;
  timestamp: string;
  icon?: React.ReactNode;
  color?: string;
}

const TYPE_COLORS: Record<ActivityEvent["type"], string> = {
  created: "bg-emerald-500",
  updated: "bg-blue-500",
  status_changed: "bg-amber-500",
  payment: "bg-violet-500",
  note: "bg-slate-400",
  email: "bg-sky-500",
  custom: "bg-slate-400",
};

interface ActivityTimelineProps {
  events: ActivityEvent[];
  isLoading?: boolean;
  emptyMessage?: string;
}

export function ActivityTimeline({ events, isLoading, emptyMessage = "No activity yet." }: ActivityTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="h-7 w-7 rounded-full bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-1.5 pt-1">
              <div className="h-3.5 bg-muted rounded animate-pulse w-3/4" />
              <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">{emptyMessage}</p>;
  }

  return (
    <div className="relative space-y-0">
      {events.map((event, i) => (
        <div key={event.id} className="flex gap-3 group">
          {/* Line */}
          <div className="flex flex-col items-center">
            <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0 z-10", event.color ?? TYPE_COLORS[event.type])}>
              {event.icon ? (
                <span className="text-white text-xs">{event.icon}</span>
              ) : (
                <div className="h-2 w-2 rounded-full bg-white/80" />
              )}
            </div>
            {i < events.length - 1 && (
              <div className="w-px flex-1 bg-border min-h-[16px] my-1" />
            )}
          </div>
          {/* Content */}
          <div className="pb-4 pt-0.5 flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug">{event.title}</p>
            {event.description && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{event.description}</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              {event.actor && (
                <span className="text-xs text-muted-foreground">{event.actor}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

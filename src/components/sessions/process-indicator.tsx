"use client";

import { cn } from "@/lib/utils";
import type { SessionStatus } from "@/lib/types";

const STATUS_CONFIG: Record<SessionStatus, { color: string; label: string; pulse: boolean }> = {
  pending: { color: "bg-yellow-500", label: "Pending", pulse: true },
  running: { color: "bg-green-500", label: "Working", pulse: true },
  idle: { color: "bg-blue-500", label: "Ready", pulse: false },
  paused: { color: "bg-yellow-500", label: "Paused", pulse: false },
  completed: { color: "bg-gray-500", label: "Completed", pulse: false },
  failed: { color: "bg-red-500", label: "Failed", pulse: false },
  killed: { color: "bg-red-500", label: "Stopped", pulse: false },
};

interface ProcessIndicatorProps {
  status: SessionStatus;
  className?: string;
}

export function ProcessIndicator({ status, className }: ProcessIndicatorProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="relative flex h-2 w-2">
        {config.pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
              config.color
            )}
          />
        )}
        <span
          className={cn("relative inline-flex h-2 w-2 rounded-full", config.color)}
        />
      </span>
      <span className="text-xs text-muted-foreground">{config.label}</span>
    </div>
  );
}

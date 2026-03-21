"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConflictAlertBarProps {
  conflictCount: number;
  conflictFiles: string[];
}

export function ConflictAlertBar({ conflictCount, conflictFiles }: ConflictAlertBarProps) {
  const [dismissed, setDismissed] = useState(false);

  if (conflictCount === 0 || dismissed) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-sm">
      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium text-red-400">
          {conflictCount} file conflict{conflictCount !== 1 ? "s" : ""} detected
        </span>
        {conflictFiles.length > 0 && (
          <span className="ml-2 text-muted-foreground truncate">
            {conflictFiles.slice(0, 2).join(", ")}
            {conflictFiles.length > 2 && ` +${conflictFiles.length - 2} more`}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
        onClick={() => setDismissed(true)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

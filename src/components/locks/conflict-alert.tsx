"use client";

import { useLocks } from "@/hooks/use-locks";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export function ConflictAlert() {
  const { conflicts } = useLocks();

  if (conflicts.length === 0) return null;

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>File Conflicts Detected</AlertTitle>
      <AlertDescription>
        {conflicts.length} file{conflicts.length > 1 ? "s" : ""} modified in
        multiple worktrees:{" "}
        {conflicts
          .slice(0, 3)
          .map((c) => `${c.file_path} (${c.worktree_a} vs ${c.worktree_b})`)
          .join(", ")}
        {conflicts.length > 3 && ` and ${conflicts.length - 3} more`}
      </AlertDescription>
    </Alert>
  );
}

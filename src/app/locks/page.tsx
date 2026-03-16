"use client";

import { useLocks } from "@/hooks/use-locks";
import { LockTable } from "@/components/locks/lock-table";
import { ConflictAlert } from "@/components/locks/conflict-alert";
import { Skeleton } from "@/components/ui/skeleton";

export default function LocksPage() {
  const { locks, loading, resolveConflict } = useLocks();

  if (loading) {
    return <Skeleton className="h-[300px] rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      <ConflictAlert />
      <LockTable locks={locks} onResolve={resolveConflict} />
    </div>
  );
}

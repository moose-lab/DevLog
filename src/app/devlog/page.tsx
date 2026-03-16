"use client";

import { useDevlog } from "@/hooks/use-devlog";
import { StatsGrid } from "@/components/devlog/stats-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function DevLogPage() {
  const { stats, loading } = useDevlog();

  if (loading) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[100px] rounded-lg" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <p className="text-sm text-muted-foreground">
        DevLog not available. Make sure the devlog CLI is installed.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <StatsGrid stats={stats} />
    </div>
  );
}

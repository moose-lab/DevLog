"use client";

import { useDevlog } from "@/hooks/use-devlog";
import { useTodayStats } from "@/hooks/use-today-stats";
import { StatsGrid } from "@/components/devlog/stats-grid";
import { CostAreaChart } from "@/components/devlog/cost-chart";
import { Skeleton } from "@/components/ui/skeleton";

export default function DevLogPage() {
  const { stats, loading } = useDevlog();
  const { stats: today, loading: todayLoading } = useTodayStats();

  return (
    <div className="space-y-8">
      {/* All-time headline */}
      <div className="space-y-1">
        {loading ? (
          <Skeleton className="h-12 w-48" />
        ) : (
          <>
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
              All-Time Cost
            </p>
            <div className="flex items-baseline gap-6">
              <span className="text-5xl font-bold tabular-nums">
                {stats ? `$${stats.totalCost.toFixed(2)}` : "—"}
              </span>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>
                  <span className="text-foreground font-semibold tabular-nums">
                    {stats?.sessions.toLocaleString() ?? "—"}
                  </span>{" "}
                  sessions
                </span>
                <span>
                  <span className="text-foreground font-semibold tabular-nums">
                    {stats?.toolCalls.toLocaleString() ?? "—"}
                  </span>{" "}
                  tool calls
                </span>
                <span>
                  <span className="text-foreground font-semibold tabular-nums">
                    {stats?.filesTouched.toLocaleString() ?? "—"}
                  </span>{" "}
                  files touched
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Existing stats grid */}
      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[100px] rounded-lg" />
          ))}
        </div>
      ) : stats ? (
        <StatsGrid stats={stats} />
      ) : (
        <p className="text-sm text-muted-foreground">
          DevLog not available. Make sure Claude Code has been used at least once.
        </p>
      )}

      {/* Daily cost chart */}
      <CostAreaChart />

      {/* Today breakdown */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          Today
        </p>
        {todayLoading ? (
          <div className="flex gap-6">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-32" />)}
          </div>
        ) : (
          <div className="flex gap-8 flex-wrap">
            {[
              { label: "Sessions", value: String(today?.sessions ?? 0) },
              { label: "Cost", value: today ? `$${today.costUSD.toFixed(4)}` : "$0.0000" },
              { label: "Tool Calls", value: String(today?.toolCalls ?? 0) },
              { label: "Files Touched", value: String(today?.filesTouched ?? 0) },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-2xl font-bold tabular-nums">{value}</span>
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { DailyTaskCount } from "@/hooks/use-task-analytics";

interface VelocityChartProps {
  data: DailyTaskCount[];
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const current = payload.find((p) => p.dataKey === "completed")?.value ?? 0;
  const prev = payload.find((p) => p.dataKey === "prevCompleted")?.value ?? 0;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md text-xs">
      <p className="font-medium mb-1">{label}</p>
      <p className="text-muted-foreground">
        This week:{" "}
        <span className="text-foreground font-semibold">{current} tasks</span>
      </p>
      <p className="text-muted-foreground">
        Last week:{" "}
        <span className="text-foreground font-semibold">{prev} tasks</span>
      </p>
    </div>
  );
}

export function VelocityChart({ data }: VelocityChartProps) {
  const hasData = data.some((d) => d.completed > 0 || d.prevCompleted > 0);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          Task Velocity
        </p>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-primary" />
            This week
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/30" />
            Last week
          </span>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {!hasData ? (
          <div className="h-36 flex items-center justify-center text-sm text-muted-foreground">
            No completed tasks yet this week
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={144}>
            <BarChart
              data={data}
              margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
              barCategoryGap="30%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--accent))" }} />
              <Bar
                dataKey="prevCompleted"
                fill="hsl(var(--muted-foreground) / 0.2)"
                radius={[3, 3, 0, 0]}
                maxBarSize={20}
              />
              <Bar
                dataKey="completed"
                fill="hsl(var(--primary))"
                radius={[3, 3, 0, 0]}
                maxBarSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

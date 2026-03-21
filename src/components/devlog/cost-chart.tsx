"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDailyCosts } from "@/hooks/use-daily-costs";

type Range = 7 | 30;

function formatDate(dateStr: string, range: Range): string {
  const d = new Date(dateStr + "T00:00:00");
  if (range === 7) {
    return d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface TooltipPayload {
  value: number;
  payload: { date: string; costUSD: number; sessions: number };
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md text-xs">
      <p className="font-medium mb-1">{d.date}</p>
      <p className="text-muted-foreground">
        Cost: <span className="text-foreground font-semibold">${d.costUSD.toFixed(4)}</span>
      </p>
      <p className="text-muted-foreground">
        Sessions: <span className="text-foreground font-semibold">{d.sessions}</span>
      </p>
    </div>
  );
}

export function CostAreaChart() {
  const [range, setRange] = useState<Range>(7);
  const { days, loading } = useDailyCosts(range);

  const displayDays = days.slice(-range).map((d) => ({
    ...d,
    label: formatDate(d.date, range),
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          Cost Trend
        </p>
        <div className="flex gap-1">
          {([7, 30] as Range[]).map((r) => (
            <Button
              key={r}
              size="sm"
              variant={range === r ? "default" : "outline"}
              className="h-6 px-2.5 text-xs"
              onClick={() => setRange(r)}
            >
              {r === 7 ? "TODAY" : "MONTH"}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={192}>
            <AreaChart data={displayDays} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="costUSD"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#costGradient)"
                dot={false}
                activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

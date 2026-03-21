"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/core/dashboard-utils";

interface SubMetric {
  label: string;
  value: string;
}

interface MetricCardProps {
  label: string;
  value: string;
  unit?: string;
  sub?: SubMetric[];
  className?: string;
  accent?: "default" | "green" | "blue" | "red" | "yellow";
  sparkline?: number[];
  badge?: { text: string; tone: "green" | "yellow" | "red" };
}

const ACCENT_VALUE: Record<string, string> = {
  default: "text-foreground",
  green: "text-green-500",
  blue: "text-blue-500",
  red: "text-red-500",
  yellow: "text-yellow-500",
};

const BADGE_STYLE: Record<string, string> = {
  green: "text-green-600 bg-green-500/10",
  yellow: "text-yellow-600 bg-yellow-500/10",
  red: "text-red-600 bg-red-500/10",
};

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  const w = 80;
  const h = 32;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  });
  return (
    <svg width={w} height={h} className="shrink-0 overflow-visible">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.9}
      />
      {values.map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - (v / max) * h;
        return (
          <circle key={i} cx={x} cy={y} r={2} fill={color} opacity={0.8} />
        );
      })}
    </svg>
  );
}

const SPARK_COLOR: Record<string, string> = {
  default: "#6366f1",
  green: "#22c55e",
  blue: "#3b82f6",
  red: "#ef4444",
  yellow: "#eab308",
};

export function MetricCard({
  label,
  value,
  unit,
  sub,
  className,
  accent = "default",
  sparkline,
  badge,
}: MetricCardProps) {
  return (
    <Card className={cn("rounded-xl", className)}>
      <CardContent className="p-5 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium leading-tight">
            {label}
          </p>
          {badge && (
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
                BADGE_STYLE[badge.tone]
              )}
            >
              {badge.text}
            </span>
          )}
        </div>

        <div className="flex items-end justify-between gap-2">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "text-4xl font-bold tabular-nums leading-none",
                ACCENT_VALUE[accent]
              )}
            >
              {value}
            </span>
            {unit && (
              <span className="text-sm text-muted-foreground">{unit}</span>
            )}
          </div>

          {sparkline && sparkline.length > 1 && (
            <MiniSparkline values={sparkline} color={SPARK_COLOR[accent]} />
          )}
        </div>

        {sub && sub.length > 0 && (
          <div
            className={cn(
              "grid gap-x-3 gap-y-1 pt-2 border-t border-border",
              sub.length <= 2 ? "grid-cols-2" : "grid-cols-3"
            )}
          >
            {sub.map((s) => (
              <div key={s.label} className="flex flex-col gap-0.5">
                <span className="text-lg font-semibold tabular-nums leading-tight">
                  {s.value}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import { cn } from "@/core/dashboard-utils";
import type { DailyTaskCount } from "@/hooks/use-task-analytics";

interface VelocityChartProps {
  data: DailyTaskCount[];
  className?: string;
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
  const current = payload[0]?.value ?? 0;
  return (
    <div className="glass-card px-3 py-2 shadow-xl !border-white/10 text-xs">
      <p className="font-semibold text-zinc-200">{label}</p>
      <p className="text-emerald-400 mt-0.5">
        <span
          className="font-semibold tabular-nums"
          style={{ fontFamily: "var(--font-jetbrains), monospace" }}
        >
          {current}
        </span>{" "}
        tasks completed
      </p>
    </div>
  );
}

export function VelocityChart({ data, className }: VelocityChartProps) {
  const hasData = data.some((d) => d.completed > 0);

  return (
    <div
      className={cn(
        "glass-card flex flex-col overflow-hidden h-full",
        className
      )}
    >
      {/* Header */}
      <div className="px-5 pt-4">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-300">
          Task Velocity
        </span>
      </div>

      {/* Chart */}
      <div className="flex-1 px-3 pb-3 pt-2 min-h-0">
        {!hasData ? (
          <div className="h-full flex items-center justify-center text-sm text-zinc-600">
            No completed tasks yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 24, right: 8, bottom: 0, left: 8 }}
            >
              <XAxis
                dataKey="date"
                tick={{
                  fontSize: 10,
                  fill: "#52525b",
                }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                content={<CustomTooltip />}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />
              <Bar
                dataKey="completed"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              >
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.completed > 0
                        ? "#34d399"
                        : "rgba(255,255,255,0.04)"
                    }
                    fillOpacity={entry.completed > 0 ? 0.8 : 1}
                  />
                ))}
                <LabelList
                  dataKey="completed"
                  position="top"
                  formatter={(val: unknown) => {
                    const n = Number(val);
                    return n > 0 ? n : "";
                  }}
                  style={{
                    fontSize: 11,
                    fill: "#34d399",
                    fontWeight: 700,
                    fontFamily: "var(--font-jetbrains), monospace",
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, DollarSign, Wrench, FileText } from "lucide-react";
import type { DevLogStats } from "@/lib/types";

interface StatsGridProps {
  stats: DevLogStats;
}

const STAT_CARDS = [
  { key: "sessions" as const, label: "Sessions", icon: Terminal, format: (v: number) => String(v) },
  { key: "totalCost" as const, label: "Total Cost", icon: DollarSign, format: (v: number) => `$${v.toFixed(2)}` },
  { key: "toolCalls" as const, label: "Tool Calls", icon: Wrench, format: (v: number) => String(v) },
  { key: "filesTouched" as const, label: "Files Touched", icon: FileText, format: (v: number) => String(v) },
];

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {STAT_CARDS.map(({ key, label, icon: Icon, format }) => (
        <Card key={key}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {label}
            </CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{format(stats[key])}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

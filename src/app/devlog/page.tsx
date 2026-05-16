"use client";

import { CostAreaChart } from "@/components/devlog/cost-chart";
import { CostUsageDashboard } from "@/components/devlog/cost-usage-dashboard";

export default function DevLogPage() {
  return (
    <div className="space-y-8">
      <CostUsageDashboard />
      <CostAreaChart />
    </div>
  );
}

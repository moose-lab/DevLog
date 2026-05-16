"use client";

import { useMemo, useState } from "react";
import {
  Clock3,
  Coins,
  Cpu,
  DollarSign,
  Gauge,
  RefreshCw,
  Server,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  COST_PERIOD_LABELS,
  formatCredits,
  formatTokenCount,
  formatUsd,
  getCostPeriodTotals,
  getProjectPeriodTotals,
  getProviderPeriodTotals,
  getTopCostProjects,
  providerLabel,
  quotaWindowLabel,
  type CostPeriodKey,
} from "@/core/cost-analytics";
import type { CostPeriodTotals, CostQuotaWindow, CostReport } from "@/core/cost-tracker";
import { useCostReport } from "@/hooks/use-cost-report";

const PERIODS: CostPeriodKey[] = ["today", "week", "month", "allTime"];

export function CostUsageDashboard() {
  const [period, setPeriod] = useState<CostPeriodKey>("today");
  const { report, loading, error, refresh } = useCostReport();

  const topProjects = useMemo(
    () => (report ? getTopCostProjects(report, period, 10) : []),
    [report, period]
  );

  if (loading && !report) return <CostUsageSkeleton />;

  if (error && !report) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-6">
          <div>
            <p className="text-sm font-medium">Cost report unavailable</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refresh(true)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!report) return null;

  const totals = getCostPeriodTotals(report, period);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Analytics
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Cost & Usage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Estimates from local Claude Code and Codex logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={period} onValueChange={(value) => setPeriod(value as CostPeriodKey)}>
            <TabsList>
              {PERIODS.map((key) => (
                <TabsTrigger key={key} value={key}>
                  {COST_PERIOD_LABELS[key]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={() => refresh(true)} disabled={loading}>
            <RefreshCw className={loading ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            Refresh
          </Button>
        </div>
      </div>

      <CostSummaryGrid totals={totals} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <QuotaPanel report={report} />
        <ProviderPanel report={report} period={period} />
      </div>

      <ProjectCostTable report={report} period={period} projects={topProjects} />
    </div>
  );
}

function CostSummaryGrid({ totals }: { totals: CostPeriodTotals }) {
  const cards = [
    {
      label: "API Estimate",
      value: formatUsd(totals.apiCostUSD),
      detail: "Token-priced usage",
      icon: DollarSign,
    },
    {
      label: "Subscription Credits",
      value: formatCredits(totals.subscriptionCredits),
      detail: "Codex OAuth usage",
      icon: Coins,
    },
    {
      label: "Total Tokens",
      value: formatTokenCount(totals.totalTokens),
      detail: `${formatTokenCount(totals.cachedInputTokens)} cached input`,
      icon: Cpu,
    },
    {
      label: "Usage Events",
      value: totals.usageEvents.toLocaleString(),
      detail: "Claude sessions and Codex deltas",
      icon: Clock3,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, detail, icon: Icon }) => (
        <Card key={label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function QuotaPanel({ report }: { report: CostReport }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">Quota Remaining</CardTitle>
          <Gauge className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {report.quota.length === 0 ? (
          <p className="text-sm text-muted-foreground">No quota windows found in local logs.</p>
        ) : (
          report.quota.map((quota) => <QuotaRow key={quota.name} quota={quota} />)
        )}
      </CardContent>
    </Card>
  );
}

function QuotaRow({ quota }: { quota: CostQuotaWindow }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium capitalize">{quota.name}</p>
            <Badge variant="outline">{quotaWindowLabel(quota.windowMinutes)}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Resets {quota.resetsAt ? formatDateTime(quota.resetsAt) : "unknown"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums">{quota.remainingPercent}%</p>
          <p className="text-xs text-muted-foreground">{quota.usedPercent}% used</p>
        </div>
      </div>
      <Progress value={quota.remainingPercent} aria-label={`${quota.name} quota remaining`} />
    </div>
  );
}

function ProviderPanel({ report, period }: { report: CostReport; period: CostPeriodKey }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium">Provider Breakdown</CardTitle>
          <Server className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {report.providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No provider usage found.</p>
        ) : (
          report.providers.map((provider) => {
            const totals = getProviderPeriodTotals(provider, period);
            return (
              <div key={provider.provider} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{providerLabel(provider.provider)}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {provider.billingModes.map((mode) => (
                        <Badge key={mode} variant="secondary">
                          {mode === "api" ? "API" : "OAuth"}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold tabular-nums">{formatUsd(totals.apiCostUSD)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCredits(totals.subscriptionCredits)} credits
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <Metric label="Tokens" value={formatTokenCount(totals.totalTokens)} />
                  <Metric label="Cached" value={formatTokenCount(totals.cachedInputTokens)} />
                  <Metric label="Events" value={totals.usageEvents.toLocaleString()} />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function ProjectCostTable({
  report,
  period,
  projects,
}: {
  report: CostReport;
  period: CostPeriodKey;
  projects: CostReport["projects"];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-medium">Project Costs</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Generated {formatDateTime(report.generatedAt)}
            </p>
          </div>
          <Badge variant="outline">{COST_PERIOD_LABELS[period]}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No project usage in this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Providers</TableHead>
                <TableHead className="text-right">API</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Events</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => {
                const totals = getProjectPeriodTotals(project, period);
                return (
                  <TableRow key={`${project.projectName}:${project.projectPath}`}>
                    <TableCell className="max-w-[260px] whitespace-normal">
                      <div className="font-medium">{project.projectName}</div>
                      <div className="truncate text-xs text-muted-foreground">{project.projectPath}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {project.providers.map((provider) => (
                          <Badge key={provider} variant="outline">
                            {providerLabel(provider)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatUsd(totals.apiCostUSD)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCredits(totals.subscriptionCredits)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatTokenCount(totals.totalTokens)}</TableCell>
                    <TableCell className="text-right tabular-nums">{totals.usageEvents.toLocaleString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-medium text-foreground tabular-nums">{value}</p>
      <p>{label}</p>
    </div>
  );
}

function CostUsageSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-56" />
        </div>
        <Skeleton className="h-9 w-56" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="h-[126px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[260px] rounded-xl" />
        <Skeleton className="h-[260px] rounded-xl" />
      </div>
      <Skeleton className="h-[360px] rounded-xl" />
    </div>
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

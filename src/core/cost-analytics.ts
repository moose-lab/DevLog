import type {
  CostPeriodTotals,
  CostProjectSummary,
  CostProvider,
  CostProviderSummary,
  CostReport,
} from "./cost-tracker";

export type CostPeriodKey = "today" | "week" | "month" | "allTime";

export const COST_PERIOD_LABELS: Record<CostPeriodKey, string> = {
  today: "Today",
  week: "7D",
  month: "1M",
  allTime: "All Time",
};

export function getCostPeriodTotals(report: CostReport, period: CostPeriodKey): CostPeriodTotals {
  return report.totals[period];
}

export function getProviderPeriodTotals(provider: CostProviderSummary, period: CostPeriodKey): CostPeriodTotals {
  return provider[period];
}

export function getProjectPeriodTotals(project: CostProjectSummary, period: CostPeriodKey): CostPeriodTotals {
  return project[period];
}

export function getTopCostProjects(report: CostReport, period: CostPeriodKey, limit = 8): CostProjectSummary[] {
  return [...report.projects]
    .filter((project) => {
      const totals = getProjectPeriodTotals(project, period);
      return totals.apiCostUSD > 0 || totals.subscriptionCredits > 0 || totals.totalTokens > 0;
    })
    .sort((a, b) => {
      const aTotals = getProjectPeriodTotals(a, period);
      const bTotals = getProjectPeriodTotals(b, period);
      return (
        bTotals.apiCostUSD - aTotals.apiCostUSD ||
        bTotals.subscriptionCredits - aTotals.subscriptionCredits ||
        bTotals.totalTokens - aTotals.totalTokens
      );
    })
    .slice(0, limit);
}

export function providerLabel(provider: CostProvider): string {
  if (provider === "claude_code") return "Claude Code";
  return "Codex";
}

export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0.00";
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCredits(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value < 10) return value.toFixed(2);
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function formatTokenCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1_000_000_000) return `${trimDecimal(value / 1_000_000_000)}B`;
  if (value >= 1_000_000) return `${trimDecimal(value / 1_000_000)}M`;
  if (value >= 1_000) return `${trimDecimal(value / 1_000)}K`;
  return String(Math.round(value));
}

export function quotaWindowLabel(windowMinutes: number): string {
  if (windowMinutes >= 60 * 24 * 7) return "Weekly window";
  if (windowMinutes >= 60) return `${Math.round(windowMinutes / 60)}h window`;
  return `${windowMinutes}m window`;
}

function trimDecimal(value: number): string {
  return value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, "");
}

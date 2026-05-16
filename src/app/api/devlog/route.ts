import { NextRequest, NextResponse } from "next/server";
import { discoverProjects, computeStats } from "@/core/discovery";
import { discoverTodayStats } from "@/core/fast-discovery";
import { getClaudeProjectsDir } from "@/core/paths";
import { buildCostReport } from "@/core/cost-tracker";

type CostReportResult = Awaited<ReturnType<typeof buildCostReport>>;

const COST_REPORT_CACHE_MS = 60_000;
let costReportCache: { createdAt: number; report: CostReportResult } | null = null;

export async function GET(req: NextRequest) {
  const command = req.nextUrl.searchParams.get("command") ?? "stats";

  try {
    switch (command) {
      case "stats": {
        const projects = await discoverProjects();
        const stats = computeStats(projects);
        return NextResponse.json(stats);
      }
      case "cost": {
        const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";
        const now = Date.now();
        if (!forceRefresh && costReportCache && now - costReportCache.createdAt < COST_REPORT_CACHE_MS) {
          return NextResponse.json(costReportCache.report);
        }

        const report = await buildCostReport();
        costReportCache = { createdAt: Date.now(), report };
        return NextResponse.json(report);
      }
      case "today": {
        const claudeDir = getClaudeProjectsDir();
        const today = await discoverTodayStats(claudeDir);
        return NextResponse.json(today);
      }
      default:
        return NextResponse.json(
          { error: `Unknown command: ${command}. Allowed: stats, cost, today` },
          { status: 400 }
        );
    }
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

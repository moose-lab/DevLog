import { NextRequest, NextResponse } from "next/server";
import { discoverProjects, computeStats } from "@/core/discovery";
import { discoverTodayStats } from "@/core/fast-discovery";
import { getClaudeProjectsDir } from "@/core/paths";

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
        const projects = await discoverProjects();
        const stats = computeStats(projects);
        return NextResponse.json({
          totalCostUSD: stats.totalCostUSD,
          projectCount: stats.projectCount,
          sessionCount: stats.sessionCount,
        });
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

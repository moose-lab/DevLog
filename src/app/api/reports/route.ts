import { NextRequest, NextResponse } from "next/server";
import {
  normalizeReportDate,
  normalizeReportPeriod,
} from "@/core/report-summary";
import { loadReportSummary } from "@/core/report-summary-store";

export async function GET(req: NextRequest) {
  const date = normalizeReportDate(req.nextUrl.searchParams.get("date"));
  const period = normalizeReportPeriod(req.nextUrl.searchParams.get("period"));
  if (!date) {
    return NextResponse.json(
      { error: "date must use YYYY-MM-DD" },
      { status: 400 },
    );
  }
  if (!period) {
    return NextResponse.json(
      { error: "period must be daily, weekly, or monthly" },
      { status: 400 },
    );
  }

  try {
    const summary = loadReportSummary({
      date,
      period,
      projectId: req.nextUrl.searchParams.get("projectId"),
    });
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

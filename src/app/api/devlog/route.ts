import { NextRequest, NextResponse } from "next/server";
import { getDevlogToday, getDevlogStats, getDevlogCost } from "@/lib/devlog-client";

const COMMANDS: Record<string, () => Promise<unknown>> = {
  today: getDevlogToday,
  stats: getDevlogStats,
  cost: getDevlogCost,
};

export async function GET(req: NextRequest) {
  const command = req.nextUrl.searchParams.get("command") ?? "stats";

  const handler = COMMANDS[command];
  if (!handler) {
    return NextResponse.json(
      { error: `Unknown command: ${command}. Allowed: ${Object.keys(COMMANDS).join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const data = await handler();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

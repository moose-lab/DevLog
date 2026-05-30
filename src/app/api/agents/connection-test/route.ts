import { NextRequest, NextResponse } from "next/server";
import { testSessionRuntimeConnection } from "@/core/agent-connection-test";
import {
  getSessionRuntimeAuthInputFromPayload,
  resolveSessionRuntimeAuthConfig,
} from "@/core/session-runtime-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => ({}));
  const runtimeAuthInput = getSessionRuntimeAuthInputFromPayload(payload);
  const runtimeAuthConfig = resolveSessionRuntimeAuthConfig(runtimeAuthInput);
  const result = await testSessionRuntimeConnection(runtimeAuthConfig);
  return NextResponse.json(result);
}

import { NextRequest, NextResponse } from "next/server";
import { fetchProviderModels } from "@/core/api-provider-models";
import {
  getSessionRuntimeAuthInputFromPayload,
  resolveSessionRuntimeAuthConfig,
} from "@/core/session-runtime-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => ({}));
  const runtimeAuthInput = getSessionRuntimeAuthInputFromPayload(payload);
  const runtimeAuthConfig = resolveSessionRuntimeAuthConfig(runtimeAuthInput);
  const result = await fetchProviderModels(runtimeAuthConfig);
  return NextResponse.json(result);
}

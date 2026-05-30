import { NextRequest, NextResponse } from "next/server";
import { normalizeLocalCliAgentEnv } from "@/core/agent-settings";
import { detectLocalCliAgents } from "@/core/local-cli-agents";

export async function GET() {
  const agents = await detectLocalCliAgents();
  return NextResponse.json({ agents });
}

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => ({}));
  const agents = await detectLocalCliAgents({
    localCliAgentEnv: normalizeLocalCliAgentEnv(
      (payload as { local_cli_agent_env?: unknown }).local_cli_agent_env,
    ),
  });
  return NextResponse.json({ agents });
}

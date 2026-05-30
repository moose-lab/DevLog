import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getDb } from "@/core/db";
import { resolveProjectId } from "@/lib/api-utils";
import {
  processManager,
  validateSessionRuntimeProcessLaunch,
} from "@/core/process-manager";
import {
  buildAgentExecutionInstructions,
  getAgentExecutionInputFromPayload,
  resolveAgentExecutionConfig,
} from "@/core/agent-presets";
import {
  buildSessionRuntimeAuthInstructions,
  getSessionRuntimeAuthInputFromPayload,
  resolveSessionRuntimeAuthConfig,
} from "@/core/session-runtime-auth";
import type { Session } from "@/core/types-dashboard";

export async function GET(req: NextRequest) {
  const db = getDb();
  const projectId = resolveProjectId(req);
  const sessions = db
    .prepare("SELECT * FROM sessions WHERE project_id = ? ORDER BY started_at DESC")
    .all(projectId) as Session[];
  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const db = getDb();
  const projectId = resolveProjectId(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const {
    task_id,
    worktree_name,
    worktree_path,
    branch_name,
    prompt,
  } = body as Record<string, unknown>;
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (!worktree_path) {
    return NextResponse.json({ error: "worktree_path is required" }, { status: 400 });
  }

  const id = randomBytes(8).toString("hex");
  const agentConfig = resolveAgentExecutionConfig(
    getAgentExecutionInputFromPayload(body),
  );
  const runtimeAuthInput = getSessionRuntimeAuthInputFromPayload(body);
  const runtimeAuthConfig = resolveSessionRuntimeAuthConfig(runtimeAuthInput);
  const preflight = validateSessionRuntimeProcessLaunch(
    runtimeAuthConfig,
    String(worktree_path),
  );
  if (!preflight.ok) {
    return NextResponse.json({ error: preflight.error }, { status: 400 });
  }
  const sessionPrompt = [
    String(prompt).trim(),
    "",
    "## Agent Execution",
    buildAgentExecutionInstructions(agentConfig),
    buildSessionRuntimeAuthInstructions(runtimeAuthConfig),
  ].join("\n");

  const session = db
    .prepare(
      `INSERT INTO sessions (
        id, project_id, task_id, worktree_name, worktree_path, branch_name,
        status, coding_agent_id, agent_team_id, session_auth_mode,
        agent_api_key_env_var, local_cli_agent_id, agent_model,
        agent_reasoning, agent_api_protocol, agent_api_version,
        agent_base_url, agent_max_tokens, prompt
      )
       VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
    .get(
      id,
      projectId,
      task_id ?? null,
      worktree_name ?? null,
      worktree_path,
      branch_name ?? null,
      agentConfig.codingAgent.id,
      agentConfig.agentTeam.id,
      runtimeAuthConfig.mode,
      runtimeAuthConfig.agentApiKeyEnvVar,
      runtimeAuthConfig.localCliAgentId,
      runtimeAuthConfig.model,
      runtimeAuthConfig.reasoning,
      runtimeAuthConfig.apiProtocol,
      runtimeAuthConfig.apiVersion,
      runtimeAuthConfig.baseUrl,
      runtimeAuthConfig.maxTokens,
      sessionPrompt
    ) as Session;

  // Link session to task if provided
  if (task_id) {
    db.prepare("UPDATE tasks SET session_id = ?, status = 'in_progress' WHERE id = ?").run(
      id,
      task_id
    );
  }

  // Send the initial prompt as the first turn
  try {
    // Don't await — let it process in the background
    processManager.sendMessage(id, sessionPrompt, runtimeAuthInput);
  } catch (err) {
    db.prepare(
      "UPDATE sessions SET status = 'failed', ended_at = datetime('now') WHERE id = ?"
    ).run(id);
    return NextResponse.json(
      { error: `Failed to start: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(session, { status: 201 });
}

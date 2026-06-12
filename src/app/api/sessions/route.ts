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
  getPersistedSessionAuthMode,
  getPersistedSessionBaseUrl,
  resolveSessionRuntimeAuthConfig,
} from "@/core/session-runtime-auth";
import {
  markSessionFailedAndReleaseLinkedTask,
  validateTaskSessionLaunch,
} from "@/core/task-lifecycle";
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

  const bodyRecord =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const {
    task_id,
    worktree_name,
    worktree_path,
    branch_name,
    prompt,
  } = bodyRecord;
  if (typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (typeof worktree_path !== "string" || !worktree_path.trim()) {
    return NextResponse.json({ error: "worktree_path is required" }, { status: 400 });
  }
  const promptText = prompt.trim();
  const worktreePath = worktree_path.trim();
  const taskId =
    typeof task_id === "string" && task_id.trim().length > 0
      ? task_id.trim()
      : null;
  if (task_id != null && !taskId) {
    return NextResponse.json(
      { error: "task_id must be a non-empty string" },
      { status: 400 },
    );
  }

  const id = randomBytes(8).toString("hex");
  const agentConfig = resolveAgentExecutionConfig(
    getAgentExecutionInputFromPayload(bodyRecord),
  );
  const runtimeAuthInput = getSessionRuntimeAuthInputFromPayload(bodyRecord);
  const runtimeAuthConfig = resolveSessionRuntimeAuthConfig(runtimeAuthInput);
  const preflight = validateSessionRuntimeProcessLaunch(
    runtimeAuthConfig,
    worktreePath,
  );
  if (!preflight.ok) {
    return NextResponse.json({ error: preflight.error }, { status: 400 });
  }
  if (taskId) {
    const taskLaunch = validateTaskSessionLaunch(db, taskId, projectId);
    if (!taskLaunch.ok) {
      return NextResponse.json(
        { error: taskLaunch.error },
        { status: taskLaunch.status },
      );
    }
  }
  const sessionPrompt = [
    promptText,
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
       VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
    .get(
      id,
      projectId,
      taskId,
      typeof worktree_name === "string" ? worktree_name : null,
      worktreePath,
      typeof branch_name === "string" ? branch_name : null,
      agentConfig.codingAgent.id,
      agentConfig.agentTeam.id,
      getPersistedSessionAuthMode(runtimeAuthConfig),
      runtimeAuthConfig.agentApiKeyEnvVar,
      runtimeAuthConfig.localCliAgentId,
      runtimeAuthConfig.model,
      runtimeAuthConfig.reasoning,
      runtimeAuthConfig.apiProtocol,
      runtimeAuthConfig.apiVersion,
      getPersistedSessionBaseUrl(runtimeAuthConfig),
      runtimeAuthConfig.maxTokens,
      sessionPrompt
    ) as Session;

  // Link session to task if provided
  if (taskId) {
    db.prepare(
      "UPDATE tasks SET session_id = ?, status = 'in_progress', fail_reason = NULL, completed_at = NULL, updated_at = datetime('now') WHERE id = ? AND project_id = ?",
    ).run(id, taskId, projectId);
  }

  // Send the initial prompt as the first turn
  try {
    // Don't await — let it process in the background
    processManager.sendMessage(id, sessionPrompt, runtimeAuthInput);
  } catch (err) {
    markSessionFailedAndReleaseLinkedTask(
      db,
      id,
      `Failed to start: ${(err as Error).message}`,
    );
    return NextResponse.json(
      { error: `Failed to start: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(session, { status: 201 });
}

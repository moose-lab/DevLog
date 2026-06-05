import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getDb } from "@/core/db";
import { resolveProjectId } from "@/lib/api-utils";
import { getProject } from "@/core/project-adapter";
import { listWorktrees } from "@/core/worktree-manager";
import {
  processManager,
  validateSessionRuntimeProcessLaunch,
} from "@/core/process-manager";
import { compileSession } from "@/core/vcc";
import { markSessionFailedAndReleaseLinkedTask } from "@/core/task-lifecycle";
import { buildTaskRetryPrompt } from "@/core/task-retry";
import {
  getAgentExecutionInputFromPayload,
  resolveAgentExecutionConfig,
} from "@/core/agent-presets";
import {
  getSessionRuntimeAuthInputFromPayload,
  getPersistedSessionBaseUrl,
  resolveSessionRuntimeAuthConfig,
} from "@/core/session-runtime-auth";
import type { Task, Session } from "@/core/types-dashboard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const db = getDb();
  const projectId = resolveProjectId(req);
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const feedback = typeof record.feedback === "string" ? record.feedback : "";

  if (!feedback?.trim()) {
    return NextResponse.json({ error: "Feedback is required" }, { status: 400 });
  }

  // 1. Find task
  const task = db
    .prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?")
    .get(taskId, projectId) as Task | undefined;

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (!task.worktree_name) {
    return NextResponse.json(
      { error: "Task has no worktree — execute first" },
      { status: 400 }
    );
  }

  // 2. Find worktree
  const worktrees = await listWorktrees(projectId);
  const wt = worktrees.find((w) => w.name === task.worktree_name);
  if (!wt) {
    return NextResponse.json(
      { error: `Worktree '${task.worktree_name}' not found` },
      { status: 404 }
    );
  }

  const project = getProject(projectId);
  const agentConfig = resolveAgentExecutionConfig(
    getAgentExecutionInputFromPayload(payload),
  );
  const runtimeAuthInput = getSessionRuntimeAuthInputFromPayload(payload);
  const runtimeAuthConfig = resolveSessionRuntimeAuthConfig(runtimeAuthInput);
  const preflight = validateSessionRuntimeProcessLaunch(
    runtimeAuthConfig,
    wt.path,
  );
  if (!preflight.ok) {
    return NextResponse.json({ error: preflight.error }, { status: 400 });
  }

  // 3. Get previous session brief for context
  let previousBrief = "";
  if (task.session_id) {
    const prevSession = db
      .prepare("SELECT claude_session_id FROM sessions WHERE id = ?")
      .get(task.session_id) as { claude_session_id: string | null } | undefined;

    if (prevSession?.claude_session_id) {
      try {
        const vcc = await compileSession(
          prevSession.claude_session_id,
          project.path
        );
        previousBrief = vcc.brief.split("\n").slice(0, 30).join("\n");
      } catch {
        // non-fatal
      }
    }
  }

  // 4. Build retry prompt
  const retryPrompt = buildTaskRetryPrompt({
    task,
    project,
    worktreePath: wt.path,
    branchName: wt.branch,
    feedback: feedback.trim(),
    previousBrief,
    agentConfig,
    runtimeAuthConfig,
  });

  // 5. Create new session
  const sessionId = randomBytes(8).toString("hex");
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
      sessionId,
      projectId,
      taskId,
      task.worktree_name,
      wt.path,
      wt.branch,
      agentConfig.codingAgent.id,
      agentConfig.agentTeam.id,
      runtimeAuthConfig.mode,
      runtimeAuthConfig.agentApiKeyEnvVar,
      runtimeAuthConfig.localCliAgentId,
      runtimeAuthConfig.model,
      runtimeAuthConfig.reasoning,
      runtimeAuthConfig.apiProtocol,
      runtimeAuthConfig.apiVersion,
      getPersistedSessionBaseUrl(runtimeAuthConfig),
      runtimeAuthConfig.maxTokens,
      retryPrompt
    ) as Session;

  // 6. Update task
  db.prepare(
    "UPDATE tasks SET status = 'in_progress', session_id = ?, fail_reason = NULL, completed_at = NULL, updated_at = datetime('now') WHERE id = ?"
  ).run(sessionId, taskId);

  // 7. Spawn agent
  try {
    processManager.sendMessage(sessionId, retryPrompt, runtimeAuthInput);
  } catch (err) {
    markSessionFailedAndReleaseLinkedTask(
      db,
      sessionId,
      `Failed to start: ${(err as Error).message}`,
    );
    return NextResponse.json(
      { error: `Failed to start: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ session }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getDb } from "@/core/db";
import { resolveProjectId } from "@/lib/api-utils";
import { processManager } from "@/core/process-manager";
import {
  buildAgentExecutionInstructions,
  getAgentExecutionInputFromPayload,
  resolveAgentExecutionConfig,
} from "@/core/agent-presets";
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
  const body = await req.json();

  const {
    task_id,
    worktree_name,
    worktree_path,
    branch_name,
    prompt,
  } = body;
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
  const sessionPrompt = [
    String(prompt).trim(),
    "",
    "## Agent Execution",
    buildAgentExecutionInstructions(agentConfig),
  ].join("\n");

  const session = db
    .prepare(
      `INSERT INTO sessions (
        id, project_id, task_id, worktree_name, worktree_path, branch_name,
        status, coding_agent_id, agent_team_id, prompt
      )
       VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)
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
    processManager.sendMessage(id, sessionPrompt);
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

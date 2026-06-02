import { buildPromptTemplate } from "./task-lifecycle";
import type { AgentExecutionConfig } from "./agent-presets";
import type { SessionRuntimeAuthConfig } from "./session-runtime-auth";
import type { Task } from "./types-dashboard";
import type { ProjectConfig } from "./types-project";

export function buildTaskRetryPrompt({
  task,
  project,
  worktreePath,
  branchName,
  feedback,
  previousBrief,
  agentConfig,
  runtimeAuthConfig,
}: {
  task: Task;
  project: ProjectConfig;
  worktreePath: string;
  branchName: string;
  feedback: string;
  previousBrief?: string;
  agentConfig: AgentExecutionConfig;
  runtimeAuthConfig: SessionRuntimeAuthConfig;
}): string {
  const basePrompt = buildPromptTemplate(
    task,
    project,
    worktreePath,
    branchName,
    agentConfig,
    runtimeAuthConfig,
  );

  return [
    basePrompt,
    "",
    "## Previous Attempt Feedback",
    feedback,
    previousBrief
      ? `\n## Previous Session Summary\n\`\`\`\n${previousBrief}\n\`\`\``
      : "",
    "",
    "Address the feedback above and complete the task.",
  ]
    .filter(Boolean)
    .join("\n");
}

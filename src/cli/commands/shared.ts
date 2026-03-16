import type { Session, SessionJson } from "../../core/types.js";

export function toSessionJson(session: Session): SessionJson {
  return {
    id: session.id,
    projectName: session.projectName,
    projectPath: session.projectPath,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    messageCount: session.meta.messageCount,
    toolCalls: session.meta.toolCalls,
    filesTouched: session.meta.filesReferenced.length,
    costUSD: Math.round(session.meta.totalCostUSD * 1000000) / 1000000,
    firstMessage: session.meta.firstUserMessage,
  };
}

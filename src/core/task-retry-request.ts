import type { SessionRuntimeAuthInput } from "./session-runtime-auth";

export function buildTaskRetryRequestBody(
  feedback: string,
  runtimePayload: SessionRuntimeAuthInput,
): { feedback: string } & SessionRuntimeAuthInput {
  return {
    feedback: feedback.trim(),
    ...runtimePayload,
  };
}

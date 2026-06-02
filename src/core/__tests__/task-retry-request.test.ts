import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTaskRetryRequestBody } from "../task-retry-request";

test("buildTaskRetryRequestBody carries feedback and current runtime payload", () => {
  assert.deepEqual(
    buildTaskRetryRequestBody("  Fix the review notes.  ", {
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "gpt-4o-mini",
      agent_base_url: "https://api.openai.com/v1",
      anthropic_api_key: "sk-test",
    }),
    {
      feedback: "Fix the review notes.",
      session_auth_mode: "anthropic-api-key",
      agent_api_protocol: "openai",
      agent_model: "gpt-4o-mini",
      agent_base_url: "https://api.openai.com/v1",
      anthropic_api_key: "sk-test",
    },
  );
});

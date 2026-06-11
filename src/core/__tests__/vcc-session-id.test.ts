import { test } from "node:test";
import assert from "node:assert/strict";
import { compileSession, isValidClaudeSessionId } from "../vcc";

/**
 * Regression tests for IM-19 (REVIEW-2026-06-10): claude_session_id is parsed
 * from agent stdout (attacker-influenced under the malicious-JSONL threat
 * model) and flowed unvalidated into a filesystem path, python3 argv, and
 * safeRead — letting a traversal id read arbitrary .txt/.jsonl files into the
 * API response.
 */

test("isValidClaudeSessionId accepts UUID-style and slug ids", () => {
  for (const id of [
    "0199b1c4-f7a2-7e11-8b3a-1c2d3e4f5a6b",
    "abc123",
    "session_42",
    "A-b_C-1",
  ]) {
    assert.equal(isValidClaudeSessionId(id), true, id);
  }
});

test("isValidClaudeSessionId rejects traversal and separator ids", () => {
  for (const id of [
    "../../../etc/passwd",
    "..",
    "a/b",
    "a\\b",
    "id.jsonl",
    "",
    " ",
    "a".repeat(129),
    "id\n",
  ]) {
    assert.equal(isValidClaudeSessionId(id), false, JSON.stringify(id));
  }
});

test("compileSession refuses invalid session ids before touching the filesystem", async () => {
  await assert.rejects(
    () => compileSession("../../../../tmp/evil", "/some/project"),
    /Invalid Claude session id/
  );
});

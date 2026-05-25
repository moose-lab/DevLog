import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasTaskPrompt,
  isActiveSessionStatus,
  normalizeReadyTaskStatus,
} from "../task-readiness";

test("todo tasks without prompts are normalized to blocked", () => {
  assert.equal(normalizeReadyTaskStatus("todo", null), "blocked");
  assert.equal(normalizeReadyTaskStatus("todo", "   "), "blocked");
  assert.equal(normalizeReadyTaskStatus("todo", "Implement the task"), "todo");
  assert.equal(normalizeReadyTaskStatus("blocked", null), "blocked");
});

test("prompt readiness trims whitespace", () => {
  assert.equal(hasTaskPrompt("  run tests  "), true);
  assert.equal(hasTaskPrompt("  "), false);
});

test("only live session statuses are active on task cards", () => {
  assert.equal(isActiveSessionStatus("running"), true);
  assert.equal(isActiveSessionStatus("idle"), true);
  assert.equal(isActiveSessionStatus("pending"), true);
  assert.equal(isActiveSessionStatus("paused"), true);
  assert.equal(isActiveSessionStatus("killed"), false);
  assert.equal(isActiveSessionStatus("failed"), false);
  assert.equal(isActiveSessionStatus("completed"), false);
});

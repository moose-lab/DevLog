import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatToolOutputForDisplay,
  getSessionInstructionInputCopy,
  isInteractiveSessionStatus,
  isTerminalSessionStatus,
} from "./session-chat";

test("formatToolOutputForDisplay keeps complete output up to 20 lines", () => {
  const output = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join(
    "\n",
  );

  assert.equal(formatToolOutputForDisplay(output), output);
});

test("formatToolOutputForDisplay folds output longer than 20 lines", () => {
  const output = Array.from({ length: 24 }, (_, index) => `line ${index + 1}`).join(
    "\n",
  );

  assert.equal(
    formatToolOutputForDisplay(output),
    [
      "line 1",
      "line 2",
      "line 3",
      "line 4",
      "line 5",
      "line 6",
      "line 7",
      "line 8",
      "line 9",
      "line 10",
      "... (truncated 9 lines)",
      "line 20",
      "line 21",
      "line 22",
      "line 23",
      "line 24",
    ].join("\n"),
  );
});

test("isInteractiveSessionStatus treats pending, running, idle, and paused as active task runs", () => {
  assert.equal(isInteractiveSessionStatus("pending"), true);
  assert.equal(isInteractiveSessionStatus("running"), true);
  assert.equal(isInteractiveSessionStatus("idle"), true);
  assert.equal(isInteractiveSessionStatus("paused"), true);

  assert.equal(isInteractiveSessionStatus("completed"), false);
  assert.equal(isInteractiveSessionStatus("failed"), false);
  assert.equal(isInteractiveSessionStatus("killed"), false);
});

test("isTerminalSessionStatus treats completed, failed, and killed as ended sessions", () => {
  assert.equal(isTerminalSessionStatus("completed"), true);
  assert.equal(isTerminalSessionStatus("failed"), true);
  assert.equal(isTerminalSessionStatus("killed"), true);

  assert.equal(isTerminalSessionStatus("pending"), false);
  assert.equal(isTerminalSessionStatus("running"), false);
  assert.equal(isTerminalSessionStatus("idle"), false);
  assert.equal(isTerminalSessionStatus("paused"), false);
});

test("getSessionInstructionInputCopy uses instruction-oriented copy for active sessions", () => {
  assert.deepEqual(
    getSessionInstructionInputCopy({ processing: false, sessionEnded: false }),
    {
      placeholder: "Send the next instruction for this task session...",
      helperText: "Enter to send, Shift+Enter for a new line",
      disabledText: "Session ended",
    },
  );

  assert.deepEqual(
    getSessionInstructionInputCopy({ processing: true, sessionEnded: false }),
    {
      placeholder: "Queue a follow-up instruction for this task session...",
      helperText:
        "Instruction will be queued and sent when the current turn finishes",
      disabledText: "Session ended",
    },
  );
});

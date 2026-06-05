import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatActivityEntryForDisplay,
  formatActivityTimestampForDisplay,
  formatToolOutputForDisplay,
  getSessionInstructionInputCopy,
  isInteractiveSessionStatus,
  isTerminalSessionStatus,
} from "./session-chat";
import {
  createReplayChatMessage,
  mergeReplayMessagesWithQueuedPlaceholders,
} from "@/hooks/use-session-chat";

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

test("formatActivityEntryForDisplay returns status messages", () => {
  assert.equal(
    formatActivityEntryForDisplay({
      id: 1,
      kind: "status",
      message: "Agent process running as PID 1234",
    }),
    "Agent process running as PID 1234",
  );
});

test("formatActivityEntryForDisplay trims, truncates, and labels stderr logs", () => {
  const longChunk = `  ${"stderr chunk ".repeat(24)}  `;

  const formatted = formatActivityEntryForDisplay({
    id: 2,
    kind: "log",
    stream: "stderr",
    message: longChunk,
  });

  assert.match(formatted, /^\[stderr\] stderr chunk/);
  assert.equal(formatted.endsWith("..."), true);
  assert.ok(formatted.length <= "[stderr] ".length + 160 + "...".length);
});

test("formatActivityEntryForDisplay returns system warning and success messages", () => {
  assert.equal(
    formatActivityEntryForDisplay({
      id: 3,
      kind: "system",
      level: "warning",
      message: "Agent process exited unexpectedly",
    }),
    "Agent process exited unexpectedly",
  );

  assert.equal(
    formatActivityEntryForDisplay({
      id: 4,
      kind: "system",
      level: "success",
      message: "Agent process completed",
    }),
    "Agent process completed",
  );
});

test("formatActivityTimestampForDisplay omits invalid timestamps", () => {
  assert.equal(formatActivityTimestampForDisplay(undefined), null);
  assert.equal(formatActivityTimestampForDisplay("not a timestamp"), null);
});

test("createReplayChatMessage preserves stable persisted message ids", () => {
  assert.deepEqual(
    createReplayChatMessage({
      type: "message",
      id: 42,
      role: "assistant",
      content: "persisted response",
    }),
    {
      id: 42,
      role: "assistant",
      content: "persisted response",
    },
  );
});

test("mergeReplayMessagesWithQueuedPlaceholders drops queued messages already replayed as user messages", () => {
  const replayed = [
    { id: 1, role: "user" as const, content: "persisted follow-up" },
    { id: 2, role: "assistant" as const, content: "working" },
  ];
  const current = [
    {
      id: 3,
      role: "user" as const,
      content: "persisted follow-up",
      isQueued: true,
    },
    {
      id: 4,
      role: "user" as const,
      content: "still queued",
      isQueued: true,
    },
    { id: 5, role: "assistant" as const, content: "stale live text" },
  ];

  assert.deepEqual(
    mergeReplayMessagesWithQueuedPlaceholders(replayed, current).map(
      (message) => message.content,
    ),
    ["persisted follow-up", "working", "still queued"],
  );
});

test("mergeReplayMessagesWithQueuedPlaceholders consumes one queued duplicate per replayed user message", () => {
  const replayed = [{ id: 1, role: "user" as const, content: "continue" }];
  const current = [
    {
      id: 2,
      role: "user" as const,
      content: "continue",
      isQueued: true,
    },
    {
      id: 3,
      role: "user" as const,
      content: "continue",
      isQueued: true,
    },
  ];

  assert.deepEqual(
    mergeReplayMessagesWithQueuedPlaceholders(replayed, current).map(
      (message) => message.content,
    ),
    ["continue", "continue"],
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

test("getSessionInstructionInputCopy blocks session follow-up when selected runtime is not ready", () => {
  assert.deepEqual(
    getSessionInstructionInputCopy({
      processing: false,
      sessionEnded: false,
      runtimeReady: false,
    }),
    {
      placeholder: "",
      helperText: "",
      disabledText: "Add API key in Settings",
    },
  );
});

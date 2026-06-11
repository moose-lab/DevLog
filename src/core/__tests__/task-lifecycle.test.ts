import { test } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb } from "./test-helpers";
import {
  isFailedSessionExit,
  markSessionFailedAndReleaseLinkedTask,
  validateTaskSessionLaunch,
} from "../task-lifecycle";
import {
  getTaskBoardColumns,
  isTaskExecutableStatus,
} from "../task-status-flow";

test("linked launch failure moves the current in-progress task to fail", () => {
  const db = makeTestDb();
  db.prepare(
    `INSERT INTO tasks (
      id, project_id, title, status, worktree_name, session_id, fail_reason, prompt
    ) VALUES (
      'task-failed-launch', 'devlog', 'Retryable task', 'in_progress',
      'task-retryable-task', 'session-failed-launch', NULL, 'Run it'
    )`,
  ).run();
  db.prepare(
    `INSERT INTO sessions (
      id, project_id, task_id, worktree_name, worktree_path, status
    ) VALUES (
      'session-failed-launch', 'devlog', 'task-failed-launch',
      'task-retryable-task', '/repo/.worktrees/task-retryable-task', 'running'
    )`,
  ).run();

  markSessionFailedAndReleaseLinkedTask(
    db,
    "session-failed-launch",
    "Failed to start agent: codex not on PATH",
  );

  const task = db
    .prepare("SELECT status, session_id, fail_reason FROM tasks WHERE id = ?")
    .get("task-failed-launch") as {
    status: string;
    session_id: string | null;
    fail_reason: string | null;
  };
  const session = db
    .prepare("SELECT status, pid, ended_at FROM sessions WHERE id = ?")
    .get("session-failed-launch") as {
    status: string;
    pid: number | null;
    ended_at: string | null;
  };

  assert.deepEqual(task, {
    status: "fail",
    session_id: "session-failed-launch",
    fail_reason: "Failed to start agent: codex not on PATH",
  });
  assert.equal(session.status, "failed");
  assert.equal(session.pid, null);
  assert.equal(typeof session.ended_at, "string");
});

test("failed tasks are visible in Tasks and can be launched again", () => {
  assert.equal(isTaskExecutableStatus("fail"), true);
  assert.equal(
    getTaskBoardColumns().some(
      (column) =>
        (column.type === "status" && column.status === "fail") ||
        (column.type === "group" && column.statuses.includes("fail")),
    ),
    true,
  );
});

test("the Tasks UI groups queued and failed work without merging status semantics", () => {
  const columns = getTaskBoardColumns();

  assert.deepEqual(
    columns.map((column) => column.id),
    ["todo", "queue_failed", "in_progress", "review", "blocked", "done"],
  );

  const queueFailedColumn = columns.find(
    (column) => column.id === "queue_failed",
  );
  assert.deepEqual(queueFailedColumn, {
    id: "queue_failed",
    type: "group",
    label: "Queue / Failed",
    statuses: ["in_queue", "fail"],
  });
  assert.equal(isTaskExecutableStatus("in_queue"), false);
  assert.equal(isTaskExecutableStatus("fail"), true);
});

test("session launch validation only allows executable tasks in the current project", () => {
  const db = makeTestDb();
  db.prepare(
    `INSERT INTO tasks (id, project_id, title, status)
     VALUES
       ('task-retryable', 'devlog', 'Retryable', 'fail'),
       ('task-in-review', 'devlog', 'In Review', 'review'),
       ('task-other-project', 'other', 'Other Project', 'fail')`,
  ).run();

  assert.deepEqual(validateTaskSessionLaunch(db, "task-retryable", "devlog"), {
    ok: true,
    task: { id: "task-retryable", status: "fail" },
  });
  assert.deepEqual(validateTaskSessionLaunch(db, "task-in-review", "devlog"), {
    ok: false,
    status: 400,
    error: "Cannot launch session for task with status 'review'",
  });
  assert.deepEqual(
    validateTaskSessionLaunch(db, "task-other-project", "devlog"),
    {
      ok: false,
      status: 404,
      error: "Task not found",
    },
  );
});

test("only a recorded non-zero exit code counts as a failed session exit (IM-6)", () => {
  // NULL was previously read as failure, routing every clean exit to blocked
  // because exit_code was never persisted.
  assert.equal(isFailedSessionExit(null), false);
  assert.equal(isFailedSessionExit(0), false);
  assert.equal(isFailedSessionExit(1), true);
  assert.equal(isFailedSessionExit(137), true);
});

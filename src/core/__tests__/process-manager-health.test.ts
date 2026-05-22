import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_UNRESPONSIVE_MS,
  shouldRestartUnresponsiveSession,
} from "../process-manager";

test("shouldRestartUnresponsiveSession only restarts live stale processes", () => {
  const now = Date.parse("2026-05-22T12:00:00.000Z");

  assert.equal(
    shouldRestartUnresponsiveSession({
      lastActivityAt: now - SESSION_UNRESPONSIVE_MS - 1,
      now,
      killed: false,
    }),
    true,
  );

  assert.equal(
    shouldRestartUnresponsiveSession({
      lastActivityAt: now - SESSION_UNRESPONSIVE_MS + 1,
      now,
      killed: false,
    }),
    false,
  );

  assert.equal(
    shouldRestartUnresponsiveSession({
      lastActivityAt: now - SESSION_UNRESPONSIVE_MS - 1,
      now,
      killed: true,
    }),
    false,
  );
});

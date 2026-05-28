import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_UNRESPONSIVE_MS,
  parseClaudeBinaryPath,
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

  assert.equal(
    shouldRestartUnresponsiveSession({
      lastActivityAt: now - SESSION_UNRESPONSIVE_MS - 1,
      now,
      killed: false,
      paused: true,
    }),
    false,
  );
});

test("parseClaudeBinaryPath ignores shell alias descriptions", () => {
  // parseClaudeBinaryPath uses fs.existsSync to filter out junk lines that
  // happen to start with "/" (e.g. shell-alias descriptions). The candidate
  // path must therefore actually exist on the runner. process.execPath is
  // the running Node binary — always absolute, always present, on every
  // platform — which makes this test deterministic across Mac/Linux/Windows.
  const realPath = process.execPath;

  assert.equal(
    parseClaudeBinaryPath(
      `alias claude='command claude --dangerously-skip-permissions'\n${realPath}`,
    ),
    realPath,
  );

  assert.equal(
    parseClaudeBinaryPath(
      "claude: aliased to command claude --dangerously-skip-permissions",
    ),
    null,
  );
});

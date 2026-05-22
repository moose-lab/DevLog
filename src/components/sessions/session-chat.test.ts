import { test } from "node:test";
import assert from "node:assert/strict";
import { formatToolOutputForDisplay } from "./session-chat";

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

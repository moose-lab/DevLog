import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSession } from "../parser";

const SONNET_46 = "claude-sonnet-4-6";

async function withJsonl(lines: unknown[], run: (filePath: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "devlog-parser-cost-"));
  const filePath = join(dir, "session.jsonl");
  await writeFile(filePath, lines.map((line) => JSON.stringify(line)).join("\n"), "utf-8");

  try {
    await run(filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("scanSession counts usage once per assistant message id", async () => {
  const duplicatedAssistant = {
    type: "assistant",
    timestamp: "2026-05-16T10:00:00.000Z",
    message: {
      id: "msg_duplicate",
      role: "assistant",
      model: SONNET_46,
      usage: {
        input_tokens: 1_000,
        output_tokens: 200,
        cache_creation_input_tokens: 300,
        cache_read_input_tokens: 400,
      },
      content: [{ type: "text", text: "partial" }],
    },
  };

  await withJsonl(
    [
      {
        type: "user",
        timestamp: "2026-05-16T09:59:00.000Z",
        message: { role: "user", content: "start" },
      },
      duplicatedAssistant,
      { ...duplicatedAssistant, message: { ...duplicatedAssistant.message, content: [{ type: "text", text: "same step" }] } },
      { ...duplicatedAssistant, message: { ...duplicatedAssistant.message, content: [{ type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "a.ts" } }] } },
    ],
    async (filePath) => {
      const meta = await scanSession(filePath);

      assert.equal(meta.assistantTurns, 3);
      assert.equal(meta.toolCalls, 1);
      assert.ok(Math.abs(meta.totalCostUSD - 0.007245) < 0.000000001);
      assert.ok(Math.abs(meta.costByModel[SONNET_46] - 0.007245) < 0.000000001);
    }
  );
});

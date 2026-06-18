import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { listWorktrees } from "../worktree-manager";
import { GET, POST } from "../../app/api/worktrees/route";

function withMissingGitPath<T>(run: () => Promise<T>): Promise<T> {
  const originalPath = process.env.PATH;
  const emptyDir = mkdtempSync(path.join(tmpdir(), "devlog-no-git-"));
  process.env.PATH = emptyDir;

  return run().finally(() => {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    rmSync(emptyDir, { recursive: true, force: true });
  });
}

async function withSuppressedConsoleError<T>(run: () => Promise<T>): Promise<T> {
  const originalError = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = originalError;
  }
}

test("listWorktrees reports missing git with an actionable error", async () => {
  await withMissingGitPath(async () => {
    await assert.rejects(
      () => listWorktrees(),
      (error) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Git is not available. Install Git or add it to the service PATH.");
        assert.doesNotMatch(error.message, /spawn git ENOENT|ENOENT/);
        return true;
      }
    );
  });
});

test("GET /api/worktrees does not expose the raw missing-git failure", async () => {
  await withMissingGitPath(async () => {
    await withSuppressedConsoleError(async () => {
      const response = await GET(new NextRequest("http://localhost/api/worktrees"));
      const body = await response.json();

      assert.equal(response.status, 503);
      assert.equal(body.error, "Git is not available. Install Git or add it to the service PATH.");
      assert.doesNotMatch(body.error, /spawn git ENOENT|ENOENT/);
    });
  });
});

test("POST /api/worktrees does not expose the raw missing-git failure", async () => {
  await withMissingGitPath(async () => {
    await withSuppressedConsoleError(async () => {
      const response = await POST(
        new NextRequest("http://localhost/api/worktrees", {
          method: "POST",
          body: JSON.stringify({ name: "missing-git", branch: "missing-git" }),
        })
      );
      const body = await response.json();

      assert.equal(response.status, 503);
      assert.equal(body.error, "Git is not available. Install Git or add it to the service PATH.");
      assert.doesNotMatch(body.error, /spawn git ENOENT|ENOENT/);
    });
  });
});

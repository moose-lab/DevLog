import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const repoRoot = new URL("../../../", import.meta.url);

function readRepoFile(path: string): string {
  return readFileSync(new URL(path, repoRoot), "utf8");
}

test("package scripts define the shared DevLog quality gates", () => {
  const pkg = JSON.parse(readRepoFile("package.json"));

  assert.equal(pkg.scripts.prepare, "husky");
  assert.equal(
    pkg.scripts["quality:precommit"],
    "git diff --cached --check && bun run typecheck && TZ=Asia/Shanghai bun run test",
  );
  assert.equal(
    pkg.scripts["quality:build"],
    "bun run build:web && bun run build:cli",
  );
  assert.equal(
    pkg.scripts["quality:ci"],
    "bun run typecheck && TZ=Asia/Shanghai bun run test && bun run quality:build",
  );
  assert.equal(pkg.scripts.quality, "bun run quality:ci");
});

test("Husky pre-commit hook runs the shared pre-commit gate", () => {
  const hookPath = new URL(".husky/pre-commit", repoRoot);
  const hook = readFileSync(hookPath, "utf8");
  const mode = statSync(hookPath).mode;

  assert.match(hook, /bun run quality:precommit/);
  assert.equal(mode & 0o111, 0o111);
});

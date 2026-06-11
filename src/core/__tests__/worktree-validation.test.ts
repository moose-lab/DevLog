import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateWorktreeName,
  validateBranchName,
} from "../worktree-validation";

/**
 * Regression tests for CR-5 / IM-22 (REVIEW-2026-06-10): POST /api/worktrees
 * passed `name` into path.join with only a falsy check — a traversal name
 * materialized a working tree at an attacker-chosen path — and refs starting
 * with '-' were git argument injection.
 */

test("validateWorktreeName accepts simple names", () => {
  for (const name of ["feature-x", "fix_123", "a", "release.2026", "A-b.c_d"]) {
    assert.equal(validateWorktreeName(name).ok, true, name);
  }
});

test("validateWorktreeName rejects traversal and injection attempts", () => {
  for (const name of [
    "../../../../tmp/pwn",
    "..",
    "a/../b",
    "nested/dir",
    "-rf",
    ".hidden",
    "",
    " ",
    "a".repeat(65),
    "name with spaces",
    "tilde~",
  ]) {
    assert.equal(validateWorktreeName(name).ok, false, JSON.stringify(name));
  }
});

test("validateBranchName accepts normal git branch refs", () => {
  for (const branch of ["main", "feature/login", "fix/devlog-2026-06-10", "v1.2.3", "user/feat_x"]) {
    assert.equal(validateBranchName(branch).ok, true, branch);
  }
});

test("validateBranchName rejects option injection and invalid refs", () => {
  for (const branch of [
    "-D",
    "--force",
    "-b evil",
    "..",
    "a..b",
    ".hidden",
    "branch.lock",
    "has space",
    "",
    "a".repeat(201),
    "ends/",
    "double//slash",
  ]) {
    assert.equal(validateBranchName(branch).ok, false, JSON.stringify(branch));
  }
});

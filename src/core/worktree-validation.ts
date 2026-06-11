/**
 * Input validation for worktree creation (CR-5 / IM-22).
 *
 * `name` becomes a filesystem path segment and `branch`/`baseBranch` become
 * git argv entries, so both must be constrained before reaching path.join or
 * git: traversal names escape the repo, and refs starting with '-' are read
 * by git as options.
 */

// One path segment: starts alphanumeric, no separators, no leading '.' or '-'.
const WORKTREE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

// Git ref name: slash-separated segments, each starting alphanumeric.
const BRANCH_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_BRANCH_LENGTH = 200;

export type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateWorktreeName(name: string): ValidationResult {
  if (!WORKTREE_NAME_PATTERN.test(name) || name.includes("..")) {
    return {
      ok: false,
      error:
        "Invalid worktree name: use 1-64 letters, digits, '.', '_' or '-', starting with a letter or digit",
    };
  }
  return { ok: true };
}

export function validateBranchName(branch: string): ValidationResult {
  const invalid = {
    ok: false as const,
    error:
      "Invalid branch name: use slash-separated segments of letters, digits, '.', '_' or '-', each starting with a letter or digit",
  };
  if (!branch || branch.length > MAX_BRANCH_LENGTH || branch.includes("..")) {
    return invalid;
  }
  const segments = branch.split("/");
  for (const segment of segments) {
    if (!BRANCH_SEGMENT_PATTERN.test(segment) || segment.endsWith(".lock")) {
      return invalid;
    }
  }
  return { ok: true };
}

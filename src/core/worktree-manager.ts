import { execFile, type ExecFileOptions } from "child_process";
import { promisify } from "util";
import path from "path";
import type { Worktree } from "./types-dashboard";
import { getRepoRoot } from "./project-adapter";
import { validateBranchName, validateWorktreeName } from "./worktree-validation";
import { normalizeGitError } from "./worktree-errors";

const execFileAsync = promisify(execFile);

async function runGit(args: string[], options: ExecFileOptions): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, options);
    return stdout.toString();
  } catch (error) {
    throw normalizeGitError(error);
  }
}

async function git(projectId: string | undefined, ...args: string[]): Promise<string> {
  const repoRoot = getRepoRoot(projectId);
  return runGit(args, { cwd: repoRoot });
}

export async function listWorktrees(projectId?: string): Promise<Worktree[]> {
  const raw = await git(projectId, "worktree", "list", "--porcelain");
  const entries: Worktree[] = [];
  let current: Partial<Worktree> = {};

  for (const line of raw.split("\n")) {
    if (line.startsWith("worktree ")) {
      current.path = line.slice(9).trim();
      current.name = path.basename(current.path);
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice(5).trim();
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice(7).trim().replace("refs/heads/", "");
    } else if (line === "detached") {
      current.branch = "(detached)";
    } else if (line === "") {
      if (current.path) {
        entries.push({
          name: current.name!,
          path: current.path,
          branch: current.branch ?? "unknown",
          head: current.head ?? "",
          isMain: entries.length === 0,
        });
      }
      current = {};
    }
  }

  return entries;
}

export async function createWorktree(
  name: string,
  branch: string,
  baseBranch?: string,
  projectId?: string
): Promise<Worktree> {
  const nameCheck = validateWorktreeName(name);
  if (!nameCheck.ok) throw new Error(nameCheck.error);
  const branchCheck = validateBranchName(branch);
  if (!branchCheck.ok) throw new Error(branchCheck.error);
  if (baseBranch !== undefined) {
    const baseCheck = validateBranchName(baseBranch);
    if (!baseCheck.ok) throw new Error(baseCheck.error);
  }

  const repoRoot = getRepoRoot(projectId);
  const worktreesBase = path.join(repoRoot, ".worktrees");
  const worktreePath = path.join(worktreesBase, name);
  const relative = path.relative(worktreesBase, worktreePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid worktree name: resolves outside the worktrees directory");
  }

  if (baseBranch) {
    await git(projectId, "worktree", "add", "-b", branch, "--", worktreePath, baseBranch);
  } else {
    await git(projectId, "worktree", "add", "-b", branch, "--", worktreePath);
  }

  const worktrees = await listWorktrees(projectId);
  const created = worktrees.find((w) => w.path === worktreePath);
  if (!created) throw new Error("Worktree created but not found in list");
  return created;
}

export async function removeWorktree(name: string, projectId?: string): Promise<void> {
  const worktrees = await listWorktrees(projectId);
  const wt = worktrees.find((w) => w.name === name);
  if (!wt) throw new Error(`Worktree '${name}' not found`);
  if (wt.isMain) throw new Error("Cannot remove main worktree");

  await git(projectId, "worktree", "remove", wt.path, "--force");
}

export async function getWorktreeDiff(name: string, projectId?: string): Promise<string> {
  const worktrees = await listWorktrees(projectId);
  const wt = worktrees.find((w) => w.name === name);
  if (!wt) throw new Error(`Worktree '${name}' not found`);

  return runGit(["diff", "--stat"], {
    cwd: wt.path,
  });
}

export async function getWorktreeLog(name: string, projectId?: string): Promise<string> {
  const worktrees = await listWorktrees(projectId);
  const wt = worktrees.find((w) => w.name === name);
  if (!wt) throw new Error(`Worktree '${name}' not found`);

  return runGit(["log", "--oneline", "-10"], { cwd: wt.path });
}

export async function getWorktreeFilesChanged(name: string, projectId?: string): Promise<number> {
  const worktrees = await listWorktrees(projectId);
  const wt = worktrees.find((w) => w.name === name);
  if (!wt) return 0;

  try {
    const stdout = await runGit(["diff", "--name-only"], { cwd: wt.path });
    return stdout.trim().split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

/**
 * Get the full diff of a worktree's branch against a base branch.
 */
export async function getWorktreeBranchDiff(
  name: string,
  baseBranch: string,
  projectId?: string
): Promise<{ stat: string; diff: string }> {
  const worktrees = await listWorktrees(projectId);
  const wt = worktrees.find((w) => w.name === name);
  if (!wt) throw new Error(`Worktree '${name}' not found`);

  const [statResult, diffResult] = await Promise.all([
    runGit(["diff", `${baseBranch}...HEAD`, "--stat"], {
      cwd: wt.path,
      maxBuffer: 5 * 1024 * 1024,
    }),
    runGit(["diff", `${baseBranch}...HEAD`], {
      cwd: wt.path,
      maxBuffer: 10 * 1024 * 1024,
    }),
  ]);

  return { stat: statResult, diff: diffResult };
}

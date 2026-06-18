const GIT_UNAVAILABLE_MESSAGE =
  "Git is not available. Install Git or add it to the service PATH.";

const GENERIC_WORKTREE_ERROR_MESSAGE = "Worktree operation failed.";

export class WorktreeGitUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(GIT_UNAVAILABLE_MESSAGE);
    this.name = "WorktreeGitUnavailableError";
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

function isMissingGitError(error: unknown): boolean {
  const candidate = error as NodeJS.ErrnoException | undefined;
  return candidate?.code === "ENOENT" && candidate.path === "git";
}

export function normalizeGitError(error: unknown): Error {
  if (error instanceof WorktreeGitUnavailableError) return error;
  if (isMissingGitError(error)) return new WorktreeGitUnavailableError(error);
  if (error instanceof Error) return error;
  return new Error(GENERIC_WORKTREE_ERROR_MESSAGE);
}

export function getWorktreeClientError(error: unknown): {
  error: string;
  status: number;
} {
  if (error instanceof WorktreeGitUnavailableError || isMissingGitError(error)) {
    return { error: GIT_UNAVAILABLE_MESSAGE, status: 503 };
  }
  return { error: GENERIC_WORKTREE_ERROR_MESSAGE, status: 500 };
}

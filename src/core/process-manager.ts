import { spawn, execFileSync, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import * as readline from "readline";
import fs from "fs";
import { getDb } from "./db";
import {
  createSystemLogEvent,
  streamManager,
  type SystemLogLevel,
  type ToolCall,
} from "./stream-manager";
import { onSessionExit } from "./task-lifecycle";
import {
  buildClaudeProcessEnv,
  resolveSessionRuntimeAuthConfig,
  type SessionRuntimeAuthConfig,
  type SessionRuntimeAuthInput,
} from "./session-runtime-auth";

export function parseClaudeBinaryPath(output: string): string | null {
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("/")) continue;
    if (fs.existsSync(line)) return line;
  }
  return null;
}

function resolveClaudeBinaryPath(): string {
  const candidates: string[] = [];
  try {
    const shell = process.env.SHELL ?? "/bin/zsh";
    const resolved = execFileSync(shell, ["-ilc", "whence -p claude"], {
      encoding: "utf-8",
      timeout: 5000,
    });
    const parsed = parseClaudeBinaryPath(resolved);
    if (parsed) candidates.push(parsed);
  } catch {
    // keep fallback candidates
  }

  candidates.push(
    ...(process.env.HOME ? [`${process.env.HOME}/.local/bin/claude`] : []),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  );

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? "claude";
}

// Resolve claude binary path once at module load
let claudeBin = "claude";
claudeBin = resolveClaudeBinaryPath();

// Resolve full user PATH once
let userPath = process.env.PATH ?? "";
try {
  const shell = process.env.SHELL ?? "/bin/zsh";
  userPath = execFileSync(shell, ["-ilc", "echo $PATH"], {
    encoding: "utf-8",
    timeout: 5000,
  }).trim();
} catch {
  // keep default
}

// Read-only tools — auto-approved, no permission prompt needed
const ALLOWED_TOOLS = [
  "Read", "Glob", "Grep",
  "WebSearch", "WebFetch",
];
// Mutating tools (Bash, Write, Edit, NotebookEdit) are NOT pre-authorized.
// When Claude attempts to use them, a permission_request event is emitted
// and the user must approve or deny via the UI.

interface PendingPermission {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}

interface QueuedMessage {
  message: string;
  runtimeAuthInput?: SessionRuntimeAuthInput;
}

interface SessionProcess {
  proc: ChildProcess;
  sessionId: string;
  isProcessing: boolean;
  paused: boolean;
  lastActivityAt: number;
  textBuffer: string;
  toolCalls: ToolCall[];
  claudeSessionId: string | null;
  pendingPermission: PendingPermission | null;
}

export const WATCHDOG_INTERVAL_MS = 30000;
export const SESSION_UNRESPONSIVE_MS = 3 * 60 * 1000;

export function shouldRestartUnresponsiveSession({
  lastActivityAt,
  now,
  killed,
  paused = false,
}: {
  lastActivityAt: number;
  now: number;
  killed: boolean;
  paused?: boolean;
}): boolean {
  return now - lastActivityAt > SESSION_UNRESPONSIVE_MS && !killed && !paused;
}

export function needsBrowserApiKeyForWatchdogRestart(
  sessionAuthMode: string | null | undefined,
  isProcessing: boolean,
): boolean {
  return isProcessing && sessionAuthMode === "anthropic-api-key";
}

export function buildClaudeProcessArgs(
  runtimeAuthConfig: SessionRuntimeAuthConfig,
  claudeSessionId: string | null,
  allowedTools: string[],
): string[] {
  const args = [
    "-p",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",
    "--model", runtimeAuthConfig.model,
  ];

  if (runtimeAuthConfig.mode === "anthropic-api-key") {
    args.push("--bare");
  }

  if (claudeSessionId) {
    args.push("--resume", claudeSessionId);
  }

  args.push("--allowedTools", ...allowedTools);

  return args;
}

class ProcessManager {
  private sessions = new Map<string, SessionProcess>();
  private messageQueues = new Map<string, QueuedMessage[]>();

  constructor() {
    const watchdog = setInterval(
      () => this.checkHealth(),
      WATCHDOG_INTERVAL_MS
    );
    watchdog.unref?.();
  }

  private emitGlobalSystemLog(
    level: SystemLogLevel,
    sessionId: string,
    message: string,
    prefix?: string
  ): void {
    streamManager.emit(
      "global",
      createSystemLogEvent({ level, prefix, sessionId, message })
    );
  }

  private checkHealth(): void {
    const now = Date.now();
    for (const [sessionId, sp] of this.sessions.entries()) {
      if (
        !shouldRestartUnresponsiveSession({
          lastActivityAt: sp.lastActivityAt,
          now,
          killed: sp.proc.killed,
          paused: sp.paused,
        })
      ) {
        continue;
      }

      const sessionAuthMode = this.getStoredSessionAuthMode(sessionId);
      const cannotRestartWithoutBrowserKey =
        needsBrowserApiKeyForWatchdogRestart(sessionAuthMode, sp.isProcessing);

      if (cannotRestartWithoutBrowserKey) {
        const message =
          "BYOK session became unresponsive and cannot be restarted because DevLog does not store browser-provided API keys. Re-enter the key in Settings and start a new turn.";
        this.emitGlobalSystemLog("warning", sessionId, message, "[WATCHDOG]");

        try {
          sp.proc.kill("SIGKILL");
        } catch {
          // ignore
        }
        this.sessions.delete(sessionId);

        try {
          const db = getDb();
          db.prepare(
            "UPDATE sessions SET status = 'failed', pid = NULL, ended_at = datetime('now') WHERE id = ?",
          ).run(sessionId);
        } catch {
          // ignore
        }

        streamManager.emit(sessionId, { type: "error", message });
        streamManager.emit(sessionId, { type: "status", status: "failed" });
        continue;
      }

      this.emitGlobalSystemLog(
        "warning",
        sessionId,
        `Session ${sessionId.slice(0, 8)} unresponsive for 3m. Restarting...`,
        "[WATCHDOG]"
      );

      try {
        sp.proc.kill("SIGKILL");
      } catch {
        // ignore
      }
      this.sessions.delete(sessionId);

      try {
        const db = getDb();
        db.prepare(
          "UPDATE sessions SET status = 'idle', pid = NULL WHERE id = ?"
        ).run(sessionId);
      } catch {
        // ignore
      }

      if (sp.isProcessing) {
        this.requeueLastUserMessage(sessionId);
      }
    }
  }

  private getStoredSessionAuthMode(sessionId: string): string | null {
    try {
      const db = getDb();
      const row = db
        .prepare("SELECT session_auth_mode FROM sessions WHERE id = ? LIMIT 1")
        .get(sessionId) as { session_auth_mode: string | null } | undefined;
      return row?.session_auth_mode ?? null;
    } catch {
      return null;
    }
  }

  private requeueLastUserMessage(sessionId: string): void {
    try {
      const db = getDb();
      const row = db
        .prepare(
          "SELECT content FROM session_messages WHERE session_id = ? AND role = 'user' ORDER BY id DESC LIMIT 1"
        )
        .get(sessionId) as { content: string } | undefined;

      if (!row?.content) return;

      const queue = this.messageQueues.get(sessionId) ?? [];
      queue.unshift({ message: row.content });
      this.messageQueues.set(sessionId, queue);
    } catch {
      // ignore
    }
  }

  private sessionExists(sessionId: string): boolean {
    try {
      const db = getDb();
      const row = db
        .prepare("SELECT 1 AS exists_flag FROM sessions WHERE id = ? LIMIT 1")
        .get(sessionId) as { exists_flag: number } | undefined;
      return Boolean(row);
    } catch {
      return false;
    }
  }

  /**
   * Ensure a persistent process exists for the session.
   * Spawns `claude -p --input-format stream-json --output-format stream-json`
   * for bidirectional streaming communication.
   *
   * If a process already exists and is alive, returns it.
   * If no process exists, spawns a new one (with --resume if continuing).
   */
  private ensureProcess(
    sessionId: string,
    runtimeAuthInput: SessionRuntimeAuthInput = {},
  ): SessionProcess | null {
    const existing = this.sessions.get(sessionId);
    if (existing && !existing.proc.killed) {
      if (existing.paused) {
        existing.proc.kill("SIGCONT");
        existing.paused = false;
        const db = getDb();
        db.prepare("UPDATE sessions SET status = 'running' WHERE id = ?").run(sessionId);
        streamManager.emit(sessionId, { type: "status", status: "running" });
      }
      return existing;
    }

    // Clean up stale entry
    if (existing) {
      this.sessions.delete(sessionId);
    }

    const db = getDb();
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as {
      worktree_path: string;
      claude_session_id: string | null;
      session_auth_mode: string | null;
      agent_api_key_env_var: string | null;
      agent_model: string | null;
    } | undefined;

    if (!session) return null;

    // Clean env: remove CLAUDECODE so child doesn't think it's nested
    const { CLAUDECODE: _, ...cleanEnv } = process.env;
    const runtimeAuthConfig = resolveSessionRuntimeAuthConfig({
      session_auth_mode:
        runtimeAuthInput.session_auth_mode ?? session.session_auth_mode,
      agent_api_key_env_var:
        runtimeAuthInput.agent_api_key_env_var ?? session.agent_api_key_env_var,
      agent_model: runtimeAuthInput.agent_model ?? session.agent_model,
      anthropic_api_key: runtimeAuthInput.anthropic_api_key,
    });
    const args = buildClaudeProcessArgs(
      runtimeAuthConfig,
      session.claude_session_id,
      ALLOWED_TOOLS,
    );
    const processEnv = buildClaudeProcessEnv(
      { ...cleanEnv, PATH: userPath },
      runtimeAuthConfig,
    );
    if (!processEnv.ok) {
      db.prepare(
        "UPDATE sessions SET status = 'failed', ended_at = datetime('now') WHERE id = ?",
      ).run(sessionId);
      streamManager.emit(sessionId, {
        type: "error",
        message: processEnv.error,
      });
      streamManager.emit(sessionId, { type: "status", status: "failed" });
      this.emitGlobalSystemLog("warning", sessionId, processEnv.error);
      return null;
    }
    const env = processEnv.env;

    const proc = spawn(claudeBin, args, {
      cwd: session.worktree_path,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const sp: SessionProcess = {
      proc,
      sessionId,
      isProcessing: false,
      paused: false,
      lastActivityAt: Date.now(),
      textBuffer: "",
      toolCalls: [],
      claudeSessionId: session.claude_session_id,
      pendingPermission: null,
    };

    this.sessions.set(sessionId, sp);
    this.emitGlobalSystemLog(
      "info",
      sessionId,
      `Session ${sessionId.slice(0, 8)} process started`
    );

    proc.on("error", (err) => {
      this.sessions.delete(sessionId);
      const message = `Failed to start Claude process: ${err.message}`;
      try {
        db.prepare(
          "UPDATE sessions SET status = 'failed', pid = NULL, ended_at = datetime('now') WHERE id = ?",
        ).run(sessionId);
      } catch {
        // ignore
      }
      streamManager.emit(sessionId, { type: "error", message });
      streamManager.emit(sessionId, { type: "status", status: "failed" });
      this.emitGlobalSystemLog("warning", sessionId, message);
    });

    // Update session status
    db.prepare(
      "UPDATE sessions SET status = 'running', pid = ? WHERE id = ?"
    ).run(proc.pid, sessionId);
    streamManager.emit(sessionId, { type: "status", status: "running" });

    // Parse stdout as JSONL
    if (proc.stdout) {
      const rl = readline.createInterface({ input: proc.stdout });
      rl.on("line", (line) => {
        try {
          const event = JSON.parse(line);
          this.handleStreamEvent(sessionId, sp, event);
        } catch {
          // ignore unparseable lines
        }
      });
    }

    // Capture stderr for debugging
    if (proc.stderr) {
      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) {
          // Log stderr but don't surface as errors unless critical
          try {
            const db = getDb();
            db.prepare(
              "INSERT INTO session_logs (session_id, chunk, stream) VALUES (?, ?, 'stderr')"
            ).run(sessionId, text);
          } catch {
            // ignore
          }
        }
      });
    }

    // Handle process exit
    proc.on("exit", (code) => {
      this.sessions.delete(sessionId);
      this.emitGlobalSystemLog(
        code === 0 ? "success" : "warning",
        sessionId,
        `Session ${sessionId.slice(0, 8)} process exited with code ${code ?? "unknown"}`
      );

      // Save any remaining text buffer as assistant message
      const content = sp.textBuffer.trim();
      if (content) {
        try {
          db.prepare(
            "INSERT INTO session_messages (session_id, role, content) VALUES (?, 'assistant', ?)"
          ).run(sessionId, content);
        } catch {
          // ignore
        }
      }

      // If there was a turn in progress, notify about the interruption
      if (sp.isProcessing) {
        streamManager.emit(sessionId, {
          type: "turn_end",
          cost_usd: undefined,
          duration_ms: undefined,
          session_id: sp.claudeSessionId ?? undefined,
        });
      }

      // Update status to idle (can spawn new process for next message)
      const newStatus = "idle";
      let statusUpdated = false;
      try {
        const result = db.prepare(
          "UPDATE sessions SET status = ?, pid = NULL WHERE id = ? AND status NOT IN ('completed', 'failed', 'killed')"
        ).run(newStatus, sessionId);
        statusUpdated = result.changes > 0;
      } catch {
        // ignore
      }

      if (statusUpdated) {
        streamManager.emit(sessionId, { type: "status", status: "idle" });
      }

      // Auto-transition linked task based on session outcome
      onSessionExit(sessionId).catch(() => {
        // non-fatal: task transition failure shouldn't crash the process manager
      });

      // If there are queued messages, spawn new process and continue
      const queue = this.messageQueues.get(sessionId);
      if (queue && queue.length > 0) {
        setTimeout(() => this.processQueue(sessionId), 500);
      }
    });

    return sp;
  }

  /**
   * Send a message to a session.
   * If the session is currently processing a turn, the message is queued
   * and will be sent automatically when the current turn completes.
   */
  async sendMessage(
    sessionId: string,
    message: string,
    runtimeAuthInput?: SessionRuntimeAuthInput,
  ): Promise<void> {
    const sp = this.ensureProcess(sessionId, runtimeAuthInput);
    if (!sp) {
      if (!this.sessionExists(sessionId)) {
        streamManager.emit(sessionId, {
          type: "error",
          message: "Session not found",
        });
      }
      return;
    }

    // If currently processing or waiting for permission, queue the message
    if (sp.isProcessing || sp.pendingPermission) {
      if (!this.messageQueues.has(sessionId)) {
        this.messageQueues.set(sessionId, []);
      }
      const queue = this.messageQueues.get(sessionId)!;
      queue.push({ message, runtimeAuthInput });

      streamManager.emit(sessionId, {
        type: "message_queued",
        content: message,
        position: queue.length,
      });
      return;
    }

    this.writeMessage(sp, message);
  }

  /**
   * Write a message directly to the process stdin as stream-json.
   */
  private writeMessage(sp: SessionProcess, message: string): void {
    const db = getDb();

    // Record user message in DB
    db.prepare(
      "INSERT INTO session_messages (session_id, role, content) VALUES (?, 'user', ?)"
    ).run(sp.sessionId, message);

    // Emit to stream subscribers
    streamManager.emit(sp.sessionId, {
      type: "message",
      role: "user",
      content: message,
    });

    // Mark as processing
    sp.isProcessing = true;
    sp.textBuffer = "";
    sp.toolCalls = [];

    streamManager.emit(sp.sessionId, { type: "status", status: "running" });

    // Write to stdin in stream-json format
    const inputMsg = JSON.stringify({
      type: "user",
      message: { role: "user", content: message },
      session_id: sp.claudeSessionId ?? "default",
      parent_tool_use_id: null,
    });

    try {
      if (!sp.proc.stdin || sp.proc.killed) {
        throw new Error("Process stdin unavailable");
      }
      sp.proc.stdin.write(inputMsg + "\n");
    } catch (err) {
      sp.isProcessing = false;
      streamManager.emit(sp.sessionId, {
        type: "error",
        message: `Failed to send message: ${err instanceof Error ? err.message : String(err)}`,
      });
      streamManager.emit(sp.sessionId, { type: "status", status: "idle" });
    }
  }

  /**
   * Process the next queued message for a session.
   */
  private processQueue(sessionId: string): void {
    const queue = this.messageQueues.get(sessionId);
    if (!queue || queue.length === 0) return;

    const sp = this.sessions.get(sessionId);
    if (sp && sp.isProcessing) return; // Still processing, wait

    const nextMessage = queue.shift()!;

    streamManager.emit(sessionId, {
      type: "queue_drained",
      remaining: queue.length,
    });

    // If we still have a process, write directly. Otherwise, ensureProcess + write.
    if (sp && !sp.proc.killed) {
      this.writeMessage(sp, nextMessage.message);
    } else {
      // Need to spawn a new process (previous one exited)
      const newSp = this.ensureProcess(sessionId, nextMessage.runtimeAuthInput);
      if (newSp) {
        this.writeMessage(newSp, nextMessage.message);
      }
    }
  }

  /**
   * Respond to a permission request.
   * Writes the response to the process's stdin.
   */
  respondToPermission(sessionId: string, approved: boolean, reason?: string): void {
    const sp = this.sessions.get(sessionId);
    if (!sp || !sp.pendingPermission) {
      streamManager.emit(sessionId, {
        type: "error",
        message: "No pending permission request",
      });
      return;
    }

    const requestId = sp.pendingPermission.requestId;

    const response = JSON.stringify({
      type: "permission_response",
      decision: approved ? "approve" : "block",
      reason: reason ?? (approved ? "Approved by user" : "Denied by user"),
    });

    try {
      if (!sp.proc.stdin || sp.proc.killed) {
        throw new Error("Process stdin unavailable");
      }
      sp.proc.stdin.write(response + "\n");
    } catch (err) {
      streamManager.emit(sessionId, {
        type: "error",
        message: `Failed to send permission response: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    sp.pendingPermission = null;

    streamManager.emit(sessionId, {
      type: "permission_resolved",
      request_id: requestId,
      approved,
    });
  }

  /**
   * Parse a stream-json event from Claude Code and emit structured chat events.
   * Handles both legacy format and the granular streaming format.
   */
  private handleStreamEvent(
    sessionId: string,
    sp: SessionProcess,
    event: Record<string, unknown>
  ): void {
    sp.lastActivityAt = Date.now();

    const type = event.type as string;
    const subtype = event.subtype as string | undefined;

    // System events — capture session_id
    if (type === "system") {
      if (subtype === "init" && event.session_id) {
        sp.claudeSessionId = event.session_id as string;
        const db = getDb();
        try {
          db.prepare(
            "UPDATE sessions SET claude_session_id = ? WHERE id = ?"
          ).run(sp.claudeSessionId, sessionId);
        } catch {
          // ignore
        }
      }
      return;
    }

    // Rate limit events — skip
    if (type === "rate_limit_event") return;

    // Permission request events
    if (type === "permission_request") {
      const requestId = `perm_${randomUUID()}`;

      sp.pendingPermission = {
        requestId,
        toolName: (event.tool_name as string) ?? (event.name as string) ?? "unknown",
        toolInput: (event.tool_input as Record<string, unknown>) ?? (event.input as Record<string, unknown>) ?? {},
      };

      streamManager.emit(sessionId, {
        type: "permission_request",
        tool_name: sp.pendingPermission.toolName,
        tool_input: sp.pendingPermission.toolInput,
        request_id: requestId,
      });
      return;
    }

    // Wrapped stream events (stream_event wrapper)
    if (type === "stream_event") {
      const inner = event.event as Record<string, unknown> | undefined;
      if (inner) {
        this.handleStreamEvent(sessionId, sp, inner);
      }
      return;
    }

    // Assistant message — extract text and tool_use blocks
    if (type === "assistant") {
      const msg = event.message as {
        content?: Array<{
          type: string;
          text?: string;
          name?: string;
          input?: Record<string, unknown>;
        }>;
      } | undefined;

      if (!msg?.content) return;

      for (const block of msg.content) {
        if (block.type === "text" && block.text) {
          sp.textBuffer += block.text;
          streamManager.emit(sessionId, {
            type: "text_delta",
            text: block.text,
          });
        } else if (block.type === "tool_use" && block.name) {
          const toolCall: ToolCall = {
            name: block.name,
            input: block.input ?? {},
          };
          sp.toolCalls.push(toolCall);
          streamManager.emit(sessionId, {
            type: "tool_start",
            name: block.name,
            input: block.input ?? {},
          });
        }
      }
      return;
    }

    // Content block delta (granular streaming with --include-partial-messages)
    if (type === "content_block_delta") {
      const delta = event.delta as { type?: string; text?: string } | undefined;
      if (delta?.type === "text_delta" && delta.text) {
        sp.textBuffer += delta.text;
        streamManager.emit(sessionId, {
          type: "text_delta",
          text: delta.text,
        });
      }
      return;
    }

    // Tool result
    if (type === "tool_result" || type === "tool") {
      const name = (event.name as string) ?? "tool";
      const output = (event.result as string) ?? (event.content as string) ?? "";
      const isError = !!(event.is_error);
      streamManager.emit(sessionId, {
        type: "tool_result",
        name,
        output: typeof output === "string" ? output : JSON.stringify(output),
        is_error: isError,
      });
      return;
    }

    // Result (turn complete)
    if (type === "result") {
      const isError = event.is_error === true;
      const claudeSessionId = event.session_id as string | undefined;
      if (claudeSessionId) {
        sp.claudeSessionId = claudeSessionId;
        const db = getDb();
        try {
          db.prepare(
            "UPDATE sessions SET claude_session_id = ? WHERE id = ?"
          ).run(claudeSessionId, sessionId);
        } catch {
          // ignore
        }
      }

      // Save assistant message
      const content = sp.textBuffer.trim();
      if (content) {
        const db = getDb();
        try {
          db.prepare(
            "INSERT INTO session_messages (session_id, role, content) VALUES (?, 'assistant', ?)"
          ).run(sessionId, content);
        } catch {
          // ignore
        }
      }

      streamManager.emit(sessionId, {
        type: "turn_end",
        cost_usd: event.total_cost_usd as number | undefined,
        duration_ms: event.duration_ms as number | undefined,
        session_id: claudeSessionId,
      });

      // Reset turn state
      sp.isProcessing = false;
      sp.textBuffer = "";
      sp.toolCalls = [];

      // Update status to idle or failed
      const db = getDb();
      try {
        if (isError) {
          db.prepare(
            "UPDATE sessions SET status = 'failed', pid = NULL, ended_at = datetime('now') WHERE id = ? AND status = 'running'"
          ).run(sessionId);
        } else {
          db.prepare(
            "UPDATE sessions SET status = 'idle' WHERE id = ? AND status = 'running'"
          ).run(sessionId);
        }
      } catch {
        // ignore
      }

      streamManager.emit(sessionId, {
        type: "status",
        status: isError ? "failed" : "idle",
      });

      // Process next queued message after a brief delay
      if (!isError) {
        setTimeout(() => this.processQueue(sessionId), 200);
      } else {
        this.messageQueues.delete(sessionId);
        try {
          sp.proc.stdin?.end();
        } catch {
          // ignore
        }
        try {
          sp.proc.kill("SIGTERM");
        } catch {
          // ignore
        }
      }
      return;
    }
  }

  /** Check if a turn is actively processing */
  isProcessing(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.isProcessing ?? false;
  }

  /** Check if there's a pending permission request */
  hasPendingPermission(sessionId: string): boolean {
    return (this.sessions.get(sessionId)?.pendingPermission ?? null) !== null;
  }

  /** Get the number of queued messages */
  getQueueLength(sessionId: string): number {
    return this.messageQueues.get(sessionId)?.length ?? 0;
  }

  /** Kill the active process for a session */
  kill(sessionId: string): boolean {
    const sp = this.sessions.get(sessionId);
    this.emitGlobalSystemLog(
      "warning",
      sessionId,
      `Session ${sessionId.slice(0, 8)} kill requested`
    );

    if (sp) {
      // Close stdin gracefully first
      try {
        sp.proc.stdin?.end();
      } catch {
        // ignore
      }
      sp.proc.kill("SIGTERM");
      setTimeout(() => {
        if (this.sessions.has(sessionId)) {
          sp.proc.kill("SIGKILL");
        }
      }, 5000);
    }

    // Clear queue
    this.messageQueues.delete(sessionId);

    const db = getDb();
    db.prepare(
      "UPDATE sessions SET status = 'killed', ended_at = datetime('now') WHERE id = ?"
    ).run(sessionId);
    streamManager.emit(sessionId, { type: "status", status: "killed" });
    this.emitGlobalSystemLog(
      "warning",
      sessionId,
      `Session ${sessionId.slice(0, 8)} killed`
    );

    return true;
  }

  /** Pause the active process for a session without ending the session */
  pause(sessionId: string): boolean {
    const sp = this.sessions.get(sessionId);
    this.emitGlobalSystemLog(
      "info",
      sessionId,
      `Session ${sessionId.slice(0, 8)} pause requested`
    );

    if (sp && !sp.proc.killed) {
      sp.proc.kill("SIGSTOP");
      sp.paused = true;
      sp.isProcessing = false;
    }

    const db = getDb();
    db.prepare(
      "UPDATE sessions SET status = 'paused' WHERE id = ? AND status NOT IN ('completed', 'killed')"
    ).run(sessionId);
    streamManager.emit(sessionId, { type: "status", status: "paused" });
    this.emitGlobalSystemLog(
      "info",
      sessionId,
      `Session ${sessionId.slice(0, 8)} paused`
    );

    return true;
  }

  /** End a session (mark completed, no more turns) */
  endSession(sessionId: string): void {
    this.emitGlobalSystemLog(
      "info",
      sessionId,
      `Session ${sessionId.slice(0, 8)} completion requested`
    );
    this.kill(sessionId);
    const db = getDb();
    db.prepare(
      "UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?"
    ).run(sessionId);
    streamManager.emit(sessionId, { type: "status", status: "completed" });
    this.emitGlobalSystemLog(
      "success",
      sessionId,
      `Session ${sessionId.slice(0, 8)} completed`
    );
  }

  killAll(): void {
    for (const [sessionId] of this.sessions) {
      this.kill(sessionId);
    }
  }

  getRunningCount(): number {
    return this.sessions.size;
  }
}

// Singleton
const globalForProcess = globalThis as unknown as { processManager?: ProcessManager };
export const processManager =
  globalForProcess.processManager ??
  (globalForProcess.processManager = new ProcessManager());

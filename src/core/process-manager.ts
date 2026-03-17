import { spawn, execFileSync, type ChildProcess } from "child_process";
import * as readline from "readline";
import fs from "fs";
import { getDb } from "./db";
import { streamManager, type ToolCall } from "./stream-manager";

// Resolve claude binary path once at module load
let claudeBin = "claude";
try {
  const shell = process.env.SHELL ?? "/bin/zsh";
  claudeBin = execFileSync(shell, ["-ilc", "which claude"], {
    encoding: "utf-8",
    timeout: 5000,
  }).trim();
} catch {
  for (const p of ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"]) {
    if (fs.existsSync(p)) {
      claudeBin = p;
      break;
    }
  }
}

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

interface SessionProcess {
  proc: ChildProcess;
  sessionId: string;
  isProcessing: boolean;
  textBuffer: string;
  toolCalls: ToolCall[];
  claudeSessionId: string | null;
  pendingPermission: PendingPermission | null;
}

class ProcessManager {
  private sessions = new Map<string, SessionProcess>();
  private messageQueues = new Map<string, string[]>();

  /**
   * Ensure a persistent process exists for the session.
   * Spawns `claude -p --input-format stream-json --output-format stream-json`
   * for bidirectional streaming communication.
   *
   * If a process already exists and is alive, returns it.
   * If no process exists, spawns a new one (with --resume if continuing).
   */
  private ensureProcess(sessionId: string): SessionProcess | null {
    const existing = this.sessions.get(sessionId);
    if (existing && !existing.proc.killed) {
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
    } | undefined;

    if (!session) return null;

    // Build args for persistent bidirectional streaming
    const args = [
      "-p",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
    ];

    // Resume previous conversation if we have a Claude session ID
    if (session.claude_session_id) {
      args.push("--resume", session.claude_session_id);
    }

    // Pre-authorize common tools to reduce permission prompts
    args.push("--allowedTools", ...ALLOWED_TOOLS);

    // Clean env: remove CLAUDECODE so child doesn't think it's nested
    const { CLAUDECODE: _, ...cleanEnv } = process.env;
    const env = { ...cleanEnv, PATH: userPath };

    const proc = spawn(claudeBin, args, {
      cwd: session.worktree_path,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const sp: SessionProcess = {
      proc,
      sessionId,
      isProcessing: false,
      textBuffer: "",
      toolCalls: [],
      claudeSessionId: session.claude_session_id,
      pendingPermission: null,
    };

    this.sessions.set(sessionId, sp);

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
      const newStatus = code === 0 ? "idle" : "idle";
      try {
        db.prepare(
          "UPDATE sessions SET status = ?, pid = NULL WHERE id = ? AND status NOT IN ('completed', 'killed')"
        ).run(newStatus, sessionId);
      } catch {
        // ignore
      }

      streamManager.emit(sessionId, { type: "status", status: "idle" });

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
  async sendMessage(sessionId: string, message: string): Promise<void> {
    const sp = this.ensureProcess(sessionId);
    if (!sp) {
      streamManager.emit(sessionId, {
        type: "error",
        message: "Session not found",
      });
      return;
    }

    // If currently processing or waiting for permission, queue the message
    if (sp.isProcessing || sp.pendingPermission) {
      if (!this.messageQueues.has(sessionId)) {
        this.messageQueues.set(sessionId, []);
      }
      const queue = this.messageQueues.get(sessionId)!;
      queue.push(message);

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
      this.writeMessage(sp, nextMessage);
    } else {
      // Need to spawn a new process (previous one exited)
      const newSp = this.ensureProcess(sessionId);
      if (newSp) {
        this.writeMessage(newSp, nextMessage);
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
      const requestId = `perm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

      // Update status to idle
      const db = getDb();
      try {
        db.prepare(
          "UPDATE sessions SET status = 'idle' WHERE id = ? AND status = 'running'"
        ).run(sessionId);
      } catch {
        // ignore
      }

      streamManager.emit(sessionId, { type: "status", status: "idle" });

      // Process next queued message after a brief delay
      setTimeout(() => this.processQueue(sessionId), 200);
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

    return true;
  }

  /** End a session (mark completed, no more turns) */
  endSession(sessionId: string): void {
    this.kill(sessionId);
    const db = getDb();
    db.prepare(
      "UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?"
    ).run(sessionId);
    streamManager.emit(sessionId, { type: "status", status: "completed" });
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

import { spawn as nodeSpawn, type ChildProcess } from "child_process";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import {
  buildClaudeProcessEnv,
  type SessionRuntimeAuthConfig,
} from "./session-runtime-auth";
import {
  runProviderChatCompletion,
  validateAgentConnectionBaseUrl,
} from "./api-provider-runtime";
import {
  buildLocalCliProcessLaunch,
  type ResolveLocalCliBinary,
} from "./process-manager";

export { validateAgentConnectionBaseUrl };

export type AgentConnectionTestKind =
  | "success"
  | "auth_failed"
  | "forbidden"
  | "not_found_model"
  | "invalid_base_url"
  | "rate_limited"
  | "upstream_unavailable"
  | "timeout"
  | "agent_not_installed"
  | "agent_spawn_failed"
  | "unknown";

export interface AgentConnectionTestResponse {
  ok: boolean;
  kind: AgentConnectionTestKind;
  latencyMs: number;
  model?: string;
  sample?: string;
  status?: number;
  agentName?: string;
  detail?: string;
}

type FetchImpl = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type SpawnedConnectionProcess = Pick<
  ChildProcess,
  "stdin" | "stdout" | "stderr" | "kill" | "once"
>;

type SpawnImpl = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    stdio: ["pipe", "pipe", "pipe"];
  },
) => SpawnedConnectionProcess;

export interface AgentConnectionTestOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchImpl;
  spawnImpl?: SpawnImpl;
  resolveBin?: ResolveLocalCliBinary;
  timeoutMs?: number;
}

const SMOKE_PROMPT = "Reply with only: ok";
const DEFAULT_PROVIDER_TIMEOUT_MS = 12_000;
const DEFAULT_AGENT_TIMEOUT_MS = 45_000;
const TEST_ALLOWED_TOOLS = ["Read", "Glob", "Grep"];

function elapsed(start: number): number {
  return Math.max(0, Date.now() - start);
}

async function testProviderConnection(
  config: SessionRuntimeAuthConfig,
  options: AgentConnectionTestOptions,
): Promise<AgentConnectionTestResponse> {
  const result = await runProviderChatCompletion(
    config,
    [{ role: "user", content: SMOKE_PROMPT }],
    {
      fetchImpl: options.fetchImpl,
      maxTokens: 8,
      timeoutMs: options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      kind: result.kind,
      latencyMs: result.latencyMs,
      model: config.model,
      status: result.status,
      detail: result.error,
    };
  }

  return {
    ok: true,
    kind: "success",
    latencyMs: result.latencyMs,
    model: config.model,
    sample: result.content.slice(0, 120),
    status: result.status,
  };
}

function appendParsedText(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  try {
    const event = JSON.parse(trimmed) as Record<string, unknown>;
    return extractTextFromJsonEvent(event);
  } catch {
    return trimmed;
  }
}

function extractTextFromJsonEvent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    return value.map(extractTextFromJsonEvent).join("");
  }
  const record = value as Record<string, unknown>;
  const direct = record.text ?? record.deltaContent ?? record.content;
  if (typeof direct === "string") return direct;
  if (record.type === "assistant.message_delta") {
    return extractTextFromJsonEvent(record.data);
  }
  return extractTextFromJsonEvent(record.message) || extractTextFromJsonEvent(record.delta);
}

function isLikelyModelError(text: string): boolean {
  return /model.*(not found|invalid|does not exist|unsupported)|unknown model/i.test(text);
}

function classifyLaunchFailure(error: string): AgentConnectionTestKind {
  if (/not installed|not on PATH/i.test(error)) return "agent_not_installed";
  if (/API key/i.test(error)) return "auth_failed";
  return "agent_spawn_failed";
}

async function testLocalCliConnection(
  config: SessionRuntimeAuthConfig,
  options: AgentConnectionTestOptions,
): Promise<AgentConnectionTestResponse> {
  const start = Date.now();
  const createdTempDir = options.cwd ? null : await mkdtemp(path.join(os.tmpdir(), "devlog-agent-test-"));
  const cwd = options.cwd ?? createdTempDir ?? process.cwd();
  const launch = buildLocalCliProcessLaunch(
    config,
    null,
    TEST_ALLOWED_TOOLS,
    cwd,
    options.resolveBin,
  );
  try {
    if (!launch.ok) {
      return {
        ok: false,
        kind: classifyLaunchFailure(launch.error),
        latencyMs: elapsed(start),
        model: config.model,
        detail: launch.error,
      };
    }
    const processEnv = buildClaudeProcessEnv(options.env ?? process.env, config);
    if (!processEnv.ok) {
      return {
        ok: false,
        kind: "auth_failed",
        latencyMs: elapsed(start),
        model: config.model,
        agentName: launch.agentName,
        detail: processEnv.error,
      };
    }

    const spawnImpl = options.spawnImpl ?? nodeSpawn;
    const proc = spawnImpl(launch.command, launch.args, {
      cwd,
      env: processEnv.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      if (launch.outputProtocol === "plain") {
        stdout += text;
        return;
      }
      for (const line of text.split(/\r?\n/)) {
        stdout += appendParsedText(line);
      }
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timeoutMs = options.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
    const resultPromise = new Promise<AgentConnectionTestResponse>((resolve) => {
      const timer = setTimeout(() => {
        proc.kill?.("SIGTERM");
        resolve({
          ok: false,
          kind: "timeout",
          latencyMs: elapsed(start),
          model: config.model,
          agentName: launch.agentName,
          detail: `Connection test timed out after ${timeoutMs}ms.`,
        });
      }, timeoutMs);

      proc.once("error", (error: Error & { code?: string }) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          kind: error.code === "ENOENT" ? "agent_not_installed" : "agent_spawn_failed",
          latencyMs: elapsed(start),
          model: config.model,
          agentName: launch.agentName,
          detail: error.message,
        });
      });

      proc.once("close", (code: number | null, signal: NodeJS.Signals | null) => {
        clearTimeout(timer);
        const sample = stdout.trim().slice(0, 120);
        const detail = stderr.trim().slice(-400) || (code ? `exit ${code}` : signal ? `signal ${signal}` : undefined);
        if (code === 0 && sample && !isLikelyModelError(sample)) {
          resolve({
            ok: true,
            kind: "success",
            latencyMs: elapsed(start),
            model: config.model,
            agentName: launch.agentName,
            sample,
          });
          return;
        }
        resolve({
          ok: false,
          kind: isLikelyModelError(sample || detail || "")
            ? "not_found_model"
            : "agent_spawn_failed",
          latencyMs: elapsed(start),
          model: config.model,
          agentName: launch.agentName,
          detail: detail ?? "Agent exited without producing assistant text.",
        });
      });
    });

    if (launch.inputProtocol === "plain-stdin") {
      proc.stdin?.end(SMOKE_PROMPT, "utf8");
    } else {
      proc.stdin?.end(
        `${JSON.stringify({
          type: "user",
          message: { role: "user", content: SMOKE_PROMPT },
          session_id: "connection-test",
          parent_tool_use_id: null,
        })}\n`,
        "utf8",
      );
    }

    return await resultPromise;
  } finally {
    if (createdTempDir) {
      await rm(createdTempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function testSessionRuntimeConnection(
  config: SessionRuntimeAuthConfig,
  options: AgentConnectionTestOptions = {},
): Promise<AgentConnectionTestResponse> {
  if (config.mode === "anthropic-api-key") {
    return testProviderConnection(config, options);
  }
  return testLocalCliConnection(config, options);
}

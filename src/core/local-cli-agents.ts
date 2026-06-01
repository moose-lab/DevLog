import { execFile } from "child_process";
import { existsSync } from "fs";
import path, { delimiter } from "path";
import {
  DEFAULT_LOCAL_CLI_MODEL,
  LOCAL_CLI_AGENT_DEFINITIONS,
  getLocalCliAgentStatus,
  type LocalCliAgentDefinition,
  type LocalCliAgentStatus,
} from "./local-cli-agent-definitions";

export {
  DEFAULT_LOCAL_CLI_AGENT_ID,
  DEFAULT_LOCAL_CLI_MODEL,
  DEFAULT_LOCAL_CLI_REASONING,
  LOCAL_CLI_AGENT_DEFINITIONS,
  LOCAL_CLI_AGENT_IDS,
  LOCAL_CLI_INTELLIGENCE_OPTIONS,
  SUPPORTED_LOCAL_CLI_AGENT_NAMES,
  getLocalCliAgentStatus,
  getLocalCliAgentStatusLabel,
  isLocalCliAgentRunnable,
  type LocalCliAgentDefinition,
  type LocalCliAgentStatus,
  type LocalCliModelOption,
} from "./local-cli-agent-definitions";

export interface LocalCliAgentInfo
  extends Omit<LocalCliAgentDefinition, "modelList"> {
  available: boolean;
  path?: string;
  version?: string | null;
  status: LocalCliAgentStatus;
}

export interface ResolveExecutableOptions {
  pathEnv?: string;
  pathDelimiter?: string;
  platform?: NodeJS.Platform;
  pathExt?: string;
  pathExists?: (filePath: string) => boolean;
}

export type ExecFileProbe = (
  file: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer?: number },
) => Promise<{ stdout: string; stderr: string }>;

export interface DetectLocalCliAgentsOptions extends ResolveExecutableOptions {
  definitions?: readonly LocalCliAgentDefinition[];
  execFileProbe?: ExecFileProbe;
  localCliAgentEnv?: Record<string, Record<string, string> | undefined>;
}

export function resolveExecutableOnPath(
  bin: string,
  options: ResolveExecutableOptions = {},
): string | null {
  const pathEnv = options.pathEnv ?? process.env.PATH ?? "";
  const platform = options.platform ?? process.platform;
  const pathExt = options.pathExt ?? process.env.PATHEXT ?? ".EXE;.CMD;.BAT";
  const pathExists = options.pathExists ?? existsSync;
  const exts = platform === "win32" ? pathExt.split(";") : [""];

  for (const dir of pathEnv.split(options.pathDelimiter ?? delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, `${bin}${ext}`);
      if (pathExists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

export async function detectLocalCliAgents(
  options: DetectLocalCliAgentsOptions = {},
): Promise<LocalCliAgentInfo[]> {
  const definitions = options.definitions ?? LOCAL_CLI_AGENT_DEFINITIONS;
  const execFileProbe = options.execFileProbe ?? defaultExecFileProbe;

  return Promise.all(
    definitions.map(async (definition) => {
      const configuredPath =
        definition.binEnvKey &&
        options.localCliAgentEnv?.[definition.id]?.[definition.binEnvKey]?.trim();
      const resolved =
        configuredPath && (options.pathExists ?? existsSync)(configuredPath)
          ? configuredPath
          : resolveExecutableOnPath(definition.bin, options);
      if (!resolved) {
        return {
          ...stripProbeMetadata(definition),
          available: false,
          version: null,
          status: "not-installed",
        };
      }

      return {
        ...stripProbeMetadata(definition),
        available: true,
        path: resolved,
        version: await readCliVersion(resolved, definition.versionArgs, execFileProbe),
        models: await readCliModels(definition, resolved, execFileProbe),
        status: getLocalCliAgentStatus({
          available: true,
          runnerSupported: definition.runnerSupported,
        }),
      };
    }),
  );
}

async function readCliVersion(
  file: string,
  args: readonly string[],
  execFileProbe: ExecFileProbe,
): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileProbe(file, args, {
      timeout: 3000,
      maxBuffer: 1024 * 1024,
    });
    return firstOutputLine(stdout) ?? firstOutputLine(stderr);
  } catch {
    return null;
  }
}

function firstOutputLine(output: string): string | null {
  const line = output
    .split("\n")
    .map((candidate) => candidate.trim())
    .find(Boolean);
  return line ?? null;
}

async function readCliModels(
  definition: LocalCliAgentDefinition,
  file: string,
  execFileProbe: ExecFileProbe,
): Promise<LocalCliAgentDefinition["models"]> {
  if (!definition.modelList) {
    return definition.models;
  }

  try {
    const { stdout } = await execFileProbe(file, definition.modelList.args, {
      timeout: definition.modelList.timeoutMs ?? 5000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return (
      parseModelList(stdout, definition.modelList.parser) ?? definition.models
    );
  } catch {
    return definition.models;
  }
}

function parseModelList(
  output: string,
  parser: NonNullable<LocalCliAgentDefinition["modelList"]>["parser"],
): LocalCliAgentDefinition["models"] | null {
  const trimmed = output.trim();
  if (!trimmed) {
    return null;
  }
  if (parser === "cursor-line-separated" && /no models available/i.test(trimmed)) {
    return null;
  }

  const seen = new Set([DEFAULT_LOCAL_CLI_MODEL.id]);
  const models = [DEFAULT_LOCAL_CLI_MODEL];
  for (const line of trimmed.split("\n")) {
    const id = line.trim();
    if (!id || id.startsWith("#") || seen.has(id)) {
      continue;
    }
    seen.add(id);
    models.push({ id, label: id });
  }

  return models.length > 1 ? models : null;
}

function stripProbeMetadata(
  definition: LocalCliAgentDefinition,
): Omit<LocalCliAgentDefinition, "modelList"> {
  const { modelList: _modelList, ...agent } = definition;
  return agent;
}

function defaultExecFileProbe(
  file: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? ""),
      });
    });
  });
}

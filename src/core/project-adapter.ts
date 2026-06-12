import fs from "fs";
import path from "path";
import type { DevlogConfig, ProjectConfig } from "./types-project";

const CONFIG_PATH = path.join(process.cwd(), "devlog.config.json");

let _config: DevlogConfig | null = null;

function defaultConfig(): DevlogConfig {
  // Fresh clones have no devlog.config.json (it is machine-specific and
  // untracked) — default to treating the current checkout as the project.
  return {
    projects: [
      {
        id: "devlog",
        name: path.basename(process.cwd()),
        path: process.cwd(),
        defaultBranch: "main",
      },
    ],
    activeProject: "devlog",
    port: 3333,
  };
}

function loadConfig(): DevlogConfig {
  if (_config) return _config;
  try {
    _config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as DevlogConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    _config = defaultConfig();
  }
  return _config;
}

export function listProjects(): ProjectConfig[] {
  return loadConfig().projects;
}

export function getProject(id: string): ProjectConfig {
  const project = loadConfig().projects.find((p) => p.id === id);
  if (!project) throw new Error(`Project '${id}' not found in devlog.config.json`);
  return project;
}

export function getActiveProject(): ProjectConfig {
  const config = loadConfig();
  return getProject(config.activeProject);
}

export function getRepoRoot(projectId?: string): string {
  const project = projectId ? getProject(projectId) : getActiveProject();
  return project.path;
}

export function setActiveProject(id: string): void {
  const config = loadConfig();
  getProject(id);
  config.activeProject = id;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
  _config = config;
}

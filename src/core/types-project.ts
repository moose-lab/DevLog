export interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  defaultBranch: string;
}

export interface DevlogConfig {
  projects: ProjectConfig[];
  activeProject: string;
  port: number;
}

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

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  defaultBranch: string;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface ProjectCandidate {
  suggestedId: string;
  name: string;
  path: string;
  hasGit: boolean;
  hasPackageJson: boolean;
}

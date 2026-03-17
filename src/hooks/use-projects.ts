"use client";

import { useEffect, useState, useCallback } from "react";

interface ProjectConfig {
  id: string;
  name: string;
  path: string;
  defaultBranch: string;
}

interface ProjectsState {
  projects: ProjectConfig[];
  activeId: string;
}

export function useProjects() {
  const [state, setState] = useState<ProjectsState | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setState)
      .catch(() => {});
  }, []);

  const switchProject = useCallback(async (projectId: string) => {
    await fetch("/api/projects/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    setState((prev) =>
      prev ? { ...prev, activeId: projectId } : null
    );
    window.location.reload();
  }, []);

  return {
    projects: state?.projects ?? [],
    activeId: state?.activeId ?? "",
    switchProject,
    loading: state === null,
  };
}

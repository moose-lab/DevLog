"use client";

import { useMemo } from "react";
import type { DevLogStats } from "@/core/types-dashboard";
import { normalizeDevLogStats } from "@/core/devlog-dashboard";
import { usePolledJson } from "./use-polled-json";

export function useDevlog() {
  const { data, loading, error, refresh } = usePolledJson<unknown>(
    "/api/devlog?command=stats",
    30_000,
  );

  const stats: DevLogStats | null = useMemo(
    () => (data == null ? null : normalizeDevLogStats(data)),
    [data],
  );

  return { stats, loading, error, refresh };
}

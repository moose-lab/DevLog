"use client";

import { usePolledJson } from "./use-polled-json";

interface VccData {
  full: string;
  brief: string;
  search: string;
  error?: string;
}

export function useVcc(
  sessionId: string | null,
  isActive: boolean,
  grep?: string
) {
  const params = new URLSearchParams();
  if (grep) params.set("grep", grep);
  const url = sessionId ? `/api/sessions/${sessionId}/vcc?${params}` : null;

  const { data, loading, error, refresh } = usePolledJson<VccData>(
    url,
    isActive ? 15_000 : 60_000,
  );

  return { data, loading: url ? loading : false, error, refresh };
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AGENT_SETTINGS_STORAGE_KEY,
  DEFAULT_AGENT_SETTINGS,
  buildSessionRuntimePayload,
  buildStoredAgentSettings,
  normalizeAgentSettings,
  type AgentSettings,
} from "@/core/agent-settings";

let browserOnlyAnthropicApiKey = "";

function readStoredSettings(): AgentSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_AGENT_SETTINGS };
  }

  try {
    const raw = window.localStorage.getItem(AGENT_SETTINGS_STORAGE_KEY);
    const persisted = normalizeAgentSettings(raw ? JSON.parse(raw) : null);
    writeStoredSettings(persisted);
    return {
      ...persisted,
      anthropicApiKey: browserOnlyAnthropicApiKey,
    };
  } catch {
    return {
      ...DEFAULT_AGENT_SETTINGS,
      anthropicApiKey: browserOnlyAnthropicApiKey,
    };
  }
}

function writeStoredSettings(settings: AgentSettings): void {
  if (typeof window === "undefined") return;
  const persisted = buildStoredAgentSettings(settings);
  window.localStorage.setItem(
    AGENT_SETTINGS_STORAGE_KEY,
    JSON.stringify(persisted),
  );
}

export function useAgentSettings() {
  const [settings, setSettingsState] = useState<AgentSettings>(
    DEFAULT_AGENT_SETTINGS,
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSettingsState(readStoredSettings());
    setLoaded(true);
  }, []);

  const setSettings = useCallback((patch: Partial<AgentSettings>) => {
    setSettingsState((current) => {
      if (typeof patch.anthropicApiKey === "string") {
        browserOnlyAnthropicApiKey = patch.anthropicApiKey;
      }
      const next = normalizeAgentSettings({
        ...current,
        ...patch,
        anthropicApiKey: browserOnlyAnthropicApiKey,
      });
      writeStoredSettings(next);
      return next;
    });
  }, []);

  const runtimePayload = useMemo(
    () => buildSessionRuntimePayload(settings),
    [settings],
  );

  return {
    settings,
    setSettings,
    runtimePayload,
    loaded,
    byokReady:
      settings.executionMode !== "anthropic-api" ||
      settings.anthropicApiKey.trim().length > 0,
  };
}

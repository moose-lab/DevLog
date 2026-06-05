"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AGENT_SETTINGS_STORAGE_KEY,
  DEFAULT_AGENT_SETTINGS,
  buildSessionContinuationRuntimePayload,
  buildSessionRuntimePayload,
  buildStoredAgentSettings,
  getScopedBrowserApiKey,
  normalizeAgentSettings,
  setScopedBrowserApiKey,
  type AgentSettings,
  type BrowserApiKeyScopes,
  type SessionContinuationRuntimeSnapshot,
} from "@/core/agent-settings";

let browserOnlyApiKeysByScope: BrowserApiKeyScopes = {};

function isLoopbackApiBaseUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname.startsWith("127.")
    );
  } catch {
    return false;
  }
}

function isApiKeyRequired(
  settings: Pick<AgentSettings, "apiProtocol" | "apiBaseUrl">,
): boolean {
  return !(
    settings.apiProtocol === "ollama" &&
    isLoopbackApiBaseUrl(settings.apiBaseUrl)
  );
}

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
      anthropicApiKey: getScopedBrowserApiKey(
        persisted,
        browserOnlyApiKeysByScope,
      ),
    };
  } catch {
    const fallback = { ...DEFAULT_AGENT_SETTINGS };
    return {
      ...fallback,
      anthropicApiKey: getScopedBrowserApiKey(
        fallback,
        browserOnlyApiKeysByScope,
      ),
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
      const scopedSettings = normalizeAgentSettings({
        ...current,
        ...patch,
        anthropicApiKey: "",
      });
      if (typeof patch.anthropicApiKey === "string") {
        browserOnlyApiKeysByScope = setScopedBrowserApiKey(
          scopedSettings,
          browserOnlyApiKeysByScope,
          patch.anthropicApiKey,
        );
      }
      const next = normalizeAgentSettings({
        ...scopedSettings,
        anthropicApiKey: getScopedBrowserApiKey(
          scopedSettings,
          browserOnlyApiKeysByScope,
        ),
      });
      writeStoredSettings(next);
      return next;
    });
  }, []);

  const runtimePayload = useMemo(
    () => buildSessionRuntimePayload(settings),
    [settings],
  );
  const getRuntimePayloadForSession = useCallback(
    (session: SessionContinuationRuntimeSnapshot) =>
      buildSessionContinuationRuntimePayload(
        session,
        settings,
        browserOnlyApiKeysByScope,
      ),
    [settings],
  );
  const isRuntimeReadyForSession = useCallback(
    (session: SessionContinuationRuntimeSnapshot) => {
      const payload = buildSessionContinuationRuntimePayload(
        session,
        settings,
        browserOnlyApiKeysByScope,
      );
      if (payload.session_auth_mode !== "anthropic-api-key") {
        return true;
      }
      return (
        !isApiKeyRequired({
          apiProtocol: (payload.agent_api_protocol ??
            settings.apiProtocol) as AgentSettings["apiProtocol"],
          apiBaseUrl: payload.agent_base_url ?? settings.apiBaseUrl,
        }) || Boolean(payload.anthropic_api_key?.trim())
      );
    },
    [settings],
  );
  const byokReady =
    settings.executionMode !== "anthropic-api" ||
    ((!isApiKeyRequired(settings) ||
      settings.anthropicApiKey.trim().length > 0) &&
      settings.apiModel.trim().length > 0 &&
      settings.apiBaseUrl.trim().length > 0);
  const settingsReady = loaded && byokReady;

  return {
    settings,
    setSettings,
    runtimePayload,
    getRuntimePayloadForSession,
    isRuntimeReadyForSession,
    loaded,
    byokReady,
    settingsReady,
  };
}

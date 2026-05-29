import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AGENT_SETTINGS,
  buildSessionRuntimePayload,
  buildStoredAgentSettings,
  normalizeAgentSettings,
} from "../agent-settings";

test("agent settings normalize to local CLI defaults", () => {
  const settings = normalizeAgentSettings(null);

  assert.deepEqual(settings, DEFAULT_AGENT_SETTINGS);
});

test("agent settings ignore invalid saved values", () => {
  const settings = normalizeAgentSettings({
    executionMode: "remote",
    model: "not-a-model",
    anthropicApiKey: 42,
  });

  assert.deepEqual(settings, DEFAULT_AGENT_SETTINGS);
});

test("session runtime payload omits secrets for local CLI mode", () => {
  const payload = buildSessionRuntimePayload({
    executionMode: "local-cli",
    model: "claude-opus-4-7",
    anthropicApiKey: "sk-ant-secret",
  });

  assert.deepEqual(payload, {
    session_auth_mode: "local-cli",
    agent_model: "claude-opus-4-7",
  });
});

test("session runtime payload includes transient key for Anthropic BYOK mode", () => {
  const payload = buildSessionRuntimePayload({
    executionMode: "anthropic-api",
    model: "claude-sonnet-4-6",
    anthropicApiKey: " sk-ant-secret ",
  });

  assert.deepEqual(payload, {
    session_auth_mode: "anthropic-api-key",
    agent_model: "claude-sonnet-4-6",
    anthropic_api_key: "sk-ant-secret",
  });
});

test("stored agent settings omit browser-provided API keys", () => {
  const stored = buildStoredAgentSettings({
    executionMode: "anthropic-api",
    model: "claude-opus-4-7",
    anthropicApiKey: "sk-ant-secret",
  });

  assert.deepEqual(stored, {
    executionMode: "anthropic-api",
    model: "claude-opus-4-7",
  });
  assert.equal("anthropicApiKey" in stored, false);
});

test("agent settings cap browser-provided API keys", () => {
  const settings = normalizeAgentSettings({
    executionMode: "anthropic-api",
    model: "claude-sonnet-4-6",
    anthropicApiKey: "x".repeat(400),
  });

  assert.equal(settings.anthropicApiKey.length, 300);
});

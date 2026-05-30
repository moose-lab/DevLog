# DevLog Coding Agent Settings Port Plan

Date: 2026-05-29
Source baseline: `nexu-io/open-design@51963cff78cfe922014f4e8aa5cc0a11ee581abe`
DevLog target: Settings-backed coding agent execution configuration for Tasks, Sessions, and future chatbox workflows.

## Purpose

DevLog needs a durable Settings surface for configuring how project-management tasks connect to coding agents. The first version should mirror the core open-design Execution & model behavior:

- Pick between a local code-agent CLI and Anthropic API BYOK.
- Let the user select the execution model.
- Keep the BYOK API key only in the current browser.
- Feed the selected execution settings into task launch, session launch, and session chat follow-up.
- Avoid persisting raw browser-provided API keys in the DevLog database.

This plan exists as a handoff artifact for a fresh coding-agent session. A new session should be able to read this file, inspect the current DevLog repo state, and either implement the feature from scratch or review an existing working-tree implementation against the acceptance criteria below.

## Source Analysis

Primary source files:

- open-design web config: https://github.com/nexu-io/open-design/blob/51963cff78cfe922014f4e8aa5cc0a11ee581abe/apps/web/src/state/config.ts
- open-design Settings dialog: https://github.com/nexu-io/open-design/blob/51963cff78cfe922014f4e8aa5cc0a11ee581abe/apps/web/src/components/SettingsDialog.tsx
- open-design web connection-test wrapper: https://github.com/nexu-io/open-design/blob/51963cff78cfe922014f4e8aa5cc0a11ee581abe/apps/web/src/providers/connection-test.ts
- open-design daemon connection test: https://github.com/nexu-io/open-design/blob/51963cff78cfe922014f4e8aa5cc0a11ee581abe/apps/daemon/src/connectionTest.ts
- open-design connection-test contract: https://github.com/nexu-io/open-design/blob/51963cff78cfe922014f4e8aa5cc0a11ee581abe/packages/contracts/src/api/connectionTest.ts
- open-design execution tests: https://github.com/nexu-io/open-design/blob/51963cff78cfe922014f4e8aa5cc0a11ee581abe/apps/web/tests/components/SettingsDialog.execution.test.tsx

Key source behavior to extract:

- Execution mode is a small enum: open-design uses `daemon` for local CLI and `api` for BYOK.
- The default config starts in local CLI mode and uses Anthropic defaults for API mode: `https://api.anthropic.com`, `claude-sonnet-4-6`, plus model choices `claude-sonnet-4-6`, `claude-opus-4-7`, `claude-haiku-4-5-20251001`.
- The Settings UI treats local CLI and BYOK as the same "Execution & model" decision, not separate task-launch controls.
- BYOK requires a key, base URL, and model before a provider connection test or save is considered complete. For DevLog v1, base URL can be fixed to Anthropic, leaving key + model as the main user inputs.
- The BYOK API key is a browser-side config value. open-design stores it in its web config, while daemon-owned fields and some CLI env secrets are sanitized or delegated to daemon storage. DevLog should go stricter for this first version: store only non-secret mode/model settings in browser localStorage, keep the key in browser runtime memory, and pass it transiently per launch/follow-up.
- Connection testing is split into two paths:
  - Provider test posts a small request through `/api/test/connection`.
  - Local CLI test resolves/spawns the selected agent binary and reports structured failure kinds such as missing binary, auth required, timeout, spawn failure, and model not found.
- Open Design's Execution & model surface also carries a bounded `maxTokens`
  override. Its current source uses `8192` as the fallback, accepts
  user-provided overrides from `1024` through `200000`, and passes the value to
  provider `max_tokens` / equivalent fields.
- The source tests cover the behavior that matters most for DevLog: toggling modes, masking API keys, preserving model/base URL values, blocking incomplete BYOK tests, local CLI selection, and autosave behavior.

Do not port the whole open-design provider matrix in v1. DevLog only needs:

- Local code-agent CLI.
- Anthropic API BYOK.
- Model picker.
- Browser-only secret storage.
- Runtime payload propagation into task/session/chat execution.

## DevLog Product Mapping

DevLog concept mapping:

- Tasks are work goals.
- Sessions are AI execution work units for a task.
- Settings defines the execution transport and model used when a task/session starts or when a human continues a session through chat.
- Agent/team presets stay separate from execution transport. The agent preset answers "what role/team should work"; Settings answers "how should the coding agent be reached and which model should it use."

Required user-facing Settings copy:

- Section title: `Execution & model`
- Local mode label: `Local code-agent CLI`
- BYOK mode label: `Anthropic API (BYOK)`
- Secret boundary: `Your API key is stored only in this browser.`

## Target Architecture

Add a small browser settings contract:

- `executionMode`: `local-cli` or `anthropic-api`
- `model`: Anthropic model id
- `anthropicApiKey`: browser-only runtime string

Translate that browser settings object into a runtime payload:

```ts
// Local CLI
{
  session_auth_mode: "local-cli",
  agent_model: "claude-sonnet-4-6"
}

// Anthropic BYOK
{
  session_auth_mode: "anthropic-api-key",
  agent_model: "claude-sonnet-4-6",
  anthropic_api_key: "sk-ant-..."
}
```

Persistence boundary:

- Browser localStorage must not store the raw BYOK key.
- Browser localStorage may store non-secret mode/model preferences.
- The BYOK key stays in browser runtime memory and must be pasted again after a full page reload.
- Session rows may store `session_auth_mode` and `agent_model`.
- Session rows must not store `anthropic_api_key`.
- API route payload parsing should accept `anthropic_api_key` only as transient request input.
- Child process env may receive `ANTHROPIC_API_KEY` only at spawn time.

Runtime mapping:

- Local CLI mode should use the local Claude/code-agent auth already available to the machine.
- Anthropic BYOK mode should run the coding agent in API-key-only mode. For Claude CLI, prefer `--bare` so OAuth/keychain credentials are not silently mixed with the browser key.
- Both modes should pass `--model <selected-model>` where the CLI supports it.

## Implementation Plan

### Task 1: Source-Aware Settings Contract

Files:

- Create `src/core/agent-settings.ts`
- Create `src/hooks/use-agent-settings.ts`
- Test `src/core/__tests__/agent-settings.test.ts`

Build:

- `AGENT_MODEL_OPTIONS` from the Anthropic defaults above.
- `DEFAULT_AGENT_SETTINGS`.
- `normalizeAgentSettings(value)`.
- `buildSessionRuntimePayload(settings)`.
- A React hook that reads/writes non-secret `devlog:agent-settings:v1` preferences only in the browser and keeps the raw key in runtime memory.

Acceptance:

- Invalid saved data falls back safely.
- Local payload omits secrets.
- BYOK payload includes the transient key only when sending runtime input.

### Task 2: Settings UI

Files:

- Create `src/app/settings/page.tsx`
- Modify sidebar/header navigation files.

Build:

- A `/settings` page with one production Settings section, not a marketing page.
- Mode segmented control or two compact option buttons.
- Model select.
- Password API key field with show/hide control.
- Missing BYOK key warning.
- Saved-local status.

Acceptance:

- The exact browser-only key copy is visible.
- Switching modes does not erase the selected model.
- API key is masked by default.
- BYOK without a key is visibly incomplete.

### Task 3: Runtime Auth Contract

Files:

- Modify `src/core/session-runtime-auth.ts`
- Modify `src/core/types-dashboard.ts`
- Modify `src/core/db-schema.ts`
- Modify `src/core/db.ts`
- Test `src/core/__tests__/session-runtime-auth.test.ts`
- Test `src/core/__tests__/db-schema.test.ts`

Build:

- New modes: `local-cli`, `anthropic-api-key`.
- Backward compatibility for existing `backend-oauth` and `agent-api-key` rows if they already exist locally.
- `agent_model` column with a safe default.
- Runtime parsing that accepts transient `anthropic_api_key` but never requires it to be persisted.

Acceptance:

- Missing BYOK key returns a clear actionable error.
- BYOK maps the transient key to child `ANTHROPIC_API_KEY`.
- Legacy env-var mode still works for older sessions.
- DB migrations are idempotent for local SQLite databases.

### Task 4: Process Manager Wiring

Files:

- Modify `src/core/process-manager.ts`
- Test `src/core/__tests__/process-manager-health.test.ts`

Build:

- Add a pure helper for Claude/code-agent process args.
- Always include selected model in the invocation when supported.
- Add `--bare` for BYOK.
- Preserve existing resume and allowed-tools behavior.
- Let queued follow-up messages carry optional runtime auth input.

Acceptance:

- Local CLI args include `--model` and do not include `--bare`.
- BYOK args include `--model` and `--bare`.
- Resume args remain intact.
- Follow-up sends can reuse the latest browser settings.

### Task 5: API Route Propagation

Files:

- Modify `src/app/api/tasks/[id]/execute/route.ts`
- Modify `src/app/api/sessions/route.ts`
- Modify `src/app/api/sessions/[id]/route.ts`
- Modify `src/hooks/use-tasks.ts`
- Modify `src/hooks/use-sessions.ts`
- Modify `src/hooks/use-session-chat.ts`

Build:

- Parse runtime payload in task execution and session creation.
- Store mode/model only.
- Pass transient key into the initial process start.
- Pass runtime payload into chatbox follow-up sends.

Acceptance:

- Creating a task session with BYOK does not write the raw key into SQLite.
- Creating a manual session works in both modes.
- Sending a follow-up from the session chatbox carries current runtime settings.

### Task 6: Launch UI Integration

Files:

- Modify `src/components/sessions/agent-selector.tsx`
- Modify `src/components/sessions/launch-dialog.tsx`
- Modify `src/components/kanban/task-detail-dialog.tsx`
- Modify `src/components/kanban/board.tsx`
- Modify `src/components/sessions/session-card.tsx`
- Modify `src/app/sessions/[id]/page.tsx`

Build:

- Remove per-launch runtime auth controls from agent/team selection.
- Show read-only Settings-derived badges near launch controls.
- Disable BYOK launch when the browser key is missing.
- Link or redirect users to `/settings` when direct card execution cannot run because BYOK is incomplete.
- Show persisted execution mode/model on session cards and detail headers.

Acceptance:

- Task launch and session launch both reflect Settings.
- Direct board launch does not create an immediately failed BYOK session when key is missing.
- Existing agent/team presets still render and are still stored.

### Task 7: Verification

Run:

```bash
bun run test
bun run typecheck
bun run build
git diff --check
```

Focused tests to include or update:

- `src/core/__tests__/agent-settings.test.ts`
- `src/core/__tests__/session-runtime-auth.test.ts`
- `src/core/__tests__/process-manager-health.test.ts`
- `src/core/__tests__/db-schema.test.ts`
- Any task/session fixture tests that instantiate `Session`.

Manual browser checks:

- Open `/settings`.
- Confirm `Execution & model` renders.
- Toggle Local CLI and Anthropic BYOK.
- Confirm the API key field is masked by default and can be revealed.
- Confirm missing BYOK key blocks launch.
- Enter a fake key, confirm local UI readiness, then remove it before finishing.
- Open `/sessions` and verify cards show execution mode + model badges.
- Open a task launch UI and verify it uses Settings-derived runtime state.

## Future Extensions

After v1 is stable, extend from open-design in this order:

1. Readiness endpoint for local CLI and BYOK, modeled after open-design connection-test result kinds.
2. Real local CLI test button in DevLog Settings.
3. Provider connection smoke test for Anthropic BYOK.
4. Optional base URL override for Anthropic-compatible providers.
5. Full provider registry only if DevLog needs OpenAI-compatible, Gemini, Ollama, or custom gateway support.
6. Secret-handles or backend vault support if project-shared credentials become necessary.

## 2026-05-30 Mainline Gap: Local CLI vs API Must Be Two Independent Modes

The earlier plan is too narrow for the Code Agent mainline. It treats
`Execution & model` as mostly "Claude local vs Anthropic BYOK", but Open Design's
actual product model is more structural:

- Execution mode is a first-class switch between `Local CLI` and `API`.
- `Local CLI` is not a single Claude switch. It is a registry of supported code
  agents discovered by scanning `PATH`.
- The local agent picker must clearly distinguish:
  - in the current DevLog registry and runnable,
  - in the current DevLog registry but not detected on `PATH`,
  - in the current DevLog registry and detected, but runner-pending in DevLog.
- Each local agent owns its own model/reasoning choice. Switching from Codex to
  Gemini to Claude should not overwrite the user's previous per-agent choice.
- `API` owns its own API key, base URL, provider preset, and model. It must not
  be visually or behaviorally mixed with Local CLI configuration.

This section supersedes the "Future Extensions" ordering for the Code Agent
settings mainline. Do not treat these items as polish; they are required for the
Settings page to be understandable.

### Current DevLog Gap Snapshot

Current working-tree implementation has made progress, but it still needs to be
reviewed and completed against this stronger baseline:

- `src/app/settings/page.tsx` has the split-mode UI shape, explicit Local CLI
  status cards, and API-only controls, with the registry intentionally scoped to
  the current product-supported Local CLI set.
- `src/core/local-cli-agent-definitions.ts` now tracks only the current DevLog
  supported Local CLI list: Claude Code, Codex CLI, Gemini CLI, Cursor Agent,
  GitHub Copilot CLI, Kimi CLI, Qwen Code, Hermes, Pi, and OpenCode. Other Open
  Design CLIs are intentionally outside the supported list for this phase.
- This is a fixed DevLog product registry, not an "everything found on PATH"
  discovery list. Other CLI binaries may exist locally, but they must not appear
  in Settings or `/api/agents/local-cli` until the product scope is expanded.
- `src/core/local-cli-agents.ts` probes binary path/version and fetches bounded
  line-separated model lists for safe CLIs. ACP model discovery remains pending
  until DevLog has an ACP client.
- `src/core/session-runtime-auth.ts` preserves sanitized custom local model ids,
  matching the Settings custom-model input.
- `src/core/process-manager.ts` only has real one-shot runners for Codex,
  Gemini, OpenCode, Cursor Agent, Qwen, and Copilot; Claude still follows the
  existing Claude stream path. Hermes/Kimi ACP and Pi RPC remain visible but
  runner-pending inside the scoped supported set.
- Task and session launches now preflight the selected runtime so missing BYOK
  keys, missing binaries, and pending runners fail before creating a doomed
  session.
- `src/core/agent-connection-test.ts` and
  `/api/agents/connection-test` now provide a Settings-side smoke test shaped
  after Open Design's connection-test contract: Anthropic-compatible API mode
  sends a tiny `/v1/messages` request, and Local CLI mode launches the selected
  runner in a temporary directory and classifies missing binaries, auth/model
  failures, spawn failures, timeouts, and successes.
- `src/app/settings/page.tsx` exposes a `Test connection` action on the active
  mode and renders the structured result without persisting the transient
  browser API key.
- `src/core/agent-settings.ts`, `src/core/session-runtime-auth.ts`,
  `src/core/process-manager.ts`, and `/api/agents/local-cli` now carry a scoped
  Open Design-style `agentCliEnv` equivalent for the current supported Local CLI
  set. Settings can configure selected-agent binary overrides plus Claude/Codex
  proxy/config env values; scanner, connection test, and launch paths consume
  those values.
- API protocol configuration, Settings connection tests, and browser-BYOK
  session turns now follow the Open Design protocol matrix for Anthropic,
  OpenAI, Azure OpenAI, Google Gemini, Ollama, and SenseAudio. DevLog persists
  protocol/version metadata on sessions and routes non-legacy API sessions
  through a direct provider runtime instead of falling through to the Claude CLI
  env bridge.
- API mode now includes the Open Design-style max output token override. DevLog
  stores it as non-secret settings/session metadata, validates it with
  `1024..200000` bounds, displays it in Settings/session attribution, and passes
  it into direct provider chat requests.
- API mode now includes a Settings-side provider model discovery path modeled on
  Open Design's `/api/provider/models` wrapper. DevLog posts the transient
  browser runtime payload to `/api/agents/provider-models`, fetches provider
  account model ids for Anthropic, OpenAI-compatible, Azure OpenAI, Google
  Gemini, and local Ollama, and merges the returned ids into the current browser
  datalist without persisting the API key or fetched model list.
- The direct API runtime provides provider chat execution. Local file and shell
  tool execution remains a Local CLI capability.

## Revised Mainline Implementation Tasks

### Task 8: Lock the Execution Mode Contract

Description:

Define the Settings contract so the rest of the product cannot accidentally
merge Local CLI and API concerns again.

Files likely touched:

- `src/core/agent-settings.ts`
- `src/core/session-runtime-auth.ts`
- `src/hooks/use-agent-settings.ts`
- `src/core/__tests__/agent-settings.test.ts`
- `src/core/__tests__/session-runtime-auth.test.ts`

Acceptance:

- `executionMode` has exactly two user-facing modes: `local-cli` and
  `anthropic-api` or a renamed generic API mode if a real provider matrix is
  implemented.
- Local CLI state includes `localCliAgentId`, `localCliModel`,
  `localCliReasoning`, and `localCliAgentModels`.
- API state includes `apiModel`, `apiBaseUrl`, and browser-only
  `anthropicApiKey`.
- Switching modes preserves the inactive mode's configuration.
- Stored settings never include the raw API key.

Verification:

- `node --test --import tsx src/core/__tests__/agent-settings.test.ts src/core/__tests__/session-runtime-auth.test.ts`

Dependencies: existing Tasks 1-3.

Estimated scope: Medium.

### Task 9: Lock the Current Supported Local CLI Registry

Description:

Make DevLog's supported Local CLI list match the current product scope and
encode runner support honestly.

Files likely touched:

- `src/core/local-cli-agent-definitions.ts`
- `src/core/local-cli-agents.ts`
- `src/core/__tests__/local-cli-agents.test.ts`

Build:

- Keep only the current supported agents: Claude Code, Codex CLI, Gemini CLI,
  Cursor Agent, GitHub Copilot CLI, Kimi CLI, Qwen Code, Hermes, Pi, and
  OpenCode.
- Do not expose other Open Design CLIs in DevLog's registry yet, even if they
  are installed on the user's `PATH`.
- For agents whose runtime protocol is not implemented in DevLog, set an
  explicit `runnerSupported: false` and show them as supported registry entries
  with pending DevLog runners if detected.
- Add static fallback model lists for every agent.
- Add a product-facing status label source that can produce
  `Supported · available`, `Supported · not detected`, and
  `Supported · runner pending` without duplicating logic across UI components.

Acceptance:

- `/api/agents/local-cli` returns every supported agent even when none is
  installed.
- Missing binaries are visible as supported-but-not-installed, not hidden.
- Installed registry agents whose DevLog runner is pending are visible but
  cannot be selected for a session run.
- Tests assert the registry is exactly the scoped supported agent list.

Verification:

- `node --test --import tsx src/core/__tests__/local-cli-agents.test.ts`
- Manual: open `/settings`, scan Local CLI panel, confirm pending/missing states
  are understandable.

Dependencies: Task 8.

Estimated scope: Small to Medium.

### Task 10: Add Dynamic Local Model Discovery Where It Is Safe

Description:

Open Design fetches live models for some CLIs. DevLog should add this only for
CLIs where the model-list command is non-interactive and bounded by timeout.

Files likely touched:

- `src/core/local-cli-agent-definitions.ts`
- `src/core/local-cli-agents.ts`
- `src/core/__tests__/local-cli-agents.test.ts`

Build:

- Add optional model discovery metadata to agent definitions, separate from
  runner args.
- Support line-separated model discovery for OpenCode and Cursor Agent where
  installed.
- Support a bounded Pi model discovery parser only if it can be tested without
  shell-specific behavior.
- Treat ACP model discovery for Hermes and Kimi as pending unless the ACP
  protocol driver is implemented and tested in DevLog.
- Always fall back to static model hints when discovery fails, times out, or
  returns an unusable response.

Acceptance:

- A failed model-list command never breaks Settings rendering.
- Dynamic models are de-duplicated and always include `Default (CLI config)`.
- Tests cover success, timeout/failure fallback, and "no models available"
  fallback.

Verification:

- `node --test --import tsx src/core/__tests__/local-cli-agents.test.ts`

Dependencies: Task 9.

Estimated scope: Medium.

### Task 11: Rebuild Settings UI Around Two Separate Configuration Panels

Description:

Make `/settings` read like Open Design: first choose execution mode, then show
only that mode's configuration. The UI should not force users to infer whether
they are configuring Local CLI or API.

Files likely touched:

- `src/app/settings/page.tsx`
- `src/hooks/use-agent-settings.ts`

Build:

- Keep the top segmented mode switch compact and explicit.
- Local CLI panel:
  - explain that PATH scanning checks only DevLog's current supported registry,
  - show supported agents in a scannable grid or list,
  - expose binary, detected path, version, and status,
  - allow selection only for installed and runner-supported agents,
  - show model select, custom model input, and reasoning select only after a
    runnable agent is selected.
- API panel:
  - keep API key, model, base URL, and provider quick fill together,
  - show the browser-only key boundary,
  - make incomplete API state visibly block launches.
- Avoid nested cards inside the Settings card. Use sections, borders, and dense
  lists instead.

Acceptance:

- A user can identify the active mode in under one scan.
- A user can tell which local CLIs are available, not installed, or pending.
- Selecting a local CLI restores that CLI's previous model/reasoning choice.
- API configuration does not show Local CLI controls, and Local CLI does not show
  API key/base URL controls.

Verification:

- Browser check `/settings` at desktop width.
- Browser check `/settings` at a narrow/mobile width.
- Confirm no text overlaps or truncates in the agent grid.

Dependencies: Tasks 8-10.

Estimated scope: Medium.

### Task 12: Make Runtime Validation Match the Settings Surface

Description:

Ensure a setting the UI accepts can actually reach the runner, and a setting the
runner cannot support is blocked before launch.

Files likely touched:

- `src/core/session-runtime-auth.ts`
- `src/core/process-manager.ts`
- `src/core/__tests__/session-runtime-auth.test.ts`
- `src/core/__tests__/process-manager-health.test.ts`

Build:

- Accept sanitized custom local CLI model ids in runtime validation, matching
  `src/core/agent-settings.ts`.
- Preserve per-agent reasoning validation.
- Block runner-pending registry entries with a clear error before process spawn.
- Keep installed runner-pending registry entries visible in Settings but
  disabled for launch.
- Add runner metadata tests for Codex, Gemini, OpenCode, Cursor Agent, and Qwen.
- Add runner metadata and JSONL parser tests for Copilot.

Acceptance:

- Custom local model ids survive `buildSessionRuntimePayload` and
  `resolveSessionRuntimeAuthConfig`.
- Runner-pending registry entries fail with a precise message, not a generic
  spawn failure.
- Runner args do not include model flags when model is `default`.

Verification:

- `node --test --import tsx src/core/__tests__/session-runtime-auth.test.ts src/core/__tests__/process-manager-health.test.ts`

Dependencies: Tasks 8-11.

Estimated scope: Medium.

### Task 12A: Add Settings Connection Test

Description:

Bring over the user-visible Open Design ability to test the active Execution &
model configuration before launching a real DevLog Session.

Files likely touched:

- `src/core/agent-connection-test.ts`
- `src/core/__tests__/agent-connection-test.test.ts`
- `src/app/api/agents/connection-test/route.ts`
- `src/app/settings/page.tsx`

Build:

- Add a structured connection-test response with Open Design-compatible failure
  kinds for provider and Local CLI paths.
- For Anthropic-compatible API mode, send a bounded smoke request to
  `/v1/messages` using the transient browser API key, then discard the key.
- Validate provider base URLs before fetch and block private external hosts
  while allowing loopback local-provider endpoints.
- For Local CLI mode, reuse DevLog's launch metadata, spawn the selected runner
  in a temporary directory with a small smoke prompt, and treat assistant text as
  success.
- Surface the active-mode result in Settings as success, warning, or failure
  without storing the result in localStorage or the database.

Acceptance:

- Missing API key fails before network fetch.
- Provider auth, model, rate-limit, timeout, and upstream failures are
  distinguishable.
- Missing Local CLI binary fails before spawn.
- Local CLI assistant text produces a success result with agent name and sample.
- The endpoint never persists the browser API key.

Verification:

- `bun test src/core/__tests__/agent-connection-test.test.ts`
- `bun run typecheck`
- Browser check `/settings`: run `Test connection` in Local CLI and API modes.

Dependencies: Tasks 8-12.

Estimated scope: Medium.

### Task 12B: Add Local CLI Environment Overrides

Description:

Open Design's Local CLI mode includes `agentCliEnv`: allowlisted per-agent
environment and binary-path overrides used by agent scanning, connection tests,
and real launches. DevLog needs the same local-control surface so a user can
configure a CLI installed outside `PATH` or routed through a local/proxy
endpoint without mixing that with API mode.

Files likely touched:

- `src/core/agent-settings.ts`
- `src/core/session-runtime-auth.ts`
- `src/core/local-cli-agent-definitions.ts`
- `src/core/local-cli-agents.ts`
- `src/core/process-manager.ts`
- `src/app/api/agents/local-cli/route.ts`
- `src/app/settings/page.tsx`
- related tests

Build:

- Add a scoped Local CLI env allowlist for the current supported registry:
  Claude Code, Codex CLI, Gemini CLI, Cursor Agent, GitHub Copilot CLI, Kimi
  CLI, Qwen Code, Hermes, Pi, and OpenCode.
- Expose selected-agent fields in a collapsed Advanced section, matching Open
  Design's "proxy & custom paths" affordance.
- Support `CLAUDE_CONFIG_DIR`, `CLAUDE_BIN`, `ANTHROPIC_BASE_URL`, and
  `ANTHROPIC_API_KEY` for Claude Code.
- Support `CODEX_HOME`, `CODEX_BIN`, `OPENAI_BASE_URL`, `CODEX_API_KEY`, and
  `OPENAI_API_KEY` for Codex CLI.
- Support binary override env keys for the remaining scoped CLIs.
- Send only the selected agent's env in session runtime payloads.
- Use binary overrides in `/api/agents/local-cli`, connection tests, task
  launch, session launch, and follow-up chat launches.
- Strip inherited Claude/Codex API keys for Local CLI mode unless the matching
  custom base URL is configured, so Local CLI login/auth is not accidentally
  replaced by ambient BYOK credentials.

Acceptance:

- Unknown agent ids and unknown env keys are dropped.
- Configured binary paths can mark a supported CLI as available even when the
  binary is outside `PATH`.
- Selected binary override wins over PATH for process launch.
- Claude/Codex proxy keys are not leaked from ambient process env into Local CLI
  runs unless an explicit custom base URL is configured.
- API mode remains separate and does not receive Local CLI env values.

Verification:

- `bun test src/core/__tests__/agent-settings.test.ts src/core/__tests__/session-runtime-auth.test.ts src/core/__tests__/local-cli-agents.test.ts src/core/__tests__/process-manager-health.test.ts`
- Browser check `/settings`: Local CLI selected-agent Advanced section renders
  the right fields and scan/test remains usable.

Dependencies: Tasks 9-12A.

Estimated scope: Medium.

### Task 13: Decide and Implement the API Runtime Boundary

Description:

Do not let the UI imply Open Design's full API provider capability unless DevLog
has a runtime that can execute it. Pick one of two explicit product scopes.

Option A - Anthropic-only BYOK:

- Label the mode `Anthropic API (BYOK)`.
- Keep provider quick-fill limited to Anthropic-compatible endpoints only.
- Remove or hide OpenAI-compatible provider presets until the runtime exists.
- Map key/model/base URL into the Claude execution path and document this
  limitation.

Option B - Real provider API mode:

- Rename the mode to `API`.
- Add provider type to settings, for example `anthropic-compatible` and
  `openai-compatible`.
- Implement a real API execution/proxy path instead of only setting Claude
  process environment variables.
- Add tests for Anthropic and OpenAI-compatible request shaping and redaction.

Acceptance:

- The UI label, provider presets, runtime behavior, and tests all describe the
  same capability.
- If MiMo OpenAI-compatible remains visible, there is a tested execution path for
  it.
- API keys are not persisted, logged, included in prompts, or stored in sessions.

Verification:

- Focused runtime tests for the chosen scope.
- Manual BYOK incomplete-state launch check from task and session launch UI.

Dependencies: Tasks 8 and 11.

Estimated scope:

- Option A: Small.
- Option B: Large; split into a separate PR if chosen.

### Task 13A: Port Open Design API Protocol Matrix for Settings Tests

Description:

Bring the Open Design BYOK protocol tabs, provider smoke-test request shapes,
and direct provider session runtime into DevLog Settings.

Files likely touched:

- `src/core/agent-settings.ts`
- `src/core/session-runtime-auth.ts`
- `src/core/api-provider-runtime.ts`
- `src/core/api-session-runtime.ts`
- `src/core/agent-connection-test.ts`
- `src/core/process-manager.ts`
- `src/app/settings/page.tsx`
- `src/core/db-schema.ts`
- `src/core/db.ts`
- related tests

Build:

- Add API protocols: Anthropic, OpenAI, Azure OpenAI, Google Gemini, Ollama,
  and SenseAudio.
- Add per-protocol default base URLs, key placeholders, suggested model lists,
  and provider quick-fill presets.
- Store `apiProtocol`, `apiVersion`, and per-protocol model/base URL/version
  preferences, plus max output token preferences, without storing browser API
  keys.
- Add protocol-aware Settings connection tests:
  - Anthropic: `/v1/messages`,
  - OpenAI/SenseAudio: `/v1/chat/completions`,
  - Azure: deployment chat-completions plus `api-version`,
  - Google: `:generateContent`,
  - Ollama: `/api/chat`.
- Add provider model discovery:
  - Anthropic/OpenAI/SenseAudio: versioned `/models`,
  - Azure: `/openai/models` plus `api-version`,
  - Google: `/v1beta/models`,
  - Ollama: `/api/tags`.
- Persist safe session protocol/version metadata for runtime attribution.
- Persist safe session max-token metadata for runtime attribution.
- Reuse the same provider request builder for Settings connection tests and
  non-legacy browser-BYOK session turns.
- Route non-legacy API sessions through direct provider chat completion instead
  of spawning a Local CLI process.
- Keep legacy backend env-var API mode on the existing Claude CLI path for
  compatibility.
- Keep fetched provider model ids in component state only; they are UI
  suggestions, not durable configuration.

Acceptance:

- Settings API panel has protocol tabs and protocol-scoped provider presets.
- Connection-test request shaping and response parsing are covered for all six
  protocols.
- Provider model discovery request shaping, model extraction, de-duplication,
  loopback Ollama no-key behavior, and error redaction are covered by tests.
- Non-legacy API protocol session launches do not silently fall through into the
  Anthropic Claude CLI path.
- Direct API session turns persist user/assistant messages and emit the same
  basic chat stream events as Local CLI turns.

Verification:

- `bun test src/core/__tests__/agent-settings.test.ts src/core/__tests__/session-runtime-auth.test.ts src/core/__tests__/agent-connection-test.test.ts src/core/__tests__/api-provider-runtime.test.ts src/core/__tests__/api-session-runtime.test.ts src/core/__tests__/process-manager-health.test.ts`
- `bun test src/core/__tests__/api-provider-models.test.ts`
- `node --test --import tsx src/core/__tests__/db-schema.test.ts`
- `bun run typecheck`

Dependencies: Task 13.

Estimated scope: Medium.

### Task 14: Propagate Clear Runtime Attribution Through Tasks and Sessions

Description:

Sessions must show how they were launched so users can debug failures and trust
the execution path.

Files likely touched:

- `src/components/sessions/agent-selector.tsx`
- `src/components/sessions/session-card.tsx`
- `src/app/sessions/[id]/page.tsx`
- `src/app/api/tasks/[id]/execute/route.ts`
- `src/app/api/sessions/route.ts`
- `src/core/types-dashboard.ts`

Acceptance:

- Task launch and manual session launch both use Settings-derived runtime
  payload.
- Session cards and detail pages show mode, local CLI agent, model, reasoning,
  safe API host, and max output tokens where applicable.
- BYOK launch is blocked before creating an immediately failed session when the
  browser key is missing.
- Pending/missing Local CLI launch is blocked before creating an immediately
  failed session.

Verification:

- Existing task/session tests.
- Browser check for `/tasks`, `/sessions`, and one session detail route.

Dependencies: Tasks 8, 11, 12, and selected Task 13 scope.

Estimated scope: Medium.

### Task 15: End-to-End Verification and Review Gate

Description:

Close the mainline only after automated tests and browser evidence prove the
user-facing confusion has been removed.

Run:

```bash
bun run test
bun run typecheck
bun run build
git diff --check
```

Manual browser checks:

- `/settings`: Local CLI mode, API mode, scan failure fallback, disabled local
  agents, custom model input, API base URL/provider quick fill, provider
  `Load models`, and active-mode `Test connection` result rendering.
- `/tasks`: direct task launch uses Settings and blocks incomplete API state.
- `/sessions`: manual session launch and session badges match Settings.
- One session detail page: runtime attribution matches persisted session fields.

Acceptance:

- No generated `next-env.d.ts` or `tsconfig.tsbuildinfo` churn remains in the
  final diff.
- The plan has a matching implementation checklist in the PR description.
- Code review explicitly checks the two-mode boundary, local-agent status
  taxonomy, secret boundary, and custom-model/runtime consistency.

Dependencies: Tasks 8-14.

Estimated scope: Small.

## Security Notes

- Do not log `anthropic_api_key`.
- Do not include `anthropic_api_key` in session prompts, message rows, report JSON, or HTML export.
- Redact key-like strings from errors before surfacing process failures.
- Treat browser-memory BYOK as local convenience, not team-shared configuration.
- The connection-test endpoint accepts a transient key only for the current smoke
  request and must never write it to localStorage, the registry DB, session
  rows, prompts, logs, reports, or exported HTML.

## New Session Handoff Checklist

When starting a fresh session:

1. Read this document.
2. Run `git status --short` and identify unrelated untracked `docs/plans/*` files before editing.
3. Inspect current DevLog files named in the implementation plan.
4. If an implementation already exists, review it against the persistence boundary and verification checklist rather than duplicating it.
5. If starting from a clean branch, implement tasks 1-7 in order.
6. Use Bun commands for DevLog verification unless the project package-manager policy changes.

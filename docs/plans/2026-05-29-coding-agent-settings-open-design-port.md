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

## Security Notes

- Do not log `anthropic_api_key`.
- Do not include `anthropic_api_key` in session prompts, message rows, report JSON, or HTML export.
- Redact key-like strings from errors before surfacing process failures.
- Treat browser-memory BYOK as local convenience, not team-shared configuration.
- If a future backend readiness endpoint accepts a key for testing, the endpoint must perform a smoke test and discard the key immediately.

## New Session Handoff Checklist

When starting a fresh session:

1. Read this document.
2. Run `git status --short` and identify unrelated untracked `docs/plans/*` files before editing.
3. Inspect current DevLog files named in the implementation plan.
4. If an implementation already exists, review it against the persistence boundary and verification checklist rather than duplicating it.
5. If starting from a clean branch, implement tasks 1-7 in order.
6. Use Bun commands for DevLog verification unless the project package-manager policy changes.

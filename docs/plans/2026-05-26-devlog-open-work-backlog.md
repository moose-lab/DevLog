# DevLog Open Work Backlog

Date: 2026-05-26
Branch: `feat/2026-05-25-sessions-panel`
PR: `#10 Add session agent runtime auth selection`

## Purpose

Record the main unfinished work after the Sessions panel, agent preset, runtime auth selection, and task launch E2E slice.

The current product direction is:

- Users work in DevLog by tasks.
- Launching a task creates a session.
- A session is the working unit for a coding agent or agent team.
- The session detail page should behave like a Claude Code style code-mode workspace: streamed agent output, human follow-up, approval points, and task review closure.

## Current Baseline

Completed in the current branch:

- Task launch can create a session with selected coding agent, agent team, and runtime auth mode.
- Session records persist `coding_agent_id`, `agent_team_id`, `session_auth_mode`, and `agent_api_key_env_var`.
- The process manager resolves the real Claude binary, injects selected backend API key env vars, handles spawn errors, and marks auth/runtime failures as failed sessions.
- Session detail and cards show selected agent/team/auth context.
- `scripts/task-launch-e2e.mjs` covers task creation, task launch, session creation, SSE connection, follow-up send, and assistant acknowledgement polling.

Verified locally:

- `node --test --import tsx src/core/__tests__/process-manager-health.test.ts src/core/__tests__/session-runtime-auth.test.ts src/core/__tests__/db-schema.test.ts src/core/__tests__/agent-presets.test.ts src/core/__tests__/task-card-actions.test.ts`
- `bun run test`
- `bun run typecheck`
- `bun run build`

Known blocker:

- The full happy-path task launch E2E is blocked by local Claude Code authentication. The runtime reports no usable backend OAuth/API key source and returns `403 Request not allowed`. The current E2E reaches task creation, session creation, SSE sync, and follow-up queueing, then fails at real agent execution.

## Open Task List

### P0: Auth Readiness And Failed Session Retry

**Description:** Add a non-secret auth readiness layer so users can see whether the selected runtime can execute before or after launch, and retry failed sessions after credentials are fixed.

**Acceptance criteria:**

- [ ] Backend exposes a readiness result for the selected runtime auth mode.
- [ ] Readiness distinguishes Claude binary missing, backend OAuth unavailable, selected env var missing, and runtime usable.
- [ ] Launch UI shows actionable readiness before starting a task or session.
- [ ] Failed sessions caused by auth/runtime startup errors can be retried with the same or updated auth selection.
- [ ] Retry preserves the task/session context and appends a clear retry event to session messages or timeline.

**Verification:**

- [ ] Unit tests cover readiness mapping and missing env var behavior.
- [ ] Manual check: missing env var blocks or warns before launch.
- [ ] Manual check: failed auth session can be retried after credentials are provided.

**Dependencies:** None.

**Files likely touched:**

- `src/core/process-manager.ts`
- `src/core/session-runtime-auth.ts`
- `src/app/api/sessions/[id]/route.ts`
- `src/app/api/sessions/route.ts`
- `src/components/sessions/launch-dialog.tsx`
- `src/app/sessions/[id]/page.tsx`

**Estimated scope:** Medium.

### P0: Complete Real Task Launch E2E Happy Path

**Description:** Finish proof that a prompt-bearing task can launch a real coding-agent session, navigate to `/sessions/:id`, stream the agent reply, accept human follow-up, and finish without orphaned processes.

**Acceptance criteria:**

- [ ] From a task with a prompt, launch creates a new session.
- [ ] The UI or response path opens `/sessions/:id`.
- [ ] SSE emits `sync` plus streamed agent output events.
- [ ] A human follow-up instruction sent from session detail is processed by the same session.
- [ ] The E2E observes both the initial agent acknowledgement and follow-up acknowledgement.
- [ ] Failed runs leave `pid = null` and no orphaned Claude process.

**Verification:**

- [ ] Start the app with a real usable backend OAuth or API key runtime.
- [ ] Run `DEVLOG_E2E_BASE_URL=http://127.0.0.1:3334 DEVLOG_E2E_AUTH_MODE=agent-api-key DEVLOG_E2E_AGENT_API_KEY_ENV_VAR=ANTHROPIC_API_KEY bun run test:e2e:task-launch`.
- [ ] Browser check: task launch opens a session detail page and live output appears in the session.

**Dependencies:** P0 auth readiness or a confirmed working credential setup.

**Files likely touched:**

- `scripts/task-launch-e2e.mjs`
- `src/app/api/tasks/[id]/execute/route.ts`
- `src/app/sessions/[id]/page.tsx`
- `src/components/sessions/session-chat.tsx`

**Estimated scope:** Small to medium, depending on credential readiness.

### P1: Session Detail Human-In-The-Loop Workspace

**Description:** Turn session detail from a streamed chat surface into a structured task-run workspace with clear live state, queued human instructions, permission prompts, and retry controls.

**Acceptance criteria:**

- [ ] Session detail has a compact timeline for run states, user instructions, assistant output, tool calls, permission requests, failures, and retries.
- [ ] Queued follow-up instructions are visible while the agent is processing.
- [ ] Users can pause, resume, cancel, or retry when the process manager supports the state.
- [ ] Permission prompts remain recoverable after reload.
- [ ] Empty, running, failed, completed, and paused states have distinct copy and actions.

**Verification:**

- [ ] Component tests cover session state copy and action availability.
- [ ] Browser check: `/sessions/:id` remains usable on mobile and desktop widths.
- [ ] Manual check: reload during a pending permission or queued follow-up does not lose state.

**Dependencies:** P0 retry/readiness for robust failed-state actions.

**Files likely touched:**

- `src/app/sessions/[id]/page.tsx`
- `src/components/sessions/session-chat.tsx`
- `src/components/sessions/session-card.tsx`
- `src/core/process-manager.ts`
- `src/hooks/use-sessions.ts`

**Estimated scope:** Medium.

### P1: Task Review And Completion Closure

**Description:** Close the loop from agent execution back to task status, diff review, and human approval.

**Acceptance criteria:**

- [ ] A session can produce a final summary tied to the source task.
- [ ] Task status moves into review only when there is reviewable output or explicit completion.
- [ ] Users can approve, reopen, or request follow-up from the task review state.
- [ ] Worktree changes, process outcome, and final assistant summary are visible from the task.
- [ ] Completion does not silently discard failed or partial work.

**Verification:**

- [ ] Unit tests cover task status transitions from session outcomes.
- [ ] Manual check: successful session creates a reviewable task outcome.
- [ ] Manual check: failed session leaves the task actionable and not falsely complete.

**Dependencies:** P0 real task launch E2E and P1 session workspace state.

**Files likely touched:**

- `src/core/task-lifecycle.ts`
- `src/core/process-manager.ts`
- `src/components/kanban/task-detail-dialog.tsx`
- `src/components/kanban/board.tsx`
- `src/app/sessions/[id]/page.tsx`

**Estimated scope:** Medium to large.

### P2: Agent Registry And Provider Configuration

**Description:** Move beyond hard-coded presets by adding a real registry for coding agents, teams, provider choices, model choices, and backend-secret references.

**Acceptance criteria:**

- [ ] Built-in presets remain available as defaults.
- [ ] Agents and teams can be listed from a single registry contract.
- [ ] Provider/model/auth metadata is part of the execution config.
- [ ] API keys are referenced by backend env var or secret handle, never stored raw in session rows.
- [ ] Launch UI can choose a compatible agent, team, provider, and auth mode.

**Verification:**

- [ ] Unit tests cover fallback defaults and unknown provider handling.
- [ ] Manual check: existing sessions still render after schema migration.

**Dependencies:** P0 auth readiness.

**Files likely touched:**

- `src/core/agent-presets.ts`
- `src/core/session-runtime-auth.ts`
- `src/core/db-schema.ts`
- `src/core/types-dashboard.ts`
- `src/components/sessions/agent-selector.tsx`

**Estimated scope:** Medium to large.

### P2: Real Multi-Agent Team Orchestration

**Description:** Implement actual agent-team execution instead of a single prompt-injected team preset.

**Acceptance criteria:**

- [ ] Team runs can create multiple role-specific agent jobs or sub-sessions.
- [ ] The dispatcher tracks each agent role, current state, output, and failure.
- [ ] Human follow-up can target the whole session or a specific role when appropriate.
- [ ] Team output is merged into a coherent task result.
- [ ] Conflicting edits or failed role outputs require review instead of being auto-accepted.

**Verification:**

- [ ] Unit tests cover dispatcher state transitions.
- [ ] Integration smoke test covers at least two roles in one team run.
- [ ] Browser check: session detail clearly shows per-agent progress.

**Dependencies:** P1 session workspace and P2 registry.

**Files likely touched:**

- `src/core/process-manager.ts`
- `src/core/agent-presets.ts`
- `src/core/db-schema.ts`
- `src/app/api/tasks/[id]/execute/route.ts`
- `src/app/sessions/[id]/page.tsx`

**Estimated scope:** Large. Break into smaller slices before implementation.

### P2: Cost And Usage Module

**Description:** Add first-class visibility into coding-agent usage, session cost, project totals, and quota/credit status.

**Acceptance criteria:**

- [ ] Session records can be associated with provider/model/auth mode for cost reporting.
- [ ] Cost reports distinguish API-key billing from OAuth/subscription-style usage.
- [ ] Users can view project, task, and session-level estimated cost.
- [ ] Cost UI uses existing local cost tracker plans as input instead of duplicating logic.

**Verification:**

- [ ] Unit tests cover aggregation by provider, project, and session.
- [ ] Manual check: cost cards remain useful when quota data is unknown.

**Dependencies:** P2 provider configuration for accurate attribution.

**Related local plans:**

- `docs/plans/2026-05-16-cost-module-phase-1.md`
- `docs/plans/2026-05-16-cost-usage-analytics-ui.md`
- `docs/plans/2026-05-16-devlog-cost-tracking-research.md`

**Estimated scope:** Medium to large.

## Recommended Execution Order

1. P0: Auth readiness and failed session retry.
2. P0: Complete real task launch E2E happy path with real credentials.
3. P1: Session detail human-in-the-loop workspace.
4. P1: Task review and completion closure.
5. P2: Agent registry and provider configuration.
6. P2: Real multi-agent team orchestration.
7. P2: Cost and usage module.

## Checkpoints

### Checkpoint 1: Real Session Execution

- [ ] Credentials are discoverable or explicitly reported as missing.
- [ ] Failed auth sessions can be retried.
- [ ] `bun run test:e2e:task-launch` passes with a real runtime.

### Checkpoint 2: Human-In-The-Loop Detail Page

- [ ] Session detail shows live output, queued human input, and state-specific actions.
- [ ] Reload does not lose important human-in-the-loop state.
- [ ] Browser checks pass for desktop and mobile widths.

### Checkpoint 3: Task Closure

- [ ] A successful session creates a reviewable task result.
- [ ] Failed and partial sessions keep the task actionable.
- [ ] Task, session, and review states are consistent.

### Checkpoint 4: Multi-Agent Foundation

- [ ] Agent/provider registry is durable.
- [ ] Team orchestration is split into role-specific tracked work.
- [ ] Cost reporting can attribute usage by session, task, project, provider, and model.

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Backend OAuth/API key availability is unclear until launch time. | E2E and user sessions fail late. | Add readiness checks and failed-session retry first. |
| Agent team presets are mistaken for real multi-agent orchestration. | Product behavior overpromises current runtime. | Keep labels honest until dispatcher/fan-out exists. |
| Human follow-up is only chat, not workflow control. | Users cannot reliably guide long-running sessions. | Add timeline, queue visibility, pause/resume, permission recovery, and retry. |
| Task completion is inferred from process exit alone. | Failed or partial work may appear complete. | Require reviewable output and human approval for closure. |
| Cost data lacks provider/model attribution. | Cost reports are too coarse to guide decisions. | Add provider/model/auth metadata before full cost UI. |

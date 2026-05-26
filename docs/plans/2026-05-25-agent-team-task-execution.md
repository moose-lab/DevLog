# Agent Team Task Execution Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users start a task as a session with an explicit coding agent and agent team preset, then observe and continue the streamed session as the task work unit.

**Architecture:** Reuse the existing task execute route, Claude Code stream-json process manager, SSE stream, and session chat. Add a small agent preset contract, persist the selected preset on sessions, inject the preset into the initial prompt, and expose the selector in task/session launch UI.

**Tech Stack:** Next.js App Router, React client components, TypeScript, SQLite via better-sqlite3, node:test with `tsx`, existing shadcn-style UI components.

### Task 1: Agent Preset Contract

**Files:**
- Create: `src/core/agent-presets.ts`
- Test: `src/core/__tests__/agent-presets.test.ts`

**Step 1: Write the failing tests**

Create tests that verify:
- Unknown or missing preset ids resolve to the default coding agent and default team.
- The default team is an implementation/review/testing team, not a passive solo log.
- Prompt instructions include both the selected coding agent and selected team roles.

Run:
```bash
node --test --import tsx src/core/__tests__/agent-presets.test.ts
```

Expected: fail because `agent-presets.ts` does not exist.

**Step 2: Implement the minimal contract**

Add built-in coding agents and teams:
- `general-coding-agent`
- `frontend-coding-agent`
- `backend-coding-agent`
- `implementation-review-team`
- `solo-coding-agent`

Export:
- `CODING_AGENTS`
- `AGENT_TEAMS`
- `DEFAULT_CODING_AGENT_ID`
- `DEFAULT_AGENT_TEAM_ID`
- `resolveAgentExecutionConfig(input)`
- `buildAgentExecutionInstructions(config)`

**Step 3: Verify**

Run:
```bash
node --test --import tsx src/core/__tests__/agent-presets.test.ts
```

Expected: pass.

### Task 2: Persist Agent Selection On Sessions

**Files:**
- Modify: `src/core/types-dashboard.ts`
- Modify: `src/core/db-schema.ts`
- Modify: `src/core/db.ts`
- Modify: `src/core/__tests__/db-schema.test.ts`
- Modify: `src/core/__tests__/task-card-actions.test.ts`

**Step 1: Write the failing schema test**

Add a test that inserts a session without agent fields and verifies defaults:
- `coding_agent_id = "general-coding-agent"`
- `agent_team_id = "implementation-review-team"`

Run:
```bash
node --test --import tsx src/core/__tests__/db-schema.test.ts
```

Expected: fail until the sessions schema has the new columns.

**Step 2: Add session fields**

Add `coding_agent_id` and `agent_team_id` to the `sessions` table with backward-compatible defaults. Add idempotent migrations in `getDb()` for existing local databases. Extend the `Session` TypeScript interface.

**Step 3: Verify**

Run:
```bash
node --test --import tsx src/core/__tests__/db-schema.test.ts src/core/__tests__/task-card-actions.test.ts
```

Expected: pass.

### Task 3: Inject Presets Into Task And Session Launch

**Files:**
- Modify: `src/core/task-lifecycle.ts`
- Test: `src/core/__tests__/agent-presets.test.ts`
- Modify: `src/app/api/tasks/[id]/execute/route.ts`
- Modify: `src/app/api/sessions/route.ts`
- Modify: `src/hooks/use-tasks.ts`
- Modify: `src/hooks/use-sessions.ts`

**Step 1: Extend tests**

Add a test that `buildPromptTemplate()` includes the `## Agent Execution` section for a selected coding agent and team.

Run:
```bash
node --test --import tsx src/core/__tests__/agent-presets.test.ts
```

Expected: fail until `buildPromptTemplate()` accepts agent config.

**Step 2: Update launch paths**

Accept optional `coding_agent_id` and `agent_team_id` in:
- `POST /api/tasks/[id]/execute`
- `POST /api/sessions`

Resolve missing/unknown values through `resolveAgentExecutionConfig()`, store the resolved ids on the session row, and pass the resolved config into the prompt builder.

**Step 3: Verify**

Run:
```bash
node --test --import tsx src/core/__tests__/agent-presets.test.ts
```

Expected: pass.

### Task 4: Add Task Launch Agent Selector

**Files:**
- Create: `src/components/sessions/agent-selector.tsx`
- Modify: `src/components/sessions/launch-dialog.tsx`
- Modify: `src/components/kanban/task-detail-dialog.tsx`
- Modify: `src/components/kanban/board.tsx`
- Modify: `src/components/sessions/session-card.tsx`
- Modify: `src/app/sessions/[id]/page.tsx`

**Step 1: Build the selector**

Create a compact selector with two existing `Select` controls:
- Coding agent
- Agent team

Use `CODING_AGENTS` and `AGENT_TEAMS` as the source of truth.

**Step 2: Wire launch flows**

Pass selected ids from:
- New Session dialog
- Task Detail launch section

Task-card quick launch should use the default agent config.

**Step 3: Show selected agent/team**

Display compact badges on session cards and session detail header so the user can see which coding agent/team is handling the task run.

### Task 5: Verify Full Slice

**Commands:**
```bash
node --test --import tsx src/core/__tests__/agent-presets.test.ts
bun run test
bun run typecheck
bun run build
```

**Browser checks:**
- Start `bun run dev -- --port 3333`.
- Visit `http://localhost:3333/tasks`.
- Open a task with a prompt and confirm the task launch UI exposes coding agent and agent team selection.
- Launch the task and confirm it opens `/sessions/:id`.
- Confirm session detail streams live replies and shows the selected agent/team.

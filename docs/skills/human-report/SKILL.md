---
name: human-report
description: Convert DevLog task and session evidence into human-facing daily and weekly project status reports. Use when changing Reports, report summaries, report HTML export, log cleaning, backend report snapshots, or project-manager-facing daily and weekly report content.
---

# Human Report

Use this skill when changing DevLog Reports, report summaries, HTML export,
backend report snapshots, or daily and weekly report content for project
managers and leads.

Reports are human-facing project status reports, not log inspection views. The
first output should explain whether the project is on track, at risk, blocked,
or inactive; what meaningful work changed; what needs attention; and what
should happen next.

## Workflow

1. Collect only task and session evidence relevant to the selected period.
2. Remove machine noise, repeated status churn, and low-value runtime detail.
3. Promote outcomes, risks, decisions, blockers, and next priorities.
4. Render the final report for humans first.
5. Keep raw metrics and original evidence in a compact appendix or backend
   snapshot.
6. Treat JSON as a backend artifact for audit, regeneration, and automation.
7. Keep Markdown output out of v1 scope.

## Quality Gate

- The report starts with status, summary, outcomes, risks, and next priorities.
- Metrics support the narrative instead of dominating it.
- Session prompts and runtime details stay secondary unless they explain a risk
  or decision.
- HTML is the user-facing export format.
- No visible JSON or Markdown output is introduced as a primary frontend format.

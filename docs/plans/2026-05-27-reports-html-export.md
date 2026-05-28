# Reports HTML Export

## Product Decision

Reports are work-output reports, not cost reports. The primary entry lives under
`Analytics` as `/reports`, with lightweight export entry points on the dashboard and task
board. The first supported periods are daily, weekly, and monthly.

## User Value

Developers who do not plan every task upfront can still reconstruct a time period from DevLog:
what changed, what finished, what remains in review, what is blocked, and which sessions
produced the work.

## Design Contract

- Page title: `Reports`
- Controls: period selector, date picker, refresh button, `Export HTML`
- Metrics: completion, project progress, tasks touched, focus time
- Sections: highlights, project breakdown, completed work, in review, active/in progress,
  blocked/failed, session timeline
- Empty state: no recorded work for the selected period, with links to tasks and sessions
- Visual style: dense developer dashboard, existing card/table/button system, no hero or
  marketing layout

## Development Contract

- Core logic: `src/core/report-summary.ts`
- Data loader: `src/core/report-summary-store.ts`
- JSON endpoint: `GET /api/reports?date=YYYY-MM-DD&period=daily|weekly|monthly`
- HTML endpoint: `GET /api/reports/export?date=YYYY-MM-DD&period=daily|weekly|monthly`
- Main UI: `/reports`
- Navigation: sidebar `Analytics -> Reports`
- Lightweight actions: dashboard `Export Report`, task board `Reports`

## Metrics

- `touchedTasks`: task `updated_at` or `completed_at` lands in the selected period
- `completedInPeriod`: task is `done` and `completed_at` lands in the selected period
- `completionRate`: `completedInPeriod / touchedTasks`
- `projectProgressRate`: all project `done / total` tasks
- `sessions`: session `started_at` or `ended_at` lands in the selected period
- `focusTime`: ended session runtime only
- `projectBreakdown`: same period metrics grouped by project

## Acceptance

- Invalid dates return HTTP 400.
- Invalid periods return HTTP 400.
- HTML export escapes task titles, descriptions, and prompts.
- Empty periods still render a useful report.
- `bun run test`, `bun run typecheck`, and `bun run build` pass.

## Usage

Users open `Analytics -> Reports`, choose `Daily`, `Weekly`, or `Monthly`, choose a date
inside the target period, then click `Export HTML`. The browser downloads a standalone
HTML report named `devlog-<period>-report-YYYY-MM-DD.html`.

To get today's daily report:

1. Start DevLog with `devlog serve` or `bun run dev -- -p 3333`.
2. Open `http://localhost:3333/reports`.
3. Select `Daily`.
4. Keep the date on today, or choose another day.
5. Click `Export HTML`.

The dashboard home page also has `Export Report`, which downloads today's daily report
directly. The Tasks page links to `Reports` for users who start from the task board.

Direct API usage:

- JSON: `GET /api/reports?period=daily&date=2026-05-27`
- HTML: `GET /api/reports/export?period=daily&date=2026-05-27`

Weekly and monthly reports use the same `date` parameter as an anchor date. For example,
`period=weekly&date=2026-05-27` returns the week from `2026-05-25` to `2026-05-31`;
`period=monthly&date=2026-05-27` returns the natural month from `2026-05-01` to
`2026-05-31`.

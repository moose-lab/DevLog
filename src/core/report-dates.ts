/**
 * Shared date handling for reports (IM-3, REVIEW-2026-06-10).
 *
 * One zone end-to-end: reports bucket by the user's LOCAL calendar day.
 * Stored timestamps come from SQLite's datetime('now') — bare UTC strings
 * like "2026-06-10 22:30:00" — which JS would otherwise parse as local
 * time. Previously the day key was sliced from the UTC string while range
 * boundaries used local components, so in UTC+8 anything between 00:00 and
 * 08:00 local landed in the previous day's report.
 */

/** Local calendar Y-M-D for a Date. */
export function getTodayDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parses a stored timestamp. Bare strings (no zone suffix) are SQLite UTC
 * and get an explicit Z; strings carrying a zone are respected as-is.
 */
export function parseDbTimestamp(value: string): Date | null {
  const normalized = value.trim().replace(" ", "T");
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const date = new Date(hasZone ? normalized : `${normalized}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Local-day key ("YYYY-MM-DD") for a stored timestamp. */
export function localDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = parseDbTimestamp(trimmed);
  return parsed ? getTodayDateKey(parsed) : null;
}

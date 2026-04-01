"use client";

import { useMemo } from "react";
import dayjs from "dayjs";
import type { Task } from "@/core/types-dashboard";

export interface DailyTaskCount {
  date: string;     // "Mon", "Tue" …
  completed: number;
  prevCompleted: number; // same weekday last week
}

export interface RecentActivity {
  task: Task;
  label: string;
  ago: string;
}

export interface TaskAnalytics {
  completedToday: number;
  completedThisWeek: number;
  inProgressTasks: Task[];
  stuckTasks: Task[];        // in_progress, no update in 48h
  dailyVelocity: DailyTaskCount[];
  recentActivity: RecentActivity[];
  totalTasks: number;
  doneTasks: number;
  progressPct: number;
  estimatedDaysLeft: number | null;
  avgVelocity: number;       // tasks/day last 7 days
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STUCK_THRESHOLD_H = 48;

function isSameDay(dateStr: string | null, target: dayjs.Dayjs): boolean {
  if (!dateStr) return false;
  return dayjs(dateStr).isSame(target, "day");
}

export function useTaskAnalytics(tasks: Task[]): TaskAnalytics {
  return useMemo(() => {
    const now = dayjs();
    const todayStart = now.startOf("day");
    const weekStart = now.startOf("week");

    // ── Completed counts ──────────────────────────────────
    const doneTasks = tasks.filter((t) => t.status === "done");
    const completedToday = doneTasks.filter((t) =>
      isSameDay(t.completed_at, todayStart)
    ).length;
    const completedThisWeek = doneTasks.filter((t) => {
      if (!t.completed_at) return false;
      return dayjs(t.completed_at).isAfter(weekStart);
    }).length;

    // ── In progress ───────────────────────────────────────
    const inProgressTasks = tasks
      .filter((t) => t.status === "in_progress")
      .sort((a, b) => dayjs(b.updated_at).diff(dayjs(a.updated_at)));

    // ── Stuck tasks (in_progress, no update in 48h) ───────
    const stuckTasks = inProgressTasks.filter((t) => {
      const hoursAgo = now.diff(dayjs(t.updated_at), "hour");
      return hoursAgo >= STUCK_THRESHOLD_H;
    });

    // ── Daily velocity (last 7 days vs prior 7 days) ──────
    const dailyVelocity: DailyTaskCount[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = now.subtract(i, "day");
      const prevDay = day.subtract(7, "day");
      const completed = doneTasks.filter((t) => isSameDay(t.completed_at, day)).length;
      const prevCompleted = doneTasks.filter((t) => isSameDay(t.completed_at, prevDay)).length;
      dailyVelocity.push({
        date: WEEKDAYS[day.day()],
        completed,
        prevCompleted,
      });
    }

    // ── Recent activity (last 10 updated tasks) ───────────
    const sorted = [...tasks].sort((a, b) =>
      dayjs(b.updated_at).diff(dayjs(a.updated_at))
    );
    const recentActivity: RecentActivity[] = sorted.slice(0, 10).map((t) => {
      const diff = now.diff(dayjs(t.updated_at), "minute");
      let ago: string;
      if (diff < 1) ago = "just now";
      else if (diff < 60) ago = `${diff}m ago`;
      else if (diff < 1440) ago = `${Math.floor(diff / 60)}h ago`;
      else ago = `${Math.floor(diff / 1440)}d ago`;

      const STATUS_LABEL: Record<string, string> = {
        done: "Completed",
        in_progress: "Started",
        todo: "Queued",
      };
      return { task: t, label: STATUS_LABEL[t.status] ?? t.status, ago };
    });

    // ── Progress & ETA ────────────────────────────────────
    const totalTasks = tasks.length;
    const progressPct = totalTasks > 0 ? Math.round((doneTasks.length / totalTasks) * 100) : 0;
    const avgVelocity =
      dailyVelocity.reduce((s, d) => s + d.completed, 0) / 7;
    const remaining = totalTasks - doneTasks.length;
    const estimatedDaysLeft =
      avgVelocity > 0 ? Math.ceil(remaining / avgVelocity) : null;

    return {
      completedToday,
      completedThisWeek,
      inProgressTasks,
      stuckTasks,
      dailyVelocity,
      recentActivity,
      totalTasks,
      doneTasks: doneTasks.length,
      progressPct,
      estimatedDaysLeft,
      avgVelocity,
    };
  }, [tasks]);
}

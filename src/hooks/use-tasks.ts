"use client";

import { useState, useEffect, useCallback } from "react";
import type { Task, TaskStatus, TaskPriority } from "@/core/types-dashboard";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        setTasks(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchTasks]);

  const createTask = async (data: {
    title: string;
    description?: string;
    priority?: TaskPriority;
    worktree_name?: string;
    prompt?: string;
  }) => {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      await fetchTasks();
      return (await res.json()) as Task;
    }
    return null;
  };

  const updateTask = async (id: string, data: Partial<Task>) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      await fetchTasks();
    }
  };

  const deleteTask = async (id: string) => {
    const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    if (res.ok) {
      await fetchTasks();
    }
  };

  const reorder = async (
    items: { id: string; status: TaskStatus; sort_order: number }[]
  ) => {
    await fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    await fetchTasks();
  };

  const tasksByStatus = (status: TaskStatus) =>
    tasks.filter((t) => t.status === status).sort((a, b) => a.sort_order - b.sort_order);

  return {
    tasks,
    loading,
    createTask,
    updateTask,
    deleteTask,
    reorder,
    tasksByStatus,
    refresh: fetchTasks,
  };
}

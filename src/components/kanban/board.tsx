"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { KanbanColumn } from "./column";
import { CreateTaskDialog } from "./create-task-dialog";
import { TaskDetailDialog } from "./task-detail-dialog";
import { useTasks } from "@/hooks/use-tasks";
import { useTaskSessions } from "@/hooks/use-task-sessions";
import type { Task, TaskStatus } from "@/core/types-dashboard";
import { Skeleton } from "@/components/ui/skeleton";

const COLUMNS: TaskStatus[] = ["todo", "in_progress", "review", "blocked", "done"];

export function KanbanBoard() {
  const { loading, tasksByStatus, createTask, updateTask, deleteTask, reorder, executeTask } = useTasks();
  const taskSessions = useTaskSessions();
  const router = useRouter();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleExecuteTask = async (taskId: string) => {
    const result = await executeTask(taskId);
    if (result?.session) {
      router.push(`/sessions/${result.session.id}`);
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const destStatus = destination.droppableId as TaskStatus;
    const sourceStatus = source.droppableId as TaskStatus;

    const items: { id: string; status: TaskStatus; sort_order: number }[] = [];

    if (sourceStatus === destStatus) {
      const columnTasks = [...tasksByStatus(sourceStatus)];
      const [moved] = columnTasks.splice(source.index, 1);
      columnTasks.splice(destination.index, 0, moved);
      columnTasks.forEach((t, i) => items.push({ id: t.id, status: destStatus, sort_order: i }));
    } else {
      const sourceTasks = [...tasksByStatus(sourceStatus)];
      const destTasks = [...tasksByStatus(destStatus)];

      const [moved] = sourceTasks.splice(source.index, 1);
      destTasks.splice(destination.index, 0, moved);

      sourceTasks.forEach((t, i) => items.push({ id: t.id, status: sourceStatus, sort_order: i }));
      destTasks.forEach((t, i) => items.push({ id: t.id, status: destStatus, sort_order: i }));
    }

    await reorder(items);
  };

  const handleClickTask = (task: Task) => {
    setSelectedTask(task);
    setDetailOpen(true);
  };

  const handleUpdateTask = async (id: string, data: Partial<Task>) => {
    await updateTask(id, data);
    setSelectedTask((prev) => (prev?.id === id ? { ...prev, ...data } as Task : prev));
  };

  const handleLaunchSession = async (
    task: Task,
    worktreePath: string,
    worktreeName?: string,
    branchName?: string
  ): Promise<{ id: string } | null> => {
    const prompt = task.prompt;
    if (!prompt) return null;

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: task.id,
        worktree_name: worktreeName,
        worktree_path: worktreePath,
        branch_name: branchName,
        prompt,
      }),
    });

    if (res.ok) {
      const session = await res.json();
      return { id: session.id };
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {COLUMNS.map((col) => (
          <Skeleton key={col} className="h-[400px] min-w-[240px] flex-1 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreateTaskDialog onSubmit={createTask} />
      </div>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {COLUMNS.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={tasksByStatus(status)}
              taskSessions={taskSessions}
              onDeleteTask={deleteTask}
              onClickTask={handleClickTask}
              onExecuteTask={handleExecuteTask}
            />
          ))}
        </div>
      </DragDropContext>

      <TaskDetailDialog
        task={selectedTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdate={handleUpdateTask}
        onLaunchSession={handleLaunchSession}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KanbanSquare, GitBranch, Terminal, ChevronRight, Plus } from "lucide-react";
import { CreateTaskDialog } from "@/components/kanban/create-task-dialog";
import { TaskDetailDialog } from "@/components/kanban/task-detail-dialog";
import { useTasks } from "@/hooks/use-tasks";
import type { Task, TaskStatus } from "@/core/types-dashboard";
import { cn } from "@/core/dashboard-utils";

const QUICK_COLUMNS: TaskStatus[] = ["todo", "in_progress"];

const COLUMN_CONFIG: Record<TaskStatus, { label: string; dot: string }> = {
  todo: { label: "Todo", dot: "bg-zinc-500" },
  in_progress: { label: "In Progress", dot: "bg-sky-500" },
  review: { label: "Review", dot: "bg-purple-500" },
  blocked: { label: "Blocked", dot: "bg-red-500" },
  done: { label: "Done", dot: "bg-emerald-500" },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  medium: "bg-sky-500/15 text-sky-400 border-sky-500/25",
  high: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  critical: "bg-rose-500/15 text-rose-400 border-rose-500/25",
};

function MiniTaskCard({
  task,
  index,
  onClick,
}: {
  task: Task;
  index: number;
  onClick: (task: Task) => void;
}) {
  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={cn(
            "rounded-lg border border-white/[0.06] bg-white/[0.03] p-2.5 space-y-1.5 cursor-grab active:cursor-grabbing hover:border-white/[0.12] transition-all",
            snapshot.isDragging && "ring-2 ring-sky-500/40 shadow-lg shadow-sky-500/10"
          )}
          onClick={() => onClick(task)}
        >
          <div className="flex items-start justify-between gap-1.5">
            <span className="text-xs font-medium leading-tight flex-1 line-clamp-2">
              {task.title}
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0 mt-0.5" />
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <Badge
              variant="outline"
              className={cn("text-[9px] px-1 py-0", PRIORITY_COLORS[task.priority])}
            >
              {task.priority}
            </Badge>
            {task.worktree_name && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 gap-0.5">
                <GitBranch className="h-2 w-2" />
                {task.worktree_name}
              </Badge>
            )}
            {task.session_id && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 gap-0.5">
                <Terminal className="h-2 w-2" />
                active
              </Badge>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}

export function TaskQuickView() {
  const { tasks, loading, createTask, updateTask, deleteTask, reorder, tasksByStatus } = useTasks();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const destStatus = destination.droppableId as TaskStatus;
    const sourceStatus = source.droppableId as TaskStatus;
    const items: { id: string; status: TaskStatus; sort_order: number }[] = [];

    if (sourceStatus === destStatus) {
      const col = [...tasksByStatus(sourceStatus)];
      const [moved] = col.splice(source.index, 1);
      col.splice(destination.index, 0, moved);
      col.forEach((t, i) => items.push({ id: t.id, status: destStatus, sort_order: i }));
    } else {
      const srcTasks = [...tasksByStatus(sourceStatus)];
      const dstTasks = [...tasksByStatus(destStatus)];
      const [moved] = srcTasks.splice(source.index, 1);
      dstTasks.splice(destination.index, 0, moved);
      srcTasks.forEach((t, i) => items.push({ id: t.id, status: sourceStatus, sort_order: i }));
      dstTasks.forEach((t, i) => items.push({ id: t.id, status: destStatus, sort_order: i }));
    }

    await reorder(items);
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
    if (!task.prompt) return null;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: task.id,
        worktree_name: worktreeName,
        worktree_path: worktreePath,
        branch_name: branchName,
        prompt: task.prompt,
      }),
    });
    if (res.ok) {
      const session = await res.json();
      return { id: session.id };
    }
    return null;
  };

  const activeTasks = tasks.filter((t) => t.status !== "done");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <KanbanSquare className="h-4 w-4 text-zinc-500" />
        <span className="text-[11px] uppercase tracking-[0.15em] text-zinc-500 font-medium">
          Tasks
        </span>
        <span
          className="text-[10px] font-medium text-zinc-400 tabular-nums px-1.5 py-0.5 rounded-md bg-white/[0.06]"
          style={{ fontFamily: "var(--font-jetbrains), monospace" }}
        >
          {activeTasks.length}
        </span>
        <div className="ml-auto">
          <CreateTaskDialog onSubmit={createTask} />
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Loading tasks…</span>
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
            {QUICK_COLUMNS.map((status) => {
              const colTasks = tasksByStatus(status);
              const config = COLUMN_CONFIG[status];
              return (
                <div key={status} className="flex flex-col rounded-lg bg-white/[0.02] border border-white/[0.04] min-h-0">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] shrink-0">
                    <span className={cn("h-2 w-2 rounded-full", config.dot)} />
                    <span className="text-xs font-medium text-zinc-400">{config.label}</span>
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {colTasks.length}
                    </Badge>
                  </div>
                  <Droppable droppableId={status}>
                    {(provided, snapshot) => (
                      <ScrollArea className="flex-1">
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={cn(
                            "space-y-1.5 p-2 min-h-[120px] transition-colors",
                            snapshot.isDraggingOver && "bg-sky-500/5"
                          )}
                        >
                          {colTasks.map((task, index) => (
                            <MiniTaskCard
                              key={task.id}
                              task={task}
                              index={index}
                              onClick={(t) => {
                                setSelectedTask(t);
                                setDetailOpen(true);
                              }}
                            />
                          ))}
                          {provided.placeholder}
                        </div>
                      </ScrollArea>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}

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

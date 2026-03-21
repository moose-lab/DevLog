"use client";

import { Droppable } from "@hello-pangea/dnd";
import { TaskCard } from "./task-card";
import { Badge } from "@/components/ui/badge";
import type { Task, TaskStatus, Session } from "@/core/types-dashboard";
import { cn } from "@/core/dashboard-utils";

const COLUMN_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: "Todo", color: "bg-slate-500" },
  in_progress: { label: "In Progress", color: "bg-blue-500" },
  done: { label: "Done", color: "bg-green-500" },
};

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  taskSessions?: Map<string, Session>;
  onDeleteTask: (id: string) => void;
  onClickTask: (task: Task) => void;
}

export function KanbanColumn({ status, tasks, taskSessions, onDeleteTask, onClickTask }: KanbanColumnProps) {
  const config = COLUMN_CONFIG[status];

  return (
    <div className="flex flex-col rounded-lg bg-muted/50 min-w-[280px] w-full">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <span className={cn("h-2 w-2 rounded-full", config.color)} />
        <h3 className="text-sm font-medium">{config.label}</h3>
        <Badge variant="secondary" className="ml-auto text-xs">
          {tasks.length}
        </Badge>
      </div>
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "flex-1 space-y-2 p-2 min-h-[200px] transition-colors",
              snapshot.isDraggingOver && "bg-accent/50"
            )}
          >
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                session={taskSessions?.get(task.id)}
                onDelete={onDeleteTask}
                onClick={onClickTask}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

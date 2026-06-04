"use client";

import { Droppable } from "@hello-pangea/dnd";
import { TaskCard } from "./task-card";
import { Badge } from "@/components/ui/badge";
import type { Task, TaskStatus, Session } from "@/core/types-dashboard";
import { cn } from "@/core/dashboard-utils";

const COLUMN_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  todo: { label: "Todo", color: "bg-slate-500" },
  in_queue: { label: "Queued", color: "bg-amber-500" },
  in_progress: { label: "In Progress", color: "bg-blue-500" },
  review: { label: "Review", color: "bg-purple-500" },
  blocked: { label: "Blocked", color: "bg-red-500" },
  fail: { label: "Failed", color: "bg-rose-500" },
  done: { label: "Done", color: "bg-green-500" },
};

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  taskSessions?: Map<string, Session>;
  onDeleteTask: (id: string) => void;
  onClickTask: (task: Task) => void;
  onExecuteTask?: (id: string) => void;
  onPauseTask?: (sessionId: string) => void;
}

interface KanbanGroupedColumnProps
  extends Omit<KanbanColumnProps, "status" | "tasks"> {
  label: string;
  sections: { status: TaskStatus; tasks: Task[] }[];
}

function KanbanTaskSection({
  status,
  tasks,
  taskSessions,
  onDeleteTask,
  onClickTask,
  onExecuteTask,
  onPauseTask,
  compact = false,
}: KanbanColumnProps & { compact?: boolean }) {
  return (
    <Droppable droppableId={status}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={cn(
            "space-y-2 transition-colors",
            compact ? "min-h-[96px]" : "flex-1 min-h-[200px] p-2",
            snapshot.isDraggingOver && "bg-accent/50",
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
              onExecute={onExecuteTask}
              onPause={onPauseTask}
            />
          ))}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
}

export function KanbanColumn(props: KanbanColumnProps) {
  const { status, tasks } = props;
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
      <KanbanTaskSection {...props} />
    </div>
  );
}

export function KanbanGroupedColumn({
  label,
  sections,
  taskSessions,
  onDeleteTask,
  onClickTask,
  onExecuteTask,
  onPauseTask,
}: KanbanGroupedColumnProps) {
  const totalTasks = sections.reduce((sum, section) => sum + section.tasks.length, 0);

  return (
    <div className="flex flex-col rounded-lg bg-muted/50 min-w-[280px] w-full">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        <span className="h-2 w-2 rounded-full bg-rose-500" />
        <h3 className="text-sm font-medium">{label}</h3>
        <Badge variant="secondary" className="ml-auto text-xs">
          {totalTasks}
        </Badge>
      </div>
      <div className="flex-1 space-y-3 p-2">
        {sections.map(({ status, tasks }) => {
          const config = COLUMN_CONFIG[status];

          return (
            <section key={status} className="space-y-2">
              <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <span className={cn("h-1.5 w-1.5 rounded-full", config.color)} />
                <span>{config.label}</span>
                <Badge variant="outline" className="ml-auto h-5 px-1.5 text-[10px]">
                  {tasks.length}
                </Badge>
              </div>
              <KanbanTaskSection
                status={status}
                tasks={tasks}
                taskSessions={taskSessions}
                onDeleteTask={onDeleteTask}
                onClickTask={onClickTask}
                onExecuteTask={onExecuteTask}
                onPauseTask={onPauseTask}
                compact
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}

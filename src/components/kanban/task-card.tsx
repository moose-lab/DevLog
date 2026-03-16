"use client";

import { Draggable } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Trash2, GitBranch, Terminal, ChevronRight } from "lucide-react";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  medium: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
};

interface TaskCardProps {
  task: Task;
  index: number;
  onDelete: (id: string) => void;
  onClick: (task: Task) => void;
}

export function TaskCard({ task, index, onDelete, onClick }: TaskCardProps) {
  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <Card
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={cn(
            "p-3 space-y-2 cursor-grab active:cursor-grabbing hover:border-primary/30 transition-colors",
            snapshot.isDragging && "ring-2 ring-primary shadow-lg"
          )}
          onClick={() => onClick(task)}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-medium leading-tight flex-1">
              {task.title}
            </span>
            <div className="flex items-center gap-0.5 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(task.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            </div>
          </div>
          {task.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {task.description}
            </p>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0", PRIORITY_COLORS[task.priority])}
            >
              {task.priority}
            </Badge>
            {task.worktree_name && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                <GitBranch className="h-2.5 w-2.5" />
                {task.worktree_name}
              </Badge>
            )}
            {task.session_id && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
                <Terminal className="h-2.5 w-2.5" />
                session
              </Badge>
            )}
            {task.prompt && !task.session_id && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground border-dashed">
                has prompt
              </Badge>
            )}
          </div>
        </Card>
      )}
    </Draggable>
  );
}

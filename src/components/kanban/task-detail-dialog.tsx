"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Play,
  Save,
  ExternalLink,
  Clock,
  Loader2,
  GitBranch,
  Terminal,
} from "lucide-react";
import type { Task, TaskPriority, TaskStatus, Worktree } from "@/core/types-dashboard";
import { cn } from "@/core/dashboard-utils";

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  medium: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  review: "Review",
  blocked: "Blocked",
  done: "Done",
};

interface TaskDetailDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, data: Partial<Task>) => Promise<void>;
  onLaunchSession: (task: Task, worktreePath: string, worktreeName?: string, branchName?: string) => Promise<{ id: string } | null>;
}

export function TaskDetailDialog({
  task,
  open,
  onOpenChange,
  onUpdate,
  onLaunchSession,
}: TaskDetailDialogProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [selectedWorktree, setSelectedWorktree] = useState("");

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setPriority(task.priority);
      setPrompt(task.prompt ?? "");
      setEditing(false);
    }
  }, [task]);

  // Load worktrees when dialog opens (for launching session)
  useEffect(() => {
    if (open) {
      fetch("/api/worktrees")
        .then((r) => (r.ok ? r.json() : []))
        .then((wts: Worktree[]) => {
          setWorktrees(wts);
          const main = wts.find((w: Worktree) => w.isMain);
          if (main) setSelectedWorktree(main.name);
          else if (wts.length > 0) setSelectedWorktree(wts[0].name);
        });
    }
  }, [open]);

  if (!task) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(task.id, {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        prompt: prompt.trim() || null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleLaunch = async () => {
    const taskPrompt = prompt.trim() || task.prompt;
    if (!taskPrompt) return;

    const wt = worktrees.find((w) => w.name === selectedWorktree);
    const mainWt = worktrees.find((w) => w.isMain);
    const worktreePath = wt?.path ?? mainWt?.path;
    if (!worktreePath) return;

    setLaunching(true);
    try {
      const session = await onLaunchSession(
        task,
        worktreePath,
        wt?.name,
        wt?.branch
      );
      if (session?.id) {
        onOpenChange(false);
        router.push(`/sessions/${session.id}`);
      }
    } finally {
      setLaunching(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleString();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0", PRIORITY_COLORS[task.priority])}
            >
              {task.priority}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {STATUS_LABELS[task.status]}
            </Badge>
            <DialogTitle className="sr-only">Task Detail</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          {editing ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-base font-medium"
              />
            </div>
          ) : (
            <h2
              className="text-base font-medium cursor-pointer hover:text-primary transition-colors"
              onClick={() => setEditing(true)}
            >
              {task.title}
            </h2>
          )}

          {/* Description */}
          {editing ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Task description..."
                rows={3}
                className="resize-none"
              />
            </div>
          ) : (
            <div
              className="cursor-pointer hover:bg-muted/50 rounded-md p-2 -m-2 transition-colors"
              onClick={() => setEditing(true)}
            >
              {task.description ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {task.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/50 italic">
                  Click to add description...
                </p>
              )}
            </div>
          )}

          {/* Priority (edit mode) */}
          {editing && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Prompt */}
          {editing ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Claude Code Prompt</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Prompt for Claude Code..."
                rows={4}
                className="resize-none font-mono text-xs"
              />
            </div>
          ) : task.prompt ? (
            <div
              className="cursor-pointer hover:bg-muted/50 rounded-md p-2 -m-2 transition-colors"
              onClick={() => setEditing(true)}
            >
              <Label className="text-xs text-muted-foreground mb-1 block">Prompt</Label>
              <p className="text-xs font-mono bg-muted/30 rounded p-2 whitespace-pre-wrap">
                {task.prompt}
              </p>
            </div>
          ) : null}

          {/* Edit actions */}
          {editing && (
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={!title.trim() || saving} size="sm">
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5 mr-1" />
                )}
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTitle(task.title);
                  setDescription(task.description ?? "");
                  setPriority(task.priority);
                  setPrompt(task.prompt ?? "");
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          )}

          {!editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-xs text-muted-foreground">
              Edit task...
            </Button>
          )}

          {/* Metadata */}
          <div className="border-t pt-3 space-y-2">
            {task.worktree_name && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                <span>{task.worktree_name}</span>
              </div>
            )}
            {task.session_id && (
              <div className="flex items-center gap-1.5 text-xs">
                <Terminal className="h-3 w-3 text-muted-foreground" />
                <button
                  className="text-primary hover:underline"
                  onClick={() => {
                    onOpenChange(false);
                    router.push(`/sessions/${task.session_id}`);
                  }}
                >
                  View session
                  <ExternalLink className="h-2.5 w-2.5 ml-0.5 inline" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Created {formatDate(task.created_at)}</span>
            </div>
            {task.completed_at && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Completed {formatDate(task.completed_at)}</span>
              </div>
            )}
          </div>

          {/* Launch session */}
          {!task.session_id && task.status !== "done" && (
            <div className="border-t pt-3 space-y-3">
              <Label className="text-xs text-muted-foreground">Launch Session from Task</Label>
              {worktrees.length > 1 && (
                <Select value={selectedWorktree} onValueChange={setSelectedWorktree}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select worktree" />
                  </SelectTrigger>
                  <SelectContent>
                    {worktrees.map((wt) => (
                      <SelectItem key={wt.name} value={wt.name}>
                        {wt.name}
                        <span className="ml-1.5 text-muted-foreground">({wt.branch})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                onClick={handleLaunch}
                disabled={launching || !(prompt.trim() || task.prompt)}
                size="sm"
                className="w-full"
              >
                {launching ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    Launching...
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Launch Session
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

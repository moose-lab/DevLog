"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  GitPullRequest,
  RefreshCw,
  Loader2,
  ExternalLink,
  CheckCircle2,
  FileCode2,
} from "lucide-react";
import type { Task } from "@/core/types-dashboard";

interface TaskReviewPanelProps {
  task: Task;
  onUpdate: (id: string, data: Partial<Task>) => Promise<void>;
}

export function TaskReviewPanel({ task, onUpdate }: TaskReviewPanelProps) {
  const router = useRouter();
  const [diff, setDiff] = useState<{ stat: string; diff: string } | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [creatingPr, setCreatingPr] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    if (task.worktree_name) {
      setLoadingDiff(true);
      fetch(`/api/worktrees/${task.worktree_name}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setDiff({ stat: data.diff ?? "", diff: data.log ?? "" });
        })
        .finally(() => setLoadingDiff(false));
    }
  }, [task.worktree_name]);

  const handleCreatePr = async () => {
    setCreatingPr(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/pr`, { method: "POST" });
      if (res.ok) {
        const { url } = await res.json();
        setPrUrl(url);
        await onUpdate(task.id, { status: "done" });
      }
    } finally {
      setCreatingPr(false);
    }
  };

  const handleRetry = async () => {
    if (!feedback.trim()) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedback.trim() }),
      });
      if (res.ok) {
        const { session } = await res.json();
        router.push(`/sessions/${session.id}`);
      }
    } finally {
      setRetrying(false);
    }
  };

  const handleMarkDone = async () => {
    await onUpdate(task.id, { status: "done" });
  };

  return (
    <div className="border-t pt-3 space-y-3">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        <FileCode2 className="h-3.5 w-3.5" />
        Review
      </Label>

      {/* Diff summary */}
      {loadingDiff ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading diff...
        </div>
      ) : diff?.stat ? (
        <ScrollArea className="max-h-[200px]">
          <pre className="text-[10px] font-mono bg-muted/30 rounded p-2 whitespace-pre-wrap">
            {diff.stat}
          </pre>
        </ScrollArea>
      ) : (
        <p className="text-xs text-muted-foreground">No changes found</p>
      )}

      {/* PR result */}
      {prUrl && (
        <div className="flex items-center gap-2 text-xs text-green-500">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <a href={prUrl} target="_blank" rel="noopener" className="hover:underline">
            PR created <ExternalLink className="h-3 w-3 inline ml-0.5" />
          </a>
        </div>
      )}

      {/* Actions */}
      {!prUrl && (
        <div className="flex gap-2">
          <Button
            onClick={handleCreatePr}
            disabled={creatingPr}
            size="sm"
            className="flex-1"
          >
            {creatingPr ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <GitPullRequest className="h-3.5 w-3.5 mr-1" />
            )}
            Create PR
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFeedback(!showFeedback)}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Retry
          </Button>
          <Button variant="ghost" size="sm" onClick={handleMarkDone}>
            Done
          </Button>
        </div>
      )}

      {/* Feedback for retry */}
      {showFeedback && (
        <div className="space-y-2">
          <Textarea
            placeholder="What should the agent fix or change?"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            className="resize-none text-xs"
          />
          <Button
            onClick={handleRetry}
            disabled={retrying || !feedback.trim()}
            size="sm"
            className="w-full"
          >
            {retrying ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Retry with Feedback
          </Button>
        </div>
      )}
    </div>
  );
}

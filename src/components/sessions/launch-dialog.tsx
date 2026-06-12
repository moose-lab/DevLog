"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import {
  DEFAULT_AGENT_TEAM_ID,
  DEFAULT_CODING_AGENT_ID,
} from "@/core/agent-presets";
import { AgentSelector } from "./agent-selector";
import { useAgentSettings } from "@/hooks/use-agent-settings";
import type { SessionRuntimeAuthInput } from "@/core/session-runtime-auth";
import type { Worktree } from "@/core/types-dashboard";

const EXAMPLE_PROMPTS = [
  "Fix the bug in...",
  "Add a new feature that...",
  "Refactor the code in...",
  "Write tests for...",
  "Explain how the code in... works",
];

interface LaunchDialogProps {
  onSubmit: (data: {
    worktree_name?: string;
    worktree_path: string;
    branch_name?: string;
    prompt: string;
    coding_agent_id: string;
    agent_team_id: string;
  } & SessionRuntimeAuthInput) => Promise<{ id: string } | null>;
}

export function LaunchDialog({ onSubmit }: LaunchDialogProps) {
  // Stable per-mount example (was re-randomized on every render)
  const examplePrompt = useMemo(
    () => EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)],
    [],
  );
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [selectedWorktree, setSelectedWorktree] = useState("");
  const [codingAgentId, setCodingAgentId] = useState(DEFAULT_CODING_AGENT_ID);
  const [agentTeamId, setAgentTeamId] = useState(DEFAULT_AGENT_TEAM_ID);
  const [prompt, setPrompt] = useState("");
  const [launching, setLaunching] = useState(false);
  const { settings, runtimePayload, byokReady, loaded, settingsReady } =
    useAgentSettings();

  useEffect(() => {
    if (open) {
      fetch("/api/worktrees")
        .then((r) => (r.ok ? r.json() : []))
        .then((wts: Worktree[]) => {
          setWorktrees(wts);
          // Auto-select the main worktree for convenience
          const main = wts.find((w) => w.isMain);
          if (main && !selectedWorktree) {
            setSelectedWorktree(main.name);
          } else if (wts.length === 1 && !selectedWorktree) {
            setSelectedWorktree(wts[0].name);
          }
        });
    }
  }, [open, selectedWorktree]);

  const handleSubmit = async () => {
    if (!settingsReady) return;
    if (!prompt.trim() || launching) return;

    const wt = worktrees.find((w) => w.name === selectedWorktree);
    // Use selected worktree or fall back to main worktree path
    const mainWt = worktrees.find((w) => w.isMain);
    const worktreePath = wt?.path ?? mainWt?.path;
    if (!worktreePath) return;

    setLaunching(true);
    try {
      const session = await onSubmit({
        worktree_name: wt?.name,
        worktree_path: worktreePath,
        branch_name: wt?.branch,
        prompt: prompt.trim(),
        coding_agent_id: codingAgentId,
        agent_team_id: agentTeamId,
        ...runtimePayload,
      });

      setPrompt("");
      setSelectedWorktree("");
      setOpen(false);

      // Navigate directly to the new session
      if (session?.id) {
        router.push(`/sessions/${session.id}`);
      }
    } finally {
      setLaunching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Session
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>New Coding Agent Session</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>What should the agent do?</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={examplePrompt}
              rows={5}
              autoFocus
              className="resize-none"
            />
            <p className="text-[10px] text-muted-foreground">
              Describe the task clearly. The selected agent will work in an isolated session.
            </p>
          </div>

          {worktrees.length > 1 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Worktree</Label>
              <Select value={selectedWorktree} onValueChange={setSelectedWorktree}>
                <SelectTrigger className="h-9">
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
            </div>
          )}

          <AgentSelector
            codingAgentId={codingAgentId}
            agentTeamId={agentTeamId}
            runtimeSettings={settings}
            onCodingAgentChange={setCodingAgentId}
            onAgentTeamChange={setAgentTeamId}
          />

          <Button
            onClick={handleSubmit}
            disabled={!prompt.trim() || launching || !settingsReady}
            className="w-full"
          >
            {launching ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Launching...
              </>
            ) : !loaded ? (
              <>Loading Settings...</>
            ) : !byokReady ? (
              <>Add API key in Settings</>
            ) : (
              <>Start Session</>
            )}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            {"\u2318"}+Enter to launch
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { useWorktrees } from "@/hooks/use-worktrees";
import { WorktreeCard } from "@/components/worktrees/worktree-card";
import { DiffViewer } from "@/components/worktrees/diff-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";

export default function WorktreesPage() {
  const { worktrees, loading, createWorktree, removeWorktree } = useWorktrees();
  const [selected, setSelected] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBranch, setNewBranch] = useState("");

  const handleCreate = async () => {
    if (!newName.trim() || !newBranch.trim()) return;
    try {
      await createWorktree(newName.trim(), newBranch.trim());
      setNewName("");
      setNewBranch("");
      setDialogOpen(false);
    } catch {
      // error handling could go here
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[120px] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Worktree
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Worktree</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. feature-auth"
                />
              </div>
              <div className="space-y-2">
                <Label>Branch</Label>
                <Input
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  placeholder="e.g. feat/auth"
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={!newName.trim() || !newBranch.trim()}
                className="w-full"
              >
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {worktrees.map((wt) => (
          <WorktreeCard
            key={wt.name}
            worktree={wt}
            onRemove={removeWorktree}
            onSelect={setSelected}
          />
        ))}
      </div>

      <DiffViewer worktreeName={selected} />
    </div>
  );
}

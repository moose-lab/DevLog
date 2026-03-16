"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitBranch, FileText, Trash2 } from "lucide-react";
import type { Worktree } from "@/lib/types";

interface WorktreeCardProps {
  worktree: Worktree;
  onRemove: (name: string) => void;
  onSelect: (name: string) => void;
}

export function WorktreeCard({ worktree, onRemove, onSelect }: WorktreeCardProps) {
  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => onSelect(worktree.name)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-sm font-medium">{worktree.name}</CardTitle>
          {!worktree.isMain && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(worktree.name);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GitBranch className="h-3 w-3" />
          <span>{worktree.branch}</span>
        </div>
        {worktree.filesChanged !== undefined && worktree.filesChanged > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3 w-3" />
            <span>{worktree.filesChanged} files changed</span>
          </div>
        )}
        {worktree.isMain && (
          <Badge variant="secondary" className="text-[10px]">
            main
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

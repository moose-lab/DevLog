"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

interface WorktreeDetail {
  name: string;
  branch: string;
  diff: string;
  log: string;
}

interface DiffViewerProps {
  worktreeName: string | null;
}

export function DiffViewer({ worktreeName }: DiffViewerProps) {
  const [detail, setDetail] = useState<WorktreeDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!worktreeName) {
      setDetail(null);
      return;
    }
    setLoading(true);
    fetch(`/api/worktrees/${encodeURIComponent(worktreeName)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDetail(data))
      .finally(() => setLoading(false));
  }, [worktreeName]);

  if (!worktreeName) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
          Select a worktree to view details
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return <Skeleton className="h-[300px] rounded-lg" />;
  }

  if (!detail) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{detail.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="diff">
          <TabsList>
            <TabsTrigger value="diff">Diff</TabsTrigger>
            <TabsTrigger value="log">Log</TabsTrigger>
          </TabsList>
          <TabsContent value="diff">
            <ScrollArea className="h-[250px]">
              <pre className="text-xs font-mono whitespace-pre-wrap p-3 bg-muted rounded-md">
                {detail.diff || "No changes"}
              </pre>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="log">
            <ScrollArea className="h-[250px]">
              <pre className="text-xs font-mono whitespace-pre-wrap p-3 bg-muted rounded-md">
                {detail.log || "No commits"}
              </pre>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

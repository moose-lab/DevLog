"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import type { FileLock } from "@/core/types-dashboard";

interface LockTableProps {
  locks: FileLock[];
  onResolve: (filePath: string, worktreeName?: string) => void;
}

export function LockTable({ locks, onResolve }: LockTableProps) {
  if (locks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No active file locks.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>File</TableHead>
          <TableHead>Worktree</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Detected</TableHead>
          <TableHead className="w-[80px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {locks.map((lock) => (
          <TableRow key={lock.id}>
            <TableCell className="font-mono text-xs">{lock.file_path}</TableCell>
            <TableCell>
              <Badge variant="secondary" className="text-xs">
                {lock.worktree_name}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge
                variant={lock.lock_type === "conflict" ? "destructive" : "outline"}
                className="text-xs"
              >
                {lock.lock_type}
              </Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(lock.detected_at).toLocaleTimeString()}
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onResolve(lock.file_path, lock.worktree_name)}
              >
                <Check className="h-3 w-3" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

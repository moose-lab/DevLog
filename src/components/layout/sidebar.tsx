"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  KanbanSquare,
  Terminal,
  GitBranch,
  Lock,
  BarChart3,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjects } from "@/hooks/use-projects";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: KanbanSquare },
  { href: "/sessions", label: "Sessions", icon: Terminal },
  { href: "/worktrees", label: "Worktrees", icon: GitBranch },
  { href: "/locks", label: "Locks", icon: Lock },
  { href: "/devlog", label: "DevLog", icon: BarChart3 },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { projects, activeId, switchProject } = useProjects();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Terminal className="h-5 w-5 text-sidebar-primary" />
        <span className="font-semibold text-sidebar-foreground">DevTool</span>
      </div>
      {/* Project context */}
      <div className="border-b border-border px-4 py-2">
        {projects.length > 1 ? (
          <Select value={activeId} onValueChange={switchProject}>
            <SelectTrigger className="h-8 text-xs">
              <FolderOpen className="h-3 w-3 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FolderOpen className="h-3 w-3" />
            <span>{projects[0]?.name ?? "No project"}</span>
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3 text-xs text-muted-foreground">
        Port 3333 &middot; Local Only
      </div>
    </aside>
  );
}

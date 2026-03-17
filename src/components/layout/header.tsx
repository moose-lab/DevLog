"use client";

import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/tasks": "Tasks",
  "/sessions": "Sessions",
  "/worktrees": "Worktrees",
  "/locks": "Locks",
  "/devlog": "DevLog",
};

export function Header() {
  const pathname = usePathname();
  const title =
    PAGE_TITLES[pathname] ??
    Object.entries(PAGE_TITLES).find(([k]) => k !== "/" && pathname.startsWith(k))?.[1] ??
    "DevLog";

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          Connected
        </span>
      </div>
    </header>
  );
}

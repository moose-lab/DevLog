"use client";

import { useState } from "react";
import { useVcc } from "@/hooks/use-vcc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Search, FileText, ListTree, Loader2 } from "lucide-react";
import { cn } from "@/core/dashboard-utils";

interface SessionVccProps {
  sessionId: string;
  isActive: boolean;
}

type VccTab = "brief" | "full" | "search";

export function SessionVcc({ sessionId, isActive }: SessionVccProps) {
  const [tab, setTab] = useState<VccTab>("brief");
  const [grep, setGrep] = useState("");
  const [activeGrep, setActiveGrep] = useState<string | undefined>();

  const { data, loading, refresh } = useVcc(
    sessionId,
    isActive,
    tab === "search" ? activeGrep : undefined
  );

  const content =
    tab === "full"
      ? data?.full
      : tab === "brief"
        ? data?.brief
        : data?.search;

  const handleSearch = () => {
    if (grep.trim()) {
      setActiveGrep(grep.trim());
    }
  };

  const tabs: { id: VccTab; label: string; icon: React.ReactNode }[] = [
    { id: "brief", label: "Brief", icon: <ListTree className="h-3.5 w-3.5" /> },
    { id: "full", label: "Full", icon: <FileText className="h-3.5 w-3.5" /> },
    { id: "search", label: "Search", icon: <Search className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b px-2 py-1.5 shrink-0">
        {tabs.map((t) => (
          <Button
            key={t.id}
            variant={tab === t.id ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            {t.label}
          </Button>
        ))}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Search input (only for search tab) */}
      {tab === "search" && (
        <div className="flex gap-2 px-3 py-2 border-b shrink-0">
          <Input
            placeholder="Regex pattern..."
            value={grep}
            onChange={(e) => setGrep(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="h-8 text-xs font-mono"
          />
          <Button size="sm" className="h-8" onClick={handleSearch}>
            Search
          </Button>
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1">
        {loading && !content ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Compiling...
          </div>
        ) : content ? (
          <pre className="p-3 text-xs font-mono whitespace-pre-wrap leading-relaxed">
            {content.split("\n").map((line, i) => {
              const isError =
                /error|Error|FAIL|failed|exception/i.test(line) &&
                !/\berror\b.*=\s*0/i.test(line);
              return (
                <div
                  key={i}
                  className={cn(
                    isError && "text-destructive bg-destructive/10 -mx-3 px-3 border-l-2 border-destructive"
                  )}
                >
                  {line || "\u00A0"}
                </div>
              );
            })}
          </pre>
        ) : (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            {tab === "search"
              ? "Enter a search pattern and press Enter"
              : "No transcript available yet"}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

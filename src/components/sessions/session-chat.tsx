"use client";

import { useEffect, useRef, useState } from "react";
import {
  useSessionChat,
  type ChatMsg,
  type PermissionRequest,
} from "@/hooks/use-session-chat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ReactMarkdown from "react-markdown";
import {
  Send,
  ChevronDown,
  ChevronRight,
  Loader2,
  FileText,
  Terminal as TerminalIcon,
  Search,
  Pencil,
  AlertCircle,
  ShieldQuestion,
  Check,
  X,
  Clock,
  ListOrdered,
} from "lucide-react";
import { cn } from "@/core/dashboard-utils";

// Tool icon mapping
function ToolIcon({ name }: { name: string }) {
  switch (name) {
    case "Read":
    case "Glob":
      return <FileText className="h-3.5 w-3.5" />;
    case "Bash":
      return <TerminalIcon className="h-3.5 w-3.5" />;
    case "Grep":
    case "WebSearch":
      return <Search className="h-3.5 w-3.5" />;
    case "Write":
    case "Edit":
    case "NotebookEdit":
      return <Pencil className="h-3.5 w-3.5" />;
    default:
      return <TerminalIcon className="h-3.5 w-3.5" />;
  }
}

// Format tool input for display
function formatToolInput(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "Read":
      return String(input.file_path ?? "");
    case "Write":
    case "Edit":
      return String(input.file_path ?? "");
    case "Bash":
      return String(input.command ?? "").slice(0, 120);
    case "Glob":
      return String(input.pattern ?? "");
    case "Grep":
      return String(input.pattern ?? "");
    case "WebSearch":
      return String(input.query ?? "");
    default:
      return Object.keys(input).slice(0, 2).join(", ");
  }
}

// Collapsible tool call block
function ToolCallBlock({
  name,
  input,
  result,
}: {
  name: string;
  input: Record<string, unknown>;
  result?: { output: string; is_error?: boolean };
}) {
  const [open, setOpen] = useState(false);
  const label = formatToolInput(name, input);

  return (
    <div className="my-1.5 rounded border border-border/50 bg-muted/30 text-xs">
      <button
        className="flex items-center gap-2 w-full px-2.5 py-1.5 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <ToolIcon name={name} />
        <span className="font-medium text-foreground/80">{name}</span>
        {label && (
          <span className="text-muted-foreground truncate">{label}</span>
        )}
        {result?.is_error && (
          <AlertCircle className="h-3 w-3 text-destructive shrink-0 ml-auto" />
        )}
      </button>
      {open && result && (
        <div className="border-t border-border/50 px-2.5 py-2 max-h-[200px] overflow-auto">
          <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground leading-relaxed">
            {result.output.slice(0, 2000)}
            {result.output.length > 2000 && "\n... (truncated)"}
          </pre>
        </div>
      )}
    </div>
  );
}

// Permission prompt component — shown when Claude needs user approval
function PermissionPrompt({
  permission,
  onRespond,
}: {
  permission: PermissionRequest;
  onRespond: (approved: boolean) => void;
}) {
  const label = formatToolInput(permission.toolName, permission.toolInput);

  return (
    <div className="px-4 py-2">
      <div className="rounded-xl border-2 border-amber-500/50 bg-amber-500/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <ShieldQuestion className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Permission Required
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Claude wants to use{" "}
              <span className="font-mono font-medium text-foreground/80">
                {permission.toolName}
              </span>
            </p>
            {label && (
              <div className="mt-2 rounded bg-muted/50 px-2.5 py-1.5">
                <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap break-all">
                  {label}
                </pre>
              </div>
            )}
            {Object.keys(permission.toolInput).length > 0 && !label && (
              <div className="mt-2 rounded bg-muted/50 px-2.5 py-1.5 max-h-[120px] overflow-auto">
                <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap">
                  {JSON.stringify(permission.toolInput, null, 2).slice(0, 500)}
                </pre>
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="default"
                className="h-7 gap-1.5 text-xs bg-green-600 hover:bg-green-700"
                onClick={() => onRespond(true)}
              >
                <Check className="h-3.5 w-3.5" />
                Allow
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 gap-1.5 text-xs"
                onClick={() => onRespond(false)}
              >
                <X className="h-3.5 w-3.5" />
                Deny
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Single message bubble
function MessageBubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";

  return (
    <div className={cn("px-4 py-2", isUser ? "flex justify-end" : "")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-4 py-2.5",
          isUser
            ? msg.isQueued
              ? "bg-primary/50 text-primary-foreground border border-dashed border-primary-foreground/30"
              : "bg-primary text-primary-foreground"
            : "bg-muted/40"
        )}
      >
        {isUser ? (
          <div>
            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            {msg.isQueued && (
              <div className="flex items-center gap-1 mt-1 text-[10px] opacity-70">
                <Clock className="h-2.5 w-2.5" />
                <span>Queued — will send when current turn finishes</span>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Tool calls (shown before the text response) */}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="mb-2">
                {msg.toolCalls.map((tc, i) => (
                  <ToolCallBlock
                    key={i}
                    name={tc.name}
                    input={tc.input}
                    result={msg.toolResults?.[i]}
                  />
                ))}
              </div>
            )}
            <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:bg-background/50 [&_pre]:rounded [&_pre]:p-2.5 [&_pre]:text-xs [&_code]:text-xs [&_code]:bg-background/30 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
            {msg.costUsd !== undefined && (
              <p className="text-[10px] text-muted-foreground mt-2">
                ${msg.costUsd.toFixed(4)}
                {msg.durationMs !== undefined && ` · ${(msg.durationMs / 1000).toFixed(1)}s`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Streaming indicator while Claude is responding
function StreamingBubble({
  text,
  tools,
  toolResults,
}: {
  text: string;
  tools: { name: string; input: Record<string, unknown> }[];
  toolResults: { name: string; output: string; is_error?: boolean }[];
}) {
  // Show the current tool being used
  const currentTool = tools.length > toolResults.length ? tools[tools.length - 1] : null;

  return (
    <div className="px-4 py-2">
      <div className="max-w-[85%] rounded-xl px-4 py-2.5 bg-muted/40">
        {tools.length > 0 && (
          <div className="mb-2">
            {tools.map((tc, i) => (
              <ToolCallBlock
                key={i}
                name={tc.name}
                input={tc.input}
                result={toolResults[i]}
              />
            ))}
          </div>
        )}
        {text ? (
          <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:bg-background/50 [&_pre]:rounded [&_pre]:p-2.5 [&_pre]:text-xs [&_code]:text-xs [&_code]:bg-background/30 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>
              {currentTool
                ? `Using ${currentTool.name}...`
                : "Thinking..."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Main session chat component
interface SessionChatProps {
  sessionId: string;
  isActive: boolean;
}

export function SessionChat({ sessionId, isActive }: SessionChatProps) {
  const {
    messages,
    streamingText,
    streamingTools,
    streamingToolResults,
    connected,
    processing,
    sessionStatus,
    error,
    sendMessage,
    pendingPermission,
    respondToPermission,
    queuedCount,
  } = useSessionChat(sessionId);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Input is always available unless the session has ended
  const sessionEnded =
    sessionStatus === "completed" || sessionStatus === "killed";
  const canSend = isActive && !sessionEnded;

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingText, streamingTools, pendingPermission, autoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAutoScroll(atBottom);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || !canSend) return;
    setSending(true);
    setInput("");
    try {
      await sendMessage(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Build status text
  const getStatusText = () => {
    if (pendingPermission) return "Waiting for approval...";
    if (processing) {
      const currentTool =
        streamingTools.length > streamingToolResults.length
          ? streamingTools[streamingTools.length - 1]
          : null;
      if (currentTool) return `Using ${currentTool.name}...`;
      return "Working...";
    }
    if (connected) return "Ready";
    return "Reconnecting...";
  };

  const getStatusColor = () => {
    if (pendingPermission) return "bg-amber-500";
    if (processing) return "bg-blue-500 animate-pulse";
    if (connected) return "bg-green-500";
    return "bg-red-500";
  };

  return (
    <div className="relative flex flex-col flex-1 min-h-0 rounded-lg border border-border overflow-hidden bg-background">
      {/* Status bar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-1.5 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", getStatusColor())} />
          <span className="text-xs text-muted-foreground">
            {getStatusText()}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {queuedCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ListOrdered className="h-3 w-3" />
              <span>{queuedCount} queued</span>
            </div>
          )}
          <span className="text-xs text-muted-foreground">
            {messages.length} message{messages.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto py-4"
      >
        {messages.length === 0 && !processing && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Starting session...
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        {/* Streaming response */}
        {processing && (
          <StreamingBubble
            text={streamingText}
            tools={streamingTools}
            toolResults={streamingToolResults}
          />
        )}

        {/* Permission prompt */}
        {pendingPermission && (
          <PermissionPrompt
            permission={pendingPermission}
            onRespond={(approved) => respondToPermission(approved)}
          />
        )}

        {/* Error display */}
        {error && (
          <div className="px-4 py-2">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Scroll-to-bottom button */}
      {!autoScroll && (
        <div className="absolute bottom-24 right-4 z-10">
          <Button
            variant="secondary"
            size="icon"
            className="rounded-full shadow-lg h-8 w-8"
            onClick={() => {
              setAutoScroll(true);
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Input area — always available unless session ended */}
      {canSend ? (
        <div className="shrink-0 border-t border-border p-3 bg-muted/10">
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                processing
                  ? "Type to queue a follow-up message..."
                  : "Send a message..."
              }
              className="flex-1 min-h-[44px] max-h-[160px] resize-none text-sm"
              rows={1}
              disabled={sending}
              autoFocus
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              size="icon"
              className="h-[44px] w-[44px] shrink-0"
            >
              {processing ? (
                <ListOrdered className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-1.5 px-1">
            {processing
              ? "Message will be queued and sent when current turn finishes"
              : "Enter to send, Shift+Enter for new line"}
          </p>
        </div>
      ) : (
        <div className="shrink-0 border-t border-border px-4 py-3 bg-muted/10 text-center">
          <p className="text-xs text-muted-foreground">Session ended</p>
        </div>
      )}
    </div>
  );
}

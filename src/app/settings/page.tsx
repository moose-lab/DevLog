"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  Server,
} from "lucide-react";
import {
  AGENT_MODEL_OPTIONS,
  type AgentExecutionMode,
} from "@/core/agent-settings";
import { cn } from "@/core/dashboard-utils";
import { useAgentSettings } from "@/hooks/use-agent-settings";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EXECUTION_OPTIONS: Array<{
  id: AgentExecutionMode;
  label: string;
  description: string;
  icon: typeof Laptop;
}> = [
  {
    id: "local-cli",
    label: "Local code-agent CLI",
    description: "Use the locally authenticated Claude Code runtime.",
    icon: Laptop,
  },
  {
    id: "anthropic-api",
    label: "Anthropic API (BYOK)",
    description: "Use an Anthropic API key saved in this browser.",
    icon: Server,
  },
];

export default function SettingsPage() {
  const { settings, setSettings, byokReady } = useAgentSettings();
  const [showApiKey, setShowApiKey] = useState(false);

  const selectedModel = useMemo(
    () =>
      AGENT_MODEL_OPTIONS.find((model) => model.id === settings.model) ??
      AGENT_MODEL_OPTIONS[0],
    [settings.model],
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure how DevLog launches coding agents for Tasks and Sessions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Execution & model</CardTitle>
          <CardDescription>
            Choose between a local code-agent CLI and the Anthropic API (BYOK).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            {EXECUTION_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = settings.executionMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={cn(
                    "flex min-h-[104px] items-start gap-3 rounded-lg border p-4 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/20 hover:bg-muted/40",
                  )}
                  onClick={() => setSettings({ executionMode: option.id })}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 items-center justify-center rounded-md border",
                      selected
                        ? "border-primary/40 bg-primary/20 text-primary"
                        : "border-border bg-background text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {option.label}
                      {selected && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      )}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
            <div className="space-y-1.5">
              <Label htmlFor="agent-model">Model</Label>
              <Select
                value={settings.model}
                onValueChange={(model) => setSettings({ model })}
              >
                <SelectTrigger id="agent-model" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_MODEL_OPTIONS.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {selectedModel.description}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="anthropic-api-key">Anthropic API key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="anthropic-api-key"
                    type={showApiKey ? "text" : "password"}
                    value={settings.anthropicApiKey}
                    onChange={(event) =>
                      setSettings({ anthropicApiKey: event.currentTarget.value })
                    }
                    placeholder="sk-ant-..."
                    className="pl-9 font-mono text-xs"
                    autoComplete="off"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  onClick={() => setShowApiKey((value) => !value)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your API key is stored only in this browser.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  byokReady ? "bg-emerald-500" : "bg-amber-500",
                )}
              />
              {settings.executionMode === "anthropic-api" && !byokReady
                ? "API key required before launching BYOK sessions"
                : "Settings saved locally"}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

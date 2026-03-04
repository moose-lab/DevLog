/**
 * Generate realistic Claude Code session data for testing DevLog.
 * Now with: varied timestamps, cost data, multiple models, error scenarios.
 */
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { randomUUID } from "crypto";

const CLAUDE_DIR = join(homedir(), ".claude", "projects");

// Clean previous test data
try {
  rmSync(CLAUDE_DIR, { recursive: true, force: true });
} catch {}

const projects = [
  {
    encoded: "-home-ubuntu-projects-stripe-checkout",
    sessions: [
      {
        hoursAgo: 1.5,
        messages: [
          {
            role: "human" as const,
            text: "Help me set up Stripe checkout for my Next.js app. I need a simple payment flow with a product page and checkout session.",
          },
          {
            role: "assistant" as const,
            text: "I'll help you set up Stripe checkout in your Next.js app. Let me start by looking at your project structure.",
            model: "claude-sonnet-4-20250514",
            costUSD: 0.0082,
            durationMs: 2340,
            tools: [
              { name: "Read", input: { file_path: "package.json" }, output: '{"name":"my-store","dependencies":{"next":"14.0.0"}}' },
              { name: "Write", input: { file_path: "lib/stripe.ts", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "app/api/checkout/route.ts", content: "..." }, output: "File written" },
              { name: "Bash", input: { command: "npm install stripe @stripe/stripe-js" }, output: "added 2 packages" },
            ],
          },
          {
            role: "human" as const,
            text: "Now add a webhook handler to process successful payments and update the database",
          },
          {
            role: "assistant" as const,
            text: "I'll create a webhook endpoint to handle Stripe events, particularly the checkout.session.completed event.",
            model: "claude-sonnet-4-20250514",
            costUSD: 0.0124,
            durationMs: 3100,
            tools: [
              { name: "Write", input: { file_path: "app/api/webhooks/stripe/route.ts", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "lib/db.ts", content: "..." }, output: "File written" },
              { name: "Bash", input: { command: "npx stripe listen --forward-to localhost:3000/api/webhooks/stripe" }, output: "Ready!" },
            ],
          },
          {
            role: "human" as const,
            text: "Add error handling and retry logic for failed webhook deliveries",
          },
          {
            role: "assistant" as const,
            text: "Good thinking. I'll add robust error handling with exponential backoff retry logic.",
            model: "claude-sonnet-4-20250514",
            costUSD: 0.0095,
            durationMs: 2800,
            tools: [
              { name: "Read", input: { file_path: "app/api/webhooks/stripe/route.ts" }, output: "..." },
              { name: "Write", input: { file_path: "app/api/webhooks/stripe/route.ts", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "lib/retry.ts", content: "..." }, output: "File written" },
            ],
          },
        ],
      },
      {
        hoursAgo: 4,
        messages: [
          {
            role: "human" as const,
            text: "The Stripe checkout is redirecting to a blank page after payment. Debug this.",
          },
          {
            role: "assistant" as const,
            text: "Let me investigate. I'll check the checkout route, environment variables, and client-side redirect logic.",
            model: "claude-sonnet-4-20250514",
            costUSD: 0.0067,
            durationMs: 1900,
            tools: [
              { name: "Read", input: { file_path: "app/api/checkout/route.ts" }, output: "..." },
              { name: "Bash", input: { command: "cat .env.local" }, output: "STRIPE_SECRET_KEY=sk_test_...\nNEXT_PUBLIC_URL=" },
              { name: "Read", input: { file_path: "app/checkout/page.tsx" }, output: "..." },
            ],
          },
          {
            role: "assistant" as const,
            text: "Found it! Your NEXT_PUBLIC_URL is empty, causing invalid redirect URLs. Let me fix that and also add validation.",
            model: "claude-sonnet-4-20250514",
            costUSD: 0.0043,
            durationMs: 1200,
            tools: [
              { name: "Write", input: { file_path: ".env.local", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "app/api/checkout/route.ts", content: "..." }, output: "File written" },
            ],
          },
        ],
      },
    ],
  },
  {
    encoded: "-home-ubuntu-projects-ai-chatbot",
    sessions: [
      {
        hoursAgo: 0.5,
        messages: [
          {
            role: "human" as const,
            text: "I want to build a RAG chatbot using LangChain and Pinecone. Start with the vector store setup and document ingestion pipeline.",
          },
          {
            role: "assistant" as const,
            text: "I'll set up a complete RAG pipeline with LangChain and Pinecone. Starting with project structure, dependencies, and the vector store.",
            model: "claude-sonnet-4-20250514",
            costUSD: 0.0156,
            durationMs: 4200,
            tools: [
              { name: "Bash", input: { command: "pip install langchain pinecone-client openai tiktoken" }, output: "Successfully installed..." },
              { name: "Write", input: { file_path: "src/vectorstore.py", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "src/ingest.py", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "src/embeddings.py", content: "..." }, output: "File written" },
              { name: "Bash", input: { command: "python src/ingest.py --dir ./docs" }, output: "Ingested 42 documents, 156 chunks" },
            ],
          },
          {
            role: "human" as const,
            text: "Now create the chat chain with conversation memory and streaming support",
          },
          {
            role: "assistant" as const,
            text: "I'll create a conversational retrieval chain with memory and add streaming for real-time responses.",
            model: "claude-sonnet-4-20250514",
            costUSD: 0.0112,
            durationMs: 3400,
            tools: [
              { name: "Write", input: { file_path: "src/chain.py", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "src/streaming.py", content: "..." }, output: "File written" },
              { name: "Bash", input: { command: "python -c \"from src.chain import create_chain; print('OK')\"" }, output: "OK" },
            ],
          },
          {
            role: "human" as const,
            text: "Add a FastAPI server with WebSocket support for real-time chat",
          },
          {
            role: "assistant" as const,
            text: "I'll create a FastAPI server with both REST and WebSocket endpoints for the chatbot.",
            model: "claude-sonnet-4-20250514",
            costUSD: 0.0089,
            durationMs: 2600,
            tools: [
              { name: "Write", input: { file_path: "src/server.py", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "src/websocket.py", content: "..." }, output: "File written" },
              { name: "Bash", input: { command: "uvicorn src.server:app --reload --port 8000" }, output: "INFO: Uvicorn running on http://127.0.0.1:8000" },
            ],
          },
        ],
      },
      {
        hoursAgo: 26,
        messages: [
          {
            role: "human" as const,
            text: "The chatbot is returning irrelevant results. Help me tune the retrieval parameters and add re-ranking.",
          },
          {
            role: "assistant" as const,
            text: "Let me analyze the retrieval quality and implement a re-ranking step using Cohere's reranker.",
            model: "claude-sonnet-4-20250514",
            costUSD: 0.0198,
            durationMs: 5100,
            tools: [
              { name: "Read", input: { file_path: "src/vectorstore.py" }, output: "..." },
              { name: "Bash", input: { command: "pip install cohere" }, output: "Successfully installed cohere" },
              { name: "Write", input: { file_path: "src/reranker.py", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "src/chain.py", content: "..." }, output: "File written" },
              { name: "Bash", input: { command: "python tests/test_retrieval.py" }, output: "PASS: 8/10 queries returned relevant results (was 5/10)", error: false },
            ],
          },
        ],
      },
    ],
  },
  {
    encoded: "-home-ubuntu-projects-devlog",
    sessions: [
      {
        hoursAgo: 0.2,
        messages: [
          {
            role: "human" as const,
            text: "Let's build the DevLog CLI tool. Start with the project scaffold using TypeScript, Commander.js, and tsup for bundling.",
          },
          {
            role: "assistant" as const,
            text: "Great idea! I'll set up a clean TypeScript CLI project. This will be the foundation for everything else.",
            model: "claude-sonnet-4-20250514",
            costUSD: 0.0073,
            durationMs: 2100,
            tools: [
              { name: "Bash", input: { command: "mkdir -p devlog/src/{commands,core,utils}" }, output: "" },
              { name: "Bash", input: { command: "cd devlog && npm init -y && pnpm add commander chalk ora" }, output: "..." },
              { name: "Write", input: { file_path: "src/cli.ts", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "tsconfig.json", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "tsup.config.ts", content: "..." }, output: "File written" },
            ],
          },
          {
            role: "human" as const,
            text: "Now implement the JSONL parser that can stream-read Claude Code's session files",
          },
          {
            role: "assistant" as const,
            text: "I'll create a streaming JSONL parser that handles all event types in Claude Code's format.",
            model: "claude-sonnet-4-20250514",
            costUSD: 0.0134,
            durationMs: 3800,
            tools: [
              { name: "Write", input: { file_path: "src/core/types.ts", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "src/core/parser.ts", content: "..." }, output: "File written" },
              { name: "Bash", input: { command: "pnpm build" }, output: "Build success in 17ms" },
            ],
          },
        ],
      },
    ],
  },
  {
    encoded: "-home-ubuntu-projects-portfolio-site",
    sessions: [
      {
        hoursAgo: 72,
        messages: [
          {
            role: "human" as const,
            text: "Create a minimal portfolio site with Astro. Dark theme, fast, accessible.",
          },
          {
            role: "assistant" as const,
            text: "I'll create a clean, performant portfolio using Astro with a dark theme and full accessibility.",
            model: "claude-sonnet-4-20250514",
            costUSD: 0.0210,
            durationMs: 6200,
            tools: [
              { name: "Bash", input: { command: "npm create astro@latest portfolio -- --template minimal" }, output: "Project created" },
              { name: "Write", input: { file_path: "src/layouts/Base.astro", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "src/pages/index.astro", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "src/styles/global.css", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "src/components/Header.astro", content: "..." }, output: "File written" },
              { name: "Write", input: { file_path: "src/components/ProjectCard.astro", content: "..." }, output: "File written" },
            ],
          },
        ],
      },
    ],
  },
];

// ── Generate ────────────────────────────────────────────

function generateSessionJsonl(
  session: (typeof projects)[0]["sessions"][0]
): string {
  const lines: string[] = [];
  const sessionId = randomUUID();
  const baseTime = Date.now() - session.hoursAgo * 3600 * 1000;
  let timeOffset = 0;

  for (const msg of session.messages) {
    timeOffset += 3000 + Math.random() * 8000;
    const timestamp = new Date(baseTime + timeOffset).toISOString();

    if (msg.role === "human") {
      lines.push(
        JSON.stringify({
          type: "human",
          uuid: randomUUID(),
          sessionId,
          timestamp,
          content: [{ type: "text", text: msg.text }],
        })
      );
    } else if (msg.role === "assistant") {
      const content: any[] = [{ type: "text", text: msg.text }];

      if (msg.tools) {
        for (const tool of msg.tools) {
          const toolUseId = `toolu_${randomUUID().slice(0, 20)}`;

          content.push({
            type: "tool_use",
            id: toolUseId,
            name: tool.name,
            input: tool.input,
          });

          timeOffset += 500 + Math.random() * 2000;
          const resultTimestamp = new Date(baseTime + timeOffset).toISOString();

          lines.push(
            JSON.stringify({
              type: "human",
              uuid: randomUUID(),
              sessionId,
              timestamp: resultTimestamp,
              content: [
                {
                  type: "tool_result",
                  tool_use_id: toolUseId,
                  content: tool.output,
                  is_error: (tool as any).error === true,
                },
              ],
            })
          );
        }
      }

      lines.push(
        JSON.stringify({
          type: "assistant",
          uuid: randomUUID(),
          sessionId,
          timestamp,
          content,
          costUSD: msg.costUSD || 0.005 + Math.random() * 0.015,
          durationMs: msg.durationMs || 1000 + Math.random() * 4000,
          model: msg.model || "claude-sonnet-4-20250514",
        })
      );
    }
  }

  return lines.join("\n") + "\n";
}

function main() {
  console.log("Generating rich test data...\n");

  for (const project of projects) {
    const projectDir = join(CLAUDE_DIR, project.encoded);
    mkdirSync(projectDir, { recursive: true });

    for (const session of project.sessions) {
      const sessionId = randomUUID();
      const filePath = join(projectDir, `${sessionId}.jsonl`);
      const content = generateSessionJsonl(session);
      writeFileSync(filePath, content, "utf-8");

      const projectName = project.encoded.split("-").pop();
      const hoursLabel =
        session.hoursAgo < 1
          ? `${Math.round(session.hoursAgo * 60)}m ago`
          : `${session.hoursAgo}h ago`;
      console.log(
        `  ✓ ${projectName?.padEnd(16)} ${hoursLabel.padEnd(10)} ${session.messages.length} messages`
      );
    }
  }

  console.log(`\n  ${projects.reduce((s, p) => s + p.sessions.length, 0)} sessions across ${projects.length} projects`);
  console.log("\nRun:  node dist/cli.js");
}

main();

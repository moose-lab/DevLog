import { NextRequest } from "next/server";
import { getDb } from "@/core/db";
import { streamManager } from "@/core/stream-manager";
import type { ChatMessage } from "@/core/types-dashboard";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Replay persisted messages so the frontend catches up
      try {
        const db = getDb();
        const messages = db
          .prepare(
            "SELECT * FROM session_messages WHERE session_id = ? ORDER BY id ASC"
          )
          .all(id) as ChatMessage[];

        for (const msg of messages) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "message", role: msg.role, content: msg.content })}\n\n`
            )
          );
        }
      } catch {
        // DB might not be ready
      }

      // Signal replay complete
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "sync" })}\n\n`)
      );

      // Subscribe to live events
      const unsubscribe = streamManager.subscribe(id, (event) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          unsubscribe();
        }
      });

      // Heartbeat every 15s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 15000);

      _req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

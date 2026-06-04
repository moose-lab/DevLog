import { NextRequest } from "next/server";
import { getDb } from "@/core/db";
import { filterBufferedReplayDuplicates } from "@/core/session-stream-dedupe";
import { buildSessionStreamReplayEvents } from "@/core/session-stream-replay";
import { streamManager } from "@/core/stream-manager";
import type { ChatStreamEvent } from "@/core/stream-manager";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const encoder = new TextEncoder();
  let cleanupStream = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const liveEventBuffer: ChatStreamEvent[] = [];
      let bufferingLiveEvents = true;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let unsubscribe = () => {};
      let cleanedUp = false;
      let abortHandler: (() => void) | undefined;

      const cleanup = () => {
        if (cleanedUp) {
          return;
        }
        cleanedUp = true;
        if (heartbeat) {
          clearInterval(heartbeat);
        }
        if (abortHandler) {
          _req.signal.removeEventListener("abort", abortHandler);
        }
        unsubscribe();
      };
      cleanupStream = cleanup;

      const safeEnqueue = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          cleanup();
          return false;
        }
      };

      const enqueueEvent = (event: ChatStreamEvent) => {
        return safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
      };

      abortHandler = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      _req.signal.addEventListener("abort", abortHandler);

      if (_req.signal.aborted) {
        cleanup();
        return;
      }

      // Subscribe before replay so live events are not lost during catch-up.
      unsubscribe = streamManager.subscribe(id, (event) => {
        if (bufferingLiveEvents) {
          liveEventBuffer.push(event);
          return;
        }

        enqueueEvent(event);
      });

      if (_req.signal.aborted) {
        cleanup();
        return;
      }

      // Replay persisted messages so the frontend catches up
      let replayEvents: ChatStreamEvent[] = [];
      try {
        const db = getDb();
        replayEvents = buildSessionStreamReplayEvents(db, id);

        for (const event of replayEvents) {
          if (!enqueueEvent(event)) {
            return;
          }
        }
      } catch (error) {
        // DB might not be ready
        console.warn("Failed to replay session stream events", {
          sessionId: id,
          error,
        });
      }

      // Signal replay complete
      if (!safeEnqueue(`data: ${JSON.stringify({ type: "sync" })}\n\n`)) {
        return;
      }

      const eventsToDrain = filterBufferedReplayDuplicates(
        replayEvents,
        liveEventBuffer,
      );
      for (const event of eventsToDrain) {
        if (!enqueueEvent(event)) {
          return;
        }
      }
      bufferingLiveEvents = false;

      // Heartbeat every 15s
      heartbeat = setInterval(() => {
        safeEnqueue(": heartbeat\n\n");
      }, 15000);
    },
    cancel() {
      cleanupStream();
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

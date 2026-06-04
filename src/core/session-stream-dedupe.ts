import type { ChatStreamEvent } from "./stream-manager";

export function filterBufferedReplayDuplicates(
  replayEvents: ChatStreamEvent[],
  bufferedEvents: ChatStreamEvent[],
): ChatStreamEvent[] {
  const replayKeys = new Set<string>();
  for (const event of replayEvents) {
    const key = getReplayDedupeKey(event);
    if (key) replayKeys.add(key);
  }

  return bufferedEvents.filter((event) => {
    const key = getReplayDedupeKey(event);
    return !key || !replayKeys.has(key);
  });
}

function getReplayDedupeKey(event: ChatStreamEvent): string | null {
  switch (event.type) {
    case "message":
      return typeof event.id === "number" ? `message:${event.id}` : null;
    case "log":
      return typeof event.id === "number" ? `log:${event.id}` : null;
    case "status":
      return `status:${event.status}`;
    default:
      return null;
  }
}

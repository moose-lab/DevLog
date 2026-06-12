"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Shared polling layer (IM-13 / IM-27, REVIEW-2026-06-10).
 *
 * The dashboard's polling hooks each re-implemented the same catch-less
 * try/finally fetch: a network rejection became an unhandled promise
 * rejection every tick, non-OK responses silently left stale data with no
 * error state, and pages mounting the same hook twice polled the same
 * endpoint twice. Polls are now deduplicated per URL in a module-level
 * subscriber-counted store with an error state and a sequence guard
 * (stale responses can't overwrite newer ones).
 */

interface PollSnapshot {
  data: unknown;
  loading: boolean;
  error: string | null;
}

interface PollStore {
  url: string;
  intervalMs: number;
  snapshot: PollSnapshot;
  seq: number;
  timer: ReturnType<typeof setInterval> | null;
  listeners: Set<() => void>;
}

const INITIAL_SNAPSHOT: PollSnapshot = { data: null, loading: true, error: null };

const stores = new Map<string, PollStore>();

function notify(store: PollStore): void {
  for (const listener of store.listeners) listener();
}

async function pollOnce(store: PollStore): Promise<void> {
  const seq = ++store.seq;
  try {
    const res = await fetch(store.url, { cache: "no-store" });
    if (seq !== store.seq) return; // a newer poll superseded this one
    if (!res.ok) {
      store.snapshot = { ...store.snapshot, loading: false, error: `HTTP ${res.status}` };
      notify(store);
      return;
    }
    const data = (await res.json()) as unknown;
    if (seq !== store.seq) return;
    store.snapshot = { data, loading: false, error: null };
    notify(store);
  } catch (err) {
    if (seq !== store.seq) return;
    store.snapshot = {
      ...store.snapshot,
      loading: false,
      error: err instanceof Error ? err.message : "request failed",
    };
    notify(store);
  }
}

function ensureStore(url: string, intervalMs: number): PollStore {
  let store = stores.get(url);
  if (!store) {
    store = {
      url,
      intervalMs,
      snapshot: INITIAL_SNAPSHOT,
      seq: 0,
      timer: null,
      listeners: new Set(),
    };
    stores.set(url, store);
  }
  // (Re)start the timer when missing or when a subscriber asks for a
  // different cadence — last writer wins, which is fine for our callers.
  if (!store.timer || store.intervalMs !== intervalMs) {
    if (store.timer) clearInterval(store.timer);
    store.intervalMs = intervalMs;
    const owned = store;
    store.timer = setInterval(() => void pollOnce(owned), intervalMs);
  }
  return store;
}

export interface PolledJson<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function usePolledJson<T>(url: string | null, intervalMs: number): PolledJson<T> {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!url) return () => {};
      const store = ensureStore(url, intervalMs);
      store.listeners.add(onChange);
      if (store.snapshot === INITIAL_SNAPSHOT) {
        void pollOnce(store);
      }
      return () => {
        store.listeners.delete(onChange);
        if (store.listeners.size === 0) {
          if (store.timer) clearInterval(store.timer);
          stores.delete(url);
        }
      };
    },
    [url, intervalMs],
  );

  const getSnapshot = useCallback((): PollSnapshot => {
    if (!url) return INITIAL_SNAPSHOT;
    return stores.get(url)?.snapshot ?? INITIAL_SNAPSHOT;
  }, [url]);

  const getServerSnapshot = useCallback((): PollSnapshot => INITIAL_SNAPSHOT, []);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const refresh = useCallback(async () => {
    if (!url) return;
    const store = stores.get(url);
    if (store) await pollOnce(store);
  }, [url]);

  return {
    data: snapshot.data as T | null,
    loading: snapshot.loading,
    error: snapshot.error,
    refresh,
  };
}

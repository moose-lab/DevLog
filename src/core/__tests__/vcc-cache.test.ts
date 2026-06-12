import { test } from "node:test";
import assert from "node:assert/strict";
import { BoundedTtlCache, runSerializedByKey } from "../vcc";

/**
 * Regression tests for IM-25 (REVIEW-2026-06-10): the VCC compile cache
 * grew without bound (each session edit added a permanent MB-scale entry)
 * and concurrent compiles of one session raced on the shared output files.
 */

test("cache evicts expired entries and stays within its bound (IM-25)", () => {
  const cache = new BoundedTtlCache<string>(3, 1000);

  cache.set("a", "A", 0);
  cache.set("b", "B", 0);
  assert.equal(cache.get("a", 500), "A");
  // Past the TTL the entry is gone.
  assert.equal(cache.get("a", 1500), undefined);

  // Filling past the bound evicts the oldest entries.
  cache.set("c", "C", 2000);
  cache.set("d", "D", 2000);
  cache.set("e", "E", 2000);
  cache.set("f", "F", 2000);
  assert.ok(cache.size <= 3);
  assert.equal(cache.get("f", 2000), "F");
});

test("compiles for the same session never overlap (IM-25)", async () => {
  let active = 0;
  let maxActive = 0;
  const order: number[] = [];

  const job = (id: number, delay: number) => async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    order.push(id);
    active--;
    return id;
  };

  const [first, second, third] = await Promise.all([
    runSerializedByKey("session-1", job(1, 30)),
    runSerializedByKey("session-1", job(2, 5)),
    runSerializedByKey("session-1", job(3, 5)),
  ]);

  assert.equal(maxActive, 1, "same-session jobs must be serialized");
  assert.deepEqual(order, [1, 2, 3]);
  assert.deepEqual([first, second, third], [1, 2, 3]);
});

test("different sessions still run concurrently", async () => {
  let active = 0;
  let maxActive = 0;
  const job = () => async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active--;
  };

  await Promise.all([
    runSerializedByKey("s1", job()),
    runSerializedByKey("s2", job()),
  ]);
  assert.equal(maxActive, 2, "distinct sessions must not block each other");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeCost } from "../pricing";

test("computeCost uses current Claude Opus 4.6 pricing", () => {
  const cost = computeCost("claude-opus-4-6", {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cache_creation_input_tokens: 1_000_000,
    cache_read_input_tokens: 1_000_000,
  });

  assert.equal(cost, 36.75);
});

test("computeCost distinguishes Haiku 4.5 from retired Haiku 3.5 pricing", () => {
  const haiku45 = computeCost("claude-haiku-4-5-20251001", {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  });
  const haiku35 = computeCost("claude-haiku-3-5-20241022", {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  });

  assert.equal(haiku45, 6);
  assert.equal(haiku35, 4.8);
});

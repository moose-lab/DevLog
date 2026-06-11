import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePackageRoot } from "../../cli/lib/package-root";

/**
 * Regression tests for CR-8 (REVIEW-2026-06-10): the bundled dist/cli.js used
 * fixed `..` hops from import.meta.dirname, which resolve above the repo root
 * once tsup flattens the output. Resolution must anchor on package.json.
 */

function makeTree(): string {
  return mkdtempSync(join(tmpdir(), "devlog-pkg-root-"));
}

test("resolvePackageRoot finds the devlog package root from a nested dir", () => {
  const root = makeTree();
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@moose-lab/devlog" }));
    const nested = join(root, "dist", "deep");
    mkdirSync(nested, { recursive: true });

    assert.equal(resolvePackageRoot(nested), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolvePackageRoot prefers the devlog package over a nearer foreign package.json", () => {
  const root = makeTree();
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@moose-lab/devlog" }));
    const sub = join(root, "vendor");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, "package.json"), JSON.stringify({ name: "something-else" }));
    const nested = join(sub, "deep");
    mkdirSync(nested, { recursive: true });

    assert.equal(resolvePackageRoot(nested), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolvePackageRoot falls back to the nearest package.json when no devlog root exists", () => {
  const root = makeTree();
  try {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "some-host-app" }));
    const nested = join(root, "node_modules", "x");
    mkdirSync(nested, { recursive: true });

    assert.equal(resolvePackageRoot(nested), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

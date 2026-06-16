import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));

function readText(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function readJson<T>(path: string): T {
  return JSON.parse(readText(path)) as T;
}

function readBulletValue(text: string, label: string): string | undefined {
  const prefix = `- ${label}: `;
  return text
    .split(/\r?\n/)
    .find((line) => line.startsWith(prefix))
    ?.slice(prefix.length);
}

test("repository exposes public analysis and coding-agent discovery metadata", () => {
  const pkg = readJson<{
    repository?: { type?: string; url?: string };
    homepage?: string;
    bugs?: { url?: string };
    keywords?: string[];
  }>("package.json");

  assert.deepEqual(pkg.repository, {
    type: "git",
    url: "https://github.com/moose-lab/DevLog.git",
  });
  assert.equal(pkg.homepage, "https://github.com/moose-lab/DevLog#readme");
  assert.equal(pkg.bugs?.url, "https://github.com/moose-lab/DevLog/issues");

  for (const keyword of ["ai-coding-agents", "claude-code", "agent-observability"]) {
    assert.ok(pkg.keywords?.includes(keyword), `missing package keyword ${keyword}`);
  }
});

test("repository includes crawler-readable entry points without requiring DeepWiki steering", () => {
  assert.equal(existsSync(join(root, "llms.txt")), true, "llms.txt should exist");

  const llms = readText("llms.txt");
  assert.equal(readBulletValue(llms, "GitHub repository"), "https://github.com/moose-lab/DevLog");
  assert.equal(readBulletValue(llms, "DeepWiki project wiki"), "https://deepwiki.com/moose-lab/DevLog");
  assert.match(llms, /Zread/);
  assert.match(llms, /\.devin\/wiki\.json.*optional|optional.*\.devin\/wiki\.json/is);
  assert.match(llms, /steering/i);
});

test("DeepWiki steering config is optional and valid when present", () => {
  const llms = readText("llms.txt");
  assert.match(llms, /DeepWiki public indexing does not require `.devin\/wiki\.json`/i);
  assert.match(llms, /\.devin\/wiki\.json.*optional|optional.*\.devin\/wiki\.json/is);

  const wikiPath = ".devin/wiki.json";
  if (!existsSync(join(root, wikiPath))) {
    return;
  }

  const wiki = readJson<{
    repo_notes?: unknown;
    pages?: unknown;
  }>(wikiPath);
  assert.equal(Array.isArray(wiki.repo_notes), true);
  assert.equal(Array.isArray(wiki.pages), true);
});

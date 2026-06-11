import fs from "fs";
import path from "path";

const PACKAGE_NAME = "@moose-lab/devlog";

/**
 * Resolves the DevLog package root by walking up from `startDir`.
 *
 * The CLI is bundled into a single dist/cli.js, so fixed `..` hops from
 * import.meta.dirname land in different places depending on bundler layout
 * (and currently resolve above the repo root). Anchoring on package.json
 * works from the source repo, the bundled dist, and an npm installation.
 *
 * Prefers the directory whose package.json is named `@moose-lab/devlog`;
 * falls back to the nearest package.json, or null when none exists.
 */
export function resolvePackageRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  let nearest: string | null = null;

  for (;;) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { name?: string };
        if (pkg.name === PACKAGE_NAME) return dir;
      } catch {
        // unreadable/invalid package.json still marks a package boundary
      }
      nearest ??= dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return nearest;
    dir = parent;
  }
}

import { execFile, type ChildProcess } from "child_process";
import path from "path";
import chalk from "chalk";
import type { GlobalOptions } from "../../core/types.js";

export async function serveCommand(
  options: { port?: string },
  globalOpts: GlobalOptions
): Promise<void> {
  const port = options.port ?? "3333";
  const projectRoot = path.resolve(import.meta.dirname, "..", "..", "..");

  // Check if Next.js source exists (running from repo vs npm install)
  const nextConfigPath = path.join(projectRoot, "next.config.ts");
  const fs = await import("fs");
  if (!fs.existsSync(nextConfigPath)) {
    console.error(chalk.red("\n  Dashboard requires running from the DevLog source repo."));
    console.error(chalk.dim("  Clone https://github.com/moose-lab/DevLog and run from there.\n"));
    process.exit(1);
  }

  console.log();
  console.log(chalk.bold.cyan("  ▌") + chalk.bold.white(" DevLog Dashboard"));
  console.log(chalk.dim(`  Starting on port ${port}...`));
  console.log();

  const child: ChildProcess = execFile(
    "npx",
    ["next", "dev", "--port", port],
    { cwd: projectRoot, stdio: "inherit" } as any
  );

  // Forward signals for clean shutdown
  const cleanup = () => {
    child.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Wait for child to exit
  await new Promise<void>((resolve, reject) => {
    child.on("exit", (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`Dashboard exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

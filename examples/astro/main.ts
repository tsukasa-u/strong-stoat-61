/**
 * Astro runnable launcher.
 *
 * Runs the actual Astro dev server so pages are served from `src/pages/*.astro`.
 */

import { spawn } from "node:child_process";

const child = spawn(
  "pnpm",
  ["--dir", "examples/astro", "exec", "astro", "dev", "--host", "127.0.0.1", "--port", "8012"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CHOKIDAR_USEPOLLING: process.env.CHOKIDAR_USEPOLLING ?? "1",
      WATCHPACK_POLLING: process.env.WATCHPACK_POLLING ?? "true",
    },
  },
);

const shutdown = () => {
  if (!child.killed) {
    child.kill("SIGTERM");
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
